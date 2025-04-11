import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { AccessToken, VideoGrant } from "livekit-server-sdk";
import { WebSocketServer } from "ws";
import { WebSocket } from "ws";
import { slotManager } from "./managers/SlotManager";
import { cameraManager } from "./managers/CameraManager";
import { connectionManager, WebSocketMessage } from "./managers/ConnectionManager";
import { globalEvents } from "./managers/EventEmitter";
import { SlotInfo } from "@shared/schema";

// LiveKit настройки
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = 'wss://mafia.nyavkin.site/'; // URL сервера LiveKit со слешем в конце

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
      },
      connections: connectionManager.getConnectionCount(),
      users: connectionManager.getUserCount(),
      slots: slotManager.getOccupiedSlotsCount()
    });
  });
  
  // Эндпоинт для проверки наличия ведущего в комнате
  app.get('/api/room-status', (req, res) => {
    // Проверяем, есть ли уже ведущий в комнате
    // Проверяем именно слот 12, а не просто префикс пользователей
    const hostSlot = slotManager.getSlotAssignments().get(12);
    const currentHostExists = !!hostSlot && slotManager.isUserHost(hostSlot);
    
    // Дополнительно проверяем, активно ли соединение пользователя
    const hostIsConnected = currentHostExists && 
      connectionManager.getUserCount() > 0 && 
      connectionManager.isUserConnected(hostSlot || '');
    
    res.json({
      hasHost: hostIsConnected, // Только если ведущий реально подключен
      userCount: connectionManager.getUserCount(),
      timestamp: new Date().toISOString()
    });
  });
app.get("/debug/env", (req, res) => {
  res.json({
    LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET,
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

  // Подписываемся на события обновления от менеджеров
  globalEvents.on('slots_updated', (slotsData) => {
    console.log('Получено событие slots_updated, отправляем обновление всем клиентам');
    
    // Используем данные из события вместо повторного запроса
    const updateMessage: WebSocketMessage = {
      type: 'slots_update',
      slots: slotsData
    };
    
    connectionManager.broadcastToAll(updateMessage);
  });

  globalEvents.on('cameras_updated', (cameraStates) => {
    console.log('Получено событие cameras_updated, отправляем обновление всем клиентам');
    
    // Используем данные из события вместо повторного запроса
    const updateMessage: WebSocketMessage = {
      type: 'camera_states_update',
      cameraStates: cameraStates
    };
    
    connectionManager.broadcastToAll(updateMessage);
  });

  // Периодическая проверка статуса
  setInterval(() => {
    // Логирование текущего состояния
    console.log(`Периодическая проверка: соединения=${connectionManager.getConnectionCount()}, слоты=${slotManager.getOccupiedSlotsCount()}, присвоено=${slotManager.getOccupiedSlotsCount()}, камеры=${cameraManager.getActiveCamerasCount()}`);
    
    // Отладка: показываем текущие назначения слотов
    slotManager.logCurrentAssignments();
    
    // Активность соединений
    console.log(`Активные соединения: ${connectionManager.getConnectionCount()}, активные слоты: ${slotManager.getOccupiedSlotsCount()}`);
    
    // Отправка периодических обновлений только при изменениях
    // Используем тихие версии без обновления каждые 5 секунд
    // broadcastSlotUpdate();
    // broadcastCameraStates();
  }, 5000); // каждые 5 секунд

  // Обработчик подключений WebSocket
  wss.on('connection', (ws: WebSocket) => {
    let userId: string | null = null;
    
    // Обработка входящих сообщений
    ws.on('message', (message: Buffer | string) => {
      try {
        const messageStr = message.toString();
        const data = JSON.parse(messageStr) as WebSocketMessage;
        
        // Обработка разных типов сообщений
        switch(data.type) {
          case 'register':
            // Регистрация пользователя
            userId = data.userId as string;
            if (userId) {
              // Регистрируем соединение для пользователя
              connectionManager.registerConnection(userId, ws);
              console.log(`Пользователь зарегистрирован: ${userId}`);
              
              // Инициализируем состояние камеры (выключена по умолчанию)
              cameraManager.initializeUserCamera(userId);
              
              // Назначаем слот для пользователя (автоматически назначается слот по роли)
              const assignedSlot = slotManager.assignFirstAvailableSlot(userId);
              
              if (assignedSlot) {
                console.log(`Автоматически назначен слот ${assignedSlot} для ${userId}`);
              } else {
                console.warn(`Не удалось найти свободный слот для ${userId}`);
              }
            } else {
              console.error('Ошибка: получен пустой userId при регистрации');
            }
            
            // Отправляем состояние только новому пользователю вместо всех клиентов
            sendInitialState(userId);
            break;
            
          case 'select_slot':
            // Пользователь выбирает слот
            if (!userId) break;
            
            const selectedSlot = data.slotNumber as number;
            const success = slotManager.assignSlot(userId, selectedSlot);
            
            if (success) {
              console.log(`Пользователь ${userId} выбрал слот ${selectedSlot}`);
              // broadcastSlotUpdate(); - не нужно, работает через событие slots_updated
            } else {
              // Слот занят или недоступен
              connectionManager.sendToUser(userId, {
                type: 'slot_busy',
                slotNumber: selectedSlot
              });
            }
            break;
            
          case 'release_slot':
            // Пользователь освобождает слот
            if (!userId) break;
            
            if (slotManager.releaseUserSlot(userId)) {
              console.log(`Пользователь ${userId} освободил слот`);
              // broadcastSlotUpdate(); - не нужно, работает через событие slots_updated
            }
            break;
            
          case 'camera_state_change':
            // Обработка изменения состояния камеры
            if (!userId) break;
            
            const isEnabled = Boolean(data.enabled);
            cameraManager.setCameraState(userId, isEnabled);
            
            console.log(`Пользователь ${userId} ${isEnabled ? 'включил' : 'выключил'} камеру`);
            
            // Обновление состояния камер будет отправлено через событие cameras_updated
            break;
            
          case 'move_user':
            // Ведущий перемещает пользователя в другой слот
            if (!userId) break;
            
            const userIdToMove = data.userIdToMove as string;
            const targetSlot = Number(data.targetSlot);
            
            if (!userIdToMove || isNaN(targetSlot)) {
              console.error('Некорректные параметры для перемещения пользователя');
              break;
            }
            
            const moveSuccess = slotManager.moveUserToSlot(userId, userIdToMove, targetSlot);
            
            if (moveSuccess) {
              console.log(`Ведущий ${userId} успешно переместил пользователя ${userIdToMove} в слот ${targetSlot}`);
              // Обновление слотов будет отправлено через событие slots_updated
            } else {
              console.log(`Ведущему ${userId} не удалось переместить пользователя ${userIdToMove} в слот ${targetSlot}`);
              // Можно также отправить сообщение о неудаче конкретно этому ведущему
              connectionManager.sendToUser(userId, {
                type: 'move_failed',
                userIdToMove,
                targetSlot,
                reason: 'Не удалось выполнить перемещение пользователя'
              });
            }
            break;
            
          case 'shuffle_users':
            // Ведущий запускает случайное перемешивание пользователей
            if (!userId) break;
            
            console.log(`Пользователь ${userId} запросил перемешивание игроков`);
            
            const shuffleSuccess = slotManager.shuffleAllUsers(userId);
            
            if (shuffleSuccess) {
              console.log(`Ведущий ${userId} успешно перемешал пользователей`);
              // Обновление слотов будет отправлено через событие slots_updated
            } else {
              console.log(`Ведущему ${userId} не удалось перемешать пользователей`);
              // Сообщение о неудаче
              connectionManager.sendToUser(userId, {
                type: 'shuffle_failed',
                reason: 'Не удалось выполнить перемешивание пользователей'
              });
            }
            break;
            
          case 'pong':
          case '_pong':
            // Клиент отвечает на ping - отмечаем активность
            if (userId) {
              connectionManager.markUserActivity(userId);
            }
            break;
            
          case '_heartbeat':
            // Клиент отправляет проверку соединения - отвечаем и отмечаем активность
            if (userId) {
              connectionManager.markUserActivity(userId);
              ws.send(JSON.stringify({ type: '_heartbeat_response' }));
            }
            break;
        }
      } catch (error) {
        console.error('Ошибка обработки сообщения WebSocket:', error);
      }
    });
    
    // Обработка отключения
    ws.on('close', () => {
      if (userId) {
        connectionManager.disconnectUser(userId, ws);
        console.log(`Пользователь отключился: ${userId}`);
      }
    });
    
    // Обработка ошибок
    ws.on('error', (error) => {
      console.error('WebSocket ошибка:', error);
      if (userId) {
        connectionManager.disconnectUser(userId, ws);
      }
    });
  });
  
  // Функция для отправки обновления слотов всем подключенным клиентам
  function broadcastSlotUpdate() {
    const currentSlots = slotManager.getAllSlotAssignments();
    
    const updateMessage: WebSocketMessage = {
      type: 'slots_update',
      slots: currentSlots
    };
    
    connectionManager.broadcastToAll(updateMessage);
  }
  
  // Функция для отправки первоначального состояния слотов конкретному пользователю
  function sendInitialState(userId: string) {
    const currentSlots = slotManager.getAllSlotAssignments();
    const currentCameraStates = cameraManager.getAllCameraStates();
    
    const slotsMessage: WebSocketMessage = {
      type: 'slots_update',
      slots: currentSlots
    };
    
    const cameraMessage: WebSocketMessage = {
      type: 'camera_states_update',
      cameraStates: currentCameraStates
    };
    
    // Отправляем только этому пользователю
    console.log(`Отправлено первоначальное состояние клиенту ${userId}: ${currentSlots.length} слотов`);
    connectionManager.sendToUser(userId, slotsMessage);
    connectionManager.sendToUser(userId, cameraMessage);
  }
  
  // Функция для отправки обновления состояния камер всем клиентам
  function broadcastCameraStates() {
    const currentCameraStates = cameraManager.getAllCameraStates();
    
    const updateMessage: WebSocketMessage = {
      type: 'camera_states_update',
      cameraStates: currentCameraStates
    };
    
    connectionManager.broadcastToAll(updateMessage);
  }

  return httpServer;
}
