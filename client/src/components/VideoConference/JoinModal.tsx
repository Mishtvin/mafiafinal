import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useState } from "react";

interface JoinModalProps {
  isOpen: boolean;
  onJoin: (username: string, audioEnabled: boolean, videoEnabled: boolean) => void;
}

export default function JoinModal({ isOpen, onJoin }: JoinModalProps) {
  const [username, setUsername] = useState('');
  const [enableVideo, setEnableVideo] = useState(true);
  const [enableAudio, setEnableAudio] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim()) {
      return;
    }
    
    setIsSubmitting(true);
    onJoin(username, enableAudio, enableVideo);
  };

  return (
    <Dialog open={isOpen} modal>
      <DialogContent className="bg-slate-800 text-white border-slate-700 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Join MafiaLive</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="username">Your Name</Label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your name"
              required
              className="bg-slate-700 border-slate-600 focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="video" 
                checked={enableVideo} 
                onCheckedChange={(checked) => setEnableVideo(checked as boolean)}
              />
              <Label htmlFor="video" className="cursor-pointer">Enable video</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="audio" 
                checked={enableAudio} 
                onCheckedChange={(checked) => setEnableAudio(checked as boolean)}
              />
              <Label htmlFor="audio" className="cursor-pointer">Enable audio</Label>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button 
              type="submit" 
              disabled={!username.trim() || isSubmitting}
              className="px-6 py-2 bg-blue-500 hover:bg-blue-600 font-medium"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin mr-2 h-4 w-4 border-2 border-b-transparent border-white rounded-full"></div>
                  Joining...
                </>
              ) : (
                "Join Now"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
