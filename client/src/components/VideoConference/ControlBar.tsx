import { 
  useLocalParticipant,
  useMicrophoneToggle,
  useCameraToggle,
  useScreenShareToggle
} from '@livekit/components-react';

interface ControlBarProps {
  onLeave: () => void;
}

export default function ControlBar({ onLeave }: ControlBarProps) {
  const { localParticipant } = useLocalParticipant();
  const { 
    toggle: toggleMicrophone, 
    isEnabled: isMicrophoneEnabled 
  } = useMicrophoneToggle();
  const { 
    toggle: toggleCamera, 
    isEnabled: isCameraEnabled 
  } = useCameraToggle();
  const { 
    toggle: toggleScreenShare, 
    isScreenShareEnabled 
  } = useScreenShareToggle();

  return (
    <div className="flex justify-center space-x-2 md:space-x-4">
      <button 
        className={`p-3 rounded-full ${isMicrophoneEnabled ? 'bg-slate-700 hover:bg-slate-600' : 'bg-red-500 hover:bg-red-600'} transition-colors`}
        onClick={toggleMicrophone}
        title={isMicrophoneEnabled ? 'Mute' : 'Unmute'}
      >
        <span className="material-icons">
          {isMicrophoneEnabled ? 'mic' : 'mic_off'}
        </span>
      </button>

      <button 
        className={`p-3 rounded-full ${isCameraEnabled ? 'bg-slate-700 hover:bg-slate-600' : 'bg-red-500 hover:bg-red-600'} transition-colors`}
        onClick={toggleCamera}
        title={isCameraEnabled ? 'Stop video' : 'Start video'}
      >
        <span className="material-icons">
          {isCameraEnabled ? 'videocam' : 'videocam_off'}
        </span>
      </button>

      <button 
        className={`p-3 rounded-full ${isScreenShareEnabled ? 'bg-blue-500 hover:bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'} transition-colors`}
        onClick={toggleScreenShare}
        title={isScreenShareEnabled ? 'Stop sharing' : 'Share screen'}
      >
        <span className="material-icons">
          {isScreenShareEnabled ? 'stop_screen_share' : 'screen_share'}
        </span>
      </button>

      <button 
        className="p-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
        onClick={onLeave}
        title="Leave room"
      >
        <span className="material-icons">call_end</span>
      </button>
    </div>
  );
}
