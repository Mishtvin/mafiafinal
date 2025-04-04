import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useState, useEffect } from "react";
import { LocalParticipant, Track } from "livekit-client";
import { useRoomContext } from "./CustomLiveKitRoom";

interface ControlBarProps {
  onLeave: () => void;
}

export default function ControlBar({ onLeave }: ControlBarProps) {
  const room = useRoomContext();
  const [localParticipant, setLocalParticipant] = useState<LocalParticipant | null>(null);
  const [isCameraMuted, setIsCameraMuted] = useState(false);
  
  // Получаем локального участника из комнаты
  useEffect(() => {
    if (room && room.localParticipant) {
      setLocalParticipant(room.localParticipant);
    }
  }, [room]);
  
  // Отслеживаем состояние медиатреков
  useEffect(() => {
    if (!localParticipant) {
      console.log('No local participant available yet');
      return;
    }
    
    console.log('Local participant tracks:', 
      localParticipant.getTrackPublications().map(track => ({
        source: track.track?.source,
        kind: track.track?.kind,
        isMuted: track.isMuted
      }))
    );
    
    // Обновляем состояние при монтировании
    const camTrack = localParticipant.getTrackPublications().find(
      track => track.track?.source === Track.Source.Camera
    );
    
    console.log('Camera track state:', {
      camera: camTrack ? { isMuted: camTrack.isMuted, track: !!camTrack.track } : 'none'
    });
    
    setIsCameraMuted(camTrack ? camTrack.isMuted : true);
    
    // Обновляем состояние при изменениях треков
    const handleTrackMuted = () => {
      const newCamTrack = localParticipant.getTrackPublications().find(
        track => track.track?.source === Track.Source.Camera
      );
      
      setIsCameraMuted(newCamTrack ? newCamTrack.isMuted : true);
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
  
  // Обработчики для управления камерой
  const toggleCamera = async () => {
    if (!localParticipant) {
      console.error('No local participant available for camera toggle');
      return;
    }
    
    console.log('Toggling camera from', isCameraMuted ? 'muted' : 'unmuted', 'to', !isCameraMuted ? 'muted' : 'unmuted');
    
    try {
      // Запрашиваем доступ к камере
      let mediaStream;
      try {
        // Для включения и отключения камеры используем разные подходы
        if (isCameraMuted) {
          // Включаем камеру - сначала проверяем доступность устройства
          mediaStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: 'user'
            } 
          });
          console.log('Successfully got camera access, available tracks:', mediaStream.getVideoTracks().length);
          
          // Очищаем ресурсы проверочного стрима
          mediaStream.getTracks().forEach(track => track.stop());
          
          // Включаем камеру в LiveKit с базовыми настройками
          try {
            const result = await localParticipant.setCameraEnabled(true);
            console.log('Camera enable result:', result);
            
            if (!result) {
              // Если не удалось получить трек, повторяем попытку с другими настройками
              console.warn('Failed to enable camera with default settings, trying explicit settings');
              
              // Принудительно обновляем состояние, чтобы пользователь видел результат
              setIsCameraMuted(false);
            }
          } catch (error) {
            console.error('LiveKit camera enable error:', error);
            const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
            alert(`Ошибка при активации камеры: ${errorMessage}`);
          }
        } else {
          // Выключаем камеру - просто отключаем в LiveKit
          await localParticipant.setCameraEnabled(false);
          console.log('Camera disabled');
          
          // Обновляем состояние
          setIsCameraMuted(true);
        }
      } catch (mediaError) {
        console.error('Failed to get camera access:', mediaError);
        alert('Не удалось получить доступ к камере. Пожалуйста, убедитесь, что камера подключена и разрешения предоставлены в настройках браузера.');
        return;
      }
    } catch (error) {
      console.error('Error toggling camera:', error);
      // Обработка ошибок разрешения доступа к камере
      if (error instanceof Error) {
        if (error.message.includes('Permission')) {
          alert('Доступ к камере запрещен. Пожалуйста, разрешите доступ в настройках браузера.');
        } else {
          alert(`Ошибка включения камеры: ${error.message}`);
        }
      }
    }
  };

  const handleLeave = () => {
    onLeave();
  };

  return (
    <TooltipProvider>
      <div className="flex justify-center space-x-4 items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant={isCameraMuted ? "outline" : "default"}
              size="icon"
              className={`rounded-full w-12 h-12 ${isCameraMuted ? 'bg-slate-700' : ''}`}
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
              variant="destructive"
              size="icon"
              className="rounded-full w-12 h-12"
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