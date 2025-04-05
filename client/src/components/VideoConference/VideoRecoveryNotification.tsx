import { useEffect, useState, useRef } from 'react';
import { Track } from 'livekit-client';
import { useRoomContext } from './CustomLiveKitRoom';

/**
 * Компонент, который отслеживает состояние видеотреков и предлагает
 * пользователю вручную переподключить камеру при возникновении проблем
 */
export default function VideoRecoveryNotification() {
  const room = useRoomContext();
  const [showNotification, setShowNotification] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [isRecovering, setIsRecovering] = useState(false);
  const lastNotificationTimeRef = useRef<number>(0);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Настройки интервалов и временных задержек
  const CHECK_INTERVAL_MS = 5000; // Проверяем статус видеотреков каждые 5 секунд
  const NOTIFICATION_COOLDOWN_MS = 30000; // Не показываем уведомление чаще чем раз в 30 секунд
  
  // Функция для проверки состояния видеотреков
  const checkVideoStatus = () => {
    if (!room || !room.localParticipant) return;
    
    // Получаем все видеотреки локального участника
    const videoPublications = room.localParticipant.getTrackPublications()
      .filter(pub => pub.kind === 'video' && pub.track?.source === Track.Source.Camera);
    
    if (videoPublications.length === 0) {
      if (room.localParticipant.isCameraEnabled) {
        // У нас должен быть видеотрек, если камера включена
        showRecoveryNotification();
      }
      return;
    }
    
    // Проверяем состояние каждого видеотрека
    let hasEndedTracks = false;
    
    for (const pub of videoPublications) {
      if (!pub.track || !pub.track.mediaStreamTrack) continue;
      
      if (pub.track.mediaStreamTrack.readyState === 'ended') {
        hasEndedTracks = true;
        console.log('RECOVERY NOTIFICATION: Detected ended video track', {
          trackSid: pub.trackSid,
          readyState: pub.track.mediaStreamTrack.readyState
        });
        break;
      }
    }
    
    if (hasEndedTracks) {
      showRecoveryNotification();
    } else {
      // Видеотреки в порядке, скрываем уведомление если оно показывается
      setShowNotification(false);
    }
  };
  
  // Показываем уведомление с учетом частоты появления
  const showRecoveryNotification = () => {
    const now = Date.now();
    
    // Не показываем уведомление слишком часто
    if (now - lastNotificationTimeRef.current < NOTIFICATION_COOLDOWN_MS) {
      return;
    }
    
    lastNotificationTimeRef.current = now;
    setShowNotification(true);
  };
  
  // Функция для ручного восстановления видеотрека
  const handleManualRecovery = async () => {
    if (!room || !room.localParticipant || isRecovering) return;
    
    setIsRecovering(true);
    setReconnectAttempt(prev => prev + 1);
    
    try {
      console.log('RECOVERY NOTIFICATION: Manual recovery attempt initiated by user');
      
      // Отключаем камеру
      await room.localParticipant.setCameraEnabled(false);
      
      // Небольшая пауза для корректного освобождения ресурсов
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Включаем камеру снова с явными параметрами
      const publication = await room.localParticipant.setCameraEnabled(true, {
        resolution: { width: 640, height: 480, frameRate: 30 },
        facingMode: 'user'
      });
      
      if (publication) {
        console.log('RECOVERY NOTIFICATION: Manual recovery successful', {
          trackSid: publication.trackSid,
          hasTrack: !!publication.track
        });
        
        // Скрываем уведомление через 2 секунды, чтобы пользователь увидел результат
        setTimeout(() => {
          setShowNotification(false);
          setIsRecovering(false);
        }, 2000);
      } else {
        console.error('RECOVERY NOTIFICATION: Manual recovery failed');
        setIsRecovering(false);
      }
    } catch (error) {
      console.error('RECOVERY NOTIFICATION: Error during manual recovery:', error);
      setIsRecovering(false);
    }
  };
  
  // Запускаем периодическую проверку состояния видео
  useEffect(() => {
    if (!room) return;
    
    console.log('RECOVERY NOTIFICATION: Starting video status monitoring');
    
    // Выполняем первичную проверку
    checkVideoStatus();
    
    // Запускаем периодические проверки
    checkIntervalRef.current = setInterval(checkVideoStatus, CHECK_INTERVAL_MS);
    
    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
      console.log('RECOVERY NOTIFICATION: Video status monitoring stopped');
    };
  }, [room]);
  
  // Если нет уведомления для показа, возвращаем null
  if (!showNotification) return null;
  
  return (
    <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 z-50 
                    bg-yellow-600 bg-opacity-90 text-white px-4 py-3 rounded-lg shadow-lg
                    flex items-center space-x-3 max-w-md">
      <div className="flex-shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
      </div>
      <div className="flex-1">
        <p className="font-medium">Проблема с видеопотоком</p>
        <p className="text-sm opacity-90">Ваша камера отключилась. Попробуйте переподключиться.</p>
      </div>
      <button 
        className={`bg-white text-yellow-800 px-3 py-1 rounded-md text-sm font-medium
                    ${isRecovering ? 'opacity-75 cursor-not-allowed' : 'hover:bg-yellow-50'}`}
        onClick={handleManualRecovery}
        disabled={isRecovering}
      >
        {isRecovering ? (
          <div className="flex items-center space-x-1">
            <div className="animate-spin h-4 w-4 border-2 border-yellow-800 border-t-transparent rounded-full"></div>
            <span>Восстановление...</span>
          </div>
        ) : (
          reconnectAttempt > 0 ? 'Попробовать снова' : 'Переподключить'
        )}
      </button>
    </div>
  );
}