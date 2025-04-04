import { VideoTrack } from '@livekit/components-react';
import { Participant, RemoteTrack, Track, TrackPublication } from "livekit-client";
import { useEffect, useRef, useState, useMemo } from "react";

interface ParticipantTileProps {
  participant: Participant;
}

export default function ParticipantTile({ participant }: ParticipantTileProps) {
  // Состояния для отображения UI
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  // Состояния для хранения треков (чтобы треки "закрепились" и не обновлялись слишком часто)
  const [cameraTrackPublication, setCameraTrackPublication] = useState<TrackPublication | null>(null);
  const [screenTrackPublication, setScreenTrackPublication] = useState<TrackPublication | null>(null);
  
  // Аудио элемент для звука
  const audioRef = useRef<HTMLAudioElement>(null);
  // Ссылка на видео элемент для прямого доступа
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Флаг локального участника
  const isLocal = participant.isLocal;

  // Получаем трек для видео камеры
  const getCameraTrack = () => {
    return participant.getTrackPublications().find(pub => 
      pub.kind === 'video' && 
      pub.track?.source === Track.Source.Camera &&
      !pub.isMuted
    );
  };

  // Получаем трек для демонстрации экрана
  const getScreenTrack = () => {
    return participant.getTrackPublications().find(pub => 
      pub.kind === 'video' && 
      pub.track?.source === Track.Source.ScreenShare && 
      !pub.isMuted
    );
  };

  // Получаем аудио трек
  const getAudioTrack = () => {
    return participant.getTrackPublications().find(pub => 
      pub.kind === 'audio' && 
      !pub.isMuted
    );
  };
  
  // Функция для ручного подключения видео трека к элементу
  // Этот метод увеличивает стабильность воспроизведения видео
  const attachVideoTrackManually = (publication: TrackPublication, videoElement: HTMLVideoElement | null) => {
    if (!publication?.track || !videoElement) return false;
    
    try {
      // Сначала очищаем предыдущий видеопоток
      if (videoElement.srcObject) {
        const stream = videoElement.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
      }
      
      // Устанавливаем основные параметры видео
      videoElement.autoplay = true;
      videoElement.playsInline = true;
      videoElement.muted = isLocal;
      
      // Применяем стили для отображения
      if (isLocal && publication.track.source === Track.Source.Camera) {
        videoElement.style.transform = 'scaleX(-1)';
      } else {
        videoElement.style.transform = '';
      }
      
      // Для локальных видео используем прямой метод с MediaStreamTrack
      if (isLocal && publication.track.mediaStreamTrack) {
        const stream = new MediaStream([publication.track.mediaStreamTrack]);
        videoElement.srcObject = stream;
      } 
      // Для надёжности проверяем наличие mediaStream
      else if (publication.track.mediaStream) {
        videoElement.srcObject = publication.track.mediaStream;
      }
      // В крайнем случае используем attach из LiveKit
      else {
        publication.track.attach(videoElement);
      }
      
      // Активно пытаемся запустить воспроизведение
      const startPlayback = async () => {
        try {
          await videoElement.play();
          console.log(`Successfully started video playback for ${participant.identity}`);
          return true;
        } catch (err) {
          console.warn(`Error starting video playback:`, err);
          
          // Вторая попытка с принудительным muted=true
          setTimeout(async () => {
            try {
              videoElement.muted = true;
              await videoElement.play();
              if (!isLocal) {
                setTimeout(() => { videoElement.muted = false; }, 100);
              }
            } catch (e) {
              console.error(`Failed second playback attempt:`, e);
            }
          }, 200);
          return false;
        }
      };
      
      startPlayback();
      
      // Установка обработчика на случай, если метаданные загрузятся позже
      videoElement.addEventListener('loadedmetadata', () => {
        startPlayback();
      }, { once: true });
      
      return true;
    } catch (error) {
      console.error(`Failed to manually attach video track:`, error);
      return false;
    }
  };

  // Обновление состояний UI и подключение треков
  useEffect(() => {
    console.log(`Setting up track handling for ${participant.identity}, isLocal: ${isLocal}`);

    // Функция обновления состояния и треков
    const updateTracksAndState = () => {
      const videoTrack = getCameraTrack();
      const screenTrack = getScreenTrack();
      const audioTrack = getAudioTrack();
      
      console.log(`Tracks for ${participant.identity}:`, {
        hasVideo: !!videoTrack,
        hasAudio: !!audioTrack,
        hasScreen: !!screenTrack
      });
      
      // Обновляем состояния на основе наличия треков
      setIsCameraEnabled(!!videoTrack);
      setIsScreenSharing(!!screenTrack);
      setIsMuted(!audioTrack);
      
      // Сохраняем ссылки на публикации треков для стабильности
      if (videoTrack) {
        setCameraTrackPublication(videoTrack);
      }
      
      if (screenTrack) {
        setScreenTrackPublication(screenTrack);
      }
      
      // Подключаем аудио трек если есть
      if (audioTrack && audioTrack.track && audioRef.current) {
        // Отключаем предыдущий аудио
        if (audioRef.current.srcObject) {
          const stream = audioRef.current.srcObject as MediaStream;
          stream.getTracks().forEach(t => t.stop());
          audioRef.current.srcObject = null;
        }
        
        // Подключаем новый аудио поток
        try {
          audioTrack.track.attach(audioRef.current);
          // Локальное аудио всегда должно быть заглушено чтобы избежать эха
          audioRef.current.muted = isLocal;
        } catch (error) {
          console.error(`Failed to attach audio for ${participant.identity}:`, error);
        }
      }
      
      // Если мы видим напрямую videoRef, то пробуем подключить видео вручную
      // Это дополнительная стабилизация, которая сработает если VideoTrack компонент не работает
      if (videoRef.current && videoTrack) {
        attachVideoTrackManually(videoTrack, videoRef.current);
      }
    };
    
    // Обновляем треки сразу при монтировании
    updateTracksAndState();
    
    // Подписываемся на все события, влияющие на наличие или состояние треков
    const handleTrackEvent = () => updateTracksAndState();
    
    participant.on('trackPublished', handleTrackEvent);
    participant.on('trackUnpublished', handleTrackEvent);
    participant.on('trackSubscribed', handleTrackEvent);
    participant.on('trackUnsubscribed', handleTrackEvent);
    participant.on('trackMuted', handleTrackEvent);
    participant.on('trackUnmuted', handleTrackEvent);
    
    // Для отслеживания состояния "говорящего"
    const speakingInterval = setInterval(() => {
      const nowSpeaking = participant.isSpeaking;
      setIsSpeaking(nowSpeaking);
    }, 300);
    
    // Периодическое обновление для стабильности с немного увеличенным интервалом
    // для уменьшения переподключений
    const updateInterval = setInterval(updateTracksAndState, 5000);
    
    // Очистка при размонтировании
    return () => {
      clearInterval(speakingInterval);
      clearInterval(updateInterval);
      
      participant.off('trackPublished', handleTrackEvent);
      participant.off('trackUnpublished', handleTrackEvent);
      participant.off('trackSubscribed', handleTrackEvent);
      participant.off('trackUnsubscribed', handleTrackEvent);
      participant.off('trackMuted', handleTrackEvent);
      participant.off('trackUnmuted', handleTrackEvent);
      
      // Очистка аудио элемента
      if (audioRef.current && audioRef.current.srcObject) {
        const stream = audioRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(t => t.stop());
        audioRef.current.srcObject = null;
      }
      
      // Очистка видео элемента
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(t => t.stop());
        videoRef.current.srcObject = null;
      }
      
      console.log(`Cleaned up track handling for ${participant.identity}`);
    };
  }, [participant, isLocal]);
  
  // Создание трек-референса для VideoTrack компонента из LiveKit
  const createTrackReference = (publication?: TrackPublication | null) => {
    if (!publication || !publication.track) return null;
    
    return {
      publication,
      participant,
      source: publication.track.source,
      track: publication.track
    };
  };
  
  // Активный камера-трек для отображения
  // Используем сохраненный трек для большей стабильности или получаем новый
  const activeCameraTrack = useMemo(() => {
    return cameraTrackPublication || getCameraTrack() || null;
  }, [cameraTrackPublication, participant]);
  
  // Активный скрин-трек для отображения
  const activeScreenTrack = useMemo(() => {
    return screenTrackPublication || getScreenTrack() || null;
  }, [screenTrackPublication, participant]);
  
  return (
    <div 
      className={`relative w-full h-full bg-slate-800 rounded-md overflow-hidden flex items-center justify-center ${
        isSpeaking ? 'ring-2 ring-blue-500' : ''
      }`}
    >
      {/* Аватар пользователя (виден, когда нет видео) */}
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-r from-blue-900 to-indigo-800">
        <div className="h-20 w-20 rounded-full bg-slate-700 flex items-center justify-center text-white text-2xl font-bold">
          {participant.identity.charAt(0).toUpperCase()}
        </div>
      </div>
      
      {/* Видео с камеры пользователя */}
      {/* Видео с камеры пользователя - используем сохраненный или активный трек */}
      {isCameraEnabled && !isScreenSharing && (
        <div className="absolute inset-0 w-full h-full z-10">
          {/* Основной VideoTrack с компонентом из LiveKit */}
          {activeCameraTrack && (
            <VideoTrack
              trackRef={createTrackReference(activeCameraTrack)}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: isLocal ? 'scaleX(-1)' : 'none'
              }}
            />
          )}
          
          {/* Запасной прямой видеоэлемент на случай проблем с VideoTrack */}
          <video 
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ 
              transform: isLocal ? 'scaleX(-1)' : 'none',
              // Показываем только если нетVideoTrack
              display: activeCameraTrack ? 'none' : 'block' 
            }}
            autoPlay 
            playsInline 
            muted={isLocal}
          />
        </div>
      )}
      
      {/* Демонстрация экрана */}
      {isScreenSharing && activeScreenTrack && (
        <div className="absolute inset-0 w-full h-full z-20">
          <VideoTrack
            trackRef={createTrackReference(activeScreenTrack)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain'
            }}
          />
        </div>
      )}
      
      {/* Аудио трек */}
      <audio ref={audioRef} autoPlay />
      
      {/* Информационная панель снизу */}
      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent flex justify-between items-center text-white text-sm z-30">
        <div className="flex items-center">
          <span className="font-medium truncate">
            {participant.identity}{isLocal ? ' (Вы)' : ''}
          </span>
        </div>
        
        <div className="flex space-x-1">
          {isMuted && (
            <div className="text-red-400 bg-black/30 rounded-full p-0.5">
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
            <div className="text-red-400 bg-black/30 rounded-full p-0.5">
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
            <div className="text-green-400 bg-black/30 rounded-full p-0.5">
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