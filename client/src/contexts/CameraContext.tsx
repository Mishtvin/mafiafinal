import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// Интерфейс для контекста камеры
export interface CameraContextType {
  cameraEnabled: boolean;
  enableCamera: () => void;
  disableCamera: () => void;
  toggleCamera: () => void;
  setCameraEnabled: (enabled: boolean) => void;
}

// Создаем контекст с дефолтными значениями
const CameraContext = createContext<CameraContextType>({
  cameraEnabled: false,
  enableCamera: () => {},
  disableCamera: () => {},
  toggleCamera: () => {},
  setCameraEnabled: () => {},
});

// Провайдер контекста камеры
export const CameraProvider = ({ 
  children, 
  localParticipantId
}: { 
  children: ReactNode; 
  localParticipantId: string;
}) => {
  // Локальное состояние камеры
  const [cameraEnabled, setCameraEnabled] = useState<boolean>(false);
  
  // При монтировании компонента, пытаемся восстановить состояние камеры
  useEffect(() => {
    // Получаем сохраненное состояние из sessionStorage
    const savedState = window.sessionStorage.getItem('camera-state');
    console.log(`[CameraContext] Инициализация с localParticipantId=${localParticipantId}, сохранённое состояние=`, savedState);
    
    // Если есть сохраненное состояние, устанавливаем его
    if (savedState !== null) {
      const isEnabled = savedState === 'true';
      console.log(`[CameraContext] Восстановление состояния камеры: ${isEnabled}`);
      setCameraEnabled(isEnabled);
    } else {
      // По умолчанию камера выключена при первом запуске
      console.log(`[CameraContext] Инициализация с выключенной камерой по умолчанию`);
      setCameraEnabled(false);
      // Сохраняем состояние в sessionStorage
      window.sessionStorage.setItem('camera-state', 'false');
    }
  }, [localParticipantId]);
  
  // Слушаем события обновления состояния камеры из сети
  useEffect(() => {
    // Функция-обработчик события
    const handleCameraUpdate = (event: CustomEvent) => {
      const { userId, enabled } = event.detail;
      
      // Проверяем, что это событие для текущего пользователя
      if (userId === localParticipantId) {
        console.log(`[CameraContext] Получено событие обновления камеры для текущего пользователя (${userId}): ${enabled}`);
        // Синхронизируем состояние с событием
        setCameraEnabled(enabled);
      }
    };
    
    // Типизация для TypeScript
    const handler = (e: Event) => {
      handleCameraUpdate(e as CustomEvent);
    };
    
    // Подписываемся на кастомное событие
    window.addEventListener('camera-state-update', handler);
    
    // Отписываемся при размонтировании
    return () => {
      window.removeEventListener('camera-state-update', handler);
    };
  }, [localParticipantId]);
  
  // Функции для управления камерой
  const enableCamera = () => {
    console.log('[CameraContext] Включение камеры');
    setCameraEnabled(true);
    window.sessionStorage.setItem('camera-state', 'true');
  };
  
  const disableCamera = () => {
    console.log('[CameraContext] Выключение камеры');
    setCameraEnabled(false);
    window.sessionStorage.setItem('camera-state', 'false');
  };
  
  const toggleCamera = () => {
    console.log(`[CameraContext] Переключение камеры с ${cameraEnabled} на ${!cameraEnabled}`);
    const newState = !cameraEnabled;
    setCameraEnabled(newState);
    window.sessionStorage.setItem('camera-state', String(newState));
  };
  
  // Предоставляем состояние и функции через контекст
  const value = {
    cameraEnabled,
    enableCamera,
    disableCamera,
    toggleCamera,
    setCameraEnabled,
  };
  
  return <CameraContext.Provider value={value}>{children}</CameraContext.Provider>;
};

// Хук для использования контекста камеры
export const useCameraContext = () => {
  const context = useContext(CameraContext);
  if (context === undefined) {
    throw new Error('useCameraContext must be used within a CameraProvider');
  }
  return context;
};