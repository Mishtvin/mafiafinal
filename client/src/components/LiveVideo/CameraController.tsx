import React, { useEffect } from 'react';
import { useCameraContext } from '../../contexts/CameraContext';
import { useLocalParticipant, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';

/**
 * Невидимый компонент для управления WebRTC-камерой в зависимости от состояния в контексте
 */
export const CameraController: React.FC<{ userId: string }> = ({ userId }) => {
  // Получаем состояние камеры из контекста
  const { cameraEnabled } = useCameraContext();
  
  // Получаем локального участника из LiveKit
  const { localParticipant } = useLocalParticipant();
  
  // Получаем все видеотреки с камеры
  const videoTracks = useTracks(
    [Track.Source.Camera],
    { 
      onlySubscribed: false
    }
  );
  
  // Синхронизируем состояние камеры с видеотреками
  useEffect(() => {
    if (!localParticipant) {
      console.warn('[CameraController] Локальный участник не найден');
      return;
    }
    
    try {
      // Фильтруем только видеотреки от локального участника
      const localVideoTracks = videoTracks
        .filter(pub => pub.participant && pub.participant.identity === localParticipant.identity)
        .filter(pub => pub.track && pub.track.kind === 'video' && pub.source === Track.Source.Camera);
      
      if (localVideoTracks.length === 0) {
        console.warn('[CameraController] Видеотреки не найдены для локального участника');
        return;
      }
      
      // Включаем или выключаем видеотреки в зависимости от состояния в контексте
      localVideoTracks.forEach(pub => {
        if (pub.track) {
          if (cameraEnabled && pub.track.enabled === false) {
            console.log('[CameraController] Включение видеотрека:', pub.trackSid);
            pub.track.enabled = true;
          } else if (!cameraEnabled && pub.track.enabled === true) {
            console.log('[CameraController] Выключение видеотрека:', pub.trackSid);
            pub.track.enabled = false;
          }
        }
      });
    } catch (error) {
      console.error('[CameraController] Ошибка при управлении видеотреками:', error);
    }
  }, [cameraEnabled, localParticipant, videoTracks]);
  
  // Этот компонент не рендерит никакого UI
  return null;
};