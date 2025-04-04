import { useEffect, useRef, useState } from 'react';
import { Room, LocalParticipant, Participant, Track, ConnectionState } from 'livekit-client';
import { useLocalParticipant, useRoomContext } from '@livekit/components-react';

/**
 * Улучшенный компонент VideoDebug помогает отлаживать проблемы с видео и микрофоном
 * Отображает диагностическую информацию и миниатюрный предпросмотр локального видео
 * для подтверждения, что камера и микрофон работают правильно
 */
export default function VideoDebug() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  
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
      roomStatus = `${room.name} (${ConnectionState[room.state]})`;
      
      // Дополнительная информация о комнате для отладки
      console.log('Debug Room Status:', {
        name: room.name,
        state: ConnectionState[room.state],
        numParticipants: room.numParticipants,
        sidMetadata: room.sidMetadata,
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
      console.log('Debug: Missing localParticipant or videoRef');
      return;
    }
    
    try {
      // Обновляем диагностическую информацию
      updateDebugInfo();
      
      // Получаем все видеотреки локального участника
      const videoPublications = localParticipant.getTrackPublications()
        .filter(pub => pub.kind === 'video' && 
                pub.track?.source === Track.Source.Camera);
      
      if (videoPublications.length === 0) {
        console.log('Debug: No local video tracks found');
        return;
      }
      
      // Находим активный (не заглушенный) видеотрек или берем первый доступный
      const activeVideoPublication = videoPublications.find(pub => !pub.isMuted) || videoPublications[0];
      
      if (!activeVideoPublication.track) {
        console.log('Debug: Video publication found but track is null, publication state:', {
          trackSid: activeVideoPublication.trackSid,
          isMuted: activeVideoPublication.isMuted,
          isSubscribed: activeVideoPublication.isSubscribed,
        });
        return;
      }
      
      const videoTrack = activeVideoPublication.track;
      console.log('Debug: Found local video track', videoTrack.sid, 'muted:', activeVideoPublication.isMuted);
      
      // Прикрепляем видеотрек к элементу видео
      console.log('Debug: Attaching local video track to debug view');
      
      // Подробная диагностика трека
      console.log('Debug video track details:', {
        sid: videoTrack.sid,
        kind: videoTrack.kind,
        muted: videoTrack.isMuted,
        source: videoTrack.source,
        mediaStreamTrack: !!videoTrack.mediaStreamTrack,
        mediaStream: !!videoTrack.mediaStream,
        attachedElements: videoTrack.attachedElements?.length || 0
      });
      
      const trackElement = videoRef.current;
      
      // Очищаем предыдущие треки
      if (trackElement.srcObject) {
        const stream = trackElement.srcObject as MediaStream;
        if (stream.getTracks) {
          stream.getTracks().forEach(t => {
            t.stop();
            console.log('Debug: Stopped existing track', t.id, t.kind);
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
          const stream = new MediaStream([videoTrack.mediaStreamTrack]);
          trackElement.srcObject = stream;
          attachMethod = 'mediaStreamTrack';
          console.log('Debug: Using mediaStreamTrack method', videoTrack.mediaStreamTrack.id);
        } catch (err) {
          console.log('Debug: mediaStreamTrack method failed', err);
        }
      }
      
      // Если первый метод не сработал, пробуем второй
      if (!trackElement.srcObject && videoTrack.mediaStream) {
        // 2. Используем mediaStream напрямую
        try {
          trackElement.srcObject = videoTrack.mediaStream;
          attachMethod = 'mediaStream';
          console.log('Debug: Using mediaStream method');
        } catch (err) {
          console.log('Debug: mediaStream method failed', err);
        }
      }
      
      // Если предыдущие методы не сработали, используем LiveKit API
      if (!trackElement.srcObject) {
        // 3. Используем встроенный метод LiveKit
        try {
          videoTrack.attach(trackElement);
          attachMethod = 'livekit-attach';
          console.log('Debug: Using LiveKit attach method');
        } catch (err) {
          console.log('Debug: LiveKit attach method failed', err);
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
        console.log('Debug: Checking mediaStreamTrack after LiveKit attach');
        // В некоторых случаях LiveKit не устанавливает srcObject напрямую
        if (trackElement.srcObject) {
          console.log('Debug: srcObject is now available after attach');
        } else {
          console.log('Debug: No srcObject after attach');
        }
      }
      
      // Активно пытаемся запустить воспроизведение видео
      try {
        await trackElement.play();
        console.log('Debug: Video playback started successfully');
      } catch (error) {
        console.log('Debug: Error playing video', error);
        
        // Вторая попытка через 500мс
        setTimeout(async () => {
          try {
            await trackElement.play();
            console.log('Debug: Second play attempt succeeded');
          } catch (e) {
            console.log('Debug: Second play attempt failed', e);
          }
        }, 500);
      }
      
      // Периодически обновляем состояние видео, максимум 20 секунд
      let checkCount = 0;
      const maxChecks = 20;
      
      const checkInterval = setInterval(() => {
        checkCount++;
        updateDebugInfo();
        
        // Если видео остановлено, пробуем запустить его снова
        if (trackElement.paused) {
          trackElement.play().catch(e => {
            console.log(`Debug: Periodic play attempt ${checkCount} failed`, e);
          });
        }
        
        // Останавливаем проверки после maxChecks попыток
        if (checkCount >= maxChecks) {
          clearInterval(checkInterval);
        }
      }, 1000);
      
      // Обновляем информацию сразу после попытки подключения
      updateDebugInfo();
      
    } catch (error) {
      console.error('Debug: Error attaching local video', error);
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
  
  // Сведения о видеотреке для отображения
  const getDebugInfo = () => {
    if (!localParticipant) return 'Нет участника';
    
    const videoPublications = localParticipant.getTrackPublications()
      .filter(pub => pub.kind === 'video' && 
              pub.track?.source === Track.Source.Camera);
    
    if (videoPublications.length === 0) {
      return 'Нет видеотреков';
    }
    
    const videoPublication = videoPublications[0];
    if (!videoPublication.track) {
      return 'Трек не активен';
    }
    
    return `Трек SID: ${videoPublication.trackSid.slice(0, 6)}... ${videoPublication.isMuted ? '(заглушен)' : '(активен)'}`;
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