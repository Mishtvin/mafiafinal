import { useEffect, useRef, useState } from 'react';
import { Room, LocalParticipant, Participant, Track, ConnectionState } from 'livekit-client';
import { useRoomContext } from './CustomLiveKitRoom';

/**
 * Улучшенный компонент VideoDebug помогает отлаживать проблемы с видео и микрофоном
 * Отображает диагностическую информацию и миниатюрный предпросмотр локального видео
 * для подтверждения, что камера и микрофон работают правильно
 */
export default function VideoDebug() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const room = useRoomContext();
  const [localParticipant, setLocalParticipant] = useState<LocalParticipant | null>(null);
  
  // Получаем локального участника из комнаты
  useEffect(() => {
    if (room && room.localParticipant) {
      setLocalParticipant(room.localParticipant);
    }
  }, [room]);
  
  // Расширенное состояние для отслеживания дополнительной отладочной информации
  const [debugState, setDebugState] = useState<{
    videoPlaying: boolean;
    videoDimensions: string;
    mediaStream: boolean;
    lastAttachTime: string;
    trackType: string;
    videoTracks: number;
    audioTracks: number;
    roomStatus: string;
    trackIds: string[];
    browserSupport: {
      webrtc: boolean;
      h264: boolean;
      vp8: boolean;
      getUserMedia: boolean;
    }
  }>({
    videoPlaying: false,
    videoDimensions: 'Нет данных',
    mediaStream: false,
    lastAttachTime: 'Никогда',
    trackType: 'Неизвестно',
    videoTracks: 0,
    audioTracks: 0,
    roomStatus: 'Неизвестно',
    trackIds: [],
    browserSupport: {
      webrtc: false,
      h264: false,
      vp8: false,
      getUserMedia: false
    }
  });
  
  // Проверка поддержки браузером необходимых функций
  useEffect(() => {
    // Проверяем поддержку WebRTC
    const hasWebRTC = !!window.RTCPeerConnection;
    
    // Проверяем поддержку getUserMedia
    const hasGetUserMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    
    // Проверка поддержки кодеков (очень упрощенно)
    let hasH264 = false;
    let hasVP8 = false;
    
    // Более точная проверка кодеков
    if (hasWebRTC && window.RTCRtpSender && RTCRtpSender.getCapabilities) {
      try {
        const capabilities = RTCRtpSender.getCapabilities('video');
        if (capabilities && capabilities.codecs) {
          hasH264 = capabilities.codecs.some(codec => 
            codec.mimeType.toLowerCase().includes('h264'));
          hasVP8 = capabilities.codecs.some(codec => 
            codec.mimeType.toLowerCase().includes('vp8'));
        }
      } catch (e) {
        console.log('Debug: Error checking codec support:', e);
      }
    }
    
    setDebugState(prev => ({
      ...prev,
      browserSupport: {
        webrtc: hasWebRTC,
        h264: hasH264,
        vp8: hasVP8,
        getUserMedia: hasGetUserMedia
      }
    }));
  }, []);
  
  // Функция для получения и отображения информации о видеоэлементе и треках
  const updateDebugInfo = () => {
    if (!localParticipant) return;
    
    // Обновляем информацию о видеоэлементе
    const video = videoRef.current;
    const now = new Date().toLocaleTimeString();
    
    // Получаем количество доступных треков
    const allTracks = localParticipant.getTrackPublications();
    const videoTracks = allTracks.filter(pub => pub.kind === 'video').length;
    const audioTracks = allTracks.filter(pub => pub.kind === 'audio').length;
    
    // Получаем список ID треков
    const trackIds = allTracks.map(pub => pub.trackSid);
    
    // Определяем статус комнаты
    let roomStatus = 'Не подключено';
    if (room) {
      // Используем ручное преобразование состояния в строку вместо ConnectionState[room.state]
      let stateStr;
      switch (room.state) {
        case ConnectionState.Disconnected:
          stateStr = 'отключено';
          break;
        case ConnectionState.Connected:
          stateStr = 'подключено';
          break;
        case ConnectionState.Connecting:
          stateStr = 'подключение';
          break;
        case ConnectionState.Reconnecting:
          stateStr = 'переподключение';
          break;
        default:
          stateStr = 'неизвестно';
      }
      
      roomStatus = `${room.name} (${stateStr})`;
      
      // Дополнительная информация о комнате для отладки
      console.log('Debug Room Status:', {
        name: room.name,
        state: stateStr,
        roomState: room.state,
        numParticipants: room.numParticipants,
        metadata: room.metadata,
      });
    }
    
    // Обновляем состояние для отображения в UI
    setDebugState(prev => ({
      ...prev,
      videoPlaying: video ? !video.paused : false,
      videoDimensions: video ? `${video.videoWidth}x${video.videoHeight}` : 'Нет видео',
      mediaStream: video ? !!video.srcObject : false,
      lastAttachTime: now,
      videoTracks,
      audioTracks,
      roomStatus,
      trackIds
    }));
  };
  
  // Улучшенная функция для подключения локального видео с расширенной диагностикой
  const attachLocalVideo = async () => {
    if (!localParticipant || !videoRef.current) {
      console.log('ATTACH VIDEO DEBUG: Missing localParticipant or videoRef', {
        hasParticipant: !!localParticipant,
        hasVideoRef: !!videoRef.current,
        roomConnected: room ? room.state === ConnectionState.Connected : false
      });
      return;
    }
    
    console.log('ATTACH VIDEO DEBUG: Starting attachment process', {
      participantId: localParticipant.identity,
      cameraEnabled: localParticipant.isCameraEnabled,
      microphoneEnabled: localParticipant.isMicrophoneEnabled,
      state: 'active', // Локальный участник не имеет свойства connectionState
      allPublicationsCount: localParticipant.getTrackPublications().length
    });
    
    try {
      // Проверяем состояние разрешений для устройств
      console.log('MEDIA PERMISSIONS CHECK: Starting diagnostic...');
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        console.log('AVAILABLE DEVICES:', {
          allDevices: devices.length,
          videoDevices: videoDevices.length,
          videoDeviceLabels: videoDevices.map(d => d.label || 'unlabeled device'),
          deviceIdsAvailable: videoDevices.map(d => !!d.deviceId)
        });
        
        // Проверяем, можем ли мы получить доступ к видеоустройствам напрямую
        const mediaResult = await navigator.mediaDevices.getUserMedia({ 
          video: true,
          audio: false
        });
        
        console.log('DIRECT MEDIA ACCESS:', {
          success: true,
          tracks: mediaResult.getTracks().map(t => ({
            id: t.id,
            kind: t.kind,
            label: t.label,
            enabled: t.enabled,
            muted: t.muted,
            readyState: t.readyState
          }))
        });
        
        // Останавливаем треки после проверки
        mediaResult.getTracks().forEach(t => {
          t.stop();
          console.log('Stopped test track:', t.id, t.kind);
        });
      } catch (err) {
        console.error('MEDIA PERMISSIONS ERROR:', err);
      }
      
      // Обновляем диагностическую информацию
      updateDebugInfo();
      
      // Получаем все видеотреки локального участника
      const videoPublications = localParticipant.getTrackPublications()
        .filter(pub => pub.kind === 'video' && 
                pub.track?.source === Track.Source.Camera);
      
      console.log('VIDEO PUBLICATIONS CHECK:', {
        count: videoPublications.length,
        publications: videoPublications.map(pub => ({
          sid: pub.trackSid,
          muted: pub.isMuted,
          hasTrack: !!pub.track,
          source: pub.track?.source || 'unknown'
        }))
      });
      
      if (videoPublications.length === 0) {
        console.log('CRITICAL: No local video tracks found!');
        
        // Если камера должна быть включена, но треков нет, пробуем принудительно включить её
        if (localParticipant.isCameraEnabled) {
          console.log('CAMERA RECOVERY: Camera should be enabled but no tracks found, attempting to recover...');
          
          try {
            // Принудительное включение камеры
            const publication = await localParticipant.setCameraEnabled(true);
            if (publication) {
              console.log('CAMERA RECOVERY SUCCESS:', {
                sid: publication.trackSid,
                hasTrack: !!publication.track,
                source: publication.track?.source || 'unknown'
              });
              
              // Повторим попытку подключить видео через полсекунды
              setTimeout(() => {
                attachLocalVideo();
              }, 500);
            } else {
              console.log('CAMERA RECOVERY FAILED: No publication returned');
            }
          } catch (e) {
            console.error('CAMERA RECOVERY ERROR:', e);
          }
        }
        
        return;
      }
      
      // Находим активный (не заглушенный) видеотрек или берем первый доступный
      const activeVideoPublication = videoPublications.find(pub => !pub.isMuted) || videoPublications[0];
      
      console.log('ACTIVE PUBLICATION CHECK:', {
        sid: activeVideoPublication.trackSid,
        muted: activeVideoPublication.isMuted,
        isSubscribed: activeVideoPublication.isSubscribed,
        hasTrack: !!activeVideoPublication.track,
        source: activeVideoPublication.track?.source || 'unknown'
      });
      
      if (!activeVideoPublication.track) {
        console.log('CRITICAL: Video publication found but track is null!', {
          trackSid: activeVideoPublication.trackSid,
          isMuted: activeVideoPublication.isMuted,
          isSubscribed: activeVideoPublication.isSubscribed,
          isEnabled: activeVideoPublication.isEnabled
        });
        
        // Если публикация есть, но трека нет, возможно трек был отключен
        // Пробуем переподписаться на публикацию
        if (activeVideoPublication.isEnabled === false) {
          console.log('ATTEMPTING to re-enable track...');
          
          try {
            // В новых версиях LiveKit нет прямого метода setEnabled
            // Включаем камеру через метод локального участника
            await localParticipant.setCameraEnabled(true);
            console.log('Track re-enabled, waiting for it to be available...');
            
            // Пробуем повторить подключение через секунду
            setTimeout(() => {
              attachLocalVideo();
            }, 1000);
          } catch (e) {
            console.error('TRACK ENABLE ERROR:', e);
          }
        }
        
        return;
      }
      
      const videoTrack = activeVideoPublication.track;
      console.log('TRACK FOUND - Ready to attach:', {
        sid: videoTrack.sid,
        kind: videoTrack.kind,
        muted: videoTrack.isMuted,
        source: videoTrack.source,
        streamId: videoTrack.mediaStreamTrack?.id || 'none',
        streamState: videoTrack.mediaStreamTrack?.readyState || 'unknown',
        streamEnabled: videoTrack.mediaStreamTrack?.enabled || false
      });
      
      // Прикрепляем видеотрек к элементу видео
      console.log('ATTACHING: Begin track attachment to video element');
      
      // Подробная диагностика трека
      console.log('DETAILED TRACK ANALYSIS:', {
        sid: videoTrack.sid,
        kind: videoTrack.kind,
        muted: videoTrack.isMuted,
        source: videoTrack.source,
        mediaStreamTrack: videoTrack.mediaStreamTrack ? {
          id: videoTrack.mediaStreamTrack.id,
          kind: videoTrack.mediaStreamTrack.kind,
          enabled: videoTrack.mediaStreamTrack.enabled,
          muted: videoTrack.mediaStreamTrack.muted,
          readyState: videoTrack.mediaStreamTrack.readyState,
          settings: videoTrack.mediaStreamTrack.getSettings ? 
            JSON.stringify(videoTrack.mediaStreamTrack.getSettings()) : 'not available'
        } : 'not available',
        mediaStream: videoTrack.mediaStream ? 'available' : 'not available',
        attachedElements: videoTrack.attachedElements?.length || 0,
        // В LiveKit v2 треки не имеют свойств processor и dimensions
        trackDimensions: videoTrack.mediaStreamTrack?.getSettings?.() ? 
          `${videoTrack.mediaStreamTrack.getSettings().width || '?'}x${videoTrack.mediaStreamTrack.getSettings().height || '?'}` : 'unknown'
      });
      
      const trackElement = videoRef.current;
      
      // Очищаем предыдущие треки
      if (trackElement.srcObject) {
        console.log('CLEANUP: Removing existing media tracks from video element');
        const stream = trackElement.srcObject as MediaStream;
        if (stream.getTracks) {
          stream.getTracks().forEach(t => {
            t.stop();
            console.log('CLEANUP: Stopped existing track', t.id, t.kind);
          });
        }
        trackElement.srcObject = null;
      }
      
      // Настраиваем видеоэлемент
      trackElement.muted = true;
      trackElement.autoplay = true;
      trackElement.playsInline = true;
      
      let attachMethod = 'none';
      
      // Пробуем разные методы подключения в порядке предпочтения
      if (videoTrack.mediaStreamTrack) {
        // 1. Напрямую используем mediaStreamTrack
        try {
          console.log('ATTACH METHOD 1: Using direct MediaStreamTrack');
          const stream = new MediaStream([videoTrack.mediaStreamTrack]);
          trackElement.srcObject = stream;
          attachMethod = 'mediaStreamTrack';
          console.log('ATTACH SUCCESS: Using mediaStreamTrack method', videoTrack.mediaStreamTrack.id);
        } catch (err) {
          console.error('ATTACH ERROR: mediaStreamTrack method failed', err);
        }
      }
      
      // Если первый метод не сработал, пробуем второй
      if (!trackElement.srcObject && videoTrack.mediaStream) {
        // 2. Используем mediaStream напрямую
        try {
          console.log('ATTACH METHOD 2: Using track\'s MediaStream');
          trackElement.srcObject = videoTrack.mediaStream;
          attachMethod = 'mediaStream';
          console.log('ATTACH SUCCESS: Using mediaStream method');
        } catch (err) {
          console.error('ATTACH ERROR: mediaStream method failed', err);
        }
      }
      
      // Если предыдущие методы не сработали, используем LiveKit API
      if (!trackElement.srcObject) {
        // 3. Используем встроенный метод LiveKit
        try {
          console.log('ATTACH METHOD 3: Using LiveKit\'s attach method');
          videoTrack.attach(trackElement);
          attachMethod = 'livekit-attach';
          console.log('ATTACH SUCCESS: Using LiveKit attach method');
        } catch (err) {
          console.error('ATTACH ERROR: LiveKit attach method failed', err);
        }
      }
      
      // Обновляем состояние для отладки
      setDebugState(prev => ({
        ...prev,
        trackType: attachMethod,
        lastAttachTime: new Date().toLocaleTimeString()
      }));
      
      // Проверяем, успешно ли подключили трек
      if (!trackElement.srcObject && attachMethod === 'livekit-attach') {
        console.log('POST-ATTACH CHECK: Verifying srcObject after LiveKit attach');
        // В некоторых случаях LiveKit не устанавливает srcObject напрямую
        if (trackElement.srcObject) {
          console.log('POST-ATTACH: srcObject is now available after attach');
        } else {
          console.log('POST-ATTACH WARNING: No srcObject after attach, this might fail');
        }
      }
      
      // Активно пытаемся запустить воспроизведение видео
      try {
        console.log('PLAYBACK: Attempting to start video playback');
        await trackElement.play();
        console.log('PLAYBACK SUCCESS: Video started successfully');
      } catch (error) {
        console.error('PLAYBACK ERROR: Failed to start video', error);
        
        // Вторая попытка через 500мс
        setTimeout(async () => {
          try {
            console.log('PLAYBACK RETRY: Second attempt to start video');
            await trackElement.play();
            console.log('PLAYBACK RETRY SUCCESS: Second play attempt succeeded');
          } catch (e) {
            console.error('PLAYBACK RETRY ERROR: Second play attempt failed', e);
          }
        }, 500);
      }
      
      // Регистрируем обработчики событий для мониторинга состояния видео
      trackElement.onpause = () => {
        console.log('VIDEO EVENT: Playback paused');
      };
      
      trackElement.onplay = () => {
        console.log('VIDEO EVENT: Playback started');
      };
      
      trackElement.onresize = () => {
        console.log('VIDEO EVENT: Size changed to', 
          trackElement.videoWidth, 'x', trackElement.videoHeight);
      };
      
      trackElement.onerror = (e) => {
        console.error('VIDEO EVENT: Error during playback', e);
      };
      
      // Мониторим состояние видеотрека
      if (videoTrack.mediaStreamTrack) {
        videoTrack.mediaStreamTrack.onended = () => {
          console.log('MEDIA TRACK EVENT: Track ended', videoTrack.mediaStreamTrack?.id);
        };
        
        videoTrack.mediaStreamTrack.onmute = () => {
          console.log('MEDIA TRACK EVENT: Track muted', videoTrack.mediaStreamTrack?.id);
        };
        
        videoTrack.mediaStreamTrack.onunmute = () => {
          console.log('MEDIA TRACK EVENT: Track unmuted', videoTrack.mediaStreamTrack?.id);
        };
      }
      
      // Периодически обновляем состояние видео, максимум 20 секунд
      let checkCount = 0;
      const maxChecks = 20;
      
      const checkInterval = setInterval(() => {
        checkCount++;
        
        if (videoTrack.mediaStreamTrack) {
          console.log(`TRACK MONITORING #${checkCount}:`, {
            ready: videoTrack.mediaStreamTrack.readyState,
            enabled: videoTrack.mediaStreamTrack.enabled,
            muted: videoTrack.mediaStreamTrack.muted,
            videoPaused: trackElement.paused
          });
        }
        
        updateDebugInfo();
        
        // Если видео остановлено, пробуем запустить его снова
        if (trackElement.paused) {
          console.log(`PLAYBACK RECOVERY #${checkCount}: Video paused, trying to restart`);
          trackElement.play().then(() => {
            console.log(`PLAYBACK RECOVERY #${checkCount}: Success`);
          }).catch(e => {
            console.error(`PLAYBACK RECOVERY #${checkCount}: Failed`, e);
          });
        }
        
        // Останавливаем проверки после maxChecks попыток
        if (checkCount >= maxChecks) {
          console.log('TRACK MONITORING: Ending periodic checks after', maxChecks, 'iterations');
          clearInterval(checkInterval);
        }
      }, 1000);
      
      // Обновляем информацию сразу после попытки подключения
      updateDebugInfo();
      
    } catch (error) {
      console.error('CRITICAL ERROR: Uncaught exception in attachLocalVideo', error);
    }
  };
  
  // Основной эффект для запуска отладки и подключения локального видео
  useEffect(() => {
    console.log('Debug component mounting, localParticipant:', !!localParticipant);
    
    // Обновляем информацию сразу
    updateDebugInfo();
    
    // Ждем 1 секунду перед первой попыткой, чтобы дать время на инициализацию
    const initialTimer = setTimeout(() => {
      attachLocalVideo();
    }, 1000);
    
    // Настраиваем периодические проверки и обновления
    const diagnosticInterval = setInterval(() => {
      updateDebugInfo();
    }, 2000);
    
    const attachInterval = setInterval(() => {
      attachLocalVideo();
    }, 5000); // Проверяем каждые 5 секунд
    
    // Очистка при размонтировании
    return () => {
      console.log('Debug component unmounting');
      clearTimeout(initialTimer);
      clearInterval(diagnosticInterval);
      clearInterval(attachInterval);
      
      // Очистка видеоэлемента
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => {
          track.stop();
          console.log('Debug: Stopped track on unmount', track.id);
        });
        videoRef.current.srcObject = null;
      }
    };
  }, [localParticipant, room]);
  
  // Сведения о видеотреке для отображения с расширенной диагностикой
  const getDebugInfo = () => {
    if (!localParticipant) return 'Нет участника';
    
    const videoPublications = localParticipant.getTrackPublications()
      .filter(pub => pub.kind === 'video' && 
              pub.track?.source === Track.Source.Camera);
    
    if (videoPublications.length === 0) {
      // Расширенная диагностика, когда нет видеотреков
      console.log('CAMERA CHECK - No video tracks found for participant', {
        identity: localParticipant.identity,
        isVideoEnabled: localParticipant.isCameraEnabled,
        trackCount: localParticipant.getTrackPublications().length,
        allTracks: localParticipant.getTrackPublications().map(pub => ({
          kind: pub.kind,
          sid: pub.trackSid,
          source: pub.track?.source || 'unknown',
          muted: pub.isMuted
        }))
      });
      
      // Проверяем, что происходит, если попытаться включить камеру
      if (room && !localParticipant.isCameraEnabled) {
        console.log('TRYING TO ENABLE CAMERA from VideoDebug component...');
        localParticipant.setCameraEnabled(true)
          .then(pub => {
            console.log('CAMERA ENABLED RESULT:', pub ? {
              sid: pub.trackSid,
              kind: pub.kind,
              hasTrack: !!pub.track
            } : 'failed');
          })
          .catch(e => console.error('CAMERA ENABLE ERROR:', e));
      }
      
      return 'Нет видеотреков';
    }
    
    const videoPublication = videoPublications[0];
    if (!videoPublication.track) {
      // Расширенная диагностика, когда есть публикация, но нет трека
      console.log('TRACK DIAGNOSTIC - Publication exists but track is null', {
        publicationSid: videoPublication.trackSid,
        isMuted: videoPublication.isMuted,
        isSubscribed: videoPublication.isSubscribed,
        isEnabled: videoPublication.isEnabled
      });
      
      return 'Трек не активен';
    }
    
    // Расширенная диагностика о состоянии активного трека
    console.log('ACTIVE TRACK DIAGNOSTIC:', {
      sid: videoPublication.trackSid,
      kind: videoPublication.kind,
      muted: videoPublication.isMuted,
      source: videoPublication.track.source,
      streamId: videoPublication.track.mediaStreamTrack?.id,
      streamActive: videoPublication.track.mediaStreamTrack?.enabled,
      streamState: videoPublication.track.mediaStreamTrack?.readyState,
      dimensions: {
        width: videoPublication.track.mediaStreamTrack?.getSettings?.()?.width || 'unknown',
        height: videoPublication.track.mediaStreamTrack?.getSettings?.()?.height || 'unknown'
      }
    });
    
    // Добавляем расширенную информацию для отображения
    const trackSettings = videoPublication.track.mediaStreamTrack?.getSettings?.();
    const dimensions = trackSettings ? 
      `${trackSettings.width || '?'}x${trackSettings.height || '?'}` : 'unknown';
        
    return `Трек: ${videoPublication.trackSid.slice(0, 6)}... ${videoPublication.isMuted ? '(заглушен)' : '(активен)'} ${dimensions}`;
  };
  
  // Состояние комнаты для отображения
  const getRoomInfo = () => {
    if (!room) return 'Нет комнаты';
    
    // Преобразуем состояние в строку вручную
    let stateStr = 'неизвестно';
    switch (room.state) {
      case ConnectionState.Disconnected:
        stateStr = 'отключено';
        break;
      case ConnectionState.Connected:
        stateStr = 'подключено';
        break;
      case ConnectionState.Connecting:
        stateStr = 'подключение';
        break;
      case ConnectionState.Reconnecting:
        stateStr = 'переподключение';
        break;
    }
    
    return `Комната: ${room.name} (${stateStr})`;
  };
  
  // Подробная информация для воспроизведения локального видео
  const getVideoPlaybackInfo = () => {
    if (!videoRef.current) return 'Нет элемента видео';
    
    return `${debugState.videoPlaying ? '▶️' : '⏸️'} ${debugState.videoDimensions}, ${debugState.trackType}`;
  };
  
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 w-64 shadow-lg">
      <h3 className="text-sm font-semibold mb-2 text-slate-200">Отладка видео</h3>
      
      {/* Отладочный видеоэлемент */}
      <div className="relative bg-slate-900 rounded mb-2 overflow-hidden" style={{ height: '120px' }}>
        <video 
          ref={videoRef} 
          className="w-full h-full object-cover"
          muted
          autoPlay
          playsInline
          style={{ transform: 'scaleX(-1)' }} // Зеркалим видео для камеры
        />
        {(!localParticipant || localParticipant.getTrackPublications()
            .filter(pub => pub.kind === 'video' && pub.track?.source === Track.Source.Camera).length === 0) && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
            Нет видеотрека
          </div>
        )}
      </div>
      
      {/* Отладочная информация */}
      <div className="text-xs space-y-1 text-slate-300">
        <div>{getRoomInfo()}</div>
        <div>{getDebugInfo()}</div>
        <div>Видео: {getVideoPlaybackInfo()}</div>
        <div>Последнее обновление: {debugState.lastAttachTime}</div>
      </div>
    </div>
  );
}