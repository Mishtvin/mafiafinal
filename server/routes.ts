import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { AccessToken, VideoGrant } from "livekit-server-sdk";
import { WebSocketServer } from "ws";
import { WebSocket } from "ws";

// LiveKit настройки
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = 'wss://livekit.nyavkin.site/'; // URL сервера LiveKit со слешем в конце

// Структура данных для хранения информации о слотах
interface SlotInfo {
  userId: string;
  slotNumber: number;
}

// Хранилище данных о слотах
const slotAssignments = new Map<number, string>(); // slotNumber -> userId
const userSlots = new Map<string, number>(); // userId -> slotNumber

export async function registerRoutes(app: Express): Promise<Server> {
  // API endpoints
  app.get('/api/healthcheck', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(), 
      livekit: { 
        apiKey: LIVEKIT_API_KEY ? 'configured' : 'missing',
        apiSecret: LIVEKIT_API_SECRET ? 'configured' : 'missing',
        url: LIVEKIT_URL
      }
    });
  });
  
  // Эндпоинты для создания токена LiveKit (поддерживаем GET и POST)
  app.get('/api/token', async (req, res) => {
    try {
      const identity = req.query.identity as string;
      // Всегда используем default-room, как в вашем рабочем примере
      const roomName = 'default-room';
      
      if (!identity) {
        return res.status(400).json({ error: 'Missing identity parameter' });
      }
      
      if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
        return res.status(500).json({ error: 'LiveKit API credentials are not configured' });
      }
      
      console.log("Using LiveKit credentials - API Key:", LIVEKIT_API_KEY);
      
      // Создание токена доступа
      const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity,
        ttl: 3600 * 24, // 24 часа
      });
      
      // Определяем права доступа
      const videoGrant: VideoGrant = {
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      };
      
      at.addGrant(videoGrant);
      
      // Создаем JWT токен - обрабатываем Promise если нужно
      try {
        const jwt = await Promise.resolve(at.toJwt());
        const tokenString = String(jwt);
        
        console.log("Generated token for:", identity, "room:", roomName);
        
        // Возвращаем токен в формате, который ожидает клиент
        return res.json({ token: tokenString, identity, room: roomName });
      } catch (tokenError) {
        console.error('Error generating token:', tokenError);
        return res.status(500).json({ error: 'Failed to generate token' });
      }
    } catch (error) {
      console.error('Error generating LiveKit token:', error);
      return res.status(500).json({ error: 'Failed to generate token' });
    }
  });
  
  // POST endpoint для токенов LiveKit
  app.post('/api/livekit/token', async (req, res) => {
    try {
      const { identity, roomName } = req.body;
      
      if (!identity) {
        return res.status(400).json({ error: 'Missing identity parameter' });
      }
      
      const actualRoomName = roomName || 'default-room';
      
      if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
        return res.status(500).json({ error: 'LiveKit API credentials are not configured' });
      }
      
      console.log("Using LiveKit credentials for POST request - API Key:", LIVEKIT_API_KEY);
      
      // Создание токена доступа
      const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity,
        ttl: 3600 * 24, // 24 часа
      });
      
      // Определяем права доступа
      const videoGrant: VideoGrant = {
        roomJoin: true,
        room: actualRoomName,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      };
      
      at.addGrant(videoGrant);
      
      // Создаем JWT токен
      try {
        const jwt = await Promise.resolve(at.toJwt());
        const tokenString = String(jwt);
        
        console.log("Generated token for POST request:", identity, "room:", actualRoomName);
        
        // Возвращаем токен в формате, который ожидает клиент
        return res.json({ token: tokenString, identity, room: actualRoomName });
      } catch (tokenError) {
        console.error('Error generating token:', tokenError);
        return res.status(500).json({ error: 'Failed to generate token' });
      }
    } catch (error) {
      console.error('Error handling POST request for LiveKit token:', error);
      return res.status(500).json({ error: 'Failed to generate token' });
    }
  });

  const httpServer = createServer(app);

  // Создаем WebSocket сервер на отдельном пути
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  console.log('WebSocket server initialized on path /ws');

  // Коллекция подключений для отслеживания клиентов
  const connections = new Map<string, WebSocket>();

  // Создаем хранилище для состояния камер
  const cameraStates = new Map<string, boolean>(); // userId -> камера включена
  
  // Интервал для проверки соединений (pings)
  const pingInterval = 10000; // 10 секунд
  const pingIntervalId = setInterval(() => {
    connections.forEach((ws, userId) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'ping' }));
        } catch (e) {
          console.error(`Ошибка отправки ping для ${userId}:`, e);
        }
      }
    });
  }, pingInterval);
  
  // Обработчик подключений WebSocket
  wss.on('connection', (ws: WebSocket) => {
    let userId: string | null = null;
    let lastPongTime = Date.now();
    
    // Функция для отправки сообщения клиенту
    const sendToClient = (data: any) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(data));
        } catch (e) {
          console.error('Ошибка отправки данных клиенту:', e);
        }
      }
    };

    // Обработка входящих сообщений
    ws.on('message', (message: Buffer | string) => {
      try {
        const messageStr = message.toString();
        const data = JSON.parse(messageStr);
        
        // Обновляем время последнего pong для отслеживания активности
        lastPongTime = Date.now();
        
        // Обработка разных типов сообщений
        switch(data.type) {
          case 'register':
            // Регистрация пользователя
            userId = data.userId;
            if (userId) {
              connections.set(userId, ws);
              console.log(`Пользователь зарегистрирован: ${userId}`);
              
              // Устанавливаем начальное состояние камеры (выключена по умолчанию)
              if (!cameraStates.has(userId)) {
                cameraStates.set(userId, false);
              }
              
              // Если пользователь не занял слот, назначаем свободный
              if (!userSlots.has(userId)) {
                // Находим первый свободный слот
                for (let i = 1; i <= 12; i++) {
                  if (!slotAssignments.has(i)) {
                    slotAssignments.set(i, userId);
                    userSlots.set(userId, i);
                    console.log(`Автоматически назначен слот ${i} для ${userId}`);
                    break;
                  }
                }
              }
            } else {
              console.error('Ошибка: получен пустой userId при регистрации');
            }
            
            // Отправляем текущее состояние слотов
            const currentSlots: SlotInfo[] = [];
            slotAssignments.forEach((userId, slotNumber) => {
              currentSlots.push({ userId, slotNumber });
            });
            
            // Отправляем состояние слотов
            sendToClient({
              type: 'slots_update',
              slots: currentSlots
            });
            
            // Отправляем состояние камер
            const currentCameraStates: Record<string, boolean> = {};
            cameraStates.forEach((enabled, userId) => {
              currentCameraStates[userId] = enabled;
            });
            
            sendToClient({
              type: 'camera_states_update',
              cameraStates: currentCameraStates
            });
            break;
            
          case 'select_slot':
            // Пользователь выбирает слот
            if (!userId) break;
            
            const selectedSlot = data.slotNumber;
            const previousSlot = userSlots.get(userId);
            
            // Освобождаем предыдущий слот, если был
            if (previousSlot !== undefined) {
              slotAssignments.delete(previousSlot);
            }
            
            // Проверяем, не занят ли выбранный слот
            const currentOccupant = slotAssignments.get(selectedSlot);
            if (currentOccupant && currentOccupant !== userId) {
              // Слот занят другим пользователем
              sendToClient({
                type: 'slot_busy',
                slotNumber: selectedSlot
              });
              return;
            }
            
            // Занимаем новый слот
            slotAssignments.set(selectedSlot, userId);
            userSlots.set(userId, selectedSlot);
            
            console.log(`Пользователь ${userId} выбрал слот ${selectedSlot}`);
            
            // Отправляем обновление всем подключенным клиентам
            broadcastSlotUpdate();
            break;
            
          case 'release_slot':
            // Пользователь освобождает слот
            if (!userId) break;
            
            const slotToRelease = userSlots.get(userId);
            if (slotToRelease !== undefined) {
              slotAssignments.delete(slotToRelease);
              userSlots.delete(userId);
              
              console.log(`Пользователь ${userId} освободил слот ${slotToRelease}`);
              
              // Отправляем обновление всем подключенным клиентам
              broadcastSlotUpdate();
            }
            break;
            
          case 'camera_state_change':
            // Обработка изменения состояния камеры
            if (!userId) break;
            
            const isEnabled = Boolean(data.enabled);
            cameraStates.set(userId, isEnabled);
            
            console.log(`Пользователь ${userId} ${isEnabled ? 'включил' : 'выключил'} камеру`);
            
            // Отправляем обновление состояния камер всем клиентам
            broadcastCameraStates();
            break;
            
          case 'pong':
            // Клиент отвечает на ping
            lastPongTime = Date.now();
            break;
        }
      } catch (error) {
        console.error('Ошибка обработки сообщения WebSocket:', error);
      }
    });
    
    // Проверка активности соединения
    const connectionCheckInterval = setInterval(() => {
      const now = Date.now();
      if (now - lastPongTime > 30000) { // 30 секунд без ответа
        console.log(`Соединение неактивно более 30 секунд для ${userId || 'неизвестного пользователя'}`);
        ws.terminate(); // Принудительно закрываем соединение
        clearInterval(connectionCheckInterval);
      }
    }, 10000);
    
    // Обработка отключения
    ws.on('close', () => {
      clearInterval(connectionCheckInterval);
      
      if (userId) {
        // Освобождаем слот при отключении пользователя
        const slotToRelease = userSlots.get(userId);
        if (slotToRelease !== undefined) {
          slotAssignments.delete(slotToRelease);
          userSlots.delete(userId);
        }
        
        // Удаляем информацию о состоянии камеры
        cameraStates.delete(userId);
        
        connections.delete(userId);
        console.log(`Пользователь отключился: ${userId}`);
        
        // Отправляем обновление всем подключенным клиентам
        broadcastSlotUpdate();
        broadcastCameraStates();
      }
    });
    
    // Обработка ошибок
    ws.on('error', (error) => {
      console.error('WebSocket ошибка:', error);
      clearInterval(connectionCheckInterval);
    });
  });
  
  // Функция для отправки обновления слотов всем подключенным клиентам
  function broadcastSlotUpdate() {
    const currentSlots: SlotInfo[] = [];
    slotAssignments.forEach((userId, slotNumber) => {
      currentSlots.push({ userId, slotNumber });
    });
    
    const updateMessage = JSON.stringify({
      type: 'slots_update',
      slots: currentSlots
    });
    
    connections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(updateMessage);
        } catch (e) {
          console.error('Ошибка отправки обновления слотов:', e);
        }
      }
    });
  }
  
  // Функция для отправки обновления состояния камер всем клиентам
  function broadcastCameraStates() {
    const currentCameraStates: Record<string, boolean> = {};
    cameraStates.forEach((enabled, userId) => {
      currentCameraStates[userId] = enabled;
    });
    
    const updateMessage = JSON.stringify({
      type: 'camera_states_update',
      cameraStates: currentCameraStates
    });
    
    connections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(updateMessage);
        } catch (e) {
          console.error('Ошибка отправки обновления состояния камер:', e);
        }
      }
    });
  }

  return httpServer;
}
