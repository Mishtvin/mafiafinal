import { useState, useEffect, useRef } from 'react';
import { Participant, TrackPublication, Track } from 'livekit-client';
import { useRoomContext } from './CustomLiveKitRoom';

interface ParticipantTileProps {
  participant: Participant;
}

/**
 * Улучшенная версия ParticipantTile с более надежным подключением видеотреков
 * и обработкой различных состояний.
 */
export default function ParticipantTile({ participant }: ParticipantTileProps) {
  const room = useRoomContext();
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [videoState, setVideoState] = useState<string>('loading');
  const [videoInfo, setVideoInfo] = useState<{
    sid?: string;
    streamId?: string;
    readyState?: string;
    resolution?: string;
  }>({});
  
  // Отслеживаем текущие подписки для избежания утечек памяти
  const pubTrackRef = useRef<{
    video?: TrackPublication;
    audio?: TrackPublication;
    screen?: TrackPublication;
  }>({});
  
  // Обработчик для подключения видеопотока к элементу <video>
  const attachVideoTrack = (publication: TrackPublication) => {
    if (!videoRef.current || !publication.track || !videoContainerRef.current) return;
    
    try {
      console.log('Attaching video track:', {
        trackSid: publication.trackSid,
        trackSource: publication.track.source,
        trackState: publication.track.mediaStreamTrack?.readyState || 'unknown',
        attachedTo: videoRef.current ? 'video element' : 'no video element',
      });
      
      // Получаем размеры контейнера для расчета пропорций
      const container = videoContainerRef.current;
      const width = container.clientWidth;
      const height = container.clientHeight;
      setDimensions({ width, height });
      
      // Используем стандартное API LiveKit для подключения видео
      publication.track.attach(videoRef.current);
      
      // Отслеживаем состояние трека и включаем/отключаем видео в соответствии с ним
      if (publication.track.mediaStreamTrack?.readyState === 'ended') {
        setVideoState('ended');
      } else {
        setVideoState('playing');
      }
      
      // Обновляем техническую информацию для диагностики
      setVideoInfo({
        sid: publication.trackSid,
        streamId: publication.track.mediaStreamTrack?.id,
        readyState: publication.track.mediaStreamTrack?.readyState,
        resolution: publication.dimensions ? 
          `${publication.dimensions.width}x${publication.dimensions.height}` : 'unknown'
      });
      
    } catch (error) {
      console.error('Failed to attach video track:', error);
      setVideoState('error');
    }
  };
  
  // Функция для безопасного отключения видеотрека
  const detachVideoTrack = (publication?: TrackPublication) => {
    if (!publication || !publication.track) return;
    
    try {
      if (videoRef.current) {
        console.log('Detaching video track:', publication.trackSid);
        publication.track.detach(videoRef.current);
      }
    } catch (error) {
      console.error('Error detaching video track:', error);
    }
  };
  
  // Обработчики событий трека
  const handleTrackSubscribed = (track: Track, publication: TrackPublication) => {
    console.log('Track subscribed in tile:', {
      trackSid: publication.trackSid,
      kind: track.kind,
      source: track.source
    });
    
    if (track.kind === 'video' && track.source === Track.Source.Camera) {
      pubTrackRef.current.video = publication;
      attachVideoTrack(publication);
    }
  };
  
  const handleTrackUnsubscribed = (track: Track, publication: TrackPublication) => {
    console.log('Track unsubscribed in tile:', {
      trackSid: publication.trackSid,
      kind: track.kind,
      source: track.source
    });
    
    if (track.kind === 'video' && track.source === Track.Source.Camera) {
      detachVideoTrack(publication);
      pubTrackRef.current.video = undefined;
      setVideoState('off');
    }
  };
  
  const handleTrackMuted = (publication: TrackPublication) => {
    if (publication.kind === 'video') {
      console.log('Video track muted:', publication.trackSid);
      setVideoState('muted');
    }
  };
  
  const handleTrackUnmuted = (publication: TrackPublication) => {
    if (publication.kind === 'video') {
      console.log('Video track unmuted:', publication.trackSid);
      setVideoState('playing');
    }
  };
  
  // Установка обработчиков событий при монтировании компонента
  useEffect(() => {
    if (!participant) return;
    
    // Инициализация: поиск и подключение существующих треков
    const videoPublication = participant.getTrackPublications().find(
      pub => pub.kind === 'video' && pub.track?.source === Track.Source.Camera
    );
    
    // Если есть видеотрек и он активен, подключаем его
    if (videoPublication?.isSubscribed && videoPublication.track) {
      pubTrackRef.current.video = videoPublication;
      attachVideoTrack(videoPublication);
    } else {
      console.log('No active video track found for participant:', participant.identity);
      setVideoState(videoPublication ? 'loading' : 'off');
    }
    
    // Установка обработчиков событий участника
    participant.on('trackSubscribed', handleTrackSubscribed);
    participant.on('trackUnsubscribed', handleTrackUnsubscribed);
    participant.on('trackMuted', handleTrackMuted);
    participant.on('trackUnmuted', handleTrackUnmuted);
    
    // Создаем интервал для периодического мониторинга состояния видеотрека
    // Это помогает обнаружить и исправить проблемы с видео
    const trackMonitorInterval = setInterval(() => {
      const currentVideoTrack = pubTrackRef.current.video;
      
      if (currentVideoTrack && currentVideoTrack.track) {
        const mediaTrack = currentVideoTrack.track.mediaStreamTrack;
        
        if (mediaTrack && mediaTrack.readyState === 'ended') {
          console.log('Detected ended track in monitor for:', participant.identity);
          setVideoState('ended');
          
          // Попытка переподключить видео
          if (room && participant === room.localParticipant) {
            console.log('Attempting to recover local video track...');
            // VideoProvider должен автоматически обработать переподключение
          }
        }
      }
    }, 5000);
    
    // Функция очистки при размонтировании
    return () => {
      // Отписываемся от всех событий
      participant.off('trackSubscribed', handleTrackSubscribed);
      participant.off('trackUnsubscribed', handleTrackUnsubscribed);
      participant.off('trackMuted', handleTrackMuted);
      participant.off('trackUnmuted', handleTrackUnmuted);
      
      // Отключаем все подключенные треки
      if (pubTrackRef.current.video) {
        detachVideoTrack(pubTrackRef.current.video);
      }
      
      clearInterval(trackMonitorInterval);
    };
  }, [participant, room]);
  
  // Динамически управляем отображением состояния видео
  const renderVideoStatus = () => {
    switch (videoState) {
      case 'loading':
        return (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-800 bg-opacity-70">
            <div className="animate-spin h-8 w-8 border-2 border-blue-500 rounded-full border-t-transparent"></div>
          </div>
        );
      case 'off':
        return (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-800 bg-opacity-70">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white opacity-40">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>
        );
      case 'muted':
        return (
          <div className="absolute bottom-2 right-2 bg-red-500 rounded-full p-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23"></line>
              <path d="M15 11a5 5 0 0 1-1.7 3.8l-7-7A5 5 0 0 1 15 11z"></path>
              <path d="M19 19v-1.5a5 5 0 0 0-12-2.1"></path>
            </svg>
          </div>
        );
      case 'ended':
        return (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-900 bg-opacity-30">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500 mb-2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <p className="text-xs text-red-200">Видео остановлено</p>
          </div>
        );
      case 'error':
        return (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-900 bg-opacity-40">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500 mb-2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <p className="text-xs text-red-200">Ошибка видео</p>
          </div>
        );
      default:
        return null;
    }
  };
  
  // Определяем, является ли этот участник локальным
  const isLocal = room && participant === room.localParticipant;
  
  return (
    <div 
      className={`relative overflow-hidden rounded-lg bg-slate-800 border ${isLocal ? 'border-blue-500' : 'border-slate-700'}`}
      style={{ aspectRatio: '16/9' }}
      ref={videoContainerRef}
    >
      {/* Видео элемент с обработкой ошибок */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal} // Глушим свое видео
        className={`object-cover w-full h-full ${videoState === 'playing' ? 'opacity-100' : 'opacity-0'}`}
        onError={() => setVideoState('error')}
      />
      
      {/* Визуальный статус видео */}
      {renderVideoStatus()}
      
      {/* Индикатор локального участника и имя */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
        <div className="flex items-center">
          <span className="text-white text-sm font-medium truncate">
            {participant.identity}
            {isLocal && ' (вы)'}
          </span>
          
          {isLocal && (
            <span className="ml-2 bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded">
              Локальный
            </span>
          )}
          
          {videoInfo.readyState && videoInfo.readyState !== 'live' && (
            <span className="ml-auto text-xs text-red-300">
              {videoInfo.readyState}
            </span>
          )}
        </div>
        
        {/* Технические детали для отладки - можно убрать в продакшене */}
        {process.env.NODE_ENV !== 'production' && videoInfo.sid && (
          <div className="text-xs text-gray-400 opacity-70 mt-1">
            {videoInfo.sid.substring(0, 8)}
            {videoInfo.resolution && ` (${videoInfo.resolution})`}
          </div>
        )}
      </div>
    </div>
  );
}