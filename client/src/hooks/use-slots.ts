import { useState, useEffect, useCallback, useRef } from 'react';
import { webSocketService } from '../lib/websocket';
import { useWebSocket, useWebSocketMessage } from './use-websocket';

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

  const userIdRef = useRef(userId);
  const { sendMessage, isConnected, status } = useWebSocket();
  
  // Обрабатываем сообщения об обновлении слотов
  useEffect(() => {
    const handleSlotsUpdate = (data: any) => {
      if (data.type !== 'slots_update' || !Array.isArray(data.slots)) return;
      
      // Обновление информации о слотах
      const slots: Record<number, string> = {};
      let userSlot: number | null = null;
      
      // Заполняем объект слотов из массива
      data.slots.forEach((slot: SlotInfo) => {
        slots[slot.slotNumber] = slot.userId;
        
        console.log(`Слот ${slot.slotNumber} занят пользователем ${slot.userId}`);
        
        // Возможно два идентификатора для сравнения - текущий и глобальный
        const currentId = userIdRef.current;
        const globalId = (window as any).currentUserIdentity;
        
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
    };
    
    // Подписываемся на обновления
    const messageListener = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        handleSlotsUpdate(data);
      } catch (error) {
        console.error('Ошибка при обработке сообщения об обновлении слотов:', error);
      }
    };
    
    webSocketService.addMessageListener(messageListener);
    
    return () => {
      webSocketService.removeMessageListener(messageListener);
    };
  }, []);
  
  // Обрабатываем сообщения об обновлении состояния камеры
  useEffect(() => {
    const handleCameraUpdate = (data: any) => {
      if (data.type !== 'individual_camera_update' || !data.userId) return;
      
      const { userId: cameraUserId, enabled } = data;
      console.log(`Получено индивидуальное обновление камеры: ${cameraUserId} -> ${enabled}`);
      
      setState(prev => {
        // Получаем текущий ID пользователя
        const currentUserId = userIdRef.current;
        const globalId = (window as any).currentUserIdentity;
        
        // Создаем копию текущего состояния камер
        const newCameraStates = { ...prev.cameraStates };
        
        // Проверяем, является ли эта камера нашим пользователем
        // ТОЛЬКО точное соответствие одному из наших идентификаторов
        const isCurrentUser = (
          cameraUserId === currentUserId || 
          cameraUserId === globalId
        );
        
        console.log(`Проверка своей камеры: userId=${cameraUserId}, currentUserId=${currentUserId}, globalId=${globalId}, isCurrentUser=${isCurrentUser}`);
        
        if (isCurrentUser) {
          // ДЛЯ СВОЕЙ КАМЕРЫ:
          console.log(`Получено обновление СВОЕЙ камеры с сервера: userId=${cameraUserId}, enabled=${enabled}`);
          console.log(`Наш ID: currentUserId=${currentUserId}, globalId=${globalId}`);
          
          // Всегда проверяем сохраненное состояние в sessionStorage
          const savedState = window.sessionStorage.getItem('camera-state');
          console.log(`Но используем сохраненное состояние:`, savedState);
          
          if (savedState !== null) {
            // Используем ТОЛЬКО сохраненное состояние вместо полученного
            const savedEnabled = savedState === 'true';
            console.log(`Устанавливаем свою камеру в сохраненное состояние: ${savedEnabled}`);
            newCameraStates[cameraUserId] = savedEnabled;
          } else if (cameraUserId in newCameraStates) {
            // Не меняем уже установленное состояние
            console.log(`Сохраняем текущее состояние своей камеры: ${cameraUserId} -> ${newCameraStates[cameraUserId]}`);
          } else {
            // Если нет данных, то по умолчанию камера ВЫКЛЮЧЕНА
            newCameraStates[cameraUserId] = false;
            console.log(`Устанавливаем начальное состояние своей камеры в выключено`);
            
            // Сохраняем это состояние
            window.sessionStorage.setItem('camera-state', 'false');
          }
        } else {
          // ДЛЯ ЧУЖИХ КАМЕР:
          // Всегда обновляем состояние из сети
          console.log(`Обновляем состояние чужой камеры: ${cameraUserId} -> ${enabled}`);
          newCameraStates[cameraUserId] = enabled;
          
          // Отправляем событие для обновления камеры в контексте
          // Используем CustomEvent для передачи данных между компонентами
          const cameraEvent = new CustomEvent('camera-state-update', {
            detail: {
              userId: cameraUserId, 
              enabled: enabled
            }
          });
          window.dispatchEvent(cameraEvent);
        }
        
        return {
          ...prev,
          cameraStates: newCameraStates
        };
      });
    };
    
    // Подписываемся на обновления
    const messageListener = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        handleCameraUpdate(data);
      } catch (error) {
        console.error('Ошибка при обработке сообщения об обновлении камеры:', error);
      }
    };
    
    webSocketService.addMessageListener(messageListener);
    
    return () => {
      webSocketService.removeMessageListener(messageListener);
    };
  }, []);
  
  // Обрабатываем изменение статуса соединения
  useEffect(() => {
    setState(prev => ({
      ...prev,
      connected: isConnected,
      loading: status === 'connecting' || status === 'reconnecting'
    }));
    
    // Если соединение установлено, регистрируем пользователя
    if (isConnected) {
      // Определяем эффективный идентификатор пользователя
      // Приоритет: 1) глобальный в window 2) переданный в хук 3) из localStorage
      let effectiveUserId = userIdRef.current;
      
      // Проверяем, есть ли глобальный идентификатор
      if ((window as any).currentUserIdentity && (window as any).currentUserIdentity !== 'undefined') {
        effectiveUserId = (window as any).currentUserIdentity;
        console.log('Использую глобальный идентификатор:', effectiveUserId);
      } 
      // Если нет, пробуем использовать переданный в хук
      else if (userId && userId !== 'unknown-user') {
        effectiveUserId = userId;
        console.log('Использую переданный в хук идентификатор:', effectiveUserId);
        // Синхронизируем с глобальной переменной
        (window as any).currentUserIdentity = effectiveUserId;
      }
      // В крайнем случае проверяем localStorage
      else {
        const storedId = window.localStorage.getItem('user-identity');
        if (storedId) {
          effectiveUserId = storedId;
          console.log('Использую идентификатор из localStorage:', effectiveUserId);
          (window as any).currentUserIdentity = effectiveUserId;
        } else {
          // Генерация нового ID в крайнем случае
          effectiveUserId = `User-${Math.floor(Math.random() * 10000)}-${Math.floor(Math.random() * 10000)}`;
          console.log('Сгенерирован новый идентификатор:', effectiveUserId);
          window.localStorage.setItem('user-identity', effectiveUserId);
          (window as any).currentUserIdentity = effectiveUserId;
        }
      }
      
      // Регистрируем пользователя на сервере с эффективным ID
      console.log('Регистрируем пользователя на сервере:', effectiveUserId);
      sendMessage({
        type: 'register',
        userId: effectiveUserId
      });
    }
  }, [status, isConnected, userId, sendMessage]);
  
  // Обновляем ref при изменении userId
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);
  
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
    console.log(`Сохраняем состояние камеры в sessionStorage: ${enabled}`);
    
    // Обновляем время последнего переключения
    lastCameraToggleTime.current = now;
    
    // Отправляем обновление на сервер
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

  return {
    ...state,
    selectSlot,
    releaseSlot,
    setCameraState,
    registerUser
  };
}
