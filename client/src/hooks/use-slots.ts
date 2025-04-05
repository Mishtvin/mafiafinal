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
            
            // Обработка индивидуального обновления состояния камеры
            case 'individual_camera_update': {
              const { userId, enabled } = data;
              console.log(`Получено индивидуальное обновление камеры: ${userId} -> ${enabled}`);
              
              setState(prev => {
                // Получаем текущий ID пользователя
                const currentUserId = userIdRef.current;
                const globalId = window.currentUserIdentity;
                
                // Создаем копию текущего состояния камер
                const newCameraStates = { ...prev.cameraStates };
                
                // Проверяем, является ли эта камера нашим пользователем
                // ТОЛЬКО точное соответствие одному из наших идентификаторов
                const isCurrentUser = (
                  userId === currentUserId || 
                  userId === globalId
                );
                
                console.log(`Проверка своей камеры: userId=${userId}, currentUserId=${currentUserId}, globalId=${globalId}, isCurrentUser=${isCurrentUser}`);
                
                if (isCurrentUser) {
                  // ДЛЯ СВОЕЙ КАМЕРЫ:
                  console.log(`Получено обновление СВОЕЙ камеры с сервера: userId=${userId}, enabled=${enabled}`);
                  console.log(`Наш ID: currentUserId=${currentUserId}, globalId=${globalId}`);
                  
                  // Всегда проверяем сохраненное состояние в sessionStorage
                  const savedState = window.sessionStorage.getItem('camera-state');
                  console.log(`Но используем сохраненное состояние:`, savedState);
                  
                  if (savedState !== null) {
                    // Используем ТОЛЬКО сохраненное состояние вместо полученного
                    const savedEnabled = savedState === 'true';
                    console.log(`Устанавливаем свою камеру в сохраненное состояние: ${savedEnabled}`);
                    newCameraStates[userId] = savedEnabled;
                  } else if (userId in newCameraStates) {
                    // Не меняем уже установленное состояние
                    console.log(`Сохраняем текущее состояние своей камеры: ${userId} -> ${newCameraStates[userId]}`);
                  } else {
                    // Если нет данных, то по умолчанию камера ВЫКЛЮЧЕНА
                    newCameraStates[userId] = false;
                    console.log(`Устанавливаем начальное состояние своей камеры в выключено`);
                    
                    // Сохраняем это состояние
                    window.sessionStorage.setItem('camera-state', 'false');
                  }
                } else {
                  // ДЛЯ ЧУЖИХ КАМЕР:
                  // Всегда обновляем состояние из сети
                  console.log(`Обновляем состояние чужой камеры: ${userId} -> ${enabled}`);
                  newCameraStates[userId] = enabled;
                }
                
                return {
                  ...prev,
                  cameraStates: newCameraStates
                };
              });
              break;
            }
            
            case 'camera_states_update': {
              // Этот метод устарел и заменен на 'individual_camera_update'
              // Оставляем для обратной совместимости, но делаем его поведение минимальным
              console.log('Получено устаревшее camera_states_update сообщение, игнорируем его');
              // Не делаем никаких обновлений состояния, чтобы избежать конфликтов
              // с individual_camera_update
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