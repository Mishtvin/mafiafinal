import React, { useEffect, useRef, useState } from 'react';
import { Participant } from 'livekit-client';
import { useCameraContext } from '../../contexts/CameraContext';

/**
 * Изолированный компонент для отображения видеотрека с минимальными перерисовками
 */
export const IsolatedVideoTrack: React.FC<{
  participant: Participant;
}> = React.memo(({ participant }) => {
  const videoElement = useRef<HTMLVideoElement>(null);
  const identity = participant.identity;
  const isLocal = participant.isLocal;
  
  // Получаем состояние камеры из контекста
  const { getVideoEnabled } = useCameraContext();
  const isEnabled = getVideoEnabled(identity, isLocal);
  
  // Состояние для отслеживания того, что видео-элемент получил MediaStream
  const [hasVideoStream, setHasVideoStream] = useState(false);
  
  console.log(`[VIDEO_TRACK] Рендер трека для ${identity}, isEnabled: ${isEnabled}, isLocal: ${isLocal}`);
  
  // Обновляем видеотрек при изменении участника
  useEffect(() => {
    const videoEl = videoElement.current;
    if (!videoEl) return;
    
    // Получаем все треки публикации этого участника
    const trackPublications = Array.from(participant.trackPublications.values());
    // Ищем видеотрек камеры
    const videoPublication = trackPublications.find(
      pub => pub.source === 'camera' && pub.track?.kind === 'video'
    );
    
    // Если есть видеотрек и элемент доступен, подключаем его
    if (videoPublication?.track) {
      const videoTrack = videoPublication.track;
      // Ручное управление потоком
      if (isEnabled) {
        // Если камера включена, отображаем видео
        if (videoTrack.isMuted) {
          // Для LocalTrack доступен метод unmute
          if ('unmute' in videoTrack) {
            (videoTrack as any).unmute();
          }
        }
        videoEl.muted = true;
        videoEl.autoplay = true;
        
        // Присоединяем трек к HTML-элементу
        if (!videoEl.srcObject) {
          const mediaStream = new MediaStream([videoTrack.mediaStreamTrack]);
          videoEl.srcObject = mediaStream;
          setHasVideoStream(true);
          
          console.log(`[VIDEO_TRACK] Прикрепляю MediaStream для ${identity}`);
        }
      } else {
        // Если камера выключена, отключаем видео
        if (!videoTrack.isMuted) {
          // Для LocalTrack доступен метод mute
          if ('mute' in videoTrack) {
            (videoTrack as any).mute();
          }
        }
        videoEl.srcObject = null;
        setHasVideoStream(false);
        
        console.log(`[VIDEO_TRACK] Отключаю MediaStream для ${identity}`);
      }
    } else {
      // Если нет видеотрека, очищаем элемент
      if (videoEl.srcObject) {
        videoEl.srcObject = null;
        setHasVideoStream(false);
      }
    }
    
    // Очистка при размонтировании
    return () => {
      if (videoEl && videoEl.srcObject) {
        videoEl.srcObject = null;
      }
    };
  }, [participant, isEnabled, identity]);
  
  return (
    <div className="relative w-full h-full">
      {/* HTML-элемент видео */}
      <video 
        ref={videoElement} 
        className={`absolute inset-0 w-full h-full object-cover rounded-xl transition-opacity ${
          isEnabled && hasVideoStream ? 'opacity-100' : 'opacity-0'
        }`}
      />
      
      {/* Аватар пользователя, если камера выключена */}
      {(!isEnabled || !hasVideoStream) && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
          <div className="flex flex-col items-center justify-center">
            <div className="bg-purple-600 rounded-full w-16 h-16 flex items-center justify-center mb-2">
              <span className="text-xl font-bold text-white">
                {identity.substring(0, 2).toUpperCase()}
              </span>
            </div>
            <div className="text-white text-sm">{identity}</div>
          </div>
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Строгий компаратор: рендерим только при изменении идентификатора участника
  return prevProps.participant.identity === nextProps.participant.identity;
});