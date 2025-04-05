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
  const setCameraState = useCallback((enabled: boolean) => {
    return sendMessage({
      type: 'camera_state_change',
      enabled
    });
  }, [sendMessage]);

  // Выбор слота
  const selectSlot = useCallback((slotNumber: number) => {
    return sendMessage({
      type: 'select_slot',
      slotNumber
    });
  }, [sendMessage]);

  // Освобождение слота
  const releaseSlot = useCallback(() => {
    return sendMessage({
      type: 'release_slot'
    });
  }, [sendMessage]);
  
  // Функция для переопределения регистрации пользователя при необходимости
  const registerUser = useCallback(() => {
    return sendMessage({
      type: 'register',
      userId: userIdRef.current
    });
  }, [sendMessage]);

  // Эффект для установки WebSocket соединения
  useEffect(() => {
    // Сохраняем актуальный userId в ref
    userIdRef.current = userId;
    console.log('ID пользователя обновлен в useSlots:', userId);

    // Функция для установки соединения
    const connectWebSocket = () => {
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

        // Определяем эффективный идентификатор пользователя
        // Приоритет: 1) глобальный в window 2) переданный в хук 3) из localStorage
        let effectiveUserId = userIdRef.current;
        
        // Проверяем, есть ли глобальный идентификатор
        if (window.currentUserIdentity && window.currentUserIdentity !== 'undefined') {
          effectiveUserId = window.currentUserIdentity;
          console.log('Использую глобальный идентификатор:', effectiveUserId);
        } 
        // Если нет, пробуем использовать переданный в хук
        else if (userId && userId !== 'unknown-user') {
          effectiveUserId = userId;
          console.log('Использую переданный в хук идентификатор:', effectiveUserId);
          // Синхронизируем с глобальной переменной
          window.currentUserIdentity = effectiveUserId;
        }
        // В крайнем случае проверяем localStorage
        else {
          const storedId = window.localStorage.getItem('user-identity');
          if (storedId) {
            effectiveUserId = storedId;
            console.log('Использую идентификатор из localStorage:', effectiveUserId);
            window.currentUserIdentity = effectiveUserId;
          } else {
            // Генерация нового ID в крайнем случае
            effectiveUserId = `User-${Math.floor(Math.random() * 10000)}-${Math.floor(Math.random() * 10000)}`;
            console.log('Сгенерирован новый идентификатор:', effectiveUserId);
            window.localStorage.setItem('user-identity', effectiveUserId);
            window.currentUserIdentity = effectiveUserId;
          }
        }

        // Регистрируем пользователя на сервере с эффективным ID
        console.log('Регистрируем пользователя на сервере:', effectiveUserId);
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
      };

      // Обработчик закрытия соединения
      socket.onclose = () => {
        console.log('WebSocket соединение закрыто');
        setState(prev => ({ ...prev, connected: false }));
        
        // Переподключение через 5 секунд при разрыве соединения
        setTimeout(() => {
          if (socketRef.current === socket) {
            connectWebSocket();
          }
        }, 5000);
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
              const newCameraStates = data.cameraStates || {};
              console.log('Получены обновления состояния камер:', newCameraStates);
              
              setState(prev => {
                // Объединяем существующие состояния с новыми
                // Важно: НЕ заменяем весь объект, а только обновляем полученные состояния
                const mergedCameraStates = { ...prev.cameraStates };
                
                // Добавляем только те состояния, которые получили в обновлении
                Object.entries(newCameraStates).forEach(([userId, enabled]) => {
                  mergedCameraStates[userId] = enabled as boolean;
                });
                
                console.log('Объединенные состояния камер:', mergedCameraStates);
                
                return {
                  ...prev,
                  cameraStates: mergedCameraStates
                };
              });
              break;
            }
            
            case 'slot_busy': {
              // Уведомление, что слот занят
              console.log(`Слот ${data.slotNumber} уже занят другим пользователем`);
              break;
            }
            
            case 'ping': {
              // Ответ на пинг от сервера
              sendMessage({ type: 'pong' });
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
    setCameraState,
    registerUser
  };
}