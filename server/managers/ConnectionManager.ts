import { WebSocket } from 'ws';
import { globalEvents } from './EventEmitter';
import { slotManager } from './SlotManager';
import { cameraManager } from './CameraManager';

/**
 * Тип сообщения WebSocket
 */
export interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

/**
 * Менеджер WebSocket подключений
 */
export class ConnectionManager {
  // Карта подключений (userId -> WebSocket)
  private connections = new Map<string, WebSocket>();
  
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
      console.log(`Активные соединения: ${this.connections.size}, активные слоты: ${slotManager.getOccupiedSlotsCount()}`);
    }, 10000);
  }
  
  /**
   * Зарегистрировать новое WebSocket соединение
   * @param userId Идентификатор пользователя
   * @param ws WebSocket соединение
   */
  registerConnection(userId: string, ws: WebSocket): void {
    // Удаляем предыдущее соединение если есть
    if (this.connections.has(userId)) {
      const oldWs = this.connections.get(userId);
      if (oldWs) {
        try {
          oldWs.close();
        } catch (error) {
          console.error(`Ошибка закрытия предыдущего соединения для ${userId}:`, error);
        }
      }
    }
    
    // Регистрируем новое соединение
    this.connections.set(userId, ws);
    
    // Инициализируем состояние камеры
    cameraManager.initializeUserCamera(userId);
    
    // Отмечаем активность пользователя
    this.markUserActivity(userId);
    
    // Настраиваем обработчики событий для WebSocket
    this.setupEventHandlers(userId, ws);
    
    // Настраиваем проверку активности
    this.setupActivityChecker(userId, ws);
    
    console.log(`Зарегистрировано новое соединение для ${userId}`);
  }
  
  /**
   * Отправить сообщение конкретному пользователю
   * @param userId Идентификатор пользователя
   * @param message Сообщение для отправки
   */
  sendToUser(userId: string, message: WebSocketMessage): boolean {
    const ws = this.connections.get(userId);
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error(`Ошибка отправки сообщения пользователю ${userId}:`, error);
        return false;
      }
    }
    
    return false;
  }
  
  /**
   * Отправить сообщение всем подключенным пользователям
   * @param message Сообщение для рассылки
   */
  broadcastToAll(message: WebSocketMessage): void {
    const messageStr = JSON.stringify(message);
    
    this.connections.forEach((ws, userId) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(messageStr);
        } catch (error) {
          console.error(`Ошибка отправки сообщения пользователю ${userId}:`, error);
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
  disconnectUser(userId: string): void {
    const ws = this.connections.get(userId);
    
    // Удаляем таймер проверки активности
    const checker = this.activityCheckers.get(userId);
    if (checker) {
      clearInterval(checker);
      this.activityCheckers.delete(userId);
    }
    
    // Удаляем информацию об активности
    this.lastActivityTime.delete(userId);
    
    // Закрываем соединение
    if (ws) {
      try {
        ws.close();
      } catch (error) {
        console.error(`Ошибка закрытия соединения для ${userId}:`, error);
      }
      
      this.connections.delete(userId);
    }
    
    // Удаляем информацию о состоянии камеры
    cameraManager.removeCameraState(userId);
    
    // Освобождаем слот
    slotManager.releaseUserSlot(userId);
    
    console.log(`Отключен пользователь ${userId}`);
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
      case 'select_slot':
        // Пользователь выбирает слот
        if (data.slotNumber !== undefined) {
          const slotNumber = Number(data.slotNumber);
          const success = slotManager.assignSlot(userId, slotNumber);
          
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
    // Обработчик закрытия соединения
    ws.on('close', () => {
      console.log(`Соединение закрыто для ${userId}`);
      this.disconnectUser(userId);
    });
    
    // Обработчик ошибок
    ws.on('error', (error) => {
      console.error(`Ошибка в соединении для ${userId}:`, error);
      this.disconnectUser(userId);
    });
    
    // Подписываемся на события изменения слотов
    globalEvents.on("slots_updated", (slots) => {
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
    });
    
    // Подписываемся на события изменения состояний камер
    globalEvents.on("camera_states_updated", (cameraStates) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({
            type: 'camera_states_update',
            cameraStates
          }));
        } catch (error) {
          console.error(`Ошибка отправки обновления состояний камер пользователю ${userId}:`, error);
        }
      }
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
    return this.connections.size;
  }
}

// Создаем глобальный экземпляр менеджера соединений
export const connectionManager = new ConnectionManager();