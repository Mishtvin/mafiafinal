import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { 
  useMediaDevices,
  useAudioSettings,
  useVideoSettings
} from '@livekit/components-react';
import { useEffect, useState } from "react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { devices, isLoading } = useMediaDevices();
  const audioSettings = useAudioSettings();
  const videoSettings = useVideoSettings();

  const [selectedMicrophone, setSelectedMicrophone] = useState<string>('');
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>('');
  const [selectedCamera, setSelectedCamera] = useState<string>('');

  // Initialize with current devices when modal opens
  useEffect(() => {
    if (isOpen && !isLoading) {
      if (audioSettings.selectedDeviceId) {
        setSelectedMicrophone(audioSettings.selectedDeviceId);
      }
      
      // If browser supports speaker selection
      if (devices.audioOutput && devices.audioOutput.length > 0) {
        const defaultSpeaker = localStorage.getItem('preferred-speaker-device') || devices.audioOutput[0].deviceId;
        setSelectedSpeaker(defaultSpeaker);
      }
      
      if (videoSettings.selectedDeviceId) {
        setSelectedCamera(videoSettings.selectedDeviceId);
      }
    }
  }, [isOpen, isLoading, devices, audioSettings, videoSettings]);

  const handleSave = () => {
    if (selectedMicrophone) {
      audioSettings.selectDevice(selectedMicrophone);
    }
    
    if (selectedCamera) {
      videoSettings.selectDevice(selectedCamera);
    }
    
    // Handle speaker selection if browser supports it
    if (selectedSpeaker && typeof HTMLMediaElement.prototype.setSinkId === 'function') {
      localStorage.setItem('preferred-speaker-device', selectedSpeaker);
      // Note: Actual speaker setting would need to be applied to specific audio elements
    }
    
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-slate-800 text-white border-slate-700 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Settings</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-6 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mx-auto mb-2"></div>
            <p>Loading devices...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Audio settings */}
            <div>
              <h3 className="font-medium mb-2">Audio</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="microphone">Microphone</Label>
                  <Select 
                    value={selectedMicrophone} 
                    onValueChange={setSelectedMicrophone}
                  >
                    <SelectTrigger id="microphone" className="bg-slate-700 border-slate-600">
                      <SelectValue placeholder="Select microphone" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-700 border-slate-600">
                      {devices.audioInput?.map((device) => (
                        <SelectItem key={device.deviceId} value={device.deviceId}>
                          {device.label || `Microphone ${device.deviceId.slice(0, 5)}`}
                        </SelectItem>
                      ))}
                      {!devices.audioInput?.length && (
                        <SelectItem value="none" disabled>No microphones found</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="speaker">Speaker</Label>
                  <Select 
                    value={selectedSpeaker} 
                    onValueChange={setSelectedSpeaker}
                    disabled={!devices.audioOutput?.length}
                  >
                    <SelectTrigger id="speaker" className="bg-slate-700 border-slate-600">
                      <SelectValue placeholder="Select speaker" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-700 border-slate-600">
                      {devices.audioOutput?.map((device) => (
                        <SelectItem key={device.deviceId} value={device.deviceId}>
                          {device.label || `Speaker ${device.deviceId.slice(0, 5)}`}
                        </SelectItem>
                      ))}
                      {!devices.audioOutput?.length && (
                        <SelectItem value="none" disabled>No speakers found</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Video settings */}
            <div>
              <h3 className="font-medium mb-2">Video</h3>
              <div className="space-y-2">
                <Label htmlFor="camera">Camera</Label>
                <Select 
                  value={selectedCamera} 
                  onValueChange={setSelectedCamera}
                >
                  <SelectTrigger id="camera" className="bg-slate-700 border-slate-600">
                    <SelectValue placeholder="Select camera" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-700 border-slate-600">
                    {devices.videoInput?.map((device) => (
                      <SelectItem key={device.deviceId} value={device.deviceId}>
                        {device.label || `Camera ${device.deviceId.slice(0, 5)}`}
                      </SelectItem>
                    ))}
                    {!devices.videoInput?.length && (
                      <SelectItem value="none" disabled>No cameras found</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button 
                variant="outline" 
                onClick={onClose}
                className="bg-slate-700 hover:bg-slate-600 border-slate-600"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSave}
                className="bg-blue-500 hover:bg-blue-600"
              >
                Save
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
