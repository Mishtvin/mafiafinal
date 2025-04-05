import { useState, useEffect, useCallback, useRef } from 'react';

// Ключ для хранения слота в localStorage с префиксами для разных браузеров/устройств
const SLOT_STORAGE_KEY_BASE = 'mafia_user_slot';

// Создаем уникальный ключ для каждого устройства и сессии
// чтобы слоты не конфликтовали между разными вкладками и устройствами
function getStorageKey(userId: string) {
  // Создаем уникальный ключ на основе userId
  return `${SLOT_STORAGE_KEY_BASE}_${userId}`;
}

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
  // Состояние хука
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
  const reconnectAttempts = useRef(0);
  
  // Функция для сохранения информации о слоте в localStorage
  const saveSlotToStorage = useCallback((slotNumber: number) => {
    try {
      // Получаем уникальный ключ для этого пользователя
      const storageKey = getStorageKey(userId);
      
      // Данные для сохранения с полной информацией для отладки
      const data = {
        userId: userId,
        slotNumber: slotNumber,
        timestamp: Date.now(),
        globalIdentity: window.currentUserIdentity || 'not_set',
        origin: window.location.origin,
        device: navigator.userAgent.substring(0, 50)
      };
      
      // Сохраняем в localStorage
      localStorage.setItem(storageKey, JSON.stringify(data));
      
      // Для совместимости сохраняем и по старому ключу
      localStorage.setItem(SLOT_STORAGE_KEY_BASE, JSON.stringify(data));
      
      console.log(`СЛОТ СОХРАНЕН: ${slotNumber} для ${userId} [ключ: ${storageKey}]`);
      
      // Проверка сохранения
      const savedData = localStorage.getItem(storageKey);
      if (savedData) {
        try {
          const parsedData = JSON.parse(savedData);
          console.log(`✅ ПРОВЕРКА СОХРАНЕНИЯ: ${parsedData.slotNumber} для ${parsedData.userId}`);
        } catch (e) {
          console.error(`❌ Ошибка при проверке сохранения:`, e);
        }
      }
    } catch (error) {
      console.error('❌ КРИТИЧЕСКАЯ ОШИБКА при сохранении слота:', error);
    }
  }, [userId]);
  
  // Получение сохраненного слота для пользователя из localStorage
  const getSavedSlot = useCallback(() => {
    try {
      console.log(`🔍 ПОПЫТКА ВОССТАНОВЛЕНИЯ СЛОТА для ${userId}`);
      
      // Проверяем наличие сохраненного слота по уникальному ключу
      const storageKey = getStorageKey(userId);
      let savedData = localStorage.getItem(storageKey);
      
      // Если нет данных по уникальному ключу, проверяем старый формат
      if (!savedData) {
        savedData = localStorage.getItem(SLOT_STORAGE_KEY_BASE);
        if (savedData) {
          console.log(`🔄 Найдены данные в старом формате ключа`);
        }
      }
      
      if (!savedData) {
        console.log(`❌ Нет сохраненных данных для ${userId}`);
        return null;
      }
      
      // Распарсим данные
      console.log(`📦 Найдены сохраненные данные: ${savedData.substring(0, 100)}...`);
      const data = JSON.parse(savedData);
      
      // Валидация данных
      if (!data || typeof data !== 'object' || !data.slotNumber) {
        console.log(`❌ Некорректные данные в localStorage:`, data);
        return null;
      }
      
      // Проверим соответствие userId или глобального идентификатора
      const globalId = window.currentUserIdentity;
      const currentId = userId;
      
      console.log(`🔍 Проверка соответствия:`, {
        'сохранено-userId': data.userId,
        'текущий-userId': currentId,
        'глобальный-userId': globalId
      });
      
      // Условия для успешного восстановления слота:
      // 1. Если userId в данных совпадает с текущим userId
      // 2. Или если userId в данных совпадает с глобальным идентификатором
      // 3. Или если globalIdentity в данных совпадает с текущим userId или глобальным идентификатором
      if (
        data.userId === currentId || 
        (globalId && data.userId === globalId) ||
        (data.globalIdentity && (data.globalIdentity === currentId || data.globalIdentity === globalId))
      ) {
        console.log(`✅ ВОССТАНОВЛЕН СЛОТ ${data.slotNumber} для ${userId}`);
        
        // Сразу обновляем данные в localStorage по новому формату
        saveSlotToStorage(data.slotNumber);
        
        return data.slotNumber;
      } else {
        console.log(`❌ Данные в localStorage не соответствуют текущему пользователю`, {
          'сохранено': data.userId,
          'текущий': currentId,
          'глобальный': globalId
        });
      }
    } catch (error) {
      console.error('❌ ОШИБКА при восстановлении слота:', error);
    }
    return null;
  }, [userId, saveSlotToStorage]);

  // Очистка информации о слоте в localStorage
  const clearSlotStorage = useCallback(() => {
    try {
      const storageKey = getStorageKey(userId);
      
      // Удаляем данные и по уникальному, и по старому ключу
      localStorage.removeItem(storageKey);
      localStorage.removeItem(SLOT_STORAGE_KEY_BASE);
      
      console.log(`🗑️ Информация о слоте для ${userId} удалена из localStorage`);
      return true;
    } catch (error) {
      console.error('❌ Ошибка при удалении информации о слоте:', error);
      return false;
    }
  }, [userId]);

  // Функция для отправки сообщения через WebSocket
  const sendMessage = useCallback((message: any) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
      return true;
    } else {
      console.log(`❌ Не удалось отправить сообщение, WebSocket не открыт:`, message);
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
    console.log(`🎯 Выбор слота ${slotNumber}, сразу сохраняем в localStorage`);
    saveSlotToStorage(slotNumber);
    
    // Отправляем запрос на сервер
    return sendMessage({
      type: 'select_slot',
      slotNumber
    });
  }, [saveSlotToStorage, sendMessage]);
  
  // Освобождение слота
  const releaseSlot = useCallback(() => {
    // Удаляем информацию о слоте из localStorage
    clearSlotStorage();
    
    // Отправляем запрос на сервер
    return sendMessage({
      type: 'release_slot'
    });
  }, [clearSlotStorage, sendMessage]);
  
  // Эффект для отслеживания изменения userSlot и сохранения в localStorage
  useEffect(() => {
    // Выводим всю информацию о слотах в localStorage для отладки
    try {
      console.log(`🔍 ТЕКУЩИЕ ДАННЫЕ В LOCALSTORAGE:`);
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes(SLOT_STORAGE_KEY_BASE)) {
          const value = localStorage.getItem(key);
          console.log(`- ${key}: ${value}`);
        }
      }
    } catch (e) {
      // Игнорируем ошибки при просмотре localStorage
    }

    // Сохраняем текущий слот
    if (state.userSlot) {
      console.log(`💾 Сохраняем слот ${state.userSlot} для ${userId} в localStorage (при изменении)`);
      saveSlotToStorage(state.userSlot);
    }
  }, [state.userSlot, saveSlotToStorage, userId]);

  // Эффект для обработки закрытия вкладки/окна
  useEffect(() => {
    const handleBeforeUnload = () => {
      console.log('🚪 Страница закрывается, сохраняем текущий слот в localStorage');
      try {
        // Сохраняем текущий слот пользователя при закрытии
        if (state.userSlot) {
          console.log(`💾 Принудительно сохраняем слот ${state.userSlot} для ${userId} перед закрытием`);
          saveSlotToStorage(state.userSlot);
        }
      } catch (error) {
        console.error('❌ Ошибка при сохранении слота перед закрытием:', error);
      }
    };
    
    // Добавляем обработчик события закрытия страницы
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload); // Добавляем для iOS
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        handleBeforeUnload();
      }
    });
    
    // Удаляем обработчик при размонтировании компонента
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
      window.removeEventListener('visibilitychange', handleBeforeUnload);
      
      // Сохраняем слот при размонтировании компонента
      if (state.userSlot) {
        console.log('🔄 Компонент размонтируется, сохраняем данные о слоте в localStorage');
        saveSlotToStorage(state.userSlot);
      }
    };
  }, [state.userSlot, saveSlotToStorage, userId]);

  // Эффект для установки WebSocket соединения
  useEffect(() => {
    // Сохраняем актуальный userId в ref
    userIdRef.current = userId;
    console.log('👤 ID пользователя обновлен в useSlots:', userId);

    // Функция для установки соединения
    const connectWebSocket = () => {
      setState(prev => ({ ...prev, loading: true, error: null }));

      // Определяем адрес WebSocket сервера
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      console.log(`🔌 Подключаемся к WebSocket: ${wsUrl}, попытка #${reconnectAttempts.current + 1}`);
      
      // Создаем WebSocket соединение
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      // Обработчик открытия соединения
      socket.onopen = () => {
        console.log('✅ WebSocket соединение установлено');
        setState(prev => ({ ...prev, connected: true, loading: false }));
        reconnectAttempts.current = 0; // Сбрасываем счетчик попыток

        // Используем глобальный идентификатор из window, если доступен
        let effectiveUserId = userIdRef.current;
        if (window.currentUserIdentity && window.currentUserIdentity !== 'undefined') {
          effectiveUserId = window.currentUserIdentity;
          console.log('👤 Использую глобальный идентификатор:', effectiveUserId);
        }

        // Получаем предпочтительный слот из localStorage
        const preferredSlot = getSavedSlot();
        
        // Регистрируем пользователя на сервере, включая предпочтительный слот
        console.log('📲 Регистрируем пользователя:', effectiveUserId, 
                    preferredSlot ? `с предпочтительным слотом ${preferredSlot}` : 'без предпочтительного слота');
        
        sendMessage({
          type: 'register',
          userId: effectiveUserId,
          preferredSlot: preferredSlot
        });
      };

      // Обработчик ошибок
      socket.onerror = (error) => {
        console.error('❌ WebSocket ошибка:', error);
        setState(prev => ({ 
          ...prev, 
          error: 'Ошибка подключения к серверу', 
          loading: false,
          connected: false 
        }));
        reconnectAttempts.current += 1;
      };

      // Обработчик закрытия соединения
      socket.onclose = () => {
        console.log('🔌 WebSocket соединение закрыто');
        setState(prev => ({ ...prev, connected: false }));
        
        // При закрытии сохраняем текущий слот
        if (state.userSlot) {
          console.log(`💾 Сохраняем слот ${state.userSlot} при закрытии WebSocket`);
          saveSlotToStorage(state.userSlot);
        }
        
        // Переподключение через задержку при разрыве соединения
        const reconnectDelay = Math.min(5000 + (reconnectAttempts.current * 1000), 30000);
        console.log(`🔄 Переподключение через ${reconnectDelay/1000} секунд...`);
        
        setTimeout(() => {
          if (socketRef.current === socket) {
            connectWebSocket();
          }
        }, reconnectDelay);
      };

      // Обработчик входящих сообщений
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📩 WebSocket получено сообщение:', data);
          
          switch (data.type) {
            case 'slots_update': {
              // Обновление информации о слотах
              const slots: Record<number, string> = {};
              let userSlot: number | null = null;
              
              // Заполняем объект слотов из массива
              data.slots.forEach((slot: SlotInfo) => {
                slots[slot.slotNumber] = slot.userId;
                console.log(`🎯 Слот ${slot.slotNumber} занят пользователем ${slot.userId}`);
                
                // Возможно два идентификатора для сравнения - текущий и глобальный
                const currentId = userIdRef.current;
                const globalId = window.currentUserIdentity;
                
                console.log(`🔍 Сравниваем слот ${slot.slotNumber}: ${slot.userId} с ${currentId} и ${globalId}`);
                
                // Проверяем соответствие либо текущему, либо глобальному идентификатору
                if (slot.userId === currentId || 
                    (globalId && slot.userId === globalId)) {
                  userSlot = slot.slotNumber;
                  console.log(`✅ Найден слот текущего пользователя: ${userSlot}`);
                  
                  // Сразу сохраняем найденный слот
                  saveSlotToStorage(slot.slotNumber);
                }
              });
              
              console.log('📊 Обновляем состояние слотов:', 
                          'текущий userSlot =', userSlot, 
                          'всего слотов =', Object.keys(slots).length);
              
              setState(prev => {
                const newState = { 
                  ...prev, 
                  slots,
                  userSlot
                };
                console.log('🔄 Новое состояние:', newState);
                return newState;
              });
              break;
            }
            
            case 'camera_states_update': {
              // Обновление информации о состоянии камер
              const cameraStates = data.cameraStates || {};
              console.log('📷 Получены обновления состояния камер:', cameraStates);
              
              setState(prev => ({
                ...prev,
                cameraStates
              }));
              break;
            }
            
            case 'slot_busy': {
              // Уведомление, что слот занят
              console.log(`🚫 Слот ${data.slotNumber} уже занят другим пользователем`);
              break;
            }
            
            case 'ping': {
              // Ответ на пинг от сервера
              sendMessage({ type: 'pong' });
              break;
            }
            
            default:
              console.log('❓ Получено неизвестное сообщение:', data);
          }
        } catch (error) {
          console.error('❌ Ошибка обработки сообщения:', error);
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
  }, [userId, sendMessage, getSavedSlot, saveSlotToStorage, state.userSlot]);

  return {
    ...state,
    selectSlot,
    releaseSlot,
    setCameraState
  };
}