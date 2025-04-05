import React, { useEffect } from 'react';
import { useCameraContext } from '../../contexts/CameraContext';
import { useLocalParticipant } from '@livekit/components-react';

/**
 * Невидимый компонент для управления WebRTC-камерой в зависимости от состояния в контексте
 */
export const CameraController: React.FC<{ userId: string }> = ({ userId }) => {
  // Получаем состояние камеры из контекста
  const { cameraEnabled } = useCameraContext();
  
  // Получаем локального участника из LiveKit
  const { localParticipant } = useLocalParticipant();
  
  // Синхронизируем состояние камеры с LiveKit
  useEffect(() => {
    if (!localParticipant) {
      console.warn('[CameraController] Локальный участник не найден');
      return;
    }
    
    // Получаем видеотреки от локального участника
    const videoTracks = Array.from(localParticipant.videoTracks.values())
      .map(track => track.track)
      .filter(track => track && track.kind === 'video');
    
    if (videoTracks.length === 0) {
      console.warn('[CameraController] Видеотреки не найдены для локального участника');
      return;
    }
    
    // Включаем или выключаем видеотреки в зависимости от состояния в контексте
    videoTracks.forEach(track => {
      if (track) {
        if (cameraEnabled && track.enabled === false) {
          console.log('[CameraController] Включение видеотрека:', track.id);
          track.enabled = true;
        } else if (!cameraEnabled && track.enabled === true) {
          console.log('[CameraController] Выключение видеотрека:', track.id);
          track.enabled = false;
        }
      }
    });
  }, [cameraEnabled, localParticipant]);
  
  // Этот компонент не рендерит никакого UI
  return null;
};