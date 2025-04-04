import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useState, useEffect } from "react";
import { Room, LocalParticipant, Track } from "livekit-client";
import { useLocalParticipant } from "@livekit/components-react";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle } from "lucide-react";

interface ControlBarProps {
  onLeave: () => void;
}

export default function ControlBar({ onLeave }: ControlBarProps) {
  const { localParticipant } = useLocalParticipant();
  const [isMicrophoneMuted, setIsMicrophoneMuted] = useState(false);
  const [isCameraMuted, setIsCameraMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  
  // Дополнительное состояние для отладки
  const [deviceStatus, setDeviceStatus] = useState<{
    microphone: 'available' | 'unavailable' | 'error' | 'none';
    camera: 'available' | 'unavailable' | 'error' | 'none';
    screen: 'available' | 'unavailable' | 'error' | 'none';
  }>({
    microphone: 'none',
    camera: 'none',
    screen: 'none'
  });
  
  // Состояние для отображения дополнительной диагностики
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  
  // Проверка доступности устройств
  useEffect(() => {
    const checkDeviceAvailability = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        console.log('Available devices:', devices);
        
        // Проверка наличия микрофона
        const hasMicrophone = devices.some(device => device.kind === 'audioinput');
        // Проверка наличия камеры
        const hasCamera = devices.some(device => device.kind === 'videoinput');
        
        setDeviceStatus(prev => ({
          ...prev,
          microphone: hasMicrophone ? 'available' : 'unavailable',
          camera: hasCamera ? 'available' : 'unavailable',
          screen: 'available' // Screen sharing всегда доступен
        }));
        
      } catch (error) {
        console.error('Error checking device availability:', error);
        setDeviceStatus({
          microphone: 'error',
          camera: 'error',
          screen: 'available' // Screen sharing обычно доступен всегда
        });
      }
    };
    
    checkDeviceAvailability();
  }, []);
  
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
    const micTrack = localParticipant.getTrackPublications().find(
      track => track.track?.source === Track.Source.Microphone
    );
    const camTrack = localParticipant.getTrackPublications().find(
      track => track.track?.source === Track.Source.Camera
    );
    const screenTrack = localParticipant.getTrackPublications().find(
      track => track.track?.source === Track.Source.ScreenShare
    );
    
    console.log('Media tracks state:', {
      mic: micTrack ? { isMuted: micTrack.isMuted, track: !!micTrack.track } : 'none',
      camera: camTrack ? { isMuted: camTrack.isMuted, track: !!camTrack.track } : 'none',
      screen: screenTrack ? { isMuted: screenTrack.isMuted, track: !!screenTrack.track } : 'none'
    });
    
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
    if (!localParticipant) {
      console.error('No local participant available for microphone toggle');
      return;
    }
    
    console.log('Toggling microphone from', isMicrophoneMuted ? 'muted' : 'unmuted', 'to', !isMicrophoneMuted ? 'muted' : 'unmuted');
    
    try {
      // Запрашиваем доступ к микрофону
      let mediaStream;
      try {
        // Сначала явно запрашиваем доступ к микрофону
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log('Successfully got microphone access');
      } catch (mediaError) {
        console.error('Failed to get microphone access:', mediaError);
        alert('Не удалось получить доступ к микрофону. Пожалуйста, убедитесь, что микрофон подключен и разрешения предоставлены в настройках браузера.');
        return;
      }
      
      // Теперь пытаемся включить микрофон в LiveKit
      const result = await localParticipant.setMicrophoneEnabled(!isMicrophoneMuted);
      console.log('Toggle microphone result:', result);
      
      if (!result) {
        console.warn('No track returned when enabling microphone, but no error was thrown');
        // Принудительно обновляем состояние на основе нашего запроса
        setTimeout(() => {
          const micTrack = localParticipant.getTrackPublications().find(
            track => track.track?.source === Track.Source.Microphone
          );
          const newState = micTrack ? !micTrack.isMuted : false;
          setIsMicrophoneMuted(!newState);
        }, 500);
      }
      
      // Освобождаем ресурсы локального стрима
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
      }
    } catch (error) {
      console.error('Error toggling microphone:', error);
      // Обработка ошибок разрешения доступа к микрофону
      if (error instanceof Error) {
        if (error.message.includes('Permission')) {
          alert('Доступ к микрофону запрещен. Пожалуйста, разрешите доступ в настройках браузера.');
        } else {
          alert(`Ошибка включения микрофона: ${error.message}`);
        }
      }
    }
  };

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
        // Сначала явно запрашиваем доступ к камере
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
        console.log('Successfully got camera access');
      } catch (mediaError) {
        console.error('Failed to get camera access:', mediaError);
        alert('Не удалось получить доступ к камере. Пожалуйста, убедитесь, что камера подключена и разрешения предоставлены в настройках браузера.');
        return;
      }
      
      // Теперь пытаемся включить камеру в LiveKit
      const result = await localParticipant.setCameraEnabled(!isCameraMuted);
      console.log('Toggle camera result:', result);
      
      if (!result) {
        console.warn('No track returned when enabling camera, but no error was thrown');
        // Принудительно обновляем состояние на основе нашего запроса
        setTimeout(() => {
          const camTrack = localParticipant.getTrackPublications().find(
            track => track.track?.source === Track.Source.Camera
          );
          const newState = camTrack ? !camTrack.isMuted : false;
          setIsCameraMuted(!newState);
        }, 500);
      }
      
      // Освобождаем ресурсы локального стрима
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
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

  // Переключение отображения диагностики
  const toggleDiagnostics = () => {
    setShowDiagnostics(!showDiagnostics);
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col items-center gap-2">
        {/* Диагностическая информация (если включена) */}
        {showDiagnostics && (
          <div className="bg-black/20 rounded-md p-2 mb-2 w-full max-w-md">
            <div className="text-sm font-medium mb-1 text-center">Диагностика устройств</div>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <div className="flex flex-col items-center">
                <span className="text-xs mb-1">Микрофон</span>
                {deviceStatus.microphone === 'available' ? (
                  <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                    <CheckCircle className="w-3 h-3 mr-1" /> Доступен
                  </Badge>
                ) : deviceStatus.microphone === 'unavailable' ? (
                  <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300">
                    <AlertCircle className="w-3 h-3 mr-1" /> Недоступен
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300">
                    <AlertCircle className="w-3 h-3 mr-1" /> Ошибка
                  </Badge>
                )}
              </div>
              
              <div className="flex flex-col items-center">
                <span className="text-xs mb-1">Камера</span>
                {deviceStatus.camera === 'available' ? (
                  <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                    <CheckCircle className="w-3 h-3 mr-1" /> Доступна
                  </Badge>
                ) : deviceStatus.camera === 'unavailable' ? (
                  <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300">
                    <AlertCircle className="w-3 h-3 mr-1" /> Недоступна
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300">
                    <AlertCircle className="w-3 h-3 mr-1" /> Ошибка
                  </Badge>
                )}
              </div>
              
              <div className="flex flex-col items-center">
                <span className="text-xs mb-1">Демонстрация</span>
                <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                  <CheckCircle className="w-3 h-3 mr-1" /> Доступна
                </Badge>
              </div>
            </div>
          </div>
        )}
      
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
      </div>
    </TooltipProvider>
  );
}