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
  const [cameras, setCameras] = useState<MediaDevice[]>([]);
  const [videoInput, setVideoInput] = useState<string>("");
  
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
      navigator.mediaDevices.getUserMedia({ video: true })
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
          setPermissionError('Не удалось получить доступ к камере. Пожалуйста, проверьте настройки разрешений браузера.');
          
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
        
        const cams: MediaDevice[] = [];
        
        devices.forEach(device => {
          if (device.kind === 'videoinput') {
            cams.push({
              deviceId: device.deviceId,
              label: device.label || `Камера ${cams.length + 1}`,
              kind: device.kind
            });
          }
        });
        
        setCameras(cams);
        
        // Устанавливаем первую камеру по умолчанию, только если еще не выбрана
        if (cams.length > 0 && !videoInput) setVideoInput(cams[0].deviceId);
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

  // Обработчики удалены, поскольку аудио не используется

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Настройки</DialogTitle>
        </DialogHeader>
        
        <div className="w-full space-y-4 pt-4">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}