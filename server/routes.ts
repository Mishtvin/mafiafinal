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
  
  // Периодическая полная очистка состояния для устранения рассинхронизации
  setInterval(() => {
    // Проверяем, что все слоты соответствуют активным соединениям
    const validUserIds = new Set<string>(connections.keys());
    
    // Найдем все слоты с неактивными пользователями
    let needsUpdate = false;
    slotAssignments.forEach((userId, slotNumber) => {
      if (!validUserIds.has(userId)) {
        console.log(`Очистка слота ${slotNumber} для отключенного пользователя ${userId}`);
        slotAssignments.delete(slotNumber);
        needsUpdate = true;
      }
    });
    
    // Удаляем записи в userSlots для отключенных пользователей
    userSlots.forEach((slotNumber, userId) => {
      if (!validUserIds.has(userId)) {
        userSlots.delete(userId);
        needsUpdate = true;
      }
    });
    
    // Очищаем состояние камер для отключенных пользователей
    cameraStates.forEach((enabled, userId) => {
      if (!validUserIds.has(userId)) {
        cameraStates.delete(userId);
        needsUpdate = true;
      }
    });
    
    // Проверяем целостность данных между slotAssignments и userSlots
    userSlots.forEach((slotNumber, userId) => {
      const assignedUserId = slotAssignments.get(slotNumber);
      if (!assignedUserId || assignedUserId !== userId) {
        console.log(`Исправляем несоответствие: слот ${slotNumber} для пользователя ${userId}`);
        slotAssignments.set(slotNumber, userId);
        needsUpdate = true;
      }
    });
    
    // Если были изменения - рассылаем обновление
    if (needsUpdate) {
      console.log('Очистка неактивных соединений вызвала рассылку обновлений');
      broadcastSlotUpdate();
      broadcastCameraStates();
    }
    
    console.log(`Периодическая проверка: соединения=${connections.size}, слоты=${slotAssignments.size}, присвоено=${userSlots.size}, камеры=${cameraStates.size}`);
    
    // Проверяем корректность назначения слотов
    // Отладка: показываем все текущие слоты
    console.log('Текущие назначения слотов:');
    slotAssignments.forEach((userId, slot) => {
      console.log(`- Слот ${slot}: ${userId}`);
    });
    
    // Периодически отправляем обновление всем клиентам для синхронизации
    broadcastSlotUpdate();
    broadcastCameraStates();
  }, 5000); // каждые 5 секунд

  const pingInterval = 5000; // 5 секунд
  const pingIntervalId = setInterval(() => {
    // Проверяем и удаляем любые устаревшие соединения
    connections.forEach((ws, userId) => {
      if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        // Удаляем закрытые соединения
        connections.delete(userId);
        
        // Освобождаем слот при необходимости
        const slotToRelease = userSlots.get(userId);
        if (slotToRelease !== undefined) {
          slotAssignments.delete(slotToRelease);
          userSlots.delete(userId);
          console.log(`Очистка неактивного соединения: освобожден слот ${slotToRelease} для ${userId}`);
        }
        
        // Удаляем информацию о камере
        cameraStates.delete(userId);
        
        // Отправляем обновление всем
        broadcastSlotUpdate();
        broadcastCameraStates();
      } else if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'ping' }));
        } catch (e) {
          console.error(`Ошибка отправки ping для ${userId}:`, e);
          
          // При ошибке отправки удаляем соединение
          connections.delete(userId);
          
          // Освобождаем слот при необходимости
          const slotToRelease = userSlots.get(userId);
          if (slotToRelease !== undefined) {
            slotAssignments.delete(slotToRelease);
            userSlots.delete(userId);
          }
          
          // Удаляем информацию о камере
          cameraStates.delete(userId);
          
          console.log(`Соединение удалено из-за ошибки ping: ${userId}`);
          
          // Отправляем обновление всем
          broadcastSlotUpdate();
          broadcastCameraStates();
        }
      }
    });
    
    // Выводим текущее состояние для отладки
    console.log(`Активные соединения: ${connections.size}, активные слоты: ${slotAssignments.size}`);
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
                // Список уже занятых слотов
                const occupiedSlots = new Set<number>();
                slotAssignments.forEach((_, slot) => {
                  occupiedSlots.add(slot);
                });
                
                // Отладка: показываем занятые слоты перед назначением
                console.log(`Занятые слоты перед назначением для ${userId}:`, Array.from(occupiedSlots));
                
                // Находим первый свободный слот
                let assignedSlot = false;
                for (let i = 1; i <= 12; i++) {
                  if (!occupiedSlots.has(i)) {
                    slotAssignments.set(i, userId);
                    userSlots.set(userId, i);
                    console.log(`Автоматически назначен слот ${i} для ${userId}`);
                    assignedSlot = true;
                    break;
                  }
                }
                
                if (!assignedSlot) {
                  console.warn(`Не удалось найти свободный слот для ${userId}`);
                }
              }
            } else {
              console.error('Ошибка: получен пустой userId при регистрации');
            }
            
            // Отправляем текущее состояние слотов всем клиентам для синхронизации
            broadcastSlotUpdate();
            
            // Отправляем состояние камер всем клиентам для синхронизации
            broadcastCameraStates();
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
            
          case 'move_user':
            // Перемещение другого пользователя на указанный слот
            if (!userId) {
              console.log(`[MOVE USER] Ошибка: userId отправителя не определен`);
              break;
            }
            
            const targetUserId = data.userId;
            const targetSlot = data.targetSlot;
            
            console.log(`[MOVE USER] Запрос на перемещение: пользователь ${userId} хочет переместить ${targetUserId} в слот ${targetSlot}`);
            console.log(`[MOVE USER] Текущее состояние слотов:`);
            slotAssignments.forEach((userId, slotNumber) => {
              console.log(`[MOVE USER] - Слот ${slotNumber}: ${userId}`);
            });
            
            // Проверяем, что пользователь существует
            if (!connections.has(targetUserId)) {
              console.log(`[MOVE USER] Ошибка: пользователь ${targetUserId} не найден (нет соединения)`);
              break;
            }
            
            // Получаем текущий слот перемещаемого пользователя
            const currentUserSlot = userSlots.get(targetUserId);
            if (currentUserSlot === undefined) {
              console.log(`[MOVE USER] Ошибка: пользователь ${targetUserId} не имеет слота`);
              break;
            }
            
            console.log(`[MOVE USER] Текущий слот пользователя ${targetUserId}: ${currentUserSlot}`);
            
            // Проверяем, не занят ли целевой слот
            const targetSlotOccupant = slotAssignments.get(targetSlot);
            if (targetSlotOccupant && targetSlotOccupant !== targetUserId) {
              console.log(`[MOVE USER] Целевой слот ${targetSlot} занят пользователем ${targetSlotOccupant}`);
              
              // Если целевой слот занят, выполняем обмен слотами
              if (targetSlotOccupant) {
                const occupantCurrentSlot = userSlots.get(targetSlotOccupant);
                if (occupantCurrentSlot !== undefined) {
                  console.log(`[MOVE USER] Выполняем обмен слотами между ${targetUserId} (${currentUserSlot}) и ${targetSlotOccupant} (${targetSlot})`);
                  
                  // Устанавливаем перемещаемого пользователя на новый слот
                  slotAssignments.set(targetSlot, targetUserId);
                  userSlots.set(targetUserId, targetSlot);
                  
                  // Перемещаем текущего владельца слота на слот перемещаемого пользователя
                  slotAssignments.set(currentUserSlot, targetSlotOccupant);
                  userSlots.set(targetSlotOccupant, currentUserSlot);
                  
                  console.log(`[MOVE USER] Успешно: Пользователи ${targetUserId} и ${targetSlotOccupant} обменялись слотами ${currentUserSlot} и ${targetSlot}`);
                } else {
                  console.log(`[MOVE USER] Ошибка: не удалось определить текущий слот для ${targetSlotOccupant}`);
                }
              }
            } else {
              // Если целевой слот свободен, просто перемещаем пользователя
              console.log(`[MOVE USER] Целевой слот ${targetSlot} свободен, перемещаем пользователя ${targetUserId}`);
              slotAssignments.delete(currentUserSlot);
              slotAssignments.set(targetSlot, targetUserId);
              userSlots.set(targetUserId, targetSlot);
              console.log(`[MOVE USER] Успешно: Пользователь ${targetUserId} перемещен из слота ${currentUserSlot} в слот ${targetSlot}`);
            }
            
            console.log(`[MOVE USER] Новое состояние слотов после перемещения:`);
            slotAssignments.forEach((userId, slotNumber) => {
              console.log(`[MOVE USER] - Слот ${slotNumber}: ${userId}`);
            });
            
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
      if (now - lastPongTime > 15000) { // 15 секунд без ответа
        console.log(`Соединение неактивно более 15 секунд для ${userId || 'неизвестного пользователя'}`);
        
        // Очищаем все ресурсы пользователя
        if (userId) {
          // Освобождаем все слоты этого пользователя
          const slotToRelease = userSlots.get(userId);
          if (slotToRelease !== undefined) {
            slotAssignments.delete(slotToRelease);
            userSlots.delete(userId);
            console.log(`Автоматически освобожден слот ${slotToRelease} для ${userId} из-за неактивности`);
          }
          
          // Удаляем информацию о состоянии камеры
          cameraStates.delete(userId);
          
          // Удаляем из списка подключений
          connections.delete(userId);
          console.log(`Пользователь отключен из-за неактивности: ${userId}`);
          
          // Транслируем обновление всем клиентам
          broadcastSlotUpdate();
          broadcastCameraStates();
        }
        
        // Принудительно закрываем соединение
        ws.terminate();
        clearInterval(connectionCheckInterval);
      }
    }, 5000);
    
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
