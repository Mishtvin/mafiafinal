import { useEffect, useRef } from 'react';
import { Room, LocalParticipant, Participant, Track, ConnectionState } from 'livekit-client';
import { useLocalParticipant, useRoomContext } from '@livekit/components-react';

/**
 * Компонент VideoDebug помогает отлаживать проблемы с видео
 * Он отображает дополнительный миниатюрный предпросмотр локального видео 
 * для подтверждения, что камера работает правильно
 */
export default function VideoDebug() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  
  useEffect(() => {
    const attachLocalVideo = async () => {
      if (!localParticipant || !videoRef.current) return;
      
      try {
        // Получаем все видеотреки локального участника
        const videoPublications = localParticipant.getTrackPublications()
          .filter(pub => pub.kind === 'video' && 
                  pub.track?.source === Track.Source.Camera);
        
        if (videoPublications.length === 0) {
          console.log('Debug: No local video tracks found');
          return;
        }
        
        // Берем первый трек камеры
        const videoPublication = videoPublications[0];
        if (!videoPublication.track) {
          console.log('Debug: Local video publication found but track is null');
          return;
        }
        
        const videoTrack = videoPublication.track;
        console.log('Debug: Found local video track', videoTrack.sid);
        
        // Прикрепляем видеотрек к элементу видео
        console.log('Debug: Attaching local video track to debug view');
        
        // Для отладки проверяем свойства видеотрека
        const trackElement = videoRef.current;
        if (trackElement) {
          trackElement.muted = true;
          trackElement.autoplay = true;
          
          // В зависимости от конкретной реализации LiveKit может потребоваться 
          // разный способ прикрепления медиапотока к видеоэлементу
          if (videoTrack.mediaStream) {
            // Если у трека есть mediaStream, используем его напрямую
            trackElement.srcObject = videoTrack.mediaStream;
          } else if (videoTrack.mediaStreamTrack) {
            // Если есть только mediaStreamTrack, создаем новый MediaStream
            const stream = new MediaStream([videoTrack.mediaStreamTrack]);
            trackElement.srcObject = stream;
          } else {
            console.log('Debug: No mediaStreamTrack available on video track');
          }
          
          // Активно пытаемся воспроизвести видео
          trackElement.play().catch(error => {
            console.log('Debug: Error playing video', error);
          });
        }
      } catch (error) {
        console.error('Debug: Error attaching local video', error);
      }
    };
    
    // Ждем 1 секунду перед первой попыткой, чтобы дать время на инициализацию
    const initialTimer = setTimeout(() => {
      attachLocalVideo();
    }, 1000);
    
    // Настраиваем периодические проверки наличия видеотрека
    const interval = setInterval(() => {
      attachLocalVideo();
    }, 5000); // Проверяем каждые 5 секунд
    
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
      
      // Очистка видеоэлемента при размонтировании
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [localParticipant]);
  
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
      </div>
    </div>
  );
}