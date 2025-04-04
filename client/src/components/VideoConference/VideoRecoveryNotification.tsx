import { useState, useEffect } from 'react';
import { useRoomContext } from './CustomLiveKitRoom';
import { Track } from 'livekit-client';

/**
 * Компонент, который отслеживает состояние видеотреков и предлагает
 * пользователю вручную переподключить камеру при возникновении проблем
 */
export default function VideoRecoveryNotification() {
  const room = useRoomContext();
  const [videoIssueDetected, setVideoIssueDetected] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [lastRecoveryTime, setLastRecoveryTime] = useState(0);
  
  // Отслеживаем состояние видеотрека
  useEffect(() => {
    if (!room || !room.localParticipant) return;
    
    const videoTracks = room.localParticipant.getTrackPublications().filter(
      pub => pub.kind === 'video' && pub.track?.source === Track.Source.Camera
    );
    
    // Минимальный интервал между восстановлениями (10 секунд)
    const MIN_RECOVERY_INTERVAL = 10000;
    
    // Функция для проверки состояния видеотрека
    const checkVideoTrackHealth = () => {
      if (!room || !room.localParticipant) return;
      
      // Если видеотреков нет, хотя они должны быть
      if (videoTracks.length === 0 && room.localParticipant.isCameraEnabled) {
        setVideoIssueDetected(true);
        return;
      }
      
      // Проверяем существующие треки
      for (const pub of videoTracks) {
        if (!pub.track || !pub.track.mediaStreamTrack) continue;
        
        const trackState = pub.track.mediaStreamTrack.readyState;
        if (trackState === 'ended') {
          console.log('NOTIFICATION: Video track issue detected');
          setVideoIssueDetected(true);
          return;
        }
      }
      
      // Если дошли до сюда, значит все треки в порядке
      setVideoIssueDetected(false);
    };
    
    // Запускаем первичную проверку
    checkVideoTrackHealth();
    
    // Настраиваем интервал проверки
    const checkInterval = setInterval(checkVideoTrackHealth, 5000);
    
    // Очищаем при размонтировании
    return () => {
      clearInterval(checkInterval);
    };
  }, [room]);
  
  // Функция для ручного восстановления видеотрека
  const handleRecovery = async () => {
    if (!room || !room.localParticipant) return;
    
    // Проверяем, прошло ли достаточно времени с последнего восстановления
    const now = Date.now();
    if (now - lastRecoveryTime < 10000) {
      console.log('RECOVERY: Too soon to recover again, please wait');
      return;
    }
    
    setIsRecovering(true);
    setLastRecoveryTime(now);
    
    try {
      console.log('MANUAL RECOVERY: Starting camera recovery process');
      
      // Выключаем камеру
      await room.localParticipant.setCameraEnabled(false);
      console.log('MANUAL RECOVERY: Camera disabled');
      
      // Небольшая пауза перед повторным включением
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Включаем камеру
      await room.localParticipant.setCameraEnabled(true);
      console.log('MANUAL RECOVERY: Camera re-enabled');
      
      // Еще немного ждем, чтобы убедиться, что видео стабилизировалось
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Проверяем результат
      const videoTracks = room.localParticipant.getTrackPublications().filter(
        pub => pub.kind === 'video' && pub.track?.source === Track.Source.Camera
      );
      
      if (videoTracks.length > 0 && 
          videoTracks[0].track?.mediaStreamTrack?.readyState === 'live') {
        console.log('MANUAL RECOVERY: Success, video track is now live');
        setVideoIssueDetected(false);
      } else {
        console.log('MANUAL RECOVERY: Failed, video track still has issues');
      }
    } catch (err) {
      console.error('MANUAL RECOVERY: Error during recovery:', err);
    } finally {
      setIsRecovering(false);
    }
  };
  
  // Если нет проблем с видео, ничего не показываем
  if (!videoIssueDetected) {
    return null;
  }
  
  return (
    <div className="fixed bottom-24 left-4 z-50 bg-red-600 rounded-lg p-3 text-white shadow-lg flex items-center space-x-2 animate-pulse">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
        <path d="M23 7l-7 5 7 5V7z"></path>
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
      </svg>
      <div className="flex-1">
        <p className="text-sm font-medium">Проблема с видео</p>
        <p className="text-xs opacity-80">Ваша камера может быть недоступна</p>
      </div>
      <button
        onClick={handleRecovery}
        disabled={isRecovering}
        className="bg-white text-red-600 px-3 py-1 rounded text-sm font-medium hover:bg-red-100 disabled:opacity-50 transition-all duration-200 hover:shadow-md"
      >
        {isRecovering ? (
          <span className="flex items-center">
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Восстановление...
          </span>
        ) : (
          'Переподключить камеру'
        )}
      </button>
    </div>
  );
}