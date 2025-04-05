import React, { createContext, useContext, useState, useCallback } from 'react';

export type CameraStates = Record<string, boolean>;

// Интерфейс контекста камеры
interface CameraContextType {
  cameraStates: CameraStates;
  setCameraState: (userId: string, enabled: boolean) => void;
  updateRemoteCameraState: (userId: string, enabled: boolean) => void;
  getVideoEnabled: (userId: string, isLocal: boolean) => boolean;
}

// Создаем контекст с начальными значениями
const CameraContext = createContext<CameraContextType>({
  cameraStates: {},
  setCameraState: () => {},
  updateRemoteCameraState: () => {},
  getVideoEnabled: () => false
});

// Хук для использования контекста камеры
export const useCameraContext = () => useContext(CameraContext);

// Провайдер контекста камеры
export const CameraProvider: React.FC<React.PropsWithChildren<{
  localParticipantId: string;
}>> = ({ children, localParticipantId }) => {
  // Состояние для хранения информации о включенных/выключенных камерах
  const [cameraStates, setCameraStates] = useState<CameraStates>({});
  
  // Метод для обновления состояния своей камеры
  const setCameraState = useCallback((userId: string, enabled: boolean) => {
    console.log(`[CameraContext] Устанавливаю состояние своей камеры: ${userId} -> ${enabled}`);
    
    // Защита от случайных обновлений чужих камер
    if (userId !== localParticipantId) {
      console.warn(`[CameraContext] Попытка установить состояние чужой камеры как своей! Игнорируем.`);
      return;
    }
    
    // Обновляем состояние
    setCameraStates(prev => ({
      ...prev,
      [userId]: enabled
    }));
    
    // Сохраняем в sessionStorage для устойчивости
    try {
      window.sessionStorage.setItem('camera-state', String(enabled));
    } catch (e) {
      console.error('[CameraContext] Ошибка при сохранении состояния камеры:', e);
    }
  }, [localParticipantId]);
  
  // Метод для обновления состояния удаленной камеры
  const updateRemoteCameraState = useCallback((userId: string, enabled: boolean) => {
    console.log(`[CameraContext] Обновляю состояние удаленной камеры: ${userId} -> ${enabled}`);
    
    // Защита от случайных обновлений своей камеры через этот метод
    if (userId === localParticipantId) {
      console.warn(`[CameraContext] Попытка обновить свою камеру через updateRemoteCameraState! Игнорируем.`);
      return;
    }
    
    setCameraStates(prev => ({
      ...prev,
      [userId]: enabled
    }));
  }, [localParticipantId]);
  
  // Получение состояния видео для участника
  const getVideoEnabled = useCallback((userId: string, isLocal: boolean) => {
    // Для локального участника проверяем sessionStorage и контекст
    if (isLocal || userId === localParticipantId) {
      // Проверяем сохраненное состояние в sessionStorage
      const savedState = window.sessionStorage.getItem('camera-state');
      if (savedState !== null) {
        return savedState === 'true';
      }
    }
    
    // В остальных случаях используем состояние из контекста
    return cameraStates[userId] || false;
  }, [cameraStates, localParticipantId]);
  
  // Предоставляем контекст потомкам
  return (
    <CameraContext.Provider 
      value={{ 
        cameraStates, 
        setCameraState, 
        updateRemoteCameraState,
        getVideoEnabled
      }}
    >
      {children}
    </CameraContext.Provider>
  );
};