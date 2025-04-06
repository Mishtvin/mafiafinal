import { WebSocket } from 'ws';
import { globalEvents } from './EventEmitter';
import { slotManager } from './SlotManager';
import { cameraManager } from './CameraManager';
import { playerStateManager } from './PlayerStateManager';
import { SlotInfo, PlayerStates } from '../../shared/schema';

/**
 * Тип сообщения WebSocket
 */
export interface WebSocketMessage {
  type: string;
  // Общие параметры для всех сообщений
  [key: string]: any;
  
  // Перемешивание пользователей (shuffle_users)
  // userId - автоматически добавляется
}

/**
 * Менеджер WebSocket подключений
 */
export class ConnectionManager {
  // Карта подключений (userId -> массив WebSocket)
  private connections = new Map<string, WebSocket[]>();
  
  // Таймеры проверки активности для каждого пользователя
  private activityCheckers = new Map<string, NodeJS.Timeout>();
  
  // Время последней активности для каждого пользователя
  private lastActivityTime = new Map<string, number>();
  
  // Интервал отправки пингов (5 секунд)
  private readonly pingInterval = 5000;
  
  // Таймаут неактивности (15 секунд)
  private readonly inactivityTimeout = 15000;
  
  constructor() {
    console.log('ConnectionManager: Инициализирован');
    
    // Настраиваем периодическую отправку пингов
    setInterval(() => {
      this.pingAllConnections();
    }, this.pingInterval);
    
    // Настраиваем периодические проверки целостности
    setInterval(() => {
      console.log(`Активные пользователи: ${this.getUserCount()}, соединения: ${this.getConnectionCount()}, активные слоты: ${slotManager.getOccupiedSlotsCount()}`);
    }, 10000);
  }
  
  /**
   * Зарегистрировать новое WebSocket соединение
   * @param userId Идентификатор пользователя
   * @param ws WebSocket соединение
   */
  registerConnection(userId: string, ws: WebSocket): void {
    // Проверка на уже существующие соединения этого пользователя
    const isFirstConnection = !this.connections.has(userId);
    
    // Получаем текущий массив соединений или создаем новый
    const connections = this.connections.get(userId) || [];
    
    // Добавляем новое соединение
    connections.push(ws);
    
    // Сохраняем обновленный массив
    this.connections.set(userId, connections);
    
    // Если это первое соединение пользователя, проверяем наличие состояния камеры
    if (isFirstConnection) {
      // Проверяем, есть ли уже состояние камеры для этого пользователя
      const currentCameraState = cameraManager.getCameraState(userId);
      
      // Инициализируем состояние камеры только если его еще нет
      if (currentCameraState === undefined) {
        console.log(`Инициализируем новое состояние камеры для пользователя ${userId}`);
        cameraManager.initializeUserCamera(userId);
      } else {
        console.log(`Сохраняем существующее состояние камеры для ${userId}: ${currentCameraState}`);
      }
    }
    
    // Отмечаем активность пользователя
    this.markUserActivity(userId);
    
    // Настраиваем обработчики событий для WebSocket
    this.setupEventHandlers(userId, ws);
    
    // Настраиваем проверку активности
    this.setupActivityChecker(userId, ws);
    
    console.log(`Зарегистрировано новое соединение для ${userId} (всего соединений: ${connections.length})`);
    
    // Сразу после подключения отправляем клиенту текущее состояние слотов и камер
    try {
      const currentSlots = slotManager.getAllSlotAssignments();
      const currentCameraStates = cameraManager.getAllCameraStates();
      
      if (ws.readyState === WebSocket.OPEN) {
        // Отправляем информацию о слотах
        ws.send(JSON.stringify({
          type: 'slots_update',
          slots: currentSlots
        }));
        
        // Отправляем индивидуальные обновления только для ДРУГИХ камер, кроме своей
        // Это предотвращает перезапись собственного состояния камеры при подключении
        Object.entries(currentCameraStates).forEach(([cameraUserId, isEnabled]) => {
          // Проверяем, не является ли это камерой самого подключающегося пользователя
          if (cameraUserId !== userId) {
            ws.send(JSON.stringify({
              type: 'individual_camera_update',
              userId: cameraUserId,
              enabled: isEnabled
            }));
            console.log(`Отправлено индивидуальное обновление состояния ЧУЖОЙ камеры для ${cameraUserId} (${isEnabled}) клиенту ${userId}`);
          } else {
            console.log(`Пропускаем отправку состояния СВОЕЙ камеры для ${cameraUserId} клиенту ${userId}`);
          }
        });
        
        // Отправляем текущие состояния игроков (убит/жив)
        const playerStates = playerStateManager.getPlayerStates();
        ws.send(JSON.stringify({
          type: 'player_states_update',
          playerStates
        }));
        console.log(`Отправлено состояние игроков (убитые/живые) клиенту ${userId}`);
        
        console.log(`Отправлено первоначальное состояние клиенту ${userId}: ${currentSlots.length} слотов`);
      }
    } catch (error) {
      console.error(`Ошибка отправки начального состояния пользователю ${userId}:`, error);
    }
  }
  
  /**
   * Отправить сообщение конкретному пользователю
   * @param userId Идентификатор пользователя
   * @param message Сообщение для отправки
   */
  sendToUser(userId: string, message: WebSocketMessage): boolean {
    const connections = this.connections.get(userId);
    
    if (!connections || connections.length === 0) {
      return false;
    }
    
    const messageStr = JSON.stringify(message);
    let success = false;
    
    // Отправляем сообщение на все соединения пользователя
    for (const ws of connections) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(messageStr);
          success = true; // Если хотя бы одно соединение получило сообщение, считаем успешным
        } catch (error) {
          console.error(`Ошибка отправки сообщения пользователю ${userId}:`, error);
        }
      }
    }
    
    return success;
  }
  
  /**
   * Отправить сообщение всем подключенным пользователям
   * @param message Сообщение для рассылки
   */
  broadcastToAll(message: WebSocketMessage): void {
    const messageStr = JSON.stringify(message);
    
    this.connections.forEach((connections, userId) => {
      for (const ws of connections) {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(messageStr);
          } catch (error) {
            console.error(`Ошибка отправки сообщения пользователю ${userId}:`, error);
          }
        }
      }
    });
  }
  
  /**
   * Отметить активность пользователя (сбросить таймер неактивности)
   * @param userId Идентификатор пользователя
   */
  markUserActivity(userId: string): void {
    this.lastActivityTime.set(userId, Date.now());
  }
  
  /**
   * Проверить, неактивен ли пользователь
   * @param userId Идентификатор пользователя
   */
  isUserInactive(userId: string): boolean {
    const lastActivity = this.lastActivityTime.get(userId);
    if (!lastActivity) {
      return true;
    }
    
    return Date.now() - lastActivity > this.inactivityTimeout;
  }
  
  /**
   * Отключить пользователя (закрыть соединение и освободить ресурсы)
   * @param userId Идентификатор пользователя
   */
  disconnectUser(userId: string, ws?: WebSocket): void {
    const connections = this.connections.get(userId);
    
    if (!connections || connections.length === 0) {
      return;
    }
    
    // Если передан конкретный WebSocket, удаляем только его
    if (ws) {
      const index = connections.indexOf(ws);
      if (index !== -1) {
        // Закрываем соединение если оно еще не закрыто
        try {
          if (ws.readyState !== WebSocket.CLOSED) {
            ws.close();
          }
        } catch (error) {
          console.error(`Ошибка закрытия соединения для ${userId}:`, error);
        }
        
        // Удаляем из массива соединений
        connections.splice(index, 1);
        
        console.log(`Закрыто одно из соединений пользователя ${userId}, осталось: ${connections.length}`);
        
        // Обновляем массив соединений
        if (connections.length > 0) {
          this.connections.set(userId, connections);
        } else {
          this.connections.delete(userId);
        }
      }
    } else {
      // Если WebSocket не передан, закрываем все соединения
      for (const connection of connections) {
        try {
          if (connection.readyState !== WebSocket.CLOSED) {
            connection.close();
          }
        } catch (error) {
          console.error(`Ошибка закрытия соединения для ${userId}:`, error);
        }
      }
      
      // Удаляем все соединения
      this.connections.delete(userId);
    }
    
    // Проверяем, остались ли соединения для этого пользователя
    const remainingConnections = this.connections.get(userId);
    
    // Если соединений больше нет, освобождаем ресурсы
    if (!remainingConnections || remainingConnections.length === 0) {
      // Удаляем таймер проверки активности
      const checker = this.activityCheckers.get(userId);
      if (checker) {
        clearInterval(checker);
        this.activityCheckers.delete(userId);
      }
      
      // Удаляем информацию об активности
      this.lastActivityTime.delete(userId);
      
      // Удаляем информацию о состоянии камеры
      cameraManager.removeCameraState(userId);
      
      // Очищаем информацию о состоянии игрока (убит/жив)
      playerStateManager.clearPlayerState(userId);
      
      // Освобождаем слот
      slotManager.releaseUserSlot(userId);
      
      console.log(`Полностью отключен пользователь ${userId}`);
      
      // Удаляем запись о пользователе
      this.connections.delete(userId);
    }
  }
  
  /**
   * Обработать входящее сообщение
   * @param userId Идентификатор пользователя
   * @param data Данные сообщения
   */
  handleMessage(userId: string, data: WebSocketMessage): void {
    // Отмечаем активность пользователя при любом сообщении
    this.markUserActivity(userId);
    
    // Обработка различных типов сообщений
    switch (data.type) {
      case 'register':
        // Пользователь переопределяет свой идентификатор
        if (data.userId && data.userId !== userId) {
          console.log(`Обновлен идентификатор пользователя с ${userId} на ${data.userId}`);
          
          // Переносим данные на новый идентификатор
          const currentSlot = slotManager.getUserSlot(userId);
          const cameraState = cameraManager.getCameraState(userId);
          
          if (currentSlot) {
            // Освобождаем слот для старого ID и назначаем для нового
            console.log(`Переназначение слота ${currentSlot} с ${userId} на ${data.userId}`);
            slotManager.releaseUserSlot(userId);
            slotManager.assignSlot(data.userId, currentSlot);
          } else {
            // Если не было слота, пытаемся назначить новый
            console.log(`Назначение нового слота для ${data.userId}`);
            slotManager.assignFirstAvailableSlot(data.userId);
          }
          
          // Переносим состояние камеры, но не меняем состояние других камер
          if (cameraState !== undefined) {
            console.log(`Перенос состояния камеры для ${data.userId}: ${cameraState}`);
            // Избегаем глобального обновления при установке состояния камеры
            // Напрямую устанавливаем значение в маппинге CameraManager
            cameraManager['cameraStates'].set(data.userId, cameraState);
            
            // Используем новые изолированные события для пользователя
            globalEvents.emit("camera_state_changed_for_" + data.userId, data.userId, cameraState);
          } else {
            // Проверяем, есть ли уже состояние камеры для нового идентификатора
            const existingNewState = cameraManager.getCameraState(data.userId);
            
            if (existingNewState === undefined) {
              console.log(`Инициализируем новое состояние камеры для пользователя ${data.userId}`);
              cameraManager.initializeUserCamera(data.userId);
            } else {
              console.log(`Сохраняем существующее состояние камеры для ${data.userId}: ${existingNewState}`);
            }
          }
          
          // Отправляем обновленное состояние всем пользователям - только слоты
          const currentSlots = slotManager.getAllSlotAssignments();
          
          this.broadcastToAll({
            type: 'slots_update',
            slots: currentSlots
          });
          
          // Отправляем состояние камер только если жестко необходимо (не здесь)
        }
        break;
        
      case 'select_slot':
        // Пользователь выбирает слот
        if (data.slotNumber !== undefined) {
          const slotNumber = Number(data.slotNumber);
          const success = slotManager.assignSlot(userId, slotNumber);
          
          // Отправляем уведомление только если слот занят
          if (!success) {
            this.sendToUser(userId, {
              type: 'slot_busy',
              slotNumber
            });
          }
        }
        break;
        
      case 'release_slot':
        // Пользователь освобождает слот
        slotManager.releaseUserSlot(userId);
        break;
        
      case 'camera_state_change':
        // Изменение состояния камеры
        if (data.enabled !== undefined) {
          const isEnabled = Boolean(data.enabled);
          cameraManager.setCameraState(userId, isEnabled);
        }
        break;
        
      case 'pong':
        // Пользователь отвечает на ping
        // Активность уже отмечена в начале метода
        break;
      
      case 'kill_player':
        // Пользователь (ведущий) отмечает игрока как убитого
        if (data.targetUserId) {
          const success = playerStateManager.markPlayerAsKilled(userId, data.targetUserId);
          if (!success) {
            this.sendToUser(userId, {
              type: 'operation_failed',
              operation: 'kill_player',
              message: 'Только ведущий может отмечать игроков как убитых'
            });
          }
        }
        break;
        
      case 'revive_player':
        // Пользователь (ведущий) отмечает игрока как живого
        if (data.targetUserId) {
          const success = playerStateManager.markPlayerAsAlive(userId, data.targetUserId);
          if (!success) {
            this.sendToUser(userId, {
              type: 'operation_failed',
              operation: 'revive_player',
              message: 'Только ведущий может отмечать игроков как живых'
            });
          }
        }
        break;
        
      case 'reset_player_states':
        // Пользователь (ведущий) сбрасывает все состояния игроков
        const success = playerStateManager.resetAllPlayerStates(userId);
        if (!success) {
          this.sendToUser(userId, {
            type: 'operation_failed',
            operation: 'reset_player_states',
            message: 'Только ведущий может сбрасывать состояния игроков'
          });
        }
        break;
        
      case 'shuffle_users':
        // Перемешивание пользователей по слотам (только для ведущего)
        console.log(`Пользователь ${userId} запросил перемешивание пользователей`);
        const shuffleSuccess = slotManager.shuffleAllUsers(userId);
        
        if (shuffleSuccess) {
          console.log(`Пользователи успешно перемешаны администратором ${userId}`);
        } else {
          console.log(`Ошибка при перемешивании: пользователь ${userId} не имеет прав ведущего`);
          // Оповещаем пользователя об ошибке (опционально)
          this.sendToUser(userId, {
            type: 'error',
            message: 'Только ведущий может перемешивать пользователей'
          });
        }
        break;
        
      case 'rename_user':
        // Пользователь (ведущий) изменяет имя другого пользователя для отображения
        // Проверяем, что текущий пользователь - ведущий (слот 12)
        const isHostSlot = slotManager.getUserSlot(userId) === 12;
        
        if (isHostSlot && data.targetUserId && data.newName) {
          console.log(`Ведущий ${userId} изменяет имя пользователя ${data.targetUserId} на ${data.newName}`);
          
          // Проверяем, что targetUserId существует в слотах
          const targetSlot = slotManager.getUserSlot(data.targetUserId);
          if (!targetSlot) {
            console.log(`Пользователь ${data.targetUserId} не найден в слотах`);
            this.sendToUser(userId, {
              type: 'operation_failed',
              operation: 'rename_user',
              message: 'Пользователь не найден'
            });
            break;
          }
          
          // Вместо создания нового ID и переназначения слотов,
          // просто рассылаем всем клиентам уведомление о новом отображаемом имени
          // и продолжаем использовать тот же ID пользователя для всей внутренней логики
          
          // Отправляем broadcast о новом отображаемом имени
          this.broadcastToAll({
            type: 'display_name_update',
            userId: data.targetUserId,
            displayName: data.newName
          });
          
          console.log(`Имя пользователя ${data.targetUserId} изменено на ${data.newName} (только отображение)`);
          
          // Отправляем уведомление об успехе
          this.sendToUser(userId, {
            type: 'rename_success',
            userId: data.targetUserId,
            displayName: data.newName
          });
        } else {
          // Если пользователь не ведущий или не указано имя/целевой пользователь
          this.sendToUser(userId, {
            type: 'operation_failed',
            operation: 'rename_user',
            message: 'Только ведущий может изменять имена участников'
          });
        }
        break;
        
      case 'get_player_states':
        // Запрос текущих состояний игроков
        console.log(`Пользователь ${userId} запросил текущие состояния игроков`);
        // Отправляем состояния конкретному пользователю
        playerStateManager.sendPlayerStatesToUser(userId);
        break;
        
      default:
        console.log(`Получено неизвестное сообщение от ${userId}: ${data.type}`);
    }
  }
  
  /**
   * Настроить обработчики событий для WebSocket соединения
   * @param userId Идентификатор пользователя
   * @param ws WebSocket соединение
   */
  private setupEventHandlers(userId: string, ws: WebSocket): void {
    // Обработчик входящих сообщений
    ws.on('message', (message: string) => {
      try {
        const data = JSON.parse(message.toString()) as WebSocketMessage;
        this.handleMessage(userId, data);
      } catch (error) {
        console.error(`Ошибка обработки сообщения от ${userId}:`, error);
      }
    });
    
    // Обработчик закрытия соединения
    ws.on('close', () => {
      console.log(`Соединение закрыто для ${userId}`);
      this.disconnectUser(userId, ws);
    });
    
    // Обработчик ошибок
    ws.on('error', (error) => {
      console.error(`Ошибка в соединении для ${userId}:`, error);
      this.disconnectUser(userId, ws);
    });
    
    // Подписываемся на события изменения слотов
    const slotsListener = (slots: SlotInfo[]) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({
            type: 'slots_update',
            slots
          }));
        } catch (error) {
          console.error(`Ошибка отправки обновления слотов пользователю ${userId}:`, error);
        }
      }
    };
    
    // Больше не используем массовые обновления состояний камер
    // Заменено на индивидуальные обновления
    const cameraStatesListener = (cameraStates: Record<string, boolean>) => {
      // Функция оставлена для совместимости, но не выполняет никакой логики
      // Все обновления происходят через индивидуальные сообщения individual_camera_update
    };
    
    // Слушатель для обновления состояния конкретной камеры
    // В новой архитектуре мы подписываемся ТОЛЬКО на обновления для собственного пользователя
    const ownCameraStateChangedListener = (changedUserId: string, isEnabled: boolean) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          // В этот обработчик попадают только события для текущего пользователя,
          // но для безопасности все равно проверяем, что это именно его событие
          if (changedUserId === userId) {
            ws.send(JSON.stringify({
              type: 'individual_camera_update',
              userId: changedUserId,
              enabled: isEnabled
            }));
            
            console.log(`Отправлено индивидуальное обновление состояния СВОЕЙ камеры для ${changedUserId} (${isEnabled}) клиенту ${userId}`);
          }
        } catch (error) {
          console.error(`Ошибка отправки обновления состояния камеры ${changedUserId} пользователю ${userId}:`, error);
        }
      }
    };
    
    // Слушатель для обновления состояний игроков (убит/жив)
    const playerStatesListener = (playerStates: PlayerStates) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({
            type: 'player_states_update',
            playerStates
          }));
          console.log(`Отправлено обновление состояний игроков пользователю ${userId}`);
        } catch (error) {
          console.error(`Ошибка отправки обновления состояний игроков пользователю ${userId}:`, error);
        }
      }
    };
    
    // Регистрируем обработчики событий
    globalEvents.on("slots_updated", slotsListener);
    globalEvents.on("camera_states_updated", cameraStatesListener);
    // Подписываемся только на специфичный эвент для конкретного пользователя
    globalEvents.on("camera_state_changed_for_" + userId, ownCameraStateChangedListener);
    // Подписываемся на события обновления состояний игроков
    globalEvents.on("player_states_updated", playerStatesListener);
    
    // При закрытии соединения отписываемся от событий
    ws.on('close', () => {
      globalEvents.off("slots_updated", slotsListener);
      globalEvents.off("camera_states_updated", cameraStatesListener);
      globalEvents.off("camera_state_changed_for_" + userId, ownCameraStateChangedListener);
      globalEvents.off("player_states_updated", playerStatesListener);
    });
  }
  
  /**
   * Настроить проверку активности для пользователя
   * @param userId Идентификатор пользователя
   * @param ws WebSocket соединение
   */
  private setupActivityChecker(userId: string, ws: WebSocket): void {
    // Удаляем предыдущий таймер если есть
    const prevChecker = this.activityCheckers.get(userId);
    if (prevChecker) {
      clearInterval(prevChecker);
    }
    
    // Создаем новый таймер проверки активности
    const checker = setInterval(() => {
      if (this.isUserInactive(userId)) {
        console.log(`Соединение неактивно более ${this.inactivityTimeout / 1000} секунд для ${userId}`);
        
        // Временно помечаем как неактивного, но НЕ освобождаем слоты и не удаляем соединение
        // Это позволит пользователю вернуться к своему слоту, когда вкладка снова станет активной
        console.log(`Соединение помечено как неактивное для ${userId}, но слот ${slotManager.getUserSlot(userId)} сохранен`);
        
        // Выключаем камеру при неактивности
        cameraManager.disableCamera(userId);
      }
    }, 5000); // Проверяем каждые 5 секунд
    
    this.activityCheckers.set(userId, checker);
  }
  
  /**
   * Отправить ping всем подключенным клиентам
   */
  private pingAllConnections(): void {
    this.broadcastToAll({ type: 'ping' });
  }
  
  /**
   * Получить количество активных соединений
   */
  getConnectionCount(): number {
    let count = 0;
    this.connections.forEach(connections => {
      count += connections.length;
    });
    return count;
  }
  
  /**
   * Получить количество уникальных пользователей
   */
  getUserCount(): number {
    return this.connections.size;
  }
}

// Создаем глобальный экземпляр менеджера соединений
export const connectionManager = new ConnectionManager();