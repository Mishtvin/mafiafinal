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

  // Улучшенная функция безопасного подключения видеотрека с поддержкой различных сценариев
  const attachTrack = (pub: TrackPublication | undefined, element: HTMLVideoElement | HTMLAudioElement | null) => {
    if (!pub || !element) return;
    
    try {
      console.log(`Attaching ${pub.kind} track for ${participant.identity}, local: ${isLocal}, track exists: ${!!pub.track}`);
      
      // Отсоединяем предыдущие треки для очистки ресурсов
      if (element.srcObject) {
        const stream = element.srcObject as MediaStream;
        if (stream.getTracks) {
          stream.getTracks().forEach(t => {
            console.log(`Stopping existing track in ${element.tagName}`);
            t.stop();
          });
        }
        element.srcObject = null;
      }
      
      // Если у нас нет трека, нечего подключать
      if (!pub.track) {
        console.log(`No track available for ${pub.kind} of ${participant.identity}`);
        return;
      }
      
      // Настраиваем аудио элементы
      if (element instanceof HTMLAudioElement) {
        // Локальное аудио всегда должно быть заглушено чтобы избежать эха
        if (isLocal) {
          element.muted = true;
        }
        
        // Используем LiveKit для подключения аудио
        pub.track.attach(element);
        return;
      }
      
      // Далее обрабатываем только видео элементы
      if (!(element instanceof HTMLVideoElement)) return;
      
      // Настраиваем видео элемент
      element.autoplay = true;
      element.playsInline = true;
      element.muted = isLocal; // Локальное видео всегда должно быть заглушено
      
      // Для локальной камеры применяем зеркальный эффект если это не демонстрация экрана
      if (isLocal && pub.track.source === Track.Source.Camera) {
        element.style.transform = 'scaleX(-1)';
      } else {
        element.style.transform = '';
      }
      
      // Для локальных участников и видеотреков пробуем использовать MediaStreamTrack напрямую
      // Это более стабильно работает в некоторых браузерах
      if (isLocal && pub.track.mediaStreamTrack) {
        console.log(`Using direct MediaStreamTrack for local video of ${participant.identity}`);
        const stream = new MediaStream([pub.track.mediaStreamTrack]);
        element.srcObject = stream;
      } 
      // Для дополнительной совместимости проверяем наличие mediaStream
      else if (pub.track.mediaStream) {
        console.log(`Using mediaStream for video of ${participant.identity}`);
        element.srcObject = pub.track.mediaStream;
      }
      // В крайнем случае используем метод attach из LiveKit
      else {
        console.log(`Using LiveKit attach for video of ${participant.identity}`);
        pub.track.attach(element);
      }
      
      // Активно пытаемся запустить воспроизведение видео
      const startPlayback = async () => {
        if (element.paused) {
          try {
            await element.play();
            console.log(`Successfully started playback for ${pub.kind} of ${participant.identity}`);
          } catch (err) {
            console.warn(`Error starting ${pub.kind} playback for ${participant.identity}:`, err);
            
            // Повторная попытка через задержку
            setTimeout(async () => {
              try {
                // Устанавливаем muted=true, что позволяет автовоспроизведению работать даже с ограничениями браузера
                element.muted = true;
                await element.play();
                // Если это не локальное видео, восстанавливаем звук после успешного запуска
                if (!isLocal && pub.kind !== 'video') {
                  setTimeout(() => { element.muted = false; }, 100);
                }
              } catch (e) {
                console.error(`Failed second playback attempt for ${participant.identity}:`, e);
              }
            }, 500);
          }
        }
      };
      
      // Запускаем воспроизведение
      startPlayback();
      
      // Также устанавливаем обработчик события loadedmetadata для повторной попытки
      // воспроизведения после загрузки метаданных
      element.addEventListener('loadedmetadata', startPlayback, { once: true });
    } catch (error) {
      console.error(`Failed to attach ${pub?.kind} track for ${participant.identity}:`, error);
    }
  };
  
  // Улучшенная обработка треков при их изменении и при первом рендере
  useEffect(() => {
    console.log(`Setting up track handling for ${participant.identity}, isLocal: ${isLocal}`);
    
    // Вспомогательная функция обновления состояния и треков с логами
    const updateTracks = () => {
      console.log(`Updating tracks for ${participant.identity}...`);
      
      const { video, audio, screen } = getTracks();
      
      console.log(`Tracks for ${participant.identity}:`, {
        hasVideo: !!video,
        videoMuted: video?.isMuted,
        hasAudio: !!audio,
        audioMuted: audio?.isMuted,
        hasScreen: !!screen
      });
      
      // Обновляем состояния UI на основе наличия и состояния треков
      setIsMuted(!audio || audio.isMuted);
      setIsCameraEnabled(!!video && !video.isMuted);
      setIsScreenSharing(!!screen && !screen.isMuted);
      
      // Подключаем видео трек к элементу, если он есть
      if (video) {
        console.log(`Attaching video track for ${participant.identity}, active: ${!video.isMuted}`);
        attachTrack(video, videoRef.current);
      } else if (videoRef.current && videoRef.current.srcObject) {
        // Если нет видеотрека, но ранее был прикреплен источник, очищаем его
        console.log(`Clearing video element for ${participant.identity} - no video track`);
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(t => t.stop());
        videoRef.current.srcObject = null;
      }
      
      // Подключаем аудио трек
      if (audio) {
        console.log(`Attaching audio track for ${participant.identity}, active: ${!audio.isMuted}`);
        attachTrack(audio, audioRef.current);
      }
      
      // Подключаем демонстрацию экрана, если она есть
      if (screen) {
        console.log(`Attaching screen sharing track for ${participant.identity}`);
        attachTrack(screen, screenRef.current);
      } else if (screenRef.current && screenRef.current.srcObject) {
        // Очищаем, если демонстрация экрана завершена
        console.log(`Clearing screen element for ${participant.identity} - no screen track`);
        const stream = screenRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(t => t.stop());
        screenRef.current.srcObject = null;
      }
    };
    
    // Обновляем треки при первом рендере с небольшой задержкой
    // чтобы дать время на инициализацию всех компонентов
    const initialUpdateTimeout = setTimeout(() => {
      updateTracks();
    }, 100);
    
    // Специальные обработчики событий для каждого типа событий
    // для более точного логирования и отладки
    const handleTrackPublished = (pub: TrackPublication) => {
      console.log(`Track published for ${participant.identity}:`, {
        kind: pub.kind,
        trackSid: pub.trackSid,
        source: pub.track?.source
      });
      updateTracks();
    };
    
    const handleTrackSubscribed = (track: any, pub: TrackPublication) => {
      console.log(`Track subscribed for ${participant.identity}:`, {
        kind: pub.kind,
        trackSid: pub.trackSid,
        source: track.source
      });
      updateTracks();
    };
    
    const handleTrackUnsubscribed = () => {
      console.log(`Track unsubscribed for ${participant.identity}`);
      updateTracks();
    };
    
    const handleTrackMuted = (pub: TrackPublication) => {
      console.log(`Track muted for ${participant.identity}:`, {
        kind: pub.kind,
        source: pub.track?.source
      });
      updateTracks();
    };
    
    const handleTrackUnmuted = (pub: TrackPublication) => {
      console.log(`Track unmuted for ${participant.identity}:`, {
        kind: pub.kind,
        source: pub.track?.source
      });
      updateTracks();
    };
    
    // Подписываемся на все события с индивидуальными обработчиками
    participant.on('trackPublished', handleTrackPublished);
    participant.on('trackUnpublished', handleTrackUnsubscribed);
    participant.on('trackSubscribed', handleTrackSubscribed);
    participant.on('trackUnsubscribed', handleTrackUnsubscribed);
    participant.on('trackMuted', handleTrackMuted);
    participant.on('trackUnmuted', handleTrackUnmuted);
    
    // Для отслеживания состояния "говорящего"
    const speakingInterval = setInterval(() => {
      const wasSpeaking = isSpeaking;
      const nowSpeaking = participant.isSpeaking;
      
      if (wasSpeaking !== nowSpeaking) {
        console.log(`Speaking state changed for ${participant.identity}: ${nowSpeaking}`);
        setIsSpeaking(nowSpeaking);
      }
    }, 500);
    
    // Более агрессивное периодическое обновление для обеспечения работы видеоэлементов
    const periodicUpdateInterval = setInterval(() => {
      // Периодически проверяем состояние треков для большей надежности
      updateTracks();
    }, 5000);
    
    // Очистка при размонтировании
    return () => {
      clearTimeout(initialUpdateTimeout);
      clearInterval(speakingInterval);
      clearInterval(periodicUpdateInterval);
      
      participant.off('trackPublished', handleTrackPublished);
      participant.off('trackUnpublished', handleTrackUnsubscribed);
      participant.off('trackSubscribed', handleTrackSubscribed);
      participant.off('trackUnsubscribed', handleTrackUnsubscribed);
      participant.off('trackMuted', handleTrackMuted);
      participant.off('trackUnmuted', handleTrackUnmuted);
      
      // Очистка видеоэлементов при размонтировании
      [videoRef.current, screenRef.current, audioRef.current].forEach(element => {
        if (element && element.srcObject) {
          const stream = element.srcObject as MediaStream;
          stream.getTracks().forEach(track => track.stop());
          element.srcObject = null;
        }
      });
      
      console.log(`Cleaned up track handling for ${participant.identity}`);
    };
  }, [participant, isLocal, isSpeaking]); // Зависимости от participant, isLocal и isSpeaking
  
  // Улучшенное отображение участника с приоритетной визуализацией видео
  return (
    <div className={`relative w-full h-full bg-slate-800 rounded-md overflow-hidden flex items-center justify-center group ${isSpeaking ? 'ring-2 ring-blue-500' : ''}`}>
      {/* Плейсхолдер с аватаром (всегда отображается, если нет видео) */}
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-r from-blue-900 to-indigo-800">
        <div className="h-20 w-20 rounded-full bg-slate-700 flex items-center justify-center text-white text-2xl font-bold">
          {participant.identity.charAt(0).toUpperCase()}
        </div>
      </div>
      
      {/* Видеоэлементы (отображаются поверх плейсхолдера когда доступны) */}
      {isScreenSharing && (
        <video
          ref={screenRef}
          className="absolute inset-0 w-full h-full object-contain z-10"
          autoPlay
          playsInline
          muted={isLocal}
        />
      )}
      
      {isCameraEnabled && !isScreenSharing && (
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover z-10"
          autoPlay
          playsInline
          muted={isLocal}
          style={{ transform: isLocal ? 'scaleX(-1)' : 'none' }}
        />
      )}
      
      {/* Аудио трек */}
      <audio ref={audioRef} autoPlay />
      
      {/* Информационная панель всегда отображается поверх всего */}
      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent flex justify-between items-center text-white text-sm z-20">
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
      
      {/* Индикатор соединения для отображения состояния, когда трек загружается или отключается */}
      {((isCameraEnabled && !videoRef.current?.srcObject) || 
        (isScreenSharing && !screenRef.current?.srcObject)) && (
        <div className="absolute inset-0 flex items-center justify-center z-30 bg-black/20 backdrop-blur-sm">
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-500 mb-1"></div>
            <div className="text-xs text-white font-medium">Подключение видео...</div>
          </div>
        </div>
      )}
    </div>
  );
}