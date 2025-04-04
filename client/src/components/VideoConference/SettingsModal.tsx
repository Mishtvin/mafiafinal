import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEffect, useState, useRef } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

interface MediaDevice {
  deviceId: string;
  label: string;
  kind: string;
  selected?: boolean;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [microphones, setMicrophones] = useState<MediaDevice[]>([]);
  const [cameras, setCameras] = useState<MediaDevice[]>([]);
  const [speakers, setSpeakers] = useState<MediaDevice[]>([]);
  
  const [audioInput, setAudioInput] = useState<string>("");
  const [videoInput, setVideoInput] = useState<string>("");
  const [audioOutput, setAudioOutput] = useState<string>("");
  
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [hasRequestedPermissions, setHasRequestedPermissions] = useState(false);
  const [isShowingStats, setIsShowingStats] = useState(false);
  
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);

  // Запрос разрешений и загрузка устройств
  useEffect(() => {
    if (isOpen && !hasRequestedPermissions) {
      setHasRequestedPermissions(true);
      setPermissionError(null);
      
      // Запрашиваем разрешения на доступ к медиа-устройствам
      navigator.mediaDevices.getUserMedia({ audio: true, video: true })
        .then(stream => {
          // Успешно получили разрешения, теперь можем перечислить устройства
          loadDevices();
          
          // Сохраняем видеопоток для предпросмотра
          if (videoStreamRef.current) {
            videoStreamRef.current.getTracks().forEach(track => track.stop());
          }
          videoStreamRef.current = stream;
          
          // Отображаем предпросмотр видео
          if (videoPreviewRef.current) {
            videoPreviewRef.current.srcObject = stream;
          }
        })
        .catch(error => {
          console.error('Error requesting media permissions:', error);
          setPermissionError('Не удалось получить доступ к камере или микрофону. Пожалуйста, проверьте настройки разрешений браузера.');
          
          // Все равно пытаемся загрузить устройства, хотя их названия могут быть скрыты
          loadDevices();
        });
    }
    
    // Очистка ресурсов при закрытии
    return () => {
      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach(track => track.stop());
        videoStreamRef.current = null;
      }
      
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = null;
      }
    };
  }, [isOpen, hasRequestedPermissions]);
  
  // Загрузка доступных устройств
  const loadDevices = () => {
    navigator.mediaDevices.enumerateDevices()
      .then(devices => {
        console.log('Available media devices:', devices);
        
        const mics: MediaDevice[] = [];
        const cams: MediaDevice[] = [];
        const spks: MediaDevice[] = [];
        
        devices.forEach(device => {
          if (device.kind === 'audioinput') {
            mics.push({
              deviceId: device.deviceId,
              label: device.label || `Микрофон ${mics.length + 1}`,
              kind: device.kind
            });
          } else if (device.kind === 'videoinput') {
            cams.push({
              deviceId: device.deviceId,
              label: device.label || `Камера ${cams.length + 1}`,
              kind: device.kind
            });
          } else if (device.kind === 'audiooutput') {
            spks.push({
              deviceId: device.deviceId,
              label: device.label || `Динамик ${spks.length + 1}`,
              kind: device.kind
            });
          }
        });
        
        setMicrophones(mics);
        setCameras(cams);
        setSpeakers(spks);
        
        // Устанавливаем первые устройства по умолчанию, только если они еще не выбраны
        if (mics.length > 0 && !audioInput) setAudioInput(mics[0].deviceId);
        if (cams.length > 0 && !videoInput) setVideoInput(cams[0].deviceId);
        if (spks.length > 0 && !audioOutput) setAudioOutput(spks[0].deviceId);
      })
      .catch(error => {
        console.error('Error enumerating media devices:', error);
        setPermissionError('Не удалось получить список доступных устройств.');
      });
  };

  // Обработчик смены камеры с обновлением предпросмотра
  const handleVideoInputChange = async (value: string) => {
    setVideoInput(value);
    
    try {
      // Останавливаем предыдущий поток
      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach(track => track.stop());
      }
      
      // Запрашиваем новую камеру
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { deviceId: { exact: value } } 
      });
      
      videoStreamRef.current = stream;
      
      // Обновляем предпросмотр
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error('Error switching camera:', error);
      setPermissionError('Не удалось переключиться на выбранную камеру.');
    }
  };

  // Обработчики изменения других устройств
  const handleAudioInputChange = (value: string) => {
    setAudioInput(value);
    // В реальной реализации мы бы переключали активный микрофон здесь
  };

  const handleAudioOutputChange = (value: string) => {
    setAudioOutput(value);
    // В реальной реализации мы бы переключали устройство вывода здесь
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Настройки</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="audio" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="audio">Аудио</TabsTrigger>
            <TabsTrigger value="video">Видео</TabsTrigger>
          </TabsList>
          
          <TabsContent value="audio" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="audioInput">Микрофон</Label>
              <Select value={audioInput} onValueChange={handleAudioInputChange}>
                <SelectTrigger id="audioInput">
                  <SelectValue placeholder="Выберите микрофон" />
                </SelectTrigger>
                <SelectContent>
                  {microphones.map(device => (
                    <SelectItem key={device.deviceId} value={device.deviceId}>
                      {device.label || `Микрофон ${device.deviceId.substring(0, 5)}...`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="audioOutput">Динамики</Label>
              <Select value={audioOutput} onValueChange={handleAudioOutputChange}>
                <SelectTrigger id="audioOutput">
                  <SelectValue placeholder="Выберите динамики" />
                </SelectTrigger>
                <SelectContent>
                  {speakers.map(device => (
                    <SelectItem key={device.deviceId} value={device.deviceId}>
                      {device.label || `Динамики ${device.deviceId.substring(0, 5)}...`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
          
          <TabsContent value="video" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="videoInput">Камера</Label>
              <Select value={videoInput} onValueChange={handleVideoInputChange}>
                <SelectTrigger id="videoInput">
                  <SelectValue placeholder="Выберите камеру" />
                </SelectTrigger>
                <SelectContent>
                  {cameras.map(device => (
                    <SelectItem key={device.deviceId} value={device.deviceId}>
                      {device.label || `Камера ${device.deviceId.substring(0, 5)}...`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {videoInput && (
              <div className="mt-4 border rounded-md p-2 bg-black/10">
                <div className="aspect-video bg-black/20 rounded-md overflow-hidden relative">
                  <video 
                    ref={videoPreviewRef}
                    id="videoPreview" 
                    autoPlay 
                    playsInline 
                    muted 
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">
                    Предпросмотр камеры
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}