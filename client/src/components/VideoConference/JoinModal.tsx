import { 
  Dialog, 
  DialogContent, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { randomString } from "@/lib/utils";

interface JoinModalProps {
  isOpen: boolean;
  onJoin: (username: string, audioEnabled: boolean, videoEnabled: boolean) => void;
}

export default function JoinModal({ isOpen, onJoin }: JoinModalProps) {
  const [username, setUsername] = useState(() => `Участник-${randomString(4)}`);
  const [videoEnabled, setVideoEnabled] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onJoin(username, false, videoEnabled);
  };

  return (
    <Dialog open={isOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Присоединиться к конференции</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="username">Ваше имя</Label>
            <Input 
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Введите ваше имя"
              required
            />
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="video-toggle">Включить камеру</Label>
              <Switch 
                id="video-toggle" 
                checked={videoEnabled} 
                onCheckedChange={setVideoEnabled}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button type="submit" className="w-full">
              Присоединиться
            </Button>
          </DialogFooter>
        </form>
        
        <div className="text-xs text-center mt-4 text-gray-500">
          Присоединяясь, вы соглашаетесь с тем, что другие участники конференции будут видеть вас.
        </div>
      </DialogContent>
    </Dialog>
  );
}