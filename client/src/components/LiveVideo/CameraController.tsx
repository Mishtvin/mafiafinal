import React, { useEffect } from 'react';
import { useCameraContext } from '../../contexts/CameraContext';

/**
 * Компонент для обработки входящих событий камеры и обновления контекста
 * Изолирует логику обработки событий камеры от компонентов отображения
 */
export const CameraController: React.FC<{
  userId: string;
}> = ({ userId }) => {
  const { updateRemoteCameraState } = useCameraContext();
  
  // Обрабатываем события изменения состояния камеры
  useEffect(() => {
    const handleCameraUpdate = (event: Event) => {
      // Приводим к типу CustomEvent с ожидаемыми полями
      const customEvent = event as CustomEvent<{
        userId: string;
        enabled: boolean;
      }>;
      
      const { userId: remoteUserId, enabled } = customEvent.detail;
      
      // Проверяем, что это не наша собственная камера
      if (remoteUserId !== userId) {
        console.log(`[CameraController] Обновление состояния удаленной камеры: ${remoteUserId} -> ${enabled}`);
        updateRemoteCameraState(remoteUserId, enabled);
      } else {
        console.log(`[CameraController] Игнорирую обновление своей камеры из события: ${remoteUserId}`);
      }
    };
    
    // Слушаем событие camera-state-update
    window.addEventListener('camera-state-update', handleCameraUpdate);
    
    return () => {
      window.removeEventListener('camera-state-update', handleCameraUpdate);
    };
  }, [userId, updateRemoteCameraState]);
  
  // Этот компонент не рендерит ничего видимого
  return null;
};