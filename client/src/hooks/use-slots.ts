import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useResilientWebSocket, WebSocketMessage } from './use-resilient-websocket';
import { debounce, throttle } from '../lib/performance-utils';

/**
 * Функция для глубокого сравнения двух объектов
 * @param obj1 Первый объект
 * @param obj2 Второй объект
 * @returns true если объекты равны, false в противном случае
 */
function isEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true;
  
  // Если один из объектов null или undefined, а другой нет
  if (obj1 == null || obj2 == null) return false;
  
  // Если типы разные
  if (typeof obj1 !== typeof obj2) return false;
  
  // Для примитивных типов
  if (typeof obj1 !== 'object') return obj1 === obj2;
  
  // Для массивов
  if (Array.isArray(obj1) && Array.isArray(obj2)) {
    if (obj1.length !== obj2.length) return false;
    
    for (let i = 0; i < obj1.length; i++) {
      if (!isEqual(obj1[i], obj2[i])) return false;
    }
    
    return true;
  }
  
  // Для объектов (не массивов)
  if (Array.isArray(obj1) !== Array.isArray(obj2)) return false;
  
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  
  if (keys1.length !== keys2.length) return false;
  
  for (const key of keys1) {
    if (!obj2.hasOwnProperty(key)) return false;
    if (!isEqual(obj1[key], obj2[key])) return false;
  }
  
  return true;
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
  displayNames: Record<string, string>; // userId -> displayName
}

// Расширяем Window интерфейс для глобальных переменных
declare global {
  interface Window {
    currentUserIdentity: string;
    messageHandlers: Array<(data: any) => void>;
  }
}

// Инициализируем глобальный массив для обработчиков сообщений, если он еще не существует
if (!window.messageHandlers) {
  window.messageHandlers = [];
}

export function useSlots(userId: string) {
  // Используем useRef для отслеживания повторных вызовов
  const hookInitializedRef = useRef(false);
  
  if (!hookInitializedRef.current) {
    console.log('useSlots hook initialized with userId:', userId);
    hookInitializedRef.current = true;
  }
  
  const [state, setState] = useState<SlotsState>({
    slots: {},
    userSlot: null,
    loading: true,
    connected: false,
    error: null,
    cameraStates: {},
    displayNames: {}
  });

  const userIdRef = useRef(userId);
  
  // Функция обновления слотов с использованием debounce для предотвращения множественных обновлений
  // Кэш последних значений для избежания лишних обновлений состояния
  const lastSlotsRef = useRef<Record<number, string>>({});
  const lastUserSlotRef = useRef<number | null>(null);
  
  // Используем оптимизированный debouncedUpdateSlots с проверкой на реальные изменения
  const debouncedUpdateSlots = useMemo(() => {
    return debounce((slots: Record<number, string>, userSlot: number | null) => {
      // Проверяем, изменились ли данные
      const slotsChanged = !isEqual(slots, lastSlotsRef.current);
      const userSlotChanged = userSlot !== lastUserSlotRef.current;
      
      // Обновляем только если есть изменения
      if (slotsChanged || userSlotChanged) {
        // Отключаем логирование для повышения производительности
        // console.log('Debounced обновление состояния слотов:', 
        //            'текущий userSlot =', userSlot, 
        //            'всего слотов =', Object.keys(slots).length);
        
        // Сохраняем текущие значения в ref для будущих сравнений
        lastSlotsRef.current = {...slots};
        lastUserSlotRef.current = userSlot;
        
        setState(prev => ({
          ...prev, 
          slots,
          userSlot
        }));
      }
    }, 150); // Увеличиваем дебаунс до 150мс для лучшей группировки
  }, []);

  // Функция обновления состояния камер с использованием throttle
  const throttledUpdateCameraStates = useMemo(() => {
    return throttle((cameraStates: Record<string, boolean>) => {
      // Отключаем логирование для повышения производительности
      // console.log('Throttled обновление состояния камер');
      setState(prev => ({
        ...prev,
        cameraStates
      }));
    }, 150); // Троттлинг в 150мс для ограничения частоты обновлений
  }, []);

  // Обработчик сообщений с оптимизированными обновлениями состояния
  const handleMessage = useCallback((data: any) => {
    try {      
      switch (data.type) {
        case 'slots_update': {
          // Обновление информации о слотах
          const slots: Record<number, string> = {};
          let userSlot: number | null = null;
          
          // Заполняем объект слотов из массива
          data.slots.forEach((slot: SlotInfo) => {
            slots[slot.slotNumber] = slot.userId;
            
            // Возможно два идентификатора для сравнения - текущий и глобальный
            const currentId = userIdRef.current;
            const globalId = window.currentUserIdentity;
            
            // Проверяем соответствие либо текущему, либо глобальному идентификатору
            if (slot.userId === currentId || 
                (globalId && slot.userId === globalId)) {
              userSlot = slot.slotNumber;
              // Отключаем логирование для повышения производительности
              // console.log(`Найден слот текущего пользователя: ${userSlot}`);
            }
          });
          
          // Используем дебаунсированную функцию для обновления слотов
          debouncedUpdateSlots(slots, userSlot);
          break;
        }
        
        case 'camera_states_update': {
          // Обновление информации о состоянии камер
          const cameraStates = data.cameraStates || {};
          
          // Используем троттлированную функцию для обновления состояния камер
          throttledUpdateCameraStates(cameraStates);
          break;
        }
        
        case 'slot_busy': {
          // Уведомление, что слот занят
          console.log(`Слот ${data.slotNumber} уже занят другим пользователем`);
          break;
        }
        
        case 'display_name_update': {
          // Обновление отображаемого имени пользователя
          if (data.userId && data.displayName) {
            console.log(`Получено обновление отображаемого имени: ${data.userId} -> ${data.displayName}`);
            setState(prev => {
              // Клонируем текущие отображаемые имена и добавляем/обновляем новое
              const displayNames = { ...prev.displayNames, [data.userId]: data.displayName };
              return { ...prev, displayNames };
            });
          }
          break;
        }
        
        default:
          // Логируем только неслужебные сообщения, чтобы не захламлять консоль
          if (!data.type.startsWith('_') && data.type !== 'ping' && data.type !== 'pong') {
            console.log('Получено сообщение:', data);
          }
      }
    } catch (error) {
      console.error('Ошибка обработки сообщения:', error);
    }
  }, [debouncedUpdateSlots, throttledUpdateCameraStates]);

  // Настраиваем адрес WebSocket сервера
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  
  // Используем наш устойчивый WebSocket хук
  const { state: wsState, sendMessage, reconnect } = useResilientWebSocket(
    {
      url: wsUrl,
      initialReconnectDelay: 500,        // Начальная задержка переподключения 500мс
      maxReconnectDelay: 10000,          // Максимальная задержка 10 секунд
      reconnectBackoffMultiplier: 1.5,   // Множитель для экспоненциального отступа
      heartbeatInterval: 13000,          // Проверка здоровья соединения каждые 13 секунд
      heartbeatTimeout: 5000,            // Таймаут ожидания ответа на heartbeat 5 секунд
      connectTimeout: 10000,             // Таймаут на установку соединения 10 секунд
      debug: false                       // Логирование только важных сообщений
    },
    handleMessage,
    [userId] // Перезапускаем соединение при изменении userId
  );

  // Синхронизируем состояние с состоянием WebSocket
  useEffect(() => {
    userIdRef.current = userId;
    
    setState(prev => ({
      ...prev,
      connected: wsState.connected,
      loading: wsState.connecting,
      error: wsState.error
    }));
    
    // Регистрируем пользователя при подключении
    if (wsState.connected) {
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
    }
  }, [wsState.connected, wsState.connecting, wsState.error, userId, sendMessage]);
  
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
    reconnect, // Экспортируем функцию принудительного переподключения
    sendMessage, // Экспортируем функцию отправки сообщений
  };
}