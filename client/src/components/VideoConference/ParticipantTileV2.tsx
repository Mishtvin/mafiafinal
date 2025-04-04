import React, { useEffect, useState, useRef } from 'react';
import { Participant, Track, TrackPublication } from 'livekit-client';

interface ParticipantTileProps {
  participant: Participant;
}

export default function ParticipantTile({ participant }: ParticipantTileProps) {
  const [videoTrack, setVideoTrack] = useState<TrackPublication | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  
  // Кэш для информации о состоянии трека
  const [trackState, setTrackState] = useState({
    hasVideo: false,
    hasAudio: false,
    hasScreen: false
  });

  // Используем ref для сохранения ссылки на видеоэлемент
  const videoRef = useRef<HTMLVideoElement>(null);
  // Отдельный ref для отслеживания состояния подключения
  const attachedRef = useRef<boolean>(false);
  
  useEffect(() => {
    console.log(`Setting up track handling for ${participant.identity}, isLocal: ${participant.isLocal}`);
    
    // Функция для проверки доступных треков участника и их подключения
    const updateTracks = () => {
      // Сначала получаем все публикации треков от участника
      const trackPublications = participant.getTrackPublications();
      
      // Находим видеотрек камеры (не демонстрации экрана)
      const cameraPublication = trackPublications.find(
        pub => pub.kind === 'video' && pub.track?.source === Track.Source.Camera
      );
      
      // Находим аудиотрек (для будущих обновлений)
      const audioPublication = trackPublications.find(
        pub => pub.kind === 'audio' && pub.track?.source === Track.Source.Microphone
      );
      
      // Находим демонстрацию экрана (не используется, но для полноты)
      const screenPublication = trackPublications.find(
        pub => pub.kind === 'video' && pub.track?.source === Track.Source.ScreenShare
      );

      // Обновляем состояние треков
      setTrackState({
        hasVideo: !!cameraPublication,
        hasAudio: !!audioPublication,
        hasScreen: !!screenPublication
      });
      
      console.log(`Tracks for ${participant.identity}:`, {
        hasVideo: !!cameraPublication,
        hasAudio: !!audioPublication,
        hasScreen: !!screenPublication
      });

      // Если у нас есть видеотрек и он отличается от того, что мы отслеживали ранее - обновляем
      if (cameraPublication && (!videoTrack || videoTrack.trackSid !== cameraPublication.trackSid)) {
        setVideoTrack(cameraPublication);
        setIsMuted(cameraPublication.isMuted);
        
        // Активно подключаем трек к видеоэлементу - не ждем подписки
        attachVideoTrackManually(cameraPublication, videoRef.current);
      } else if (!cameraPublication && videoTrack) {
        // Нет публикации, но был трек - убираем его
        setVideoTrack(null);
      }
    };
    
    // Непосредственно ручное подключение видеотрека к элементу DOM
    // Используем этот подход вместо стандартного, потому что он более надежный
    const attachVideoTrackManually = (publication: TrackPublication, videoElement: HTMLVideoElement | null) => {
      if (!videoElement) return;
      if (!publication.track) return;
      
      try {
        // Сначала очищаем текущие треки, если есть
        if (videoElement.srcObject) {
          // Останавливаем все имеющиеся треки
          const stream = videoElement.srcObject as MediaStream;
          stream.getTracks().forEach(track => track.stop());
          videoElement.srcObject = null;
        }
        
        const track = publication.track;
        
        // Если у трека есть mediaStreamTrack, то создаем из него новый MediaStream
        if (track.mediaStreamTrack) {
          console.log(`Attaching track ${publication.trackSid} to video element using mediaStreamTrack`);
          try {
            const stream = new MediaStream([track.mediaStreamTrack]);
            videoElement.srcObject = stream;
            videoElement.muted = true; // Всегда заглушаем аудио в видеоэлементе (для избежания эха)
            videoElement.autoplay = true;
            videoElement.playsInline = true;
            
            // Активно пытаемся запустить воспроизведение (это требуется из-за политик браузеров)
            try {
              const playPromise = videoElement.play();
              if (playPromise) {
                playPromise.catch(e => {
                  console.warn(`Error playing video for ${participant.identity}:`, e);
                  
                  // Расширенная стратегия повторных попыток
                  const retryPlay = (attempt = 1, maxAttempts = 5) => {
                    if (attempt > maxAttempts) {
                      console.error(`Failed to play video after ${maxAttempts} attempts for ${participant.identity}`);
                      return;
                    }
                    
                    console.log(`Retry attempt ${attempt}/${maxAttempts} to play video for ${participant.identity}`);
                    
                    // Используем пользовательское взаимодействие для воспроизведения
                    const clickHandler = () => {
                      videoElement.play()
                        .then(() => {
                          console.log(`Video playback started on user interaction for ${participant.identity}`);
                          document.removeEventListener('click', clickHandler);
                        })
                        .catch(err => {
                          console.warn(`Still failed to play on user interaction: ${err}`);
                          
                          // Последняя попытка - пересоздать медиаэлемент
                          if (attempt === maxAttempts && videoTrack && videoTrack.track && videoTrack.track.mediaStreamTrack) {
                            console.log(`Last resort: recreating media element for ${participant.identity}`);
                            videoElement.srcObject = null;
                            setTimeout(() => {
                              if (videoElement) {
                                const newStream = new MediaStream([videoTrack.track!.mediaStreamTrack!]);
                                videoElement.srcObject = newStream;
                                videoElement.play().catch(() => {
                                  console.error(`Failed all attempts to play video for ${participant.identity}`);
                                });
                              }
                            }, 500);
                          }
                        });
                    };
                    
                    // Автоматически пробуем еще раз через задержку
                    setTimeout(() => {
                      videoElement.play()
                        .then(() => console.log(`Auto-retry ${attempt} succeeded for ${participant.identity}`))
                        .catch(() => {
                          // Если автоматически не получилось, пробуем через клик
                          document.addEventListener('click', clickHandler, { once: true });
                          // И запускаем следующую попытку с задержкой
                          retryPlay(attempt + 1, maxAttempts);
                        });
                    }, 800 * attempt); // Увеличиваем задержку с каждой попыткой
                  };
                  
                  // Запускаем цикл повторных попыток
                  retryPlay();
                });
              }
            } catch (e) {
              console.error(`Exception during video play for ${participant.identity}:`, e);
            }
            
            attachedRef.current = true;
            console.log(`Successfully started video playback for ${participant.identity}`);
          } catch (e) {
            console.error(`Failed to attach video track for ${participant.identity}:`, e);
          }
        } else {
          // В крайнем случае, используем встроенный метод LiveKit для подключения трека
          console.log(`Using LiveKit's attach method for track ${publication.trackSid}`);
          track.attach(videoElement);
          attachedRef.current = true;
        }
      } catch (e) {
        console.error(`Error attaching video track for ${participant.identity}:`, e);
      }
    };
    
    // Обработчики событий для отслеживания изменений в треках
    const handleTrackPublished = (pub: TrackPublication) => {
      if (pub.kind === 'video' && pub.track?.source === Track.Source.Camera) {
        setVideoTrack(pub);
        setIsMuted(pub.isMuted);
        // Активно подключаем трек при публикации
        attachVideoTrackManually(pub, videoRef.current);
      }
    };
    
    const handleTrackUnpublished = (pub: TrackPublication) => {
      if (videoTrack && pub.trackSid === videoTrack.trackSid) {
        setVideoTrack(null);
        attachedRef.current = false;
      }
    };
    
    const handleTrackMuted = (pub: TrackPublication) => {
      if (videoTrack && pub.trackSid === videoTrack.trackSid) {
        setIsMuted(true);
      }
    };
    
    const handleTrackUnmuted = (pub: TrackPublication) => {
      if (videoTrack && pub.trackSid === videoTrack.trackSid) {
        setIsMuted(false);
      }
    };
    
    // Подписываемся на события
    participant.on('trackPublished', handleTrackPublished);
    participant.on('trackUnpublished', handleTrackUnpublished);
    participant.on('trackMuted', handleTrackMuted);
    participant.on('trackUnmuted', handleTrackUnmuted);
    
    // Инициализация - вызываем сразу, чтобы получить текущие треки
    updateTracks();
    
    // Запускаем интервал для периодической проверки и перезаключения при необходимости
    const checkInterval = setInterval(() => {
      if (videoTrack && videoTrack.track && videoRef.current) {
        // Если трек есть, но не подключен - переподключаем
        if (!attachedRef.current) {
          console.log(`Re-attaching video for ${participant.identity} after lost connection`);
          attachVideoTrackManually(videoTrack, videoRef.current);
        }
        
        // Периодически проверяем наличие новых треков
        updateTracks();
      }
    }, 3000);
    
    // Очистка при размонтировании
    return () => {
      console.log(`Cleaned up track handling for ${participant.identity}`);
      participant.off('trackPublished', handleTrackPublished);
      participant.off('trackUnpublished', handleTrackUnpublished);
      participant.off('trackMuted', handleTrackMuted);
      participant.off('trackUnmuted', handleTrackUnmuted);
      
      clearInterval(checkInterval);
      
      // Очищаем видеоэлемент
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, [participant]);
  
  // Повторно подключаем при изменении videoTrack
  useEffect(() => {
    if (videoTrack && videoTrack.track && videoRef.current) {
      // Если трек изменился - нужно переподключить
      if (!attachedRef.current) {
        console.log(`Attaching updated video track ${videoTrack.trackSid} for ${participant.identity}`);
        videoRef.current.srcObject = null; // Сначала очищаем
        
        try {
          if (videoTrack.track.mediaStreamTrack) {
            const stream = new MediaStream([videoTrack.track.mediaStreamTrack]);
            videoRef.current.srcObject = stream;
            videoRef.current.muted = true;
            videoRef.current.autoplay = true;
            videoRef.current.playsInline = true;
            videoRef.current.play().catch(console.error);
            attachedRef.current = true;
          } else {
            videoTrack.track.attach(videoRef.current);
            attachedRef.current = true;
          }
        } catch (e) {
          console.error(`Error re-attaching video track for ${participant.identity}:`, e);
        }
      }
    }
  }, [videoTrack, participant]);
  
  // Для отображения имени в компактном виде
  const displayName = participant.identity.length > 15 
    ? `${participant.identity.substring(0, 12)}...` 
    : participant.identity;

  // Применяем стили для зеркального отображения локального видео
  // Если это локальный участник, отображаем видео как в зеркале
  const videoStyle = {
    transform: participant.isLocal ? 'scaleX(-1)' : 'none',
    objectFit: 'cover' as 'cover',
    width: '100%',
    height: '100%'
  };

  return (
    <div className="relative bg-slate-800 rounded-lg overflow-hidden flex flex-col">
      {/* Видеоконтейнер */}
      <div className="relative flex-grow h-full min-h-[240px] bg-slate-900 flex items-center justify-center">
        <video 
          ref={videoRef}
          autoPlay 
          playsInline 
          muted
          className="w-full h-full object-cover"
          style={videoStyle}
        />
        
        {/* Показываем заглушку, когда видео нет или оно заглушено */}
        {(!trackState.hasVideo || isMuted) && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-slate-800 to-slate-900">
            <div className="flex flex-col items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-slate-700 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
              </div>
              <div className="text-slate-300 text-sm">
                {displayName}
              </div>
            </div>
          </div>
        )}
        
        {/* Индикатор заглушенного микрофона */}
        {isMuted && trackState.hasVideo && (
          <div className="absolute bottom-3 right-3">
            <div className="bg-slate-800 rounded-full p-1.5 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                <line x1="1" y1="1" x2="23" y2="23"></line>
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
            </div>
          </div>
        )}
      </div>
      
      {/* Нижняя панель с информацией */}
      <div className="px-3 py-2 flex justify-between items-center bg-black bg-opacity-30 absolute bottom-0 left-0 right-0">
        <div className="text-white text-sm font-medium truncate">
          {displayName}
          {participant.isLocal && ' (Вы)'}
        </div>
        
        {/* Индикаторы активных треков */}
        <div className="flex space-x-2">
          {trackState.hasVideo && (
            <div className={`rounded-full p-1 ${isMuted ? 'bg-red-900 text-red-400' : 'bg-green-900 text-green-400'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7"></polygon>
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
              </svg>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}