/**
 * WebSocket сервис для поддержания одного соединения на все приложение
 */

// Базовый интерфейс WebSocket сообщения
export interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

// Типы сообщений для слотов
export interface SlotAssignmentMessage extends WebSocketMessage {
  type: 'slotAssignment';
  slots: Array<{
    userId: string;
    slotNumber: number;
  }>;
}

// Типы сообщений для камеры
export interface CameraStateMessage extends WebSocketMessage {
  type: 'cameraState';
  userId: string;
  isEnabled: boolean;
}

export interface CameraStatesMessage extends WebSocketMessage {
  type: 'cameraStates';
  states: Record<string, boolean>;
}

// Служебные сообщения
export interface PingMessage extends WebSocketMessage {
  type: 'ping';
}

export interface PongMessage extends WebSocketMessage {
  type: 'pong';
  timestamp: number;
}

export interface ErrorMessage extends WebSocketMessage {
  type: 'error';
  message: string;
}

// Тип для объединения всех возможных сообщений
export type ServerMessage = 
  | SlotAssignmentMessage
  | CameraStateMessage
  | CameraStatesMessage
  | PongMessage
  | ErrorMessage;

export type ClientMessage = 
  | PingMessage
  | { type: 'requestSlot'; slotNumber: number }
  | { type: 'releaseSlot' }
  | { type: 'setCameraState'; isEnabled: boolean };

// Типы слушателей
type MessageListener = (event: MessageEvent) => void;
type StatusListener = (status: 'connected' | 'disconnected' | 'connecting' | 'reconnecting') => void;

class WebSocketService {
  private socket: WebSocket | null = null;
  private url: string;
  private messageListeners: MessageListener[] = [];
  private statusListeners: StatusListener[] = [];
  private reconnectTimer: number | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 1000;
  private status: 'connected' | 'disconnected' | 'connecting' | 'reconnecting' = 'disconnected';
  private messageQueue: string[] = [];

  constructor() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.url = `${protocol}//${window.location.host}/ws`;
    
    // Автоподключение при создании
    this.connect();
    
    // Обработка видимости страницы
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        console.log('[WebSocketService] Страница стала видимой, проверяем соединение');
        this.checkConnection();
      }
    });
    
    // Переподключение при переходе в онлайн
    window.addEventListener('online', () => {
      console.log('[WebSocketService] Сеть доступна, переподключаемся');
      this.reconnect();
    });
  }
  
  /**
   * Получить текущий статус соединения
   */
  getStatus(): 'connected' | 'disconnected' | 'connecting' | 'reconnecting' {
    return this.status;
  }
  
  /**
   * Установить соединение с WebSocket сервером
   */
  connect(): void {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      console.log('[WebSocketService] Соединение уже установлено или устанавливается');
      return;
    }
    
    this.setStatus('connecting');
    this.socket = new WebSocket(this.url);
    
    this.socket.onopen = () => {
      console.log('[WebSocketService] Соединение установлено');
      this.setStatus('connected');
      this.reconnectAttempts = 0;
      
      // Отправляем сообщения из очереди
      this.processQueue();
    };
    
    this.socket.onmessage = (event) => {
      this.messageListeners.forEach(listener => {
        try {
          listener(event);
        } catch (e) {
          console.error('[WebSocketService] Ошибка в обработчике сообщения:', e);
        }
      });
    };
    
    this.socket.onclose = () => {
      console.log('[WebSocketService] Соединение закрыто');
      this.setStatus('disconnected');
      this.reconnect();
    };
    
    this.socket.onerror = (error) => {
      console.error('[WebSocketService] Ошибка WebSocket:', error);
      this.socket?.close();
    };
  }
  
  /**
   * Проверить состояние соединения и переподключиться при необходимости
   */
  checkConnection(): void {
    if (!this.socket || this.socket.readyState === WebSocket.CLOSED || this.socket.readyState === WebSocket.CLOSING) {
      console.log('[WebSocketService] Соединение закрыто, переподключаемся');
      this.reconnect();
    } else if (this.socket.readyState === WebSocket.OPEN) {
      // Проверяем соединение, отправляя пинг
      try {
        this.socket.send(JSON.stringify({ type: 'ping' }));
        console.log('[WebSocketService] Отправлен пинг для проверки соединения');
      } catch (e) {
        console.error('[WebSocketService] Ошибка при отправке пинга:', e);
        this.reconnect();
      }
    }
  }
  
  /**
   * Переподключение к серверу
   */
  reconnect(): void {
    // Сбрасываем предыдущий таймер переподключения
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[WebSocketService] Достигнуто максимальное количество попыток переподключения');
      return;
    }
    
    this.setStatus('reconnecting');
    this.reconnectAttempts++;
    
    // Экспоненциальная задержка между попытками
    const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 30000);
    
    console.log(`[WebSocketService] Попытка переподключения через ${delay}мс (попытка ${this.reconnectAttempts})`);
    
    this.reconnectTimer = window.setTimeout(() => {
      this.connect();
    }, delay);
  }
  
  /**
   * Принудительное закрытие соединения
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.setStatus('disconnected');
  }
  
  /**
   * Отправка сообщения через WebSocket
   */
  send(message: any): boolean {
    // Сериализуем сообщение, если оно не строка
    const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
    
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(messageStr);
        return true;
      } catch (e) {
        console.error('[WebSocketService] Ошибка при отправке сообщения:', e);
        this.messageQueue.push(messageStr);
        this.reconnect();
        return false;
      }
    } else {
      // Добавляем в очередь для отправки после переподключения
      console.log('[WebSocketService] Соединение не установлено, добавляем сообщение в очередь');
      this.messageQueue.push(messageStr);
      this.connect(); // Пытаемся подключиться, если не подключены
      return false;
    }
  }
  
  /**
   * Обработка очереди сообщений
   */
  private processQueue(): void {
    if (this.messageQueue.length === 0 || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    
    console.log(`[WebSocketService] Обработка ${this.messageQueue.length} сообщений из очереди`);
    
    // Копируем очередь и очищаем оригинал
    const queue = [...this.messageQueue];
    this.messageQueue = [];
    
    // Отправляем сообщения
    queue.forEach(message => {
      try {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          this.socket.send(message);
        } else {
          // Если соединение разорвалось во время обработки очереди, 
          // возвращаем сообщения обратно в очередь
          this.messageQueue.push(message);
        }
      } catch (e) {
        console.error('[WebSocketService] Ошибка при отправке сообщения из очереди:', e);
        this.messageQueue.push(message);
      }
    });
  }
  
  /**
   * Обновить статус соединения и уведомить слушателей
   */
  private setStatus(status: 'connected' | 'disconnected' | 'connecting' | 'reconnecting'): void {
    if (this.status !== status) {
      this.status = status;
      
      // Уведомляем слушателей об изменении статуса
      this.statusListeners.forEach(listener => {
        try {
          listener(status);
        } catch (e) {
          console.error('[WebSocketService] Ошибка в обработчике статуса:', e);
        }
      });
    }
  }
  
  /**
   * Добавить слушателя сообщений
   */
  addMessageListener(listener: MessageListener): void {
    if (!this.messageListeners.includes(listener)) {
      this.messageListeners.push(listener);
    }
  }
  
  /**
   * Удалить слушателя сообщений
   */
  removeMessageListener(listener: MessageListener): void {
    this.messageListeners = this.messageListeners.filter(l => l !== listener);
  }
  
  /**
   * Добавить слушателя статуса соединения
   */
  addStatusListener(listener: StatusListener): void {
    if (!this.statusListeners.includes(listener)) {
      this.statusListeners.push(listener);
      // Отправляем текущий статус новому слушателю
      listener(this.status);
    }
  }
  
  /**
   * Удалить слушателя статуса соединения
   */
  removeStatusListener(listener: StatusListener): void {
    this.statusListeners = this.statusListeners.filter(l => l !== listener);
  }
}

// Экспортируем один экземпляр сервиса для всего приложения
export const webSocketService = new WebSocketService();

// Также добавляем ссылку в окно для доступа из других модулей
(window as any).webSocketService = webSocketService;