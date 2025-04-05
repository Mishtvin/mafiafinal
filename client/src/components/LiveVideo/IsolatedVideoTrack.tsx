import React, { useMemo, useEffect, useState, useRef } from 'react';
import { Participant, Track } from 'livekit-client';
import { useTracks } from '@livekit/components-react';
import { useCameraContext } from '../../contexts/CameraContext';

interface IsolatedVideoTrackProps {
  participant: Participant;
  isLocal?: boolean;
}

export const IsolatedVideoTrack: React.FC<IsolatedVideoTrackProps> = ({ 
  participant,
  isLocal = false
}) => {
  // Получаем состояние камеры из контекста
  const { cameraEnabled } = useCameraContext();
  
  // Получаем видеотреки участника с помощью хука LiveKit
  const tracks = useTracks(
    [Track.Source.Camera],
    { 
      onlySubscribed: false,
      // Фильтруем треки в useEffect по identity участника
    }
  );
  
  // Состояние для отслеживания референса на видеоэлемент
  const videoEl = useRef<HTMLVideoElement | null>(null);
  
  // Мемоизированное значение видимости видео
  const isEnabled = useMemo(() => {
    if (isLocal) {
      // Для локального участника используем состояние из контекста
      return cameraEnabled;
    } else {
      // Для удаленных участников проверяем подписку и muted
      const hasVisibleTrack = tracks.some(pub => 
        pub.isSubscribed && 
        !pub.isMuted && 
        pub.track && 
        pub.source === Track.Source.Camera &&
        pub.participant && 
        pub.participant.identity === participant.identity
      );
      return hasVisibleTrack;
    }
  }, [isLocal, cameraEnabled, tracks, participant.identity]);
  
  // Эффект для прикрепления трека к видеоэлементу
  useEffect(() => {
    // Если элемент не создан или нет треков, ничего не делаем
    if (!videoEl.current || tracks.length === 0) return;
    
    // Находим первый видеотрек для этого участника
    const videoTrack = tracks.find(track => 
      track.track && 
      track.track.kind === 'video' && 
      track.source === Track.Source.Camera &&
      track.participant && 
      track.participant.identity === participant.identity
    );
    
    if (videoTrack?.track) {
      console.log(`[VIDEO_TRACK] Прикрепляем трек ${videoTrack.trackSid} к видеоэлементу для ${participant.identity}`);
      
      // Прикрепляем трек к видеоэлементу
      videoTrack.track.attach(videoEl.current);
      
      // Отсоединяем при размонтировании
      return () => {
        if (videoTrack.track) {
          videoTrack.track.detach(videoEl.current!);
        }
      };
    }
  }, [tracks, participant]);
  
  console.log(`[VIDEO_TRACK] Рендер трека для ${participant.identity}, isEnabled: ${isEnabled}, isLocal: ${isLocal}`);
  
  return (
    <div className={`video-container relative w-full h-full overflow-hidden ${isEnabled ? '' : 'hidden'}`}>
      <video
        ref={videoEl}
        className="w-full h-full object-cover"
        autoPlay
        playsInline
        muted={true}
      />
    </div>
  );
};