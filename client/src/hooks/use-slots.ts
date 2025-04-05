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

// Константа для имени ключа в localStorage
const SLOT_STORAGE_KEY = 'mafialive-user-slot';

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
  
  // Получение сохраненного слота для пользователя из localStorage
  const getSavedSlot = useCallback(() => {
    try {
      const savedData = localStorage.getItem(SLOT_STORAGE_KEY);
      if (savedData) {
        const data = JSON.parse(savedData);
        if (data.userId === userId && data.slotNumber) {
          console.log(`Восстановлен слот ${data.slotNumber} для пользователя ${userId} из localStorage`);
          return data.slotNumber;
        }
      }
    } catch (error) {
      console.error('Ошибка при чтении сохраненного слота:', error);
    }
    return null;
  }, [userId]);

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
    // Сохраняем выбранный слот в localStorage
    try {
      const data = {
        userId: userId,
        slotNumber: slotNumber,
        timestamp: Date.now()
      };
      localStorage.setItem(SLOT_STORAGE_KEY, JSON.stringify(data));
      console.log(`Выбранный слот ${slotNumber} для пользователя ${userId} сохранен в localStorage`);
    } catch (error) {
      console.error('Ошибка при сохранении выбранного слота:', error);
    }
    
    // Отправляем запрос на сервер
    return sendMessage({
      type: 'select_slot',
      slotNumber
    });
  }, [userId, sendMessage]);

  // Очистка информации о слоте в localStorage
  const clearSlotStorage = useCallback(() => {
    try {
      localStorage.removeItem(SLOT_STORAGE_KEY);
      console.log(`Информация о слоте для пользователя ${userId} удалена из localStorage`);
      return true;
    } catch (error) {
      console.error('Ошибка при удалении информации о слоте:', error);
      return false;
    }
  }, [userId]);
  
  // Освобождение слота
  const releaseSlot = useCallback(() => {
    // Удаляем информацию о слоте из localStorage
    clearSlotStorage();
    
    // Отправляем запрос на сервер
    return sendMessage({
      type: 'release_slot'
    });
  }, [clearSlotStorage, sendMessage]);

  // Функция для сохранения информации о слоте в localStorage
  const saveSlotToStorage = useCallback((slotNumber: number) => {
    try {
      const data = {
        userId: userId,
        slotNumber: slotNumber,
        timestamp: Date.now()
      };
      localStorage.setItem(SLOT_STORAGE_KEY, JSON.stringify(data));
      console.log(`Слот ${slotNumber} для пользователя ${userId} сохранен в localStorage`);
    } catch (error) {
      console.error('Ошибка при сохранении слота:', error);
    }
  }, [userId]);
  
  // Эффект для отслеживания изменения userSlot и сохранения в localStorage
  useEffect(() => {
    if (state.userSlot) {
      saveSlotToStorage(state.userSlot);
    }
  }, [state.userSlot, saveSlotToStorage]);

  // Эффект для обработки закрытия вкладки/окна
  useEffect(() => {
    const handleBeforeUnload = () => {
      console.log('Страница закрывается, удаляем сохраненный слот из localStorage');
      try {
        // Проверяем, что пользователь действительно имел назначенный слот перед удалением
        if (state.userSlot) {
          localStorage.removeItem(SLOT_STORAGE_KEY);
        }
      } catch (error) {
        console.error('Ошибка при удалении сохраненного слота:', error);
      }
    };
    
    // Добавляем обработчик события закрытия страницы
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Удаляем обработчик при размонтировании компонента
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      
      // Очищаем данные в localStorage при размонтировании компонента
      if (state.userSlot) {
        console.log('Компонент размонтируется, очищаем данные слота в localStorage');
        clearSlotStorage();
      }
    };
  }, [state.userSlot, clearSlotStorage]);

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

        // Используем глобальный идентификатор из window, если доступен
        let effectiveUserId = userIdRef.current;
        if (window.currentUserIdentity && window.currentUserIdentity !== 'undefined') {
          effectiveUserId = window.currentUserIdentity;
          console.log('Использую глобальный идентификатор:', effectiveUserId);
        }

        // Получаем предпочтительный слот из localStorage
        const preferredSlot = getSavedSlot();
        
        // Регистрируем пользователя на сервере, включая предпочтительный слот
        console.log('Регистрируем пользователя:', effectiveUserId, preferredSlot ? `с предпочтительным слотом ${preferredSlot}` : 'без предпочтительного слота');
        sendMessage({
          type: 'register',
          userId: effectiveUserId,
          preferredSlot: preferredSlot
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
    setCameraState
  };
}