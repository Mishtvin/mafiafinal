import { useParticipants } from '@livekit/components-react';
import ParticipantTile from './ParticipantTile';

export default function ParticipantGrid() {
  const participants = useParticipants();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 h-full">
      {participants.map((participant) => (
        <ParticipantTile key={participant.sid} participant={participant} />
      ))}
    </div>
  );
}
