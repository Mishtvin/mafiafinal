import React, { useEffect } from 'react';
import { useCameraContext } from '../../contexts/CameraContext';

/**
 * Невидимый компонент для управления WebRTC-камерой в зависимости от состояния в контексте
 */
export const CameraController: React.FC<{ userId: string }> = ({ userId }) => {
  // Получаем состояние камеры из контекста
  const { cameraEnabled } = useCameraContext();
  
  // Просто выводим логи состояния
  useEffect(() => {
    console.log(`[CameraController] Состояние камеры изменено: ${cameraEnabled ? 'включена' : 'выключена'}`);
    
    // Синхронизация с WebSocket происходит в CameraToggle через useSlots
    console.log(`[CameraController] Пользователь ${userId} ${cameraEnabled ? 'включил' : 'выключил'} камеру`);
    
  }, [cameraEnabled, userId]);
  
  // Этот компонент не рендерит никакого UI
  return null;
};