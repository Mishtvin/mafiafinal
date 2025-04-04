import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useState, useEffect } from "react";
import { Room, LocalParticipant, Track } from "livekit-client";
import { useLocalParticipant } from "@livekit/components-react";

interface ControlBarProps {
  onLeave: () => void;
}

export default function ControlBar({ onLeave }: ControlBarProps) {
  const { localParticipant } = useLocalParticipant();
  const [isMicrophoneMuted, setIsMicrophoneMuted] = useState(false);
  const [isCameraMuted, setIsCameraMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  
  // Отслеживаем состояние медиатреков
  useEffect(() => {
    if (!localParticipant) return;
    
    // Обновляем состояние при монтировании
    const micTrack = localParticipant.getTrackPublications().find(
      track => track.track?.source === Track.Source.Microphone
    );
    const camTrack = localParticipant.getTrackPublications().find(
      track => track.track?.source === Track.Source.Camera
    );
    const screenTrack = localParticipant.getTrackPublications().find(
      track => track.track?.source === Track.Source.ScreenShare
    );
    
    setIsMicrophoneMuted(micTrack ? micTrack.isMuted : true);
    setIsCameraMuted(camTrack ? camTrack.isMuted : true);
    setIsScreenSharing(!!screenTrack && !screenTrack.isMuted);
    
    // Обновляем состояние при изменениях треков
    const handleTrackMuted = () => {
      const newMicTrack = localParticipant.getTrackPublications().find(
        track => track.track?.source === Track.Source.Microphone
      );
      const newCamTrack = localParticipant.getTrackPublications().find(
        track => track.track?.source === Track.Source.Camera
      );
      const newScreenTrack = localParticipant.getTrackPublications().find(
        track => track.track?.source === Track.Source.ScreenShare
      );
      
      setIsMicrophoneMuted(newMicTrack ? newMicTrack.isMuted : true);
      setIsCameraMuted(newCamTrack ? newCamTrack.isMuted : true);
      setIsScreenSharing(!!newScreenTrack && !newScreenTrack.isMuted);
    };
    
    localParticipant.on('trackMuted', handleTrackMuted);
    localParticipant.on('trackUnmuted', handleTrackMuted);
    localParticipant.on('trackPublished', handleTrackMuted);
    localParticipant.on('trackUnpublished', handleTrackMuted);
    
    return () => {
      localParticipant.off('trackMuted', handleTrackMuted);
      localParticipant.off('trackUnmuted', handleTrackMuted);
      localParticipant.off('trackPublished', handleTrackMuted);
      localParticipant.off('trackUnpublished', handleTrackMuted);
    };
  }, [localParticipant]);
  
  // Обработчики для управления аудио/видео
  const toggleMicrophone = async () => {
    if (!localParticipant) return;
    
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneMuted);
    } catch (error) {
      console.error('Error toggling microphone:', error);
    }
  };

  const toggleCamera = async () => {
    if (!localParticipant) return;
    
    try {
      await localParticipant.setCameraEnabled(!isCameraMuted);
    } catch (error) {
      console.error('Error toggling camera:', error);
    }
  };

  const toggleScreenShare = async () => {
    if (!localParticipant) return;
    
    try {
      await localParticipant.setScreenShareEnabled(!isScreenSharing);
    } catch (error) {
      console.error('Error toggling screen share:', error);
    }
  };

  const handleLeave = () => {
    onLeave();
  };

  return (
    <TooltipProvider>
      <div className="flex justify-center space-x-2 sm:space-x-4 items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant={isMicrophoneMuted ? "outline" : "default"}
              size="icon"
              className={`rounded-full w-10 h-10 ${isMicrophoneMuted ? 'bg-slate-700' : ''}`}
              onClick={toggleMicrophone}
            >
              {isMicrophoneMuted ? (
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  width="20" 
                  height="20" 
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
              ) : (
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  width="20" 
                  height="20" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                >
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                  <line x1="12" y1="19" x2="12" y2="23"></line>
                  <line x1="8" y1="23" x2="16" y2="23"></line>
                </svg>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isMicrophoneMuted ? 'Включить микрофон' : 'Выключить микрофон'}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant={isCameraMuted ? "outline" : "default"}
              size="icon"
              className={`rounded-full w-10 h-10 ${isCameraMuted ? 'bg-slate-700' : ''}`}
              onClick={toggleCamera}
            >
              {isCameraMuted ? (
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  width="20" 
                  height="20" 
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
              ) : (
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  width="20" 
                  height="20" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                >
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                  <circle cx="12" cy="13" r="4"></circle>
                </svg>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isCameraMuted ? 'Включить камеру' : 'Выключить камеру'}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant={isScreenSharing ? "default" : "outline"}
              size="icon"
              className={`rounded-full w-10 h-10 ${isScreenSharing ? '' : 'bg-slate-700'}`}
              onClick={toggleScreenShare}
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="20" 
                height="20" 
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
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isScreenSharing ? 'Прекратить демонстрацию' : 'Демонстрация экрана'}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="destructive"
              size="icon"
              className="rounded-full w-10 h-10"
              onClick={handleLeave}
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="20" 
                height="20" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Покинуть конференцию</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}