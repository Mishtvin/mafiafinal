import { Participant, RemoteTrackPublication, Track, TrackPublication } from "livekit-client";
import { useEffect, useRef, useState } from "react";

interface ParticipantTileProps {
  participant: Participant;
}

export default function ParticipantTile({ participant }: ParticipantTileProps) {
  // Ссылки на HTML элементы для медиа
  const videoRef = useRef<HTMLVideoElement>(null);
  const screenRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Состояния медиа-треков
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  // Флаг локального участника (текущего пользователя)
  const isLocal = participant.isLocal;
  
  // Функция для получения треков участника
  const getTracks = () => {
    const tracks: {
      video?: TrackPublication;
      audio?: TrackPublication;
      screen?: TrackPublication;
    } = {};
    
    // Перебираем все публикации треков участника
    participant.getTrackPublications().forEach(publication => {
      // Проверяем, что трек опубликован и доступен
      if (publication.track) {
        if (publication.kind === 'audio') {
          tracks.audio = publication;
        } 
        else if (publication.kind === 'video') {
          if (publication.track.source === Track.Source.ScreenShare) {
            tracks.screen = publication;
          } else {
            tracks.video = publication;
          }
        }
      }
    });
    
    return tracks;
  };

  // Функция безопасного подключения видеотрека
  const attachTrack = (pub: TrackPublication | undefined, element: HTMLVideoElement | HTMLAudioElement | null) => {
    if (!pub || !pub.track || !element) return;
    
    try {
      // Отсоединяем предыдущие треки
      if (element.srcObject) {
        const stream = element.srcObject as MediaStream;
        if (stream.getTracks) {
          stream.getTracks().forEach(t => t.stop());
        }
        element.srcObject = null;
      }
      
      // Для локальных видеотреков используем MediaStreamTrack напрямую
      if (isLocal && pub.kind === 'video' && pub.track.mediaStreamTrack) {
        const stream = new MediaStream([pub.track.mediaStreamTrack]);
        element.srcObject = stream;
        element.muted = true;
        
        if (element instanceof HTMLVideoElement) {
          element.style.transform = 'scaleX(-1)';
        }
      } else {
        // Для всех остальных используем LiveKit API
        pub.track.attach(element);
        
        // Для локального аудио - заглушаем, чтобы избежать эха
        if (isLocal && pub.kind === 'audio') {
          element.muted = true;
        }
      }
      
      // Запускаем воспроизведение с обработкой ошибок
      if (element instanceof HTMLVideoElement) {
        element.play().catch(err => {
          console.warn(`Error playing ${pub.kind} for ${participant.identity}:`, err);
          element.muted = true; // Пробуем заглушить (часто помогает с ограничениями автовоспроизведения)
          element.play().catch(e => console.error('Second play attempt failed:', e));
        });
      }
    } catch (error) {
      console.error(`Failed to attach ${pub.kind} track for ${participant.identity}:`, error);
    }
  };
  
  // Обработка треков при их изменении и при первом рендере
  useEffect(() => {
    // Вспомогательная функция обновления состояния и треков
    const updateTracks = () => {
      const { video, audio, screen } = getTracks();
      
      // Обновляем состояния UI на основе наличия и состояния треков
      setIsMuted(!audio || audio.isMuted);
      setIsCameraEnabled(!!video && !video.isMuted);
      setIsScreenSharing(!!screen && !screen.isMuted);
      
      // Подключаем видео трек к элементу, если он есть
      if (video?.track && videoRef.current) {
        attachTrack(video, videoRef.current);
      }
      
      // Подключаем аудио трек
      if (audio?.track && audioRef.current) {
        attachTrack(audio, audioRef.current);
      }
      
      // Подключаем демонстрацию экрана
      if (screen?.track && screenRef.current) {
        attachTrack(screen, screenRef.current);
      }
    };
    
    // Обновляем треки при первом рендере
    updateTracks();
    
    // Подписываемся на события изменения треков
    const handleTrackEvent = () => updateTracks();
    
    participant.on('trackPublished', handleTrackEvent);
    participant.on('trackUnpublished', handleTrackEvent);
    participant.on('trackSubscribed', handleTrackEvent);
    participant.on('trackUnsubscribed', handleTrackEvent);
    participant.on('trackMuted', handleTrackEvent);
    participant.on('trackUnmuted', handleTrackEvent);
    
    // Для отслеживания состояния "говорящего"
    const speakingInterval = setInterval(() => {
      setIsSpeaking(participant.isSpeaking);
    }, 500);
    
    // Функция для локального участника - повторное воспроизведение видео, если оно остановилось
    let localVideoInterval: NodeJS.Timeout | null = null;
    
    if (isLocal) {
      localVideoInterval = setInterval(() => {
        const videoElement = videoRef.current;
        // Проверяем, есть ли видеоэлемент и остановлено ли видео
        if (videoElement && isCameraEnabled && videoElement.paused) {
          videoElement.play().catch(err => {
            console.warn('Retry playing local video:', err);
          });
        }
      }, 2000);
    }
    
    // Очистка при размонтировании
    return () => {
      participant.off('trackPublished', handleTrackEvent);
      participant.off('trackUnpublished', handleTrackEvent);
      participant.off('trackSubscribed', handleTrackEvent);
      participant.off('trackUnsubscribed', handleTrackEvent);
      participant.off('trackMuted', handleTrackEvent);
      participant.off('trackUnmuted', handleTrackEvent);
      
      clearInterval(speakingInterval);
      
      if (localVideoInterval) {
        clearInterval(localVideoInterval);
      }
    };
  }, [participant, isLocal]); // Зависимости только от participant и isLocal
  
  // Отображение участника
  return (
    <div className={`relative w-full h-full bg-slate-800 rounded-md overflow-hidden flex items-center justify-center group ${isSpeaking ? 'ring-2 ring-blue-500' : ''}`}>
      {isScreenSharing ? (
        <video
          ref={screenRef}
          className="w-full h-full object-contain"
          autoPlay
          playsInline
          muted={isLocal}
        />
      ) : isCameraEnabled ? (
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          autoPlay
          playsInline
          muted={isLocal}
          style={{ transform: isLocal ? 'scaleX(-1)' : 'none' }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-r from-blue-900 to-indigo-800">
          <div className="h-20 w-20 rounded-full bg-slate-700 flex items-center justify-center text-white text-2xl font-bold">
            {participant.identity.charAt(0).toUpperCase()}
          </div>
        </div>
      )}
      
      {/* Аудио трек */}
      <audio ref={audioRef} autoPlay />
      
      {/* Информационная панель */}
      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent flex justify-between items-center text-white text-sm">
        <div className="flex items-center">
          <span className="font-medium truncate">
            {participant.identity}{isLocal ? ' (Вы)' : ''}
          </span>
        </div>
        
        <div className="flex space-x-1">
          {isMuted && (
            <div className="text-red-400">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="16" 
                height="16" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <line x1="1" y1="1" x2="23" y2="23"></line>
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
            </div>
          )}
          
          {!isCameraEnabled && (
            <div className="text-red-400">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="16" 
                height="16" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <line x1="1" y1="1" x2="23" y2="23"></line>
                <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56"></path>
              </svg>
            </div>
          )}
          
          {isScreenSharing && (
            <div className="text-green-400">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="16" 
                height="16" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}