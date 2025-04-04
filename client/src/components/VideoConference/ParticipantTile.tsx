import { useState, useEffect } from "react";
import { Participant, Track, RemoteTrackPublication, LocalTrackPublication } from "livekit-client";

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
  
  // Отслеживаем состояние медиатреков участника
  useEffect(() => {
    // Функция обновления состояний
    const updateStates = () => {
      const trackPubs = participant.getTrackPublications();
      
      console.log(`Tracks for participant ${participant.identity}:`, 
        trackPubs.map(pub => ({
          sid: pub.trackSid,
          source: pub.track?.source,
          kind: pub.kind,
          isMuted: pub.isMuted,
          isSubscribed: pub.isSubscribed
        }))
      );
      
      const micPub = trackPubs.find(pub => 
        pub.track?.source === Track.Source.Microphone
      );
      const cameraPub = trackPubs.find(pub => 
        pub.track?.source === Track.Source.Camera
      );
      const screenPub = trackPubs.find(pub => 
        pub.track?.source === Track.Source.ScreenShare
      );
      
      console.log(`Media state for ${participant.identity}:`, {
        microphone: micPub ? { isMuted: micPub.isMuted, isSubscribed: micPub.isSubscribed } : 'none',
        camera: cameraPub ? { isMuted: cameraPub.isMuted, isSubscribed: cameraPub.isSubscribed } : 'none',
        screen: screenPub ? { isMuted: screenPub.isMuted, isSubscribed: screenPub.isSubscribed } : 'none'
      });
      
      setIsMuted(!micPub || micPub.isMuted);
      setIsCameraEnabled(!!cameraPub && !cameraPub.isMuted);
      setIsScreenSharing(!!screenPub && !screenPub.isMuted);
      
      // Обновление видео элементов
      if (cameraPub?.track && videoEl) {
        if (isLocal) {
          const localTrack = cameraPub.track as LocalTrackPublication["track"];
          if (localTrack && localTrack.attach) {
            localTrack.attach(videoEl);
          }
        } else {
          const remoteTrack = cameraPub.track as RemoteTrackPublication["track"];
          if (remoteTrack && remoteTrack.attach) {
            remoteTrack.attach(videoEl);
          }
        }
      }
      
      // Обновление элемента демонстрации экрана
      if (screenPub?.track && screenEl) {
        if (isLocal) {
          const localTrack = screenPub.track as LocalTrackPublication["track"];
          if (localTrack && localTrack.attach) {
            localTrack.attach(screenEl);
          }
        } else {
          const remoteTrack = screenPub.track as RemoteTrackPublication["track"];
          if (remoteTrack && remoteTrack.attach) {
            remoteTrack.attach(screenEl);
          }
        }
      }
      
      // Обновление аудио элемента
      if (micPub?.track && audioEl && !micPub.isMuted) {
        if (isLocal) {
          const localTrack = micPub.track as LocalTrackPublication["track"];
          if (localTrack && localTrack.attach) {
            localTrack.attach(audioEl);
          }
        } else {
          const remoteTrack = micPub.track as RemoteTrackPublication["track"];
          if (remoteTrack && remoteTrack.attach) {
            remoteTrack.attach(audioEl);
          }
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
        />
      ) : isCameraEnabled ? (
        <video
          ref={setVideoEl}
          className="w-full h-full object-cover"
          autoPlay
          playsInline
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