import React, { useEffect, useState } from 'react';
import { useLocalParticipant } from '@livekit/components-react';
import { useCameraContext } from '../../contexts/CameraContext';

/**
 * Компонент для переключения своей камеры
 */
export const CameraToggle: React.FC = () => {
  const { localParticipant } = useLocalParticipant();
  const { cameraStates, setCameraState } = useCameraContext();
  
  // Получаем состояние своей камеры из контекста или по умолчанию выключено 
  const cameraEnabled = localParticipant ? cameraStates[localParticipant.identity] || false : false;
  
  // Функция для переключения камеры
  const toggleCamera = async () => {
    if (!localParticipant) return;
    
    const newState = !cameraEnabled;
    console.log(`[CAMERA_TOGGLE] Переключение камеры: ${newState}`);
    
    // Меняем состояние в контексте
    setCameraState(localParticipant.identity, newState);
    
    // Управляем реальной камерой
    try {
      const tracks = Array.from(localParticipant.trackPublications.values());
      const videoTrack = tracks.find(track => track.source === 'camera');
      
      if (videoTrack) {
        // Если трек существует, включаем/отключаем его
        if (newState) {
          await videoTrack.track?.unmute();
        } else {
          await videoTrack.track?.mute();
        }
      } else if (newState) {
        // Если трека нет и хотим включить, создаем новый
        await localParticipant.enableCameraAndMicrophone();
        await localParticipant.setMicrophoneEnabled(false); // Отключаем микрофон, так как нам нужна только камера
      }
      
      // Отправляем событие на сервер
      const ws = new WebSocket(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`);
      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'camera_state_update',
          enabled: newState
        }));
        setTimeout(() => ws.close(), 100);
      };
    } catch (error) {
      console.error('[CAMERA_TOGGLE] Ошибка при переключении камеры:', error);
    }
  };
  
  // Для отладки
  useEffect(() => {
    if (localParticipant) {
      console.log(`[CAMERA_TOGGLE] Состояние камеры ${localParticipant.identity}: ${cameraEnabled}`);
    }
  }, [localParticipant, cameraEnabled]);
  
  if (!localParticipant) return null;
  
  return (
    <button 
      className={`flex items-center justify-center p-2 rounded-full transition-colors ${
        cameraEnabled ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
      }`}
      onClick={toggleCamera}
    >
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        className="h-6 w-6 text-white" 
        fill="none" 
        viewBox="0 0 24 24" 
        stroke="currentColor"
      >
        {cameraEnabled ? (
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" 
          />
        ) : (
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z M3 3l18 18" 
          />
        )}
      </svg>
    </button>
  );
};