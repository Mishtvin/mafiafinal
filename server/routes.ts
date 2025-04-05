import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { AccessToken, VideoGrant } from "livekit-server-sdk";
import { WebSocketServer } from "ws";
import { WebSocket } from "ws";
import { randomUUID } from 'crypto';

// LiveKit настройки
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = 'wss://livekit.nyavkin.site/'; // URL сервера LiveKit со слешем в конце

// Структура данных для хранения информации о слотах
interface SlotInfo {
  userId: string;
  slotNumber: number;
}

// Сессионное хранилище для сохранения данных между перезагрузками
interface SessionData {
  userId: string;
  preferredSlot?: number;
  timestamp: number;
}

// Создаем сессионное хранилище
const SESSION_STORE = new Map<string, SessionData>();

// Периодически очищаем старые сессии (старше 24 часов)
setInterval(() => {
  const MAX_SESSION_AGE = 24 * 60 * 60 * 1000; // 24 часа
  const now = Date.now();
  
  let sessionsRemoved = 0;
  
  SESSION_STORE.forEach((data, sessionId) => {
    if (now - data.timestamp > MAX_SESSION_AGE) {
      SESSION_STORE.delete(sessionId);
      sessionsRemoved++;
    }
  });
  
  if (sessionsRemoved > 0) {
    console.log(`🧹 Очищено ${sessionsRemoved} устаревших сессий`);
  }
}, 3600000); // Проверяем каждый час

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
      const { identity, roomName, sessionId, deviceId } = req.body;
      
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
        
        // Обработка сессии для установления постоянной идентификации
        let validSessionId = sessionId;
        let userSlot: number | undefined = undefined;
        
        if (sessionId && SESSION_STORE.has(sessionId)) {
          // Если сессия существует, проверяем соответствие пользователя
          const sessionData = SESSION_STORE.get(sessionId)!;
          if (sessionData.userId === identity) {
            // Пользователь совпадает, восстанавливаем его предпочтительный слот
            userSlot = sessionData.preferredSlot;
            
            // Обновляем временную метку для продления жизни сессии
            sessionData.timestamp = Date.now();
            SESSION_STORE.set(sessionId, sessionData);
            
            console.log(`🔄 Обновлена существующая сессия ${sessionId} для ${identity}, слот=${userSlot}`);
          } else {
            // Пользователь изменился - создадим новую сессию
            console.log(`⚠️ Сессия ${sessionId} принадлежит ${sessionData.userId}, а не ${identity}. Создаем новую.`);
            validSessionId = randomUUID();
            SESSION_STORE.set(validSessionId, {
              userId: identity,
              timestamp: Date.now()
            });
          }
        } else if (!validSessionId) {
          // Если сессия не существует, создаем новую
          validSessionId = randomUUID();
          SESSION_STORE.set(validSessionId, {
            userId: identity,
            timestamp: Date.now()
          });
          console.log(`🆕 Создана новая сессия ${validSessionId} для ${identity}`);
        }
        
        // Проверяем наличие сохраненного слота для пользователя
        if (!userSlot && userSlots.has(identity)) {
          userSlot = userSlots.get(identity);
          console.log(`📋 Найден активный слот ${userSlot} для ${identity}`);
        }
        
        // Если есть слот и сессия - сохраняем слот в сессии
        if (userSlot && validSessionId) {
          const sessionData = SESSION_STORE.get(validSessionId) || { 
            userId: identity, 
            timestamp: Date.now(),
            preferredSlot: undefined
          } as SessionData;
          
          sessionData.preferredSlot = userSlot;
          SESSION_STORE.set(validSessionId, sessionData);
          console.log(`💾 Сохранен слот ${userSlot} в сессии ${validSessionId} для ${identity}`);
        }
        
        // Возвращаем токен в формате, который ожидает клиент
        return res.json({ 
          token: tokenString, 
          identity, 
          room: actualRoomName,
          sessionId: validSessionId,
          slot: userSlot
        });
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
  
  // Временные метки отключения пользователей (userId -> timestamp)
  const userDisconnectTimes = new Map<string, number>();
  const SLOT_RESERVATION_TIMEOUT = 60000; // 60 секунд для возможности переподключения
  
  // Периодическая проверка состояния для устранения рассинхронизации
  setInterval(() => {
    // Текущее время для проверки таймаутов
    const currentTime = Date.now();
    
    // Проверяем, что все слоты соответствуют активным соединениям
    const validUserIds = new Set<string>(connections.keys());
    
    // Для отладки
    console.log(`🔎 Периодическая проверка: соединения=${connections.size}, слоты=${slotAssignments.size}, присвоено=${userSlots.size}, камеры=${cameraStates.size}`);
    
    // Ищем слоты, где пользователь отключен более 60 секунд
    let needsUpdate = false;
    
    // Проверяем слоты на предмет долго отключенных пользователей
    slotAssignments.forEach((userId, slotNumber) => {
      if (!validUserIds.has(userId)) {
        // Пользователь не подключен в данный момент
        
        // Записываем время отключения, если еще не записано
        if (!userDisconnectTimes.has(userId)) {
          userDisconnectTimes.set(userId, currentTime);
          console.log(`⏰ Начало отсчета времени для ${userId} в слоте ${slotNumber}`);
        }
        
        // Проверяем, прошло ли достаточно времени для очистки
        const disconnectTime = userDisconnectTimes.get(userId) || 0;
        const timePassed = currentTime - disconnectTime;
        
        if (timePassed > SLOT_RESERVATION_TIMEOUT) {
          // Прошло более 60 секунд - освобождаем слот
          console.log(`⌛ Время истекло (${Math.round(timePassed/1000)}с) - очистка слота ${slotNumber} для отключенного пользователя ${userId}`);
          slotAssignments.delete(slotNumber);
          userSlots.delete(userId);
          cameraStates.delete(userId);
          userDisconnectTimes.delete(userId);
          needsUpdate = true;
        } else {
          // Показываем оставшееся время
          const remainingSeconds = Math.round((SLOT_RESERVATION_TIMEOUT - timePassed) / 1000);
          console.log(`🕘 Слот ${slotNumber} зарезервирован для ${userId} еще на ${remainingSeconds}с`);
        }
      } else {
        // Пользователь снова подключен - сбрасываем таймер
        if (userDisconnectTimes.has(userId)) {
          console.log(`✅ Пользователь ${userId} вернулся в слот ${slotNumber}, сбрасываем таймер`);
          userDisconnectTimes.delete(userId);
        }
      }
    });
    
    // Проверяем целостность данных между slotAssignments и userSlots
    userSlots.forEach((slotNumber, userId) => {
      const assignedUserId = slotAssignments.get(slotNumber);
      if (!assignedUserId || assignedUserId !== userId) {
        console.log(`🔄 Исправляем несоответствие: слот ${slotNumber} для пользователя ${userId}`);
        slotAssignments.set(slotNumber, userId);
        needsUpdate = true;
      }
    });
    
    // Если были изменения - рассылаем обновление
    if (needsUpdate) {
      console.log('🔄 Очистка неактивных соединений вызвала рассылку обновлений');
      broadcastSlotUpdate();
      broadcastCameraStates();
    }
    
    // Отладка: показываем все текущие слоты
    console.log('📊 Текущие назначения слотов:');
    slotAssignments.forEach((userId, slot) => {
      const status = validUserIds.has(userId) ? '✅' : '⏳';
      console.log(`- Слот ${slot}: ${userId} ${status}`);
    });
    
    // Периодически отправляем обновление всем клиентам для синхронизации
    broadcastSlotUpdate();
    broadcastCameraStates();
    
    console.log(`📡 Активные соединения: ${connections.size}, активные слоты: ${slotAssignments.size}`);
  }, 5000); // каждые 5 секунд

  const pingInterval = 5000; // 5 секунд
  const pingIntervalId = setInterval(() => {
    // Проверяем соединения и отправляем пинги
    connections.forEach((ws, userId) => {
      if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        // Соединение закрыто, удаляем его из активных соединений
        connections.delete(userId);
        
        // Отмечаем время отключения для будущей очистки
        if (!userDisconnectTimes.has(userId)) {
          userDisconnectTimes.set(userId, Date.now());
          console.log(`⏰ Обнаружено закрытое соединение для ${userId}, запускаем таймер бронирования`);
          
          const userSlot = userSlots.get(userId);
          if (userSlot !== undefined) {
            console.log(`🕒 Слот ${userSlot} забронирован для ${userId} на 60 секунд (обнаружено закрытое соединение)`);
          }
        }
        
        // Отправляем обновление всем для синхронизации статусов
        broadcastSlotUpdate();
        broadcastCameraStates();
      } else if (ws.readyState === WebSocket.OPEN) {
        // Соединение открыто, отправляем ping для проверки активности
        try {
          ws.send(JSON.stringify({ type: 'ping' }));
        } catch (e) {
          // Ошибка при отправке ping
          console.error(`❌ Ошибка отправки ping для ${userId}:`, e);
          
          // Удаляем соединение из активных
          connections.delete(userId);
          
          // Отмечаем время отключения для будущей очистки
          if (!userDisconnectTimes.has(userId)) {
            userDisconnectTimes.set(userId, Date.now());
            console.log(`⏰ Ошибка ping для ${userId}, запускаем таймер бронирования`);
            
            const userSlot = userSlots.get(userId);
            if (userSlot !== undefined) {
              console.log(`🕒 Слот ${userSlot} забронирован для ${userId} на 60 секунд (ошибка ping)`);
            }
          }
          
          // Отправляем обновления всем
          broadcastSlotUpdate();
          broadcastCameraStates();
        }
      }
    });
    
    // Обрабатываем броню слотов для отключенных пользователей
    // Это делается в периодической проверке каждые 5 секунд, выше в коде
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
            if (!userId) {
              console.error('❌ Ошибка: получен пустой userId при регистрации');
              break;
            }
            
            console.log(`🆕 РЕГИСТРАЦИЯ: пользователь ${userId}`);
            connections.set(userId, ws);
            
            // Обрабатываем sessionId, если он был передан
            const sessionId = data.sessionId;
            if (sessionId) {
              console.log(`🔑 Получен sessionId ${sessionId} при регистрации ${userId}`);
              
              // Проверяем, существует ли сессия
              if (SESSION_STORE.has(sessionId)) {
                const sessionData = SESSION_STORE.get(sessionId)!;
                
                // Обновляем время сессии
                sessionData.timestamp = Date.now();
                
                // Если пользователь совпадает, и есть предпочтительный слот в сессии,
                // используем его вместо переданного в сообщении
                if (sessionData.userId === userId && sessionData.preferredSlot) {
                  console.log(`📋 Найден предпочтительный слот ${sessionData.preferredSlot} в сессии ${sessionId} для ${userId}`);
                  data.preferredSlot = sessionData.preferredSlot;
                } else if (sessionData.userId !== userId) {
                  // Пользователь не совпадает с сессией - это неожиданно
                  console.warn(`⚠️ SessionId ${sessionId} принадлежит ${sessionData.userId}, а не ${userId}`);
                }
              } else {
                // Сессия не найдена, но клиент передал sessionId - создаем новую запись
                console.log(`⚠️ Сессия ${sessionId} не найдена, создаем новую`);
                SESSION_STORE.set(sessionId, {
                  userId,
                  timestamp: Date.now(),
                  preferredSlot: undefined
                } as SessionData);
              }
            }
            
            // Обрабатываем предпочтительный слот с дополнительными проверками
            let preferredSlot: number | null = null;
            if (data.preferredSlot !== undefined && data.preferredSlot !== null) {
              preferredSlot = Number(data.preferredSlot);
              // Проверка на корректность номера слота
              if (isNaN(preferredSlot) || preferredSlot < 1 || preferredSlot > 12) {
                console.error(`❌ Некорректный предпочтительный слот: ${data.preferredSlot}`);
                preferredSlot = null;
              } else {
                console.log(`📱 Пользователь ${userId} имеет предпочтительный слот: ${preferredSlot}`);
              }
            } else {
              console.log(`⚠️ Пользователь ${userId} без предпочтительного слота`);
            }
            
            // Устанавливаем начальное состояние камеры (выключена по умолчанию)
            if (!cameraStates.has(userId)) {
              cameraStates.set(userId, false);
              console.log(`📷 Установлено начальное состояние камеры (выкл) для ${userId}`);
            }
            
            // Если пользователь уже имеет слот, проверяем его валидность
            if (userSlots.has(userId)) {
              const currentSlot = userSlots.get(userId);
              const slotOwner = slotAssignments.get(currentSlot!);
              
              if (slotOwner === userId) {
                console.log(`✅ Пользователь ${userId} уже имеет корректный слот ${currentSlot}`);
                
                // Если есть предпочтительный слот и он отличается от текущего,
                // сохраним его и попробуем назначить
                if (preferredSlot && preferredSlot !== currentSlot) {
                  console.log(`🔄 У пользователя ${userId} текущий слот ${currentSlot}, но предпочтительный ${preferredSlot}`);
                }
              } else {
                // Несоответствие между userSlots и slotAssignments
                console.error(`❌ Несоответствие слотов: userId=${userId}, currentSlot=${currentSlot}, slotOwner=${slotOwner}`);
                userSlots.delete(userId); // Сбрасываем некорректное состояние
              }
            }
            
            // Если пользователь не имеет слота, пытаемся назначить предпочтительный или свободный
            if (!userSlots.has(userId)) {
              console.log(`🔎 Ищем слот для пользователя ${userId}`);
              
              // Список уже занятых слотов
              const occupiedSlots = new Set<number>();
              slotAssignments.forEach((_, slot) => {
                occupiedSlots.add(slot);
              });
              
              // Отладка: показываем занятые слоты перед назначением
              console.log(`📋 Занятые слоты перед назначением для ${userId}:`, Array.from(occupiedSlots));
              
              let assignedSlot = false;
              
              // Пытаемся назначить предпочтительный слот, если он свободен
              if (preferredSlot && preferredSlot >= 1 && preferredSlot <= 12) {
                console.log(`🎯 Проверка доступности предпочтительного слота ${preferredSlot} для ${userId}`);
                
                // Проверяем, действительно ли слот свободен
                if (!occupiedSlots.has(preferredSlot)) {
                  slotAssignments.set(preferredSlot, userId);
                  userSlots.set(userId, preferredSlot);
                  console.log(`✅ Успешно назначен предпочтительный слот ${preferredSlot} для ${userId}`);
                  assignedSlot = true;
                } else {
                  // Дополнительная проверка: возможно, слот занят пользователем, который отключился
                  const slotUserId = slotAssignments.get(preferredSlot);
                  
                  // Особый случай: пользователь с другим ID, но то же самое соединение
                  const isUserReconnectWithDifferentId = slotUserId && 
                    (slotUserId.includes(userId) || userId.includes(slotUserId) || 
                    (sessionId && SESSION_STORE.has(sessionId) && 
                     SESSION_STORE.get(sessionId)!.userId === slotUserId));
                  
                  if (isUserReconnectWithDifferentId) {
                    // Пользователь переподключается с немного другим ID, но это тот же физический пользователь
                    console.log(`🔄 Обнаружено переподключение пользователя с другим ID: старый=${slotUserId}, новый=${userId}`);
                    
                    // Очищаем старые данные пользователя
                    userSlots.delete(slotUserId);
                    if (connections.has(slotUserId)) {
                      connections.delete(slotUserId);
                    }
                    
                    // Обновляем слот под новый ID
                    slotAssignments.set(preferredSlot, userId);
                    userSlots.set(userId, preferredSlot);
                    console.log(`✅ Обновлен ID пользователя в слоте ${preferredSlot}: ${slotUserId} -> ${userId}`);
                    assignedSlot = true;
                  }
                  // Стандартный случай: проверка на отключенного пользователя
                  else if (slotUserId && !connections.has(slotUserId)) {
                    // Слот занят отключенным пользователем, можно освободить и занять
                    console.log(`♻️ Освобождаем слот ${preferredSlot} от неактивного пользователя ${slotUserId}`);
                    slotAssignments.delete(preferredSlot);
                    userSlots.delete(slotUserId);
                    
                    // Занимаем слот текущим пользователем
                    slotAssignments.set(preferredSlot, userId);
                    userSlots.set(userId, preferredSlot);
                    console.log(`✅ Успешно назначен предпочтительный слот ${preferredSlot} после очистки`);
                    assignedSlot = true;
                  } else {
                    console.log(`🚫 Предпочтительный слот ${preferredSlot} уже занят активным пользователем ${slotUserId}`);
                  }
                }
              }
              
              // Если предпочтительный слот не указан или занят, ищем свободный
              if (!assignedSlot) {
                // Особая обработка для слотов 11 и 12
                const prioritySlots = preferredSlot && (preferredSlot === 11 || preferredSlot === 12) 
                  ? [preferredSlot] // Сначала проверяем предпочтительный 11/12
                  : [];
                
                // Затем добавляем остальные слоты
                const allSlots = [...prioritySlots];
                for (let i = 1; i <= 12; i++) {
                  if (!prioritySlots.includes(i)) {
                    allSlots.push(i);
                  }
                }
                
                // Ищем первый свободный слот в порядке приоритета
                for (const slotToCheck of allSlots) {
                  if (!occupiedSlots.has(slotToCheck)) {
                    slotAssignments.set(slotToCheck, userId);
                    userSlots.set(userId, slotToCheck);
                    console.log(`✅ Автоматически назначен слот ${slotToCheck} для ${userId}`);
                    assignedSlot = true;
                    break;
                  }
                }
              }
              
              if (!assignedSlot) {
                console.warn(`⚠️ Не удалось найти свободный слот для ${userId}, все слоты заняты`);
              }
            }
            
            // Отправляем текущее состояние слотов всем клиентам для синхронизации
            broadcastSlotUpdate();
            
            // Отправляем состояние камер всем клиентам для синхронизации
            broadcastCameraStates();
            break;
            
          case 'select_slot':
            // Пользователь выбирает слот
            if (!userId) {
              console.error('❌ Получен запрос на выбор слота без userId');
              break;
            }
            
            const selectedSlot = Number(data.slotNumber); // Принудительное приведение к числу
            if (isNaN(selectedSlot) || selectedSlot < 1 || selectedSlot > 12) {
              console.error(`❌ Некорректный номер слота: ${data.slotNumber}, пользователь: ${userId}`);
              sendToClient({
                type: 'error',
                message: 'Некорректный номер слота'
              });
              break;
            }
            
            console.log(`🎯 Попытка выбора: пользователь ${userId} хочет выбрать слот ${selectedSlot}`);
            const previousSlot = userSlots.get(userId);
            
            // Освобождаем предыдущий слот, если был
            if (previousSlot !== undefined) {
              slotAssignments.delete(previousSlot);
              console.log(`📋 Освободили предыдущий слот ${previousSlot} для пользователя ${userId}`);
            }
            
            // Проверяем, не занят ли выбранный слот
            const currentOccupant = slotAssignments.get(selectedSlot);
            if (currentOccupant && currentOccupant !== userId) {
              // Слот занят другим пользователем
              console.log(`🚫 Слот ${selectedSlot} уже занят пользователем ${currentOccupant}`);
              sendToClient({
                type: 'slot_busy',
                slotNumber: selectedSlot
              });
              
              // Восстанавливаем предыдущий слот, если был
              if (previousSlot !== undefined) {
                slotAssignments.set(previousSlot, userId);
                console.log(`♻️ Восстановлен предыдущий слот ${previousSlot} для пользователя ${userId}`);
              }
              break;
            }
            
            // Занимаем новый слот
            slotAssignments.set(selectedSlot, userId);
            userSlots.set(userId, selectedSlot);
            
            console.log(`✅ Пользователь ${userId} успешно выбрал слот ${selectedSlot}`);
            
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
        console.log(`⚠️ Соединение неактивно более 15 секунд для ${userId || 'неизвестного пользователя'}`);
        
        if (userId) {
          // НЕ удаляем информацию о слоте и камере!
          // Вместо этого отмечаем время отключения для будущей очистки
          if (!userDisconnectTimes.has(userId)) {
            userDisconnectTimes.set(userId, now);
            const userSlot = userSlots.get(userId);
            console.log(`⏰ Запускаем таймер резервирования для ${userId} в слоте ${userSlot || 'нет'}`);
          }
          
          // Удаляем только из активных соединений
          connections.delete(userId);
          
          // Отправляем обновления всем клиентам
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
        // Отмечаем время отключения пользователя
        const disconnectTime = Date.now();
        const userSlot = userSlots.get(userId);
        
        console.log(`⏳ Пользователь отключился: ${userId}, слот: ${userSlot || 'нет'}`);
        
        // Важно: НЕ освобождаем слот сразу, даем возможность переподключиться с сохранением слота
        // Это особенно важно для слотов 11 и 12, которые имеют особую роль
        // Используем таймер на 60 секунд (вместо мгновенного освобождения)
        
        // Удаляем только из активных соединений
        connections.delete(userId);
        
        // Отправляем обновление всем подключенным клиентам
        // НЕ удаляем информацию о слоте и состоянии камеры!
        // Эта информация будет очищена через 60 секунд, если пользователь не переподключится
        
        // Отправляем обновления другим клиентам
        broadcastSlotUpdate();
        broadcastCameraStates();
        
        console.log(`🕐 Слот ${userSlot} забронирован для ${userId} на 60 секунд для возможного переподключения`);
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
