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
  
  // Функция для обновления состояния камеры с защитой от слишком частых обновлений
  const lastCameraToggleTime = useRef<number>(0);
  const setCameraState = useCallback((enabled: boolean) => {
    // Защита от слишком частых переключений (минимум 1000 мс между изменениями)
    const now = Date.now();
    const timeSinceLastToggle = now - lastCameraToggleTime.current;
    
    if (timeSinceLastToggle < 1000) {
      console.log(`Слишком быстрое переключение камеры, игнорируется (прошло ${timeSinceLastToggle}ms)`);
      return false;
    }
    
    // Сохраняем состояние камеры в sessionStorage для устойчивости к сбросам
    window.sessionStorage.setItem('camera-state', String(enabled));
    console.log(`Сохранено ЛОКАЛЬНОЕ состояние камеры:`, enabled);
    
    // Немедленно обновляем локальное состояние для быстрой обратной связи
    setState(prev => {
      const userId = userIdRef.current;
      const newCameraStates = { ...prev.cameraStates };
      newCameraStates[userId] = enabled;
      return {
        ...prev,
        cameraStates: newCameraStates
      };
    });
    
    // Обновляем время последнего переключения
    lastCameraToggleTime.current = now;
    
    // Генерируем уникальный идентификатор запроса для отслеживания
    const requestId = `req_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    // Отправляем обновление на сервер с идентификатором запроса
    return sendMessage({
      type: 'camera_state_change',
      enabled,
      requestId
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
              
              // Используем функциональное обновление для предотвращения потери состояния
              // при одновременном обновлении из разных источников
              setState(prev => {
                // Сохраняем текущее состояние камер без изменений
                const newState = { 
                  ...prev, 
                  slots,
                  userSlot,
                  // Не трогаем состояние камер при обновлении слотов!
                  // cameraStates остаются прежними
                };
                console.log('Новое состояние:', newState);
                return newState;
              });
              break;
            }
            
            // Обработка индивидуального обновления состояния камеры
            case 'individual_camera_update': {
              const { userId, enabled } = data;
              console.log(`Получено сообщение individual_camera_update: ${userId} -> ${enabled}`);
              
              // Получаем текущий ID пользователя
              const currentUserId = userIdRef.current;
              const globalId = window.currentUserIdentity;
              
              // Проверяем, является ли это обновление для нашей собственной камеры
              const isCurrentUser = (
                userId === currentUserId || 
                userId === globalId
              );
              
              console.log(`Проверка своей камеры: userId=${userId}, currentUserId=${currentUserId}, globalId=${globalId}, isCurrentUser=${isCurrentUser}`);
              
              // Полностью игнорируем обновления своей камеры от сервера
              if (isCurrentUser) {
                console.log(`ИГНОРИРУЕМ обновление своей камеры из individual_camera_update`);
                return; // Выходим из обработчика, не меняя состояние
              }
              
              // Для чужих камер обновляем состояние
              setState(prev => {
                const newCameraStates = { ...prev.cameraStates };
                console.log(`Обновляем состояние ЧУЖОЙ камеры: ${userId} -> ${enabled}`);
                newCameraStates[userId] = enabled;
                
                return {
                  ...prev,
                  cameraStates: newCameraStates
                };
              });
              break;
            }
            
            // Новый тип сообщения - обновление состояния камеры для других пользователей
            case 'peer_camera_update': {
              const { userId, enabled, timestamp } = data;
              console.log(`Получено обновление чужой камеры (peer_camera_update): ${userId} -> ${enabled}`);
              
              // Проверяем, что это НЕ наша камера
              const currentUserId = userIdRef.current;
              const globalId = window.currentUserIdentity;
              
              if (userId === currentUserId || userId === globalId) {
                console.log(`ОШИБКА: Получено peer_camera_update для своей камеры. Игнорируем.`);
                return; // Выходим, не меняя состояние
              }
              
              // Обновляем состояние чужой камеры
              setState(prev => {
                const newCameraStates = { ...prev.cameraStates };
                newCameraStates[userId] = enabled;
                
                console.log(`Обновлено состояние чужой камеры: ${userId} -> ${enabled}, timestamp=${timestamp}`);
                return {
                  ...prev,
                  cameraStates: newCameraStates
                };
              });
              break;
            }
            
            // Подтверждение от сервера об успешном изменении камеры
            case 'camera_state_acknowledged': {
              const { userId, enabled, requestId } = data;
              console.log(`Получено подтверждение изменения камеры: ${userId} -> ${enabled}, requestId=${requestId}`);
              
              // Проверка что это наша камера
              const currentUserId = userIdRef.current;
              const globalId = window.currentUserIdentity;
              
              if (userId !== currentUserId && userId !== globalId) {
                console.log(`ОШИБКА: Получено camera_state_acknowledged для чужой камеры. Игнорируем.`);
                return;
              }
              
              // Здесь не меняем состояние, оно уже обновлено в момент вызова setCameraState
              console.log(`Изменение состояния камеры успешно подтверждено сервером: ${enabled}`);
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
            
            // Новый тип сообщения для начальной синхронизации состояний камер
            case 'initial_camera_states': {
              const { states } = data;
              console.log('Получен набор начальных состояний камер:', states);
              
              // Получаем текущий ID пользователя для фильтрации
              const currentUserId = userIdRef.current;
              const globalId = window.currentUserIdentity;
              
              // Проверяем, не содержатся ли наши камеры в списке (что некорректно)
              if (states[currentUserId] !== undefined || (globalId && states[globalId] !== undefined)) {
                console.log('ПРЕДУПРЕЖДЕНИЕ: Полученные initial_camera_states содержат нашу камеру, это ошибка');
              }
              
              // Обновляем состояния всех чужих камер
              setState(prev => {
                // Создаем копию текущих состояний
                const newCameraStates = { ...prev.cameraStates };
                
                // Обновляем все состояния, кроме своей камеры
                Object.entries(states).forEach(([stateUserId, stateValue]) => {
                  // Проверяем, не является ли это нашей камерой
                  if (stateUserId !== currentUserId && stateUserId !== globalId) {
                    // Явно приводим значение к boolean
                    const isEnabled = Boolean(stateValue);
                    // Обновляем состояние только чужой камеры
                    newCameraStates[stateUserId] = isEnabled;
                    console.log(`Синхронизировано начальное состояние чужой камеры: ${stateUserId} -> ${isEnabled}`);
                  }
                });
                
                return {
                  ...prev,
                  cameraStates: newCameraStates
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