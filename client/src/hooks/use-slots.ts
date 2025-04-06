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
  displayNames: Record<string, string>; // userId -> displayName
}

export function useSlots(userId: string) {
  console.log('useSlots hook initialized with userId:', userId);
  
  const [state, setState] = useState<SlotsState>({
    slots: {},
    userSlot: null,
    loading: true,
    connected: false,
    error: null,
    cameraStates: {},
    displayNames: {}
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
            
            case 'display_name_update': {
              // Обновление отображаемого имени пользователя
              if (data.userId && data.displayName) {
                console.log(`Получено обновление отображаемого имени: ${data.userId} -> ${data.displayName}`);
                setState(prev => {
                  // Клонируем текущие отображаемые имена и добавляем/обновляем новое
                  const displayNames = { ...prev.displayNames, [data.userId]: data.displayName };
                  console.log('Обновлен объект displayNames:', displayNames);
                  return { ...prev, displayNames };
                });
                
                // Выводим текущие имена через таймаут для проверки
                setTimeout(() => {
                  // Получаем текущее состояние из хука
                  setState(currentState => {
                    console.log('Текущие отображаемые имена после обновления:', 
                      JSON.stringify(currentState.displayNames || {}, null, 2));
                    return currentState; // Возвращаем без изменений
                  });
                }, 500);
              }
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

  // Функция для перемещения пользователя в другой слот (только для ведущего)
  const moveUserToSlot = useCallback((userIdToMove: string, targetSlot: number) => {
    return sendMessage({
      type: 'move_user',
      userIdToMove,
      targetSlot
    });
  }, [sendMessage]);
  
  // Функция для перемешивания всех пользователей (только для ведущего)
  const shuffleAllUsers = useCallback(() => {
    console.log('Запрос на перемешивание пользователей');
    return sendMessage({
      type: 'shuffle_users'
    });
  }, [sendMessage]);
  
  // Функция для переименования пользователя (только для ведущего)
  const renameUser = useCallback((targetUserId: string, newName: string) => {
    console.log(`Запрос на переименование пользователя ${targetUserId} -> ${newName}`);
    return sendMessage({
      type: 'rename_user',
      targetUserId,
      newName
    });
  }, [sendMessage]);

  // Функция получения отображаемого имени для пользователя
  const getDisplayName = useCallback((userId: string): string => {
    // Если для этого пользователя есть отображаемое имя, возвращаем его
    if (state.displayNames[userId]) {
      return state.displayNames[userId];
    }
    
    // Если нет отображаемого имени, извлекаем имя из userId
    // Формат userId: "Player-name-1234" или "Host-name-1234"
    if (userId) {
      // Проверяем наличие префикса
      const isHost = userId.startsWith('Host-');
      const isPlayer = userId.startsWith('Player-');
      
      if (isHost || isPlayer) {
        // Удаляем префикс "Host-" или "Player-"
        const withoutPrefix = isHost
          ? userId.substring(5)
          : userId.substring(7);
        
        // Находим индекс последнего дефиса, который разделяет имя и ID
        const lastDashIndex = withoutPrefix.lastIndexOf('-');
        
        if (lastDashIndex !== -1) {
          // Возвращаем только имя без ID
          return withoutPrefix.substring(0, lastDashIndex);
        }
        return withoutPrefix;
      }
    }
    
    // В крайнем случае возвращаем оригинальный userId
    return userId;
  }, [state.displayNames]);

  return {
    ...state,
    selectSlot,
    releaseSlot,
    setCameraState,
    moveUserToSlot,
    shuffleAllUsers,
    renameUser,
    getDisplayName,
    wsRef: socketRef // Экспортируем ссылку на WebSocket для использования в других хуках
  };
}