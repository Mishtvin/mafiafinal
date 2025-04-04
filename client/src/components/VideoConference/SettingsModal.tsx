import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

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

  // Загрузка доступных устройств
  useEffect(() => {
    if (isOpen) {
      navigator.mediaDevices.enumerateDevices()
        .then(devices => {
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
          
          // Устанавливаем первые устройства по умолчанию
          if (mics.length > 0 && !audioInput) setAudioInput(mics[0].deviceId);
          if (cams.length > 0 && !videoInput) setVideoInput(cams[0].deviceId);
          if (spks.length > 0 && !audioOutput) setAudioOutput(spks[0].deviceId);
        })
        .catch(error => {
          console.error('Error accessing media devices:', error);
        });
    }
  }, [isOpen, audioInput, videoInput, audioOutput]);

  // Обработчики изменения устройств
  const handleAudioInputChange = (value: string) => {
    setAudioInput(value);
    // В реальном приложении сюда бы добавили код для переключения между устройствами
  };

  const handleVideoInputChange = (value: string) => {
    setVideoInput(value);
    // В реальном приложении сюда бы добавили код для переключения между устройствами
  };

  const handleAudioOutputChange = (value: string) => {
    setAudioOutput(value);
    // В реальном приложении сюда бы добавили код для переключения между устройствами
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