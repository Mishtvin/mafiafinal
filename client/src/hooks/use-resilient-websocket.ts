import { useRef, useEffect, useCallback, useState } from 'react';
import { debounce, throttle, ExponentialBackoffStrategy } from '../lib/performance-utils';

// Типы сообщений
export interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

// Конфигурация WebSocket соединения
export interface WebSocketConfig {
  url: string;
  initialReconnectDelay?: number; // начальная задержка в мс
  maxReconnectDelay?: number; // максимальная задержка в мс
  reconnectBackoffMultiplier?: number; // множитель для экспоненциального отступа
  heartbeatInterval?: number; // интервал отправки heartbeat в мс
  heartbeatTimeout?: number; // таймаут ожидания ответа на heartbeat в мс
  connectTimeout?: number; // таймаут на установку соединения в мс
  debug?: boolean; // включение подробного логирования
}

// Состояние WebSocket соединения
export interface WebSocketState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  reconnectAttempt: number;
}

/**
 * Хук для устойчивого WebSocket соединения с автоматическим переподключением,
 * отслеживанием состояния, проверками здоровья соединения и экспоненциальным отступом
 */
export function useResilientWebSocket(
  config: WebSocketConfig,
  onMessage?: (data: any) => void,
  dependencies: any[] = []
) {
  // WebSocket instance
  const socketRef = useRef<WebSocket | null>(null);
  
  // Таймеры и флаги
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnect = useRef<boolean>(true);
  const lastHeartbeatResponseRef = useRef<number>(Date.now());
  const currentReconnectDelay = useRef<number>(config.initialReconnectDelay || 1000);
  
  // Состояние
  const [state, setState] = useState<WebSocketState>({
    connected: false,
    connecting: false,
    error: null,
    reconnectAttempt: 0
  });

  // Функция логирования с возможностью отключения
  const log = useCallback(
    (message: string, ...args: any[]) => {
      if (config.debug) {
        console.log(`[WebSocket] ${message}`, ...args);
      }
    },
    [config.debug]
  );

  // Функция для отправки сообщения
  const sendMessage = useCallback(
    (message: WebSocketMessage): boolean => {
      const socket = socketRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(JSON.stringify(message));
          return true;
        } catch (err) {
          log('Ошибка отправки сообщения:', err);
          return false;
        }
      }
      log('Не удалось отправить сообщение, WebSocket не подключен', message);
      return false;
    },
    [log]
  );

  // Функция для очистки всех таймеров
  const clearAllTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
  }, []);

  // Функция для проверки "зависшего" соединения
  const checkConnectionHealth = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      log('Проверка здоровья соединения: соединение не открыто');
      return;
    }

    // Сколько времени (мс) прошло с последнего успешного heartbeat
    const timeSinceLastResponse = Date.now() - lastHeartbeatResponseRef.current;
    log('Время с последнего ответа на heartbeat:', timeSinceLastResponse, 'мс');

    // Если не получили ответ в течение heartbeatTimeout, закрываем соединение вручную
    if (timeSinceLastResponse > (config.heartbeatTimeout || 10000)) {
      log('Соединение считается зависшим, принудительное переподключение');
      
      // Закрываем текущее соединение (но не сразу, т.к. может просто быть задержка)
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
      
      // Считаем предыдущее соединение закрытым
      setState(prev => ({ ...prev, connected: false, connecting: false }));
      
      // Запускаем переподключение
      reconnect();
    } else {
      // Отправляем проверку здоровья соединения
      sendMessage({ type: '_heartbeat' });
      
      // Устанавливаем таймаут на ожидание ответа
      heartbeatTimeoutRef.current = setTimeout(() => {
        log('Нет ответа на heartbeat, возможно соединение зависло');
        checkConnectionHealth(); // Перепроверим соединение
      }, config.heartbeatTimeout || 10000);
    }
  }, [config.heartbeatTimeout, log, sendMessage]);

  // Функция для переподключения с экспоненциальной задержкой
  const reconnect = useCallback(() => {
    // Отменяем все существующие таймеры
    clearAllTimers();
    
    // Если не нужно переподключаться, выходим
    if (!shouldReconnect.current) return;
    
    // Обновляем состояние
    setState(prev => ({ 
      ...prev, 
      connecting: true,
      reconnectAttempt: prev.reconnectAttempt + 1 
    }));
    
    // Рассчитываем задержку с экспоненциальным отступом
    const maxDelay = config.maxReconnectDelay || 30000; // 30 секунд
    const backoffMultiplier = config.reconnectBackoffMultiplier || 1.5;
    
    // Используем экспоненциальный отступ с базой currentReconnectDelay
    const delay = Math.min(
      currentReconnectDelay.current * backoffMultiplier, 
      maxDelay
    );
    
    // Обновляем задержку для следующего раза
    currentReconnectDelay.current = delay;
    
    log(`Переподключение через ${delay}мс (попытка ${state.reconnectAttempt + 1})`);
    
    // Планируем переподключение
    reconnectTimerRef.current = setTimeout(() => {
      connectWebSocket();
    }, delay);
  }, [clearAllTimers, config.maxReconnectDelay, config.reconnectBackoffMultiplier, log, state.reconnectAttempt]);

  // Основная функция установки WebSocket соединения
  const connectWebSocket = useCallback(() => {
    // Очищаем все таймеры перед новым подключением
    clearAllTimers();
    
    // Отмечаем процесс подключения
    setState(prev => ({ ...prev, connecting: true, error: null }));
    
    try {
      // Создаем новое соединение
      log('Устанавливаем новое WebSocket соединение:', config.url);
      const socket = new WebSocket(config.url);
      socketRef.current = socket;
      
      // Устанавливаем таймаут на подключение
      connectTimeoutRef.current = setTimeout(() => {
        log('Таймаут установки соединения');
        // Если соединение всё ещё в процессе установки, закрываем его
        if (socket.readyState === WebSocket.CONNECTING) {
          socket.close();
          setState(prev => ({ 
            ...prev, 
            connecting: false, 
            error: 'Таймаут подключения к серверу' 
          }));
          // Запускаем переподключение
          reconnect();
        }
      }, config.connectTimeout || 10000);
      
      // Обработчик успешного подключения
      socket.onopen = () => {
        log('WebSocket соединение установлено');
        
        // Очищаем таймаут подключения
        if (connectTimeoutRef.current) {
          clearTimeout(connectTimeoutRef.current);
          connectTimeoutRef.current = null;
        }
        
        // Сбрасываем счетчик попыток и задержку при успешном подключении
        setState(prev => ({ 
          ...prev, 
          connected: true, 
          connecting: false,
          error: null,
          reconnectAttempt: 0 
        }));
        currentReconnectDelay.current = config.initialReconnectDelay || 1000;
        
        // Запускаем периодическую проверку здоровья соединения
        lastHeartbeatResponseRef.current = Date.now(); // Сбрасываем таймер heartbeat
        heartbeatTimerRef.current = setInterval(() => {
          checkConnectionHealth();
        }, config.heartbeatInterval || 13000); // 13 секунд - простое число
      };
      
      // Обработчик ошибок
      socket.onerror = (event) => {
        log('WebSocket ошибка:', event);
        setState(prev => ({ 
          ...prev, 
          error: 'Ошибка WebSocket соединения',
          connecting: false 
        }));
      };
      
      // Обработчик закрытия соединения
      socket.onclose = (event) => {
        log(`WebSocket соединение закрыто: ${event.code} ${event.reason}`);
        
        // Очищаем таймеры
        clearAllTimers();
        
        // Обновляем состояние
        setState(prev => ({ 
          ...prev, 
          connected: false, 
          connecting: false 
        }));
        
        // Запускаем переподключение, если нужно
        if (shouldReconnect.current) {
          reconnect();
        }
      };
      
      // Обработчик входящих сообщений
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Обрабатываем специальные служебные сообщения
          if (data.type === '_heartbeat_response' || data.type === '_pong') {
            lastHeartbeatResponseRef.current = Date.now();
            
            // Очищаем таймаут ожидания ответа на heartbeat
            if (heartbeatTimeoutRef.current) {
              clearTimeout(heartbeatTimeoutRef.current);
              heartbeatTimeoutRef.current = null;
            }
            
            // Не логируем служебные сообщения, если не в режиме отладки
            if (config.debug) {
              log('Получен ответ на heartbeat');
            }
            return;
          }
          
          // Пинг от сервера - отвечаем pong и обновляем время последнего ответа
          if (data.type === '_ping' || data.type === 'ping') {
            lastHeartbeatResponseRef.current = Date.now();
            sendMessage({ type: 'pong' });
            return;
          }
          
          // Логируем другие сообщения
          if (data.type !== '_ping' && data.type !== '_pong') {
            log('Получено сообщение:', data);
          }
          
          // Вызываем переданный обработчик сообщений
          if (onMessage) {
            onMessage(data);
          }
          
          // Вызываем все зарегистрированные глобальные обработчики сообщений
          if (window.messageHandlers && Array.isArray(window.messageHandlers)) {
            for (const handler of window.messageHandlers) {
              try {
                handler(data);
              } catch (error) {
                console.error('Ошибка в глобальном обработчике сообщений:', error);
              }
            }
          }
        } catch (error) {
          log('Ошибка обработки сообщения:', error);
        }
      };
    } catch (error) {
      log('Ошибка при создании WebSocket соединения:', error);
      setState(prev => ({ 
        ...prev, 
        connecting: false, 
        error: 'Не удалось создать WebSocket соединение' 
      }));
      // Запускаем переподключение
      reconnect();
    }
  }, [
    clearAllTimers, 
    config.connectTimeout, 
    config.debug, 
    config.heartbeatInterval, 
    config.initialReconnectDelay, 
    config.url, 
    checkConnectionHealth, 
    log, 
    onMessage, 
    reconnect, 
    sendMessage
  ]);

  // Основной эффект для установки соединения
  useEffect(() => {
    log('Инициализация WebSocket соединения');
    shouldReconnect.current = true;
    connectWebSocket();
    
    // Очистка при размонтировании
    return () => {
      log('Очистка WebSocket ресурсов');
      shouldReconnect.current = false;
      clearAllTimers();
      
      const socket = socketRef.current;
      if (socket) {
        // Отключаем все обработчики перед закрытием
        socket.onclose = null;
        socket.onerror = null;
        socket.onmessage = null;
        socket.onopen = null;
        
        // Закрываем соединение
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
        socketRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.url, ...dependencies]);

  // Метод для ручного переподключения
  const manualReconnect = useCallback(() => {
    log('Запрошено ручное переподключение');
    
    // Закрываем существующее соединение
    const socket = socketRef.current;
    if (socket) {
      socket.close();
    }
    
    // Сбрасываем задержку и переподключаемся немедленно
    currentReconnectDelay.current = config.initialReconnectDelay || 1000;
    
    // Подключаемся напрямую без задержки
    connectWebSocket();
  }, [connectWebSocket, config.initialReconnectDelay, log]);

  return {
    state,
    sendMessage,
    reconnect: manualReconnect, // Экспортируем метод для ручного переподключения
    socketRef // Экспортируем ссылку на сокет для использования в крайних случаях
  };
}