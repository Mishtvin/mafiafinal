import { useState, useEffect } from "react";
import { Participant, Track, TrackPublication } from "livekit-client";

interface ParticipantTileProps {
  participant: Participant;
}

export default function ParticipantTile({ participant }: ParticipantTileProps) {
  const [isMuted, setIsMuted] = useState(true);
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [screenEl, setScreenEl] = useState<HTMLVideoElement | null>(null);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isLocal = participant.isLocal;
  
  // Дополнительное логирование и обработка для локального участника
  useEffect(() => {
    if (isLocal) {
      console.log('Local participant information:', {
        identity: participant.identity,
        isLocal: participant.isLocal,
        hasVideo: videoEl !== null
      });
      
      // Логируем информацию о локальном видео при каждом его изменении
      if (videoEl) {
        console.log('Local video element:', {
          hasSrcObject: !!videoEl.srcObject,
          videoWidth: videoEl.videoWidth,
          videoHeight: videoEl.videoHeight,
          paused: videoEl.paused
        });

        // Дополнительный код для попытки активировать локальное видео
        // Сразу применяем важные свойства
        videoEl.muted = true;
        videoEl.autoplay = true;
        videoEl.playsInline = true;
        videoEl.style.objectFit = 'cover';
        videoEl.style.transform = 'scaleX(-1)'; // Зеркалим изображение
        
        // Получаем доступ к треку напрямую через участника, если его нет на элементе
        if (!videoEl.srcObject) {
          // Получаем все видеотреки участника
          const tracks = participant.getTrackPublications()
            .filter(pub => pub.kind === 'video' && 
              pub.track?.source === Track.Source.Camera &&
              !pub.isMuted);
          
          console.log(`Found ${tracks.length} local video tracks to try directly attaching`);
          
          // Если есть видеотрек, пробуем его подключить
          if (tracks.length > 0 && tracks[0].track) {
            try {
              const track = tracks[0].track;
              
              // Пробуем с новым MediaStream
              if (track.mediaStreamTrack) {
                const newStream = new MediaStream([track.mediaStreamTrack]);
                videoEl.srcObject = newStream;
                console.log('Attached local mediaStreamTrack in a secondary attempt');
              } 
              // Пробуем стандартный метод подключения
              else {
                track.attach(videoEl);
                console.log('Used track.attach() in a secondary attempt');
              }
              
              // Запускаем воспроизведение с периодическими повторами
              const playAttemptInterval = setInterval(() => {
                if (videoEl && videoEl.paused) {
                  videoEl.play().catch(err => {
                    console.warn('Play attempt in secondary effect failed:', err);
                  });
                } else {
                  clearInterval(playAttemptInterval);
                }
              }, 500);
              
              // Очищаем интервал через 5 секунд в любом случае
              setTimeout(() => clearInterval(playAttemptInterval), 5000);
            } catch (error) {
              console.error('Error in secondary local video attachment attempt:', error);
            }
          }
        }
      }
      
      // Регулярно проверяем, что видео действительно воспроизводится
      const videoCheckInterval = setInterval(() => {
        if (videoEl && isCameraEnabled) {
          console.log('Периодическая проверка состояния локального видео:', {
            hasVideoElement: !!videoEl,
            hasSrcObject: !!(videoEl.srcObject),
            isPlaying: !videoEl.paused,
            tracks: videoEl.srcObject ? (videoEl.srcObject as MediaStream).getTracks().length : 0,
            videoTrackEnabled: videoEl.srcObject ? 
              (videoEl.srcObject as MediaStream).getVideoTracks().some(t => t.enabled) : false
          });
          
          // Если видео остановлено, но должно воспроизводиться (трек активен)
          if (videoEl.paused && videoEl.srcObject) {
            console.log('Обнаружена остановка локального видео, пробуем перезапустить');
            videoEl.play().catch(err => console.warn('Не удалось перезапустить видео:', err));
          }
        }
      }, 3000);
      
      return () => {
        clearInterval(videoCheckInterval);
      };
    }
  }, [isLocal, participant, videoEl, isCameraEnabled]);
  
  // Отслеживаем состояние медиатреков участника
  useEffect(() => {
    // Функция обновления состояний
    const updateStates = () => {
      // Получаем все публикации треков участника
      const trackPubs = participant.getTrackPublications();
      
      // Детальное логирование треков для отладки
      console.log(`Tracks for participant ${participant.identity}:`, 
        trackPubs.map(pub => ({
          sid: pub.trackSid,
          source: pub.track?.source,
          kind: pub.kind,
          isMuted: pub.isMuted,
          isSubscribed: pub.isSubscribed
        }))
      );
      
      // Найдем аудио, видео и треки для демонстрации экрана
      // Для микрофона ищем по типу и source
      const micPub = trackPubs.find(pub => 
        pub.kind === 'audio' && (isLocal || pub.isSubscribed)
      );
      
      // Для видео ищем по типу и source. Делаем этот поиск более либеральным,
      // чтобы захватить все видеотреки
      const cameraPub = trackPubs.find(pub => 
        pub.kind === 'video' && 
        pub.track?.source !== Track.Source.ScreenShare && 
        (isLocal || pub.isSubscribed)
      );
      
      // Для демонстрации экрана ищем по source
      const screenPub = trackPubs.find(pub => 
        pub.track?.source === Track.Source.ScreenShare && 
        (isLocal || pub.isSubscribed)
      );
      
      // Логируем состояние медиа треков для отладки
      console.log(`Media state for ${participant.identity}:`, {
        microphone: micPub ? { isMuted: micPub.isMuted, isSubscribed: micPub.isSubscribed } : 'none',
        camera: cameraPub ? { isMuted: cameraPub.isMuted, isSubscribed: cameraPub.isSubscribed } : 'none',
        screen: screenPub ? { isMuted: screenPub.isMuted, isSubscribed: screenPub.isSubscribed } : 'none'
      });
      
      // Обновляем состояние UI на основе треков
      setIsMuted(!micPub || micPub.isMuted);
      setIsCameraEnabled(!!cameraPub && !cameraPub.isMuted);
      setIsScreenSharing(!!screenPub && !screenPub.isMuted);
      
      // Функция для безопасного подключения видеотрека
      const safeAttachVideoTrack = (pub: any, element: HTMLVideoElement) => {
        try {
          if (!pub || !pub.track || !element) {
            console.log(`Cannot attach video track - missing required components:`, {
              hasPub: !!pub,
              hasTrack: !!(pub?.track),
              hasElement: !!element,
              identity: participant.identity
            });
            return false;
          }
          
          const track = pub.track;
          
          // Проверяем, что трек имеет правильный тип и не отключен
          if (track.kind !== 'video') {
            console.log(`Skipping attachment for ${participant.identity}, track is not video`);
            return false;
          }
          
          console.log(`Attaching video for ${participant.identity}:`, {
            isLocal,
            trackKind: track.kind,
            hasMediaStreamTrack: !!track.mediaStreamTrack,
            source: track.source,
            elementRef: element ? 'exists' : 'null'
          });
          
          // Очищаем все существующие подключения
          if (element.srcObject) {
            const stream = element.srcObject as MediaStream;
            if (stream.getTracks) {
              console.log(`Cleaning ${stream.getTracks().length} existing track(s) from video element`);
              stream.getTracks().forEach(t => t.stop());
            }
            element.srcObject = null;
          }
          
          // Для локального участника используем особый прямой подход
          if (isLocal) {
            // Первая стратегия - прямое подключение через MediaStreamTrack
            try {
              console.log(`Attaching local track to ${participant.identity} (direct method)`, {
                trackDetails: {
                  mediaStreamTrack: !!track.mediaStreamTrack,
                  source: track.source,
                  sid: track.sid
                }
              });
              
              // Очищаем предыдущие стили
              element.style.width = '100%';
              element.style.height = '100%';
              element.style.objectFit = 'cover';
              element.style.transform = 'scaleX(-1)'; // Зеркальное отображение
              element.muted = true; // Заглушаем, чтобы избежать эхо
              element.autoplay = true;
              element.playsInline = true;
              
              if (track.mediaStreamTrack) {
                // Создаем новый поток для видео
                const newStream = new MediaStream();
                
                // Добавляем видеодорожку в новый поток
                newStream.addTrack(track.mediaStreamTrack);
                
                console.log('Created new MediaStream with local track');
                
                // Устанавливаем стрим напрямую
                element.srcObject = newStream;
                
                // Принудительно запускаем воспроизведение в цикле
                const tryPlayInterval = setInterval(() => {
                  if (element.paused) {
                    console.log('Local video is paused, trying to play...');
                    element.play().catch(err => {
                      console.warn('Local video autoplay attempt failed: ', err);
                      
                      // Проверяем, есть ли видеодорожка в srcObject
                      const stream = element.srcObject as MediaStream;
                      if (stream && stream.getVideoTracks().length > 0) {
                        console.log('MediaStream имеет видеодорожки:', stream.getVideoTracks().length);
                        // Пробуем переподключить поток
                        const videoTracks = stream.getVideoTracks();
                        if (videoTracks.length > 0) {
                          const newStream = new MediaStream([videoTracks[0]]);
                          element.srcObject = newStream;
                          element.muted = true;
                          element.play().catch(e => console.error('Переподключение не помогло:', e));
                        }
                      } else {
                        console.log('MediaStream не имеет видеодорожек или отсутствует');
                      }
                    });
                  } else {
                    console.log('Local video is playing!');
                    clearInterval(tryPlayInterval);
                  }
                }, 500);
                
                // Очистка интервала через 10 секунд - даем больше времени
                setTimeout(() => clearInterval(tryPlayInterval), 10000);
                
                console.log('Successfully attached local video track using direct MediaStream method');
                return true;
              }
              
              // Вторая стратегия - использование встроенного медиапотока трека, если он доступен
              if (track.mediaStream) {
                console.log('Using track\'s mediaStream directly');
                element.srcObject = track.mediaStream;
                
                // Принудительно запускаем воспроизведение
                element.play().catch(err => {
                  console.warn('Local video autoplay failed: ', err);
                  
                  // Устанавливаем muted, что часто помогает обойти ограничения автовоспроизведения
                  element.muted = true;
                  
                  // Вторая попытка
                  element.play().catch(e => {
                    console.error('Second play attempt failed: ', e);
                    
                    // Третья попытка с полным переподключением потока
                    const stream = element.srcObject as MediaStream;
                    if (stream && stream.getVideoTracks().length > 0) {
                      console.log('Пробуем переподключить MediaStream с видеодорожками');
                      const videoTracks = stream.getVideoTracks();
                      if (videoTracks.length > 0) {
                        const newStream = new MediaStream([videoTracks[0]]);
                        element.srcObject = newStream;
                        element.play().catch(finalErr => console.error('Все попытки воспроизведения не удались:', finalErr));
                      }
                    }
                  });
                });
                
                console.log('Successfully attached local video using track\'s mediaStream');
                return true;
              }
              
              // Третья стратегия - использование LiveKit API
              console.log('Falling back to LiveKit track.attach() method');
              
              try {
                // Предварительно настраиваем видеоэлемент для оптимальной работы
                element.muted = true;
                element.autoplay = true;
                element.playsInline = true;
                element.style.transform = 'scaleX(-1)';
                
                // Очищаем предыдущие подключения
                if (element.srcObject) {
                  const stream = element.srcObject as MediaStream;
                  if (stream.getTracks) {
                    stream.getTracks().forEach(t => t.stop());
                  }
                  element.srcObject = null;
                }
                
                // Используем LiveKit API для подключения
                track.attach(element);
                
                // Добавляем проверку и повторные попытки воспроизведения
                const checkInterval = setInterval(() => {
                  if (element.paused) {
                    console.log('Видео от LiveKit API остановлено, пробуем запустить');
                    element.play().catch(err => console.warn('Ошибка воспроизведения LiveKit видео:', err));
                  } else {
                    console.log('Видео от LiveKit API воспроизводится');
                    clearInterval(checkInterval);
                  }
                }, 500);
                
                // Очистка интервала через 10 секунд
                setTimeout(() => clearInterval(checkInterval), 10000);
                
                console.log('Successfully attached local video track using LiveKit API');
                return true;
              } catch (error) {
                console.error('Ошибка при использовании LiveKit API:', error);
                // Продолжаем к следующей стратегии
                throw error;
              }
            } catch (localErr) {
              console.error('❌ All local video attachment strategies failed:', localErr);
              
              // Последняя попытка - предоставим LiveKit полностью управлять этим
              try {
                console.log('Выполняем последнюю аварийную попытку подключения видео');
                
                // Очищаем предыдущие подключения
                if (element.srcObject) {
                  const stream = element.srcObject as MediaStream;
                  if (stream.getTracks) {
                    stream.getTracks().forEach(t => t.stop());
                  }
                  element.srcObject = null;
                }
                
                // Принудительно применяем базовые стили и настройки
                element.muted = true;
                element.autoplay = true;
                element.playsInline = true;
                element.style.transform = 'scaleX(-1)';
                
                // Получаем все треки участника снова и пробуем подключить первый подходящий
                const allTracks = participant.getTrackPublications();
                const videoTracks = allTracks.filter(pub => 
                  pub.kind === 'video' && 
                  pub.track?.source !== Track.Source.ScreenShare
                );
                
                console.log(`Найдено ${videoTracks.length} видеотреков для аварийного подключения`);
                
                if (videoTracks.length > 0 && videoTracks[0].track) {
                  const videoTrack = videoTracks[0].track;
                  
                  // Последняя попытка - прямое подключение трека
                  if (videoTrack.mediaStreamTrack) {
                    try {
                      const emergencyStream = new MediaStream([videoTrack.mediaStreamTrack]);
                      element.srcObject = emergencyStream;
                      
                      console.log('Прямое аварийное подключение MediaStreamTrack');
                      element.play().catch(err => console.warn('Ошибка воспроизведения в аварийном режиме:', err));
                      
                      // Проверка через 1 секунду
                      setTimeout(() => {
                        if (element.paused) {
                          console.log('Аварийное видео не воспроизводится, последняя попытка с LiveKit API');
                          track.attach(element);
                        }
                      }, 1000);
                      
                      return true;
                    } catch (emergencyErr) {
                      console.error('Ошибка аварийного подключения трека:', emergencyErr);
                    }
                  }
                }
                
                // Если ничего другого не сработало, используем LiveKit API
                track.attach(element);
                element.play().catch(err => console.warn('Ошибка воспроизведения через LiveKit API:', err));
                
                console.log('Last resort: attached local video via LiveKit');
                return true;
              } catch (finalErr) {
                console.error('❌❌ Final attachment attempt failed:', finalErr);
                return false;
              }
            }
          } else {
            // Для удаленных участников - стандартный подход
            console.log(`Attaching remote ${pub.kind} track to ${participant.identity}`);
            
            // Обычный способ - использовать MediaStream API
            if (track.mediaStreamTrack) {
              const newStream = new MediaStream();
              newStream.addTrack(track.mediaStreamTrack);
              element.srcObject = newStream;
              console.log('Attached remote video using MediaStream API');
            } else {
              // Fallback to LiveKit API
              track.attach(element);
              console.log('Attached remote video using LiveKit API');
            }
          }
          
          // Для всех видео: включаем воспроизведение с обработкой ошибок
          element.muted = isLocal; // Заглушаем собственное видео, чтобы избежать эхо
          element.play().catch((err: Error) => {
            console.error(`Error playing video for ${participant.identity}:`, err);
            
            // Если есть ошибка типа "play() failed because the user didn't interact with the document first"
            // попробуем включить видео без звука (autoplay restriction)
            element.muted = true;
            element.play().catch(secondErr => {
              console.error(`Second attempt to play video failed:`, secondErr);
            });
          });
          
          return true;
        } catch (error) {
          console.error(`Error attaching ${pub?.kind || 'unknown'} track for ${participant.identity}:`, error);
          return false;
        }
      };
      
      // Обновление видео элементов с улучшенной обработкой
      if (cameraPub?.track && videoEl) {
        try {
          // Принудительно используем нашу безопасную функцию подключения
          safeAttachVideoTrack(cameraPub, videoEl);
        } catch (error) {
          console.error(`Error attaching camera track:`, error);
        }
      }
      
      // Аналогично для экрана, но с отдельной обработкой
      if (screenPub?.track && screenEl) {
        try {
          safeAttachVideoTrack(screenPub, screenEl);
        } catch (error) {
          console.error(`Error attaching screenshare track:`, error);
        }
      }
      
      // Обновление аудио элемента
      if (micPub?.track && audioEl) {
        try {
          const track = micPub.track;
          if (track.kind === 'audio') {
            // Сначала отключаем предыдущий трек
            if (audioEl.srcObject) {
              const stream = audioEl.srcObject as MediaStream;
              stream.getTracks().forEach(t => t.stop());
              audioEl.srcObject = null;
            }
            
            console.log(`Attaching audio track to ${participant.identity}`);
            track.attach(audioEl);
          }
        } catch (error) {
          console.error(`Error attaching audio for ${participant.identity}:`, error);
        }
      }
    };
    
    // Начальное обновление
    updateStates();
    
    // Подписка на события изменения треков
    const handleTrackChange = () => {
      updateStates();
    };
    
    // Обработка события говорящего
    const handleSpeakingChanged = () => {
      setIsSpeaking(participant.isSpeaking);
    };
    
    participant.on('trackMuted', handleTrackChange);
    participant.on('trackUnmuted', handleTrackChange);
    participant.on('trackPublished', handleTrackChange);
    participant.on('trackUnpublished', handleTrackChange);
    participant.on('trackSubscribed', handleTrackChange);
    participant.on('trackUnsubscribed', handleTrackChange);
    
    // Периодически проверяем состояние isSpeaking
    const speakingInterval = setInterval(() => {
      setIsSpeaking(participant.isSpeaking);
    }, 500);
    
    return () => {
      participant.off('trackMuted', handleTrackChange);
      participant.off('trackUnmuted', handleTrackChange);
      participant.off('trackPublished', handleTrackChange);
      participant.off('trackUnpublished', handleTrackChange);
      participant.off('trackSubscribed', handleTrackChange);
      participant.off('trackUnsubscribed', handleTrackChange);
      clearInterval(speakingInterval);
    };
  }, [participant, videoEl, screenEl, audioEl, isLocal]);
  
  return (
    <div className={`relative w-full h-full bg-slate-800 rounded-md overflow-hidden flex items-center justify-center group ${isSpeaking ? 'ring-2 ring-blue-500' : ''}`}>
      {isScreenSharing ? (
        <video
          ref={setScreenEl}
          className="w-full h-full object-contain"
          autoPlay
          playsInline
          muted={isLocal}
        />
      ) : isCameraEnabled ? (
        <video
          ref={setVideoEl}
          className="w-full h-full object-cover"
          autoPlay
          playsInline
          muted={isLocal}
          style={{
            transform: isLocal ? 'scaleX(-1)' : 'none',
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-r from-blue-900 to-indigo-800">
          <div className="h-20 w-20 rounded-full bg-slate-700 flex items-center justify-center text-white text-2xl font-bold">
            {participant.identity.charAt(0).toUpperCase()}
          </div>
        </div>
      )}
      
      {/* Аудиодорожка */}
      <audio ref={setAudioEl} autoPlay />
      
      {/* Информация об участнике */}
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