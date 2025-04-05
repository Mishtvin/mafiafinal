import { useEffect, useRef, useState } from 'react';
import { LocalParticipant, Track, TrackPublication } from 'livekit-client';
import { useRoomContext } from './CustomLiveKitRoom';

/**
 * Компонент для автоматического мониторинга и восстановления видеотреков
 * при возникновении проблем с камерой или прерываниях видеопотока.
 * 
 * Отслеживает состояние видеотреков локального участника и
 * автоматически переинициализирует камеру при обнаружении проблем.
 */
export default function VideoRecoverySystem() {
  const room = useRoomContext();
  const [localParticipant, setLocalParticipant] = useState<LocalParticipant | null>(null);
  const monitoringIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recoveryAttemptsRef = useRef(0);
  const lastRecoveryTimeRef = useRef<number>(0);
  const videoStatesRef = useRef<{ [trackSid: string]: string }>({});
  
  // Настройка интервала проверки и максимального числа попыток восстановления
  const MONITOR_INTERVAL_MS = 2000; // Проверка каждые 2 секунды
  const MAX_RECOVERY_ATTEMPTS = 5; // Максимум 5 попыток подряд
  const RECOVERY_COOLDOWN_MS = 10000; // 10 секунд между сериями попыток
  
  // Обнаруживаем локального участника
  useEffect(() => {
    if (room && room.localParticipant) {
      setLocalParticipant(room.localParticipant);
      
      // Чистим старые видеотреки при размонтировании компонента
      return () => {
        if (monitoringIntervalRef.current) {
          clearInterval(monitoringIntervalRef.current);
        }
      };
    }
  }, [room]);
  
  // Функция проверки состояния и попытки восстановления
  const monitorAndRecoverTracks = async () => {
    if (!localParticipant) return;
    
    const videoPublications = localParticipant.getTrackPublications()
      .filter(pub => pub.kind === 'video' && pub.track?.source === Track.Source.Camera);
    
    if (videoPublications.length === 0) {
      // Нет видеотреков, но камера должна быть включена
      if (localParticipant.isCameraEnabled) {
        console.log('RECOVERY SYSTEM: No video tracks found but camera should be enabled');
        await attemptCameraRecovery();
      }
      return;
    }
    
    // Проверяем состояние всех видеотреков
    let needsRecovery = false;
    let allTracksEnded = true;
    
    for (const pub of videoPublications) {
      if (!pub.track) continue;
      
      const trackId = pub.trackSid;
      const mediaTrack = pub.track.mediaStreamTrack;
      const currentState = mediaTrack ? mediaTrack.readyState : 'unknown';
      
      // Сохраняем историю состояний трека
      if (!videoStatesRef.current[trackId]) {
        videoStatesRef.current[trackId] = currentState;
      }
      
      // Если состояние изменилось на "ended", помечаем для восстановления
      if (videoStatesRef.current[trackId] !== 'ended' && currentState === 'ended') {
        console.log(`RECOVERY SYSTEM: Track ${trackId} changed from ${videoStatesRef.current[trackId]} to ended`);
        needsRecovery = true;
      }
      
      // Обновляем историю состояний
      videoStatesRef.current[trackId] = currentState;
      
      // Проверяем, все ли треки завершены
      if (currentState !== 'ended') {
        allTracksEnded = false;
      }
    }
    
    // Если все треки завершены или нужно восстановление
    if ((allTracksEnded && videoPublications.length > 0) || needsRecovery) {
      console.log('RECOVERY SYSTEM: Detected ended video tracks, attempting recovery');
      await attemptCameraRecovery();
    }
  };
  
  // Функция попытки восстановления камеры
  const attemptCameraRecovery = async () => {
    if (!localParticipant) return;
    
    const now = Date.now();
    
    // Проверяем, не слишком ли часто делаем попытки восстановления
    if (now - lastRecoveryTimeRef.current < RECOVERY_COOLDOWN_MS) {
      recoveryAttemptsRef.current++;
      
      if (recoveryAttemptsRef.current > MAX_RECOVERY_ATTEMPTS) {
        console.log(`RECOVERY SYSTEM: Too many attempts (${recoveryAttemptsRef.current}), cooling down`);
        return;
      }
    } else {
      // Сбрасываем счетчик попыток после периода охлаждения
      recoveryAttemptsRef.current = 1;
    }
    
    // Обновляем время последней попытки
    lastRecoveryTimeRef.current = now;
    
    console.log(`RECOVERY SYSTEM: Recovery attempt #${recoveryAttemptsRef.current}`);
    
    try {
      // Сначала пробуем просто переключить камеру
      console.log('RECOVERY SYSTEM: Trying to reconnect camera...');
      
      // Отключаем камеру
      await localParticipant.setCameraEnabled(false);
      
      // Небольшая пауза для корректного освобождения ресурсов
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Включаем камеру снова
      const publication = await localParticipant.setCameraEnabled(true);
      
      if (publication) {
        console.log('RECOVERY SYSTEM: Camera successfully reconnected', {
          trackSid: publication.trackSid,
          hasTrack: !!publication.track
        });
      } else {
        console.log('RECOVERY SYSTEM: Failed to reconnect camera - no publication returned');
        
        // Более радикальный подход - запросить доступ к медиа-устройствам заново
        await attemptMediaDeviceReset();
      }
    } catch (error) {
      console.error('RECOVERY SYSTEM: Error during camera recovery:', error);
      
      // Если произошла ошибка, пробуем более глубокий сброс
      await attemptMediaDeviceReset();
    }
  };
  
  // Функция для полного сброса медиа-устройств и переподключения
  const attemptMediaDeviceReset = async () => {
    if (!localParticipant) return;
    console.log('RECOVERY SYSTEM: Attempting deep media device reset...');
    
    try {
      // Останавливаем все существующие треки
      const publications = localParticipant.getTrackPublications();
      
      for (const pub of publications) {
        if (pub.track) {
          pub.track.stop();
        }
      }
      
      // Полностью отключаем все медиа-устройства
      await localParticipant.setCameraEnabled(false);
      await localParticipant.setMicrophoneEnabled(false);
      
      // Пауза для освобождения ресурсов
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Проверяем доступ к устройствам напрямую
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: false 
      });
      
      console.log('RECOVERY SYSTEM: Direct media access successful', {
        tracks: mediaStream.getTracks().map(t => ({
          id: t.id,
          kind: t.kind,
          readyState: t.readyState
        }))
      });
      
      // Останавливаем тестовые треки
      mediaStream.getTracks().forEach(t => t.stop());
      
      // Включаем камеру снова через LiveKit
      const publication = await localParticipant.setCameraEnabled(true);
      
      if (publication) {
        console.log('RECOVERY SYSTEM: Deep reset successful, camera reconnected', {
          trackSid: publication.trackSid,
          hasTrack: !!publication.track
        });
      } else {
        console.log('RECOVERY SYSTEM: Deep reset failed - no publication returned');
      }
    } catch (error) {
      console.error('RECOVERY SYSTEM: Deep reset error:', error);
    }
  };
  
  // Устанавливаем систему мониторинга, когда доступен локальный участник
  useEffect(() => {
    if (!localParticipant) return;
    
    // Добавляем обработчики событий для отслеживания проблем с медиа-устройствами
    // Обработка медиа-ошибок через прослушивание событий трека
    localParticipant.on('trackMuted', (pub) => {
      if (pub.kind === 'video') {
        console.log('RECOVERY SYSTEM: Video track muted:', pub.trackSid);
        // Через небольшую задержку проверяем статус трека
        setTimeout(() => {
          if (pub.track && pub.track.mediaStreamTrack && pub.track.mediaStreamTrack.readyState === 'ended') {
            console.log('RECOVERY SYSTEM: Detected ended track after mute');
            attemptCameraRecovery();
          }
        }, 1000);
      }
    });
    
    console.log('RECOVERY SYSTEM: Starting monitoring system');
    
    // Запускаем периодический мониторинг
    monitoringIntervalRef.current = setInterval(monitorAndRecoverTracks, MONITOR_INTERVAL_MS);
    
    return () => {
      if (monitoringIntervalRef.current) {
        clearInterval(monitoringIntervalRef.current);
        monitoringIntervalRef.current = null;
      }
      console.log('RECOVERY SYSTEM: Monitoring stopped');
    };
  }, [localParticipant]);
  
  // Компонент не отображает никакого UI
  return null;
}