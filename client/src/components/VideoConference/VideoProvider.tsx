import { useState, useEffect, useCallback, ReactNode } from 'react';
import { useRoomContext } from './CustomLiveKitRoom';
import { VideoPresets, Track, LocalTrackPublication } from 'livekit-client';

interface VideoProviderProps {
  children: ReactNode;
  enabled: boolean;
}

/**
 * Компонент, который централизованно управляет видеотреками,
 * используя подход, аналогичный примерам LiveKit meet.
 * Обеспечивает более стабильную работу с камерой.
 */
export default function VideoProvider({ children, enabled }: VideoProviderProps) {
  const room = useRoomContext();
  const [activeTrack, setActiveTrack] = useState<LocalTrackPublication | null>(null);
  const [trackError, setTrackError] = useState<Error | null>(null);
  
  // Функция для создания и публикации видеотрека с оптимальными настройками
  const setupVideoTrack = useCallback(async (shouldEnable: boolean) => {
    if (!room || !room.localParticipant) return;
    
    try {
      console.log('VIDEO PROVIDER: Setting up video track, enabled:', shouldEnable);
      
      // Если видео должно быть отключено, останавливаем существующие треки
      if (!shouldEnable) {
        console.log('VIDEO PROVIDER: Disabling camera');
        await room.localParticipant.setCameraEnabled(false);
        setActiveTrack(null);
        return;
      }
      
      // Используем настройки, максимально близкие к примеру LiveKit meet
      const videoOptions = {
        resolution: VideoPresets.h540,
        facingMode: 'user' as 'user',
        // Важно: не используем simulcast, это может вызывать проблемы
        simulcast: false,
        // Ограничиваем FPS для большей стабильности
        frameRate: 24,
      };
      
      // Отключаем и заново включаем камеру через API LiveKit
      // Сначала получаем существующие треки
      const existingTracks = room.localParticipant.getTrackPublications()
        .filter(pub => pub.kind === 'video' && pub.track?.source === Track.Source.Camera);
      
      // Если уже есть треки, но они в плохом состоянии - убираем их
      if (existingTracks.length > 0) {
        const hasBadTracks = existingTracks.some(pub => 
          !pub.track || 
          !pub.track.mediaStreamTrack || 
          pub.track.mediaStreamTrack.readyState === 'ended'
        );
        
        if (hasBadTracks) {
          console.log('VIDEO PROVIDER: Found bad tracks, recreating camera');
          await room.localParticipant.setCameraEnabled(false);
          // Даем время на освобождение ресурсов
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          console.log('VIDEO PROVIDER: Existing tracks are good, maintaining state');
          // Если треки в хорошем состоянии, сохраняем их
          setActiveTrack(existingTracks[0] as LocalTrackPublication);
          return;
        }
      }
      
      // Проверяем разрешения через getUserMedia напрямую
      try {
        // Это дополнительная проверка доступности камеры без создания треков в LiveKit
        const testStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 24, max: 30 },
            facingMode: 'user'
          }
        });
        
        console.log('VIDEO PROVIDER: Test access successful, camera is available', {
          tracks: testStream.getTracks().length,
          settings: testStream.getVideoTracks()[0]?.getSettings()
        });
        
        // Освобождаем тестовые треки
        testStream.getTracks().forEach(track => track.stop());
      } catch (err) {
        console.error('VIDEO PROVIDER: Camera permission test failed', err);
        // Не выбрасываем ошибку, пробуем продолжить через LiveKit API
      }
      
      // Включаем камеру с заданными опциями
      console.log('VIDEO PROVIDER: Enabling camera with options', videoOptions);
      const videoTrack = await room.localParticipant.setCameraEnabled(true, videoOptions);
      
      if (!videoTrack) {
        throw new Error('Failed to create video track');
      }
      
      console.log('VIDEO PROVIDER: Camera successfully enabled', {
        trackId: videoTrack.trackSid,
        hasTrack: !!videoTrack.track,
        trackState: videoTrack.track?.mediaStreamTrack?.readyState || 'unknown'
      });
      
      setActiveTrack(videoTrack as LocalTrackPublication);
      setTrackError(null);
      
      // Настраиваем обработчики событий трека для мониторинга
      if (videoTrack.track) {
        // Отслеживаем состояние MediaStreamTrack напрямую
        const mediaStreamTrack = videoTrack.track.mediaStreamTrack;
        if (mediaStreamTrack) {
          mediaStreamTrack.onended = () => {
            console.log('VIDEO PROVIDER: MediaStreamTrack ended event triggered');
            // При завершении трека пытаемся сразу же переподключиться
            handleTrackEnded();
          };
        }
      }
      
    } catch (error) {
      console.error('VIDEO PROVIDER: Error setting up video track:', error);
      setTrackError(error as Error);
    }
  }, [room]);
  
  // Обработчик завершения трека
  const handleTrackEnded = useCallback(async () => {
    if (!room || !room.localParticipant) return;
    
    console.log('VIDEO PROVIDER: Handling track ended event');
    
    try {
      // При обнаружении завершения трека пробуем быстро переподключиться
      await room.localParticipant.setCameraEnabled(false);
      
      // Короткая пауза
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Повторно включаем
      console.log('VIDEO PROVIDER: Recreating camera after track ended');
      
      const videoOptions = {
        resolution: VideoPresets.h540,
        facingMode: 'user' as 'user',
        simulcast: false,
        frameRate: 24,
      };
      
      const videoTrack = await room.localParticipant.setCameraEnabled(true, videoOptions);
      
      if (videoTrack) {
        console.log('VIDEO PROVIDER: Successfully recreated camera after track ended', {
          trackId: videoTrack.trackSid
        });
        setActiveTrack(videoTrack as LocalTrackPublication);
      }
    } catch (error) {
      console.error('VIDEO PROVIDER: Failed to recover from track ended:', error);
    }
  }, [room]);
  
  // Устанавливаем видеотрек при изменении состояния enabled или комнаты
  useEffect(() => {
    setupVideoTrack(enabled);
  }, [enabled, setupVideoTrack]);
  
  // Периодически проверяем состояние трека для раннего обнаружения проблем
  useEffect(() => {
    if (!room || !activeTrack || !activeTrack.track) return;
    
    const checkInterval = setInterval(() => {
      const mediaTrack = activeTrack.track?.mediaStreamTrack;
      if (mediaTrack && mediaTrack.readyState === 'ended') {
        console.log('VIDEO PROVIDER: Detected ended track during periodic check');
        handleTrackEnded();
      }
    }, 2000);
    
    return () => clearInterval(checkInterval);
  }, [room, activeTrack, handleTrackEnded]);
  
  // Добавляем обработчик событий комнаты для восстановления при реконнекте
  useEffect(() => {
    if (!room) return;
    
    const handleReconnected = () => {
      console.log('VIDEO PROVIDER: Reconnected to room, ensuring camera state');
      if (enabled) {
        setupVideoTrack(true);
      }
    };
    
    room.on('reconnected', handleReconnected);
    
    return () => {
      room.off('reconnected', handleReconnected);
    };
  }, [room, enabled, setupVideoTrack]);
  
  // Возвращаем дочерние компоненты без изменений
  return <>{children}</>;
}