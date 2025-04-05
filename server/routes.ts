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
  role?: 'player' | 'host';
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
  
  // Администраторский эндпоинт для сброса назначений слотов (для тестирования)
  app.post('/api/admin/reset-slots', (req, res) => {
    try {
      // Сохраняем количество очищенных записей
      const deletedSlots = slotAssignments.size;
      const deletedUsers = userSlots.size;
      
      // Очищаем назначения слотов
      slotAssignments.clear();
      userSlots.clear();
      
      console.log('Все слоты сброшены через API');
      
      // Отправляем обновление всем клиентам
      broadcastSlotUpdate();
      
      // Возвращаем результат операции
      res.json({
        success: true,
        message: 'Все слоты успешно сброшены',
        stats: {
          clearedSlots: deletedSlots,
          clearedUsers: deletedUsers
        }
      });
    } catch (error) {
      console.error('Ошибка при сбросе слотов:', error);
      res.status(500).json({ 
        success: false,
        message: 'Ошибка при сбросе слотов',
        error: String(error)
      });
    }
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
  
  // Хранилище для ролей пользователей (userId -> role)
  const userRoles = new Map<string, 'player' | 'host'>();
  
  // Хранение ID ведущего (может быть только один)
  let roomHostId: string | null = null;
  
  // Периодическая проверка целостности состояния для устранения рассинхронизации
  setInterval(() => {
    // Проверяем, что все слоты соответствуют активным соединениям
    const activeUserIds = new Set<string>(connections.keys());
    
    // НЕ очищаем слоты для неактивных пользователей - они могут вернуться
    // Идея: пользователь может быть неактивен (нет соединения), но его слот сохраняется
    
    // Проверяем целостность данных между slotAssignments и userSlots
    let needsUpdate = false;
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
      console.log('Обнаружены несоответствия в назначении слотов, отправляем обновления');
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
        // Удаляем только закрытые соединения, но НЕ освобождаем слоты
        connections.delete(userId);
        console.log(`Соединение закрыто для ${userId}, но слот сохранен`);
        
        // Отправляем обновление всем
        broadcastCameraStates();
      } else if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'ping' }));
        } catch (e) {
          console.error(`Ошибка отправки ping для ${userId}:`, e);
          
          // При ошибке отправки удаляем соединение из списка активных, но сохраняем слот
          connections.delete(userId);
          console.log(`Соединение удалено из-за ошибки ping: ${userId}, но слот сохранен`);
          
          // Отправляем обновление всем
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
              
              // Если указана роль, сохраняем её
              if (data.role && (data.role === 'player' || data.role === 'host')) {
                // Если роль - ведущий, проверяем, не занята ли роль
                if (data.role === 'host') {
                  if (roomHostId && roomHostId !== userId) {
                    // Роль ведущего уже занята
                    sendToClient({
                      type: 'role_busy',
                      message: 'Роль ведущего уже занята'
                    });
                    // Назначаем роль игрока вместо ведущего
                    userRoles.set(userId, 'player');
                  } else {
                    // Назначаем роль ведущего
                    userRoles.set(userId, 'host');
                    roomHostId = userId;
                    console.log(`Пользователь ${userId} назначен ведущим`);
                  }
                } else {
                  // Назначаем роль игрока
                  userRoles.set(userId, 'player');
                }
              } else {
                // По умолчанию - игрок
                userRoles.set(userId, 'player');
              }
              
              // Проверяем, есть ли у пользователя слот, если нет - назначаем новый
              // Этот блок также проверяет, если пользователь переподключается - сохраняем тот же слот
              
              // Проверяем, существует ли уже слот для этого пользователя
              let existingSlot = null;
              slotAssignments.forEach((savedUserId, slotNumber) => {
                if (savedUserId === userId) {
                  existingSlot = slotNumber;
                }
              });
              
              if (existingSlot) {
                // Пользователь переподключается, возвращаем ему тот же слот
                console.log(`Пользователь ${userId} переподключился к слоту ${existingSlot}`);
                // Обновляем userSlots для связи двух карт
                userSlots.set(userId, existingSlot);
              } else if (!userSlots.has(userId)) {
                // Пользователь подключается впервые, нужен новый слот
                // Список уже занятых слотов
                const occupiedSlots = new Set<number>();
                slotAssignments.forEach((_, slot) => {
                  occupiedSlots.add(slot);
                });
                
                // Отладка: показываем занятые слоты перед назначением
                console.log(`Занятые слоты перед назначением для ${userId}:`, Array.from(occupiedSlots));
                
                // Находим свободный слот (с приоритетом для слота 1)
                let assignedSlot = false;
                
                // Приоритетное назначение слота 1, если он свободен
                if (!occupiedSlots.has(1)) {
                  slotAssignments.set(1, userId);
                  userSlots.set(userId, 1);
                  console.log(`Приоритетное назначение слота 1 для ${userId}`);
                  assignedSlot = true;
                } else {
                  // Если слот 1 занят, ищем другие свободные слоты
                  for (let i = 2; i <= 12; i++) {
                    if (!occupiedSlots.has(i)) {
                      slotAssignments.set(i, userId);
                      userSlots.set(userId, i);
                      console.log(`Автоматически назначен слот ${i} для ${userId}`);
                      assignedSlot = true;
                      break;
                    }
                  }
                }
                
                if (!assignedSlot) {
                  console.warn(`Не удалось найти свободный слот для ${userId}`);
                }
              } else {
                console.log(`Пользователь ${userId} уже имеет слот ${userSlots.get(userId)}`);
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
      if (now - lastPongTime > 30000) { // Увеличено с 15 до 30 секунд без ответа
        console.log(`Соединение неактивно более 30 секунд для ${userId || 'неизвестного пользователя'}`);
        
        // Очищаем все ресурсы пользователя
        if (userId) {
          // Отмечаем соединение как закрытое, но сохраняем слот
          // НЕ освобождаем слот, чтобы сохранить его за пользователем на случай переподключения
          console.log(`Соединение отмечено как неактивное для ${userId}, слот сохранен`);
          
          // Удаляем из списка активных подключений
          connections.delete(userId);
          
          // Транслируем обновление всем клиентам (но без освобождения слота)
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
        // Не освобождаем слот при отключении пользователя, сохраняем его для возможного переподключения
        console.log(`Пользователь отключился: ${userId} - сохраняем слот на случай переподключения`);
        
        // Только удаляем соединение из списка активных
        connections.delete(userId);
        
        // Отправляем обновление всем подключенным клиентам (слоты не меняются)
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
      // Добавляем информацию о роли пользователя
      const role = userRoles.get(userId) || 'player';
      currentSlots.push({ 
        userId, 
        slotNumber,
        role 
      });
    });
    
    const updateMessage = JSON.stringify({
      type: 'slots_update',
      slots: currentSlots,
      hostId: roomHostId
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
