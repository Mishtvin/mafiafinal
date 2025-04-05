import { useState, useEffect, useCallback, useRef } from 'react';

export interface SlotInfo {
  userId: string;
  slotNumber: number;
}

export interface SlotsState {
  slots: Record<number, string>; // slotNumber -> userId
  userSlot: number | null;
  loading: boolean;
  connected: boolean;
  error: string | null;
  cameraStates: Record<string, boolean>; // userId -> cameraOn
}

export function useSlots(userId: string) {
  console.log('useSlots hook initialized with userId:', userId);
  
  const [state, setState] = useState<SlotsState>({
    slots: {},
    userSlot: null,
    loading: true,
    connected: false,
    error: null,
    cameraStates: {}
  });

  const socketRef = useRef<WebSocket | null>(null);
  const userIdRef = useRef(userId);

  // Функция для отправки сообщения через WebSocket
  const sendMessage = useCallback((message: any) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);
  
  // Функция для обновления состояния камеры
  // userId - опциональный параметр, если не указан - используется текущий пользователь
  const setCameraState = useCallback((enabledOrUserId: boolean | string, enabledParam?: boolean) => {
    // Проверяем формат аргументов
    let enabled: boolean;
    
    if (typeof enabledOrUserId === 'boolean') {
      // Вызов в старом формате setCameraState(enabled)
      enabled = enabledOrUserId;
    } else if (typeof enabledOrUserId === 'string' && typeof enabledParam === 'boolean') {
      // Вызов в новом формате setCameraState(userId, enabled)
      enabled = enabledParam;
    } else {
      console.error('Неверный формат аргументов setCameraState');
      return false;
    }
    
    return sendMessage({
      type: 'camera_state_change',
      enabled
    });
  }, [sendMessage]);

  // Выбор слота
  const selectSlot = useCallback((slotNumber: number, dragAndDrop: boolean = false) => {
    // Проверка, не выбран ли тот же слот
    if (state.userSlot === slotNumber) {
      console.log(`Игнорирую выбор текущего слота ${slotNumber}`);
      return false;
    }

    console.log(`Выбираем слот ${slotNumber} с dragAndDrop=${dragAndDrop}`);
    return sendMessage({
      type: 'select_slot',
      slotNumber,
      dragAndDrop
    });
  }, [sendMessage, state.userSlot]);

  // Освобождение слота
  const releaseSlot = useCallback(() => {
    return sendMessage({
      type: 'release_slot'
    });
  }, [sendMessage]);

  // Эффект для установки WebSocket соединения
  useEffect(() => {
    // Сохраняем актуальный userId в ref
    userIdRef.current = userId;
    console.log('ID пользователя обновлен в useSlots:', userId);

    // Увеличиваем попытки переподключения для улучшения надёжности
    const maxReconnectAttempts = 5;
    let reconnectAttempt = 0;

    // Функция для установки соединения
    const connectWebSocket = () => {
      reconnectAttempt++;
      setState(prev => ({ ...prev, loading: true, error: null }));

      // Определяем адрес WebSocket сервера
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      // Создаем WebSocket соединение
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      // Обработчик открытия соединения
      socket.onopen = () => {
        console.log('WebSocket соединение установлено');
        setState(prev => ({ ...prev, connected: true, loading: false }));

        // Используем глобальный идентификатор из window, если доступен
        let effectiveUserId = userIdRef.current;
        if (window.currentUserIdentity && window.currentUserIdentity !== 'undefined') {
          effectiveUserId = window.currentUserIdentity;
          console.log('Использую глобальный идентификатор:', effectiveUserId);
        }

        // Регистрируем пользователя на сервере
        console.log('Регистрируем пользователя:', effectiveUserId);
        sendMessage({
          type: 'register',
          userId: effectiveUserId
        });
      };

      // Обработчик ошибок
      socket.onerror = (error) => {
        console.error('WebSocket ошибка:', error);
        setState(prev => ({ 
          ...prev, 
          error: 'Ошибка подключения к серверу', 
          loading: false,
          connected: false 
        }));
        
        // Немедленно пытаемся переподключиться при ошибке
        setTimeout(() => {
          if (socketRef.current === socket) {
            console.log('Немедленное переподключение после ошибки WebSocket');
            connectWebSocket();
          }
        }, 500);
      };

      // Обработчик закрытия соединения
      socket.onclose = () => {
        console.log('WebSocket соединение закрыто');
        setState(prev => ({ ...prev, connected: false }));
        
        // Уменьшаем время переподключения для более быстрого восстановления
        // Адаптивный интервал в зависимости от попытки: чем больше попыток, тем больше интервал
        const reconnectDelay = Math.min(1000 * Math.pow(1.5, reconnectAttempt - 1), 5000);
        
        if (reconnectAttempt <= maxReconnectAttempts) {
          console.log(`Попытка переподключения ${reconnectAttempt}/${maxReconnectAttempts} через ${reconnectDelay}мс`);
          
          setTimeout(() => {
            if (socketRef.current === socket) {
              connectWebSocket();
            }
          }, reconnectDelay);
        } else {
          console.log(`Достигнуто максимальное количество попыток переподключения (${maxReconnectAttempts})`);
          // Сбрасываем счетчик попыток и пробуем ещё раз через больший интервал
          reconnectAttempt = 0;
          setTimeout(() => {
            if (socketRef.current === socket) {
              connectWebSocket();
            }
          }, 5000);
        }
      };

      // Обработчик входящих сообщений
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('WebSocket получено сообщение:', data);
          
          switch (data.type) {
            case 'slots_update': {
              // Обновление информации о слотах
              const slots: Record<number, string> = {};
              let userSlot: number | null = null;
              
              // Заполняем объект слотов из массива
              data.slots.forEach((slot: SlotInfo) => {
                slots[slot.slotNumber] = slot.userId;
                console.log(`Слот ${slot.slotNumber} занят пользователем ${slot.userId}`);
                
                // Возможно два идентификатора для сравнения - текущий и глобальный
                const currentId = userIdRef.current;
                const globalId = window.currentUserIdentity;
                
                console.log(`Сравниваем слот ${slot.slotNumber}: ${slot.userId} с ${currentId} и ${globalId}`);
                
                // Проверяем соответствие либо текущему, либо глобальному идентификатору
                if (slot.userId === currentId || 
                    (globalId && slot.userId === globalId)) {
                  userSlot = slot.slotNumber;
                  console.log(`Найден слот текущего пользователя: ${userSlot}`);
                }
              });
              
              console.log('Обновляем состояние слотов:', 
                          'текущий userSlot =', userSlot, 
                          'всего слотов =', Object.keys(slots).length);
              
              setState(prev => {
                const newState = { 
                  ...prev, 
                  slots,
                  userSlot
                };
                console.log('Новое состояние:', newState);
                return newState;
              });
              break;
            }
            
            case 'camera_states_update': {
              // Обновление информации о состоянии камер
              const cameraStates = data.cameraStates || {};
              console.log('Получены обновления состояния камер:', cameraStates);
              
              setState(prev => ({
                ...prev,
                cameraStates
              }));
              break;
            }
            
            case 'slot_busy': {
              // Уведомление, что слот занят
              console.log(`Слот ${data.slotNumber} уже занят другим пользователем`);
              break;
            }
            
            case 'slot_selection_result': {
              // Результат выбора слота
              if (data.success) {
                console.log(`Успешно выбран слот ${data.slotNumber}`);
              } else {
                console.log(`Ошибка выбора слота: ${data.message}`);
              }
              break;
            }
            
            case 'ping': {
              // Ответ на пинг от сервера с текущим временем для измерения задержки
              sendMessage({ 
                type: 'pong',
                timestamp: Date.now(),
                userId: userIdRef.current || window.currentUserIdentity
              });
              break;
            }
            
            default:
              console.log('Получено неизвестное сообщение:', data);
          }
        } catch (error) {
          console.error('Ошибка обработки сообщения:', error);
        }
      };
    };

    // Установка соединения
    connectWebSocket();

    // Очистка при размонтировании
    return () => {
      const socket = socketRef.current;
      if (socket) {
        socket.onclose = null; // Отключаем автоматическое переподключение
        socket.close();
        socketRef.current = null;
      }
    };
  }, [userId, sendMessage]);

  return {
    ...state,
    selectSlot,
    releaseSlot,
    setCameraState
  };
}