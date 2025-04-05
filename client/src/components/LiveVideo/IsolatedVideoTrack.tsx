import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Participant } from 'livekit-client';
import { useCameraContext } from '../../contexts/CameraContext';

/**
 * Изолированный компонент для отображения видеотрека с минимальными перерисовками
 */
export const IsolatedVideoTrack: React.FC<{
  participant: Participant;
}> = React.memo(({ participant }) => {
  const videoElement = useRef<HTMLVideoElement>(null);
  const identity = participant.identity;
  const isLocal = participant.isLocal;
  
  // Получаем контекст камеры
  const { cameraStates } = useCameraContext();
  
  // Локальное состояние для статуса камеры, которое не вызывает перерисовку
  const [localEnabled, setLocalEnabled] = useState<boolean | null>(null);
  
  // Состояние для отслеживания того, что видео-элемент получил MediaStream
  const [hasVideoStream, setHasVideoStream] = useState(false);
  
  // Определяем состояние камеры из контекста
  useEffect(() => {
    // Для локального участника проверяем sessionStorage
    if (isLocal) {
      const savedState = window.sessionStorage.getItem('camera-state');
      const newState = savedState === 'true';
      setLocalEnabled(newState);
    } else {
      // Для удаленных участников используем состояние из контекста
      const newState = cameraStates[identity] || false;
      setLocalEnabled(newState);
    }
  }, [cameraStates, identity, isLocal]);
  
  // Используем вычисленное состояние
  const isEnabled = localEnabled !== null ? localEnabled : (isLocal ? true : false);
  
  console.log(`[VIDEO_TRACK] Рендер трека для ${identity}, isEnabled: ${isEnabled}, isLocal: ${isLocal}`);
  
  // Доступ к ref переменным для обновления вне цикла React
  const enabledRef = useRef(isEnabled);
  
  // Функция для обновления видеотрека без перерисовки компонента
  const updateVideoTrack = useCallback(() => {
    const videoEl = videoElement.current;
    if (!videoEl) return;
    
    // Получаем текущее состояние камеры из ref
    const currentEnabled = enabledRef.current;
    
    // Получаем все треки публикации этого участника
    const trackPublications = Array.from(participant.trackPublications.values());
    // Ищем видеотрек камеры
    const videoPublication = trackPublications.find(
      pub => pub.source === 'camera' && pub.track?.kind === 'video'
    );
    
    // Если есть видеотрек и элемент доступен, подключаем его
    if (videoPublication?.track) {
      const videoTrack = videoPublication.track;
      
      // Ручное управление потоком
      if (currentEnabled) {
        // Если камера включена, отображаем видео
        if (videoTrack.isMuted) {
          // Для LocalTrack доступен метод unmute
          if ('unmute' in videoTrack) {
            (videoTrack as any).unmute();
          }
        }
        videoEl.muted = true;
        videoEl.autoplay = true;
        
        // Присоединяем трек к HTML-элементу
        if (!videoEl.srcObject) {
          const mediaStream = new MediaStream([videoTrack.mediaStreamTrack]);
          videoEl.srcObject = mediaStream;
          setHasVideoStream(true);
          
          console.log(`[VIDEO_TRACK] Прикрепляю MediaStream для ${identity}`);
        }
      } else {
        // Если камера выключена, отключаем видео
        if (!videoTrack.isMuted) {
          // Для LocalTrack доступен метод mute
          if ('mute' in videoTrack) {
            (videoTrack as any).mute();
          }
        }
        videoEl.srcObject = null;
        setHasVideoStream(false);
        
        console.log(`[VIDEO_TRACK] Отключаю MediaStream для ${identity}`);
      }
    } else {
      // Если нет видеотрека, очищаем элемент
      if (videoEl.srcObject) {
        videoEl.srcObject = null;
        setHasVideoStream(false);
      }
    }
  }, [identity, participant]);
  
  // Обновляем ref при изменении состояния (не вызывает перерисовку)
  useEffect(() => {
    // Обновляем ref для доступа к текущему состоянию в обработчиках
    enabledRef.current = isEnabled;
    
    // Обновляем видео только для текущего участника, не перерисовывая компонент
    updateVideoTrack();
  }, [isEnabled, updateVideoTrack]);
  
  // Устанавливаем обработчики событий для треков участника
  useEffect(() => {
    // Первое обновление при монтировании
    updateVideoTrack();
    
    // Слушаем события лайвкита для обновления видео без перерисовки
    const handleTrackPublished = () => updateVideoTrack();
    const handleTrackUnpublished = () => updateVideoTrack();
    const handleTrackSubscribed = () => updateVideoTrack();
    const handleTrackUnsubscribed = () => updateVideoTrack();
    
    participant.on('trackPublished', handleTrackPublished);
    participant.on('trackUnpublished', handleTrackUnpublished);
    participant.on('trackSubscribed', handleTrackSubscribed);
    participant.on('trackUnsubscribed', handleTrackUnsubscribed);
    
    // Очистка при размонтировании
    return () => {
      participant.off('trackPublished', handleTrackPublished);
      participant.off('trackUnpublished', handleTrackUnpublished);
      participant.off('trackSubscribed', handleTrackSubscribed);
      participant.off('trackUnsubscribed', handleTrackUnsubscribed);
      
      // Очищаем видеоэлемент
      const videoEl = videoElement.current;
      if (videoEl && videoEl.srcObject) {
        videoEl.srcObject = null;
      }
    };
  }, [participant, updateVideoTrack]);
  
  return (
    <div className="relative w-full h-full">
      {/* HTML-элемент видео с фиксированным className для предотвращения перерисовок */}
      <video 
        ref={videoElement}
        className={`absolute inset-0 w-full h-full object-cover rounded-xl transition-opacity ${
          isEnabled && hasVideoStream ? 'opacity-100' : 'opacity-0'
        }`}
        // Ключевой момент: предотвращаем React от манипуляции с медиа-элементом
        // Управляем элементом самостоятельно в useEffect
        autoPlay={false}
        muted={true}
      />
      
      {/* Аватар пользователя, если камера выключена */}
      {(!isEnabled || !hasVideoStream) && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
          <div className="flex flex-col items-center justify-center">
            <div className="bg-purple-600 rounded-full w-16 h-16 flex items-center justify-center mb-2">
              <span className="text-xl font-bold text-white">
                {identity.substring(0, 2).toUpperCase()}
              </span>
            </div>
            <div className="text-white text-sm">{identity}</div>
          </div>
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Строгий компаратор: проверяем только идентификатор участника
  // В React.memo мы не учитываем изменение состояния камеры,
  // так как это обрабатывается внутри useEffect компонента
  return prevProps.participant.identity === nextProps.participant.identity;
});