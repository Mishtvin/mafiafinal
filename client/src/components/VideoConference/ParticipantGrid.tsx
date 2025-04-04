import { useMemo } from "react";
import { useParticipants, useLocalParticipant } from "@livekit/components-react";
import ParticipantTile from "./ParticipantTile";
import { Participant, Track } from "livekit-client";

export default function ParticipantGrid() {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  
  // Принудительно убеждаемся, что локальный участник будет обработан особым образом
  const sortedParticipants = useMemo(() => {
    if (!localParticipant) return [...participants];
    
    // Отделяем локального участника от остальных участников
    const remoteParticipants = participants.filter(p => !p.isLocal);
    
    // Сортируем удаленных участников: сначала с включенной камерой, потом с выключенной
    const sortedRemoteParticipants = [...remoteParticipants].sort((a, b) => {
      // Проверяем наличие видеотреков через публикации
      const aPubs = a.getTrackPublications();
      const bPubs = b.getTrackPublications();
      
      // Смотрим, есть ли включенная камера
      const aVideo = aPubs.some(pub => 
        pub.track?.source === Track.Source.Camera && !pub.isMuted
      );
      const bVideo = bPubs.some(pub => 
        pub.track?.source === Track.Source.Camera && !pub.isMuted
      );
      
      if (aVideo && !bVideo) return -1;
      if (!aVideo && bVideo) return 1;
      
      // При равенстве статуса видео сортируем по имени
      return a.identity.localeCompare(b.identity);
    });
    
    // Сначала локальный участник, затем все остальные
    return [localParticipant, ...sortedRemoteParticipants];
  }, [participants, localParticipant]);

  // Определяем макет сетки на основе количества участников
  const gridLayout = useMemo(() => {
    const count = sortedParticipants.length;
    
    if (count === 1) return "grid-cols-1";
    if (count === 2) return "grid-cols-2";
    if (count <= 4) return "grid-cols-2";
    if (count <= 6) return "grid-cols-3";
    if (count <= 9) return "grid-cols-3";
    if (count <= 12) return "grid-cols-4";
    return "grid-cols-4";
  }, [sortedParticipants.length]);

  // Определяем высоту ячеек на основе количества участников
  const cellHeight = useMemo(() => {
    const count = sortedParticipants.length;
    
    if (count === 1) return "h-full";
    if (count === 2) return "h-full";
    if (count <= 4) return "aspect-video";
    if (count <= 6) return "aspect-video";
    return "aspect-video";
  }, [sortedParticipants.length]);

  return (
    <div className={`grid ${gridLayout} gap-2 h-full`}>
      {sortedParticipants.map((participant) => (
        <div key={participant.sid} className={`${cellHeight} overflow-hidden`}>
          <ParticipantTile participant={participant} />
        </div>
      ))}
    </div>
  );
}