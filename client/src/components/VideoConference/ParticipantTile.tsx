import { 
  ParticipantContext, 
  VideoTrack, 
  useParticipant, 
  AudioTrack 
} from '@livekit/components-react';
import { Participant, Track } from 'livekit-client';
import { useState, useEffect } from 'react';

interface ParticipantTileProps {
  participant: Participant;
}

export default function ParticipantTile({ participant }: ParticipantTileProps) {
  const {
    cameraPublication,
    microphonePublication,
    screenSharePublication,
    isLocal,
    metadata,
  } = useParticipant(participant);

  const isCameraEnabled = !!cameraPublication?.isSubscribed && !cameraPublication?.isMuted;
  const isMicrophoneEnabled = !!microphonePublication?.isSubscribed && !microphonePublication?.isMuted;

  // Handle screen share if present
  const videoTrack = screenSharePublication?.isSubscribed && !screenSharePublication?.isMuted
    ? screenSharePublication.track
    : cameraPublication?.track;

  const displayName = participant.name || participant.identity;
  const firstLetter = displayName.charAt(0).toUpperCase();

  return (
    <div className="relative h-64 md:h-full rounded-lg overflow-hidden bg-slate-800 border border-slate-700 flex flex-col items-center justify-center">
      {/* Video container */}
      <div className="absolute inset-0 bg-black">
        {isCameraEnabled ? (
          <VideoTrack
            trackRef={videoTrack}
            className="h-full w-full object-cover"
            trackSid={cameraPublication?.trackSid ?? ''}
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <span className="material-icons text-6xl text-gray-600">videocam_off</span>
          </div>
        )}
      </div>
      
      {/* Audio track (hidden) */}
      {microphonePublication?.track && (
        <AudioTrack trackRef={microphonePublication.track} />
      )}
      
      {/* Participant info overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="h-6 w-6 rounded-full bg-blue-500 flex items-center justify-center text-xs font-medium">
              <span>{firstLetter}</span>
            </div>
            <span className="font-medium">{displayName}{isLocal ? ' (You)' : ''}</span>
          </div>
          
          <div className="flex space-x-1">
            <span className="material-icons text-sm">{isMicrophoneEnabled ? 'mic' : 'mic_off'}</span>
            <span className="material-icons text-sm">{isCameraEnabled ? 'videocam' : 'videocam_off'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
