import { 
  ParticipantTile, 
  useParticipants, 
  useTracks,
  VideoTrack
} from '@livekit/components-react';
import { Track, Participant } from 'livekit-client';
import React, { useEffect, useState } from 'react';

/**
 * Компонент сетки видео 4x3 для отображения до 12 участников
 */
export function CustomVideoGrid() {
  const participants = useParticipants();
  const [slots, setSlots] = useState<React.ReactNode[]>([]);
  
  // Максимальное количество слотов в сетке
  const MAX_SLOTS = 12;
  
  // Обновляем слоты при изменении количества участников
  useEffect(() => {
    // Генерируем набор из 12 слотов
    const newSlots = [];
    
    // Заполняем слоты доступными участниками
    for (let i = 0; i < MAX_SLOTS; i++) {
      const participant = participants[i];
      
      if (participant) {
        // Создаем слот с участником
        newSlots.push(
          <ParticipantSlot 
            key={participant.identity} 
            participant={participant} 
          />
        );
      } else {
        // Создаем пустой слот
        newSlots.push(
          <EmptySlot key={`empty-${i}`} index={i} />
        );
      }
    }
    
    setSlots(newSlots);
  }, [participants]);

  return (
    <div className="h-full p-4">
      <div className="grid grid-cols-4 grid-rows-3 gap-4 h-full">
        {slots}
      </div>
    </div>
  );
}

/**
 * Компонент для отображения одного участника
 */
function ParticipantSlot({ participant }: { participant: Participant }) {
  // Получаем видеотрек камеры участника
  const videoTrack = useTracks([Track.Source.Camera], { participantIdentity: participant.identity })[0];
  
  return (
    <div className="relative overflow-hidden rounded-lg bg-slate-800 h-full">
      {videoTrack ? (
        <VideoTrack 
          trackRef={videoTrack}
          className="h-full w-full object-cover"
          participantIdentity={participant.identity}
        />
      ) : (
        <div className="flex items-center justify-center h-full">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-12 w-12 text-slate-600" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={1} 
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" 
            />
          </svg>
        </div>
      )}
      <div className="absolute bottom-2 left-2 bg-slate-900/70 py-1 px-2 rounded text-xs text-white">
        {participant.identity}
      </div>
    </div>
  );
}

/**
 * Компонент для отображения пустого слота
 */
function EmptySlot({ index }: { index: number }) {
  return (
    <div className="relative overflow-hidden rounded-lg bg-slate-800/30 border border-slate-700/50 h-full">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center justify-center text-slate-600">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-10 w-10 mb-2" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={1} 
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" 
            />
          </svg>
          <span className="text-xs">Слот {index + 1}</span>
        </div>
      </div>
    </div>
  );
}