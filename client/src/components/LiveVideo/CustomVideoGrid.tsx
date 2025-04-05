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
    <div className="h-full p-5">
      <div className="grid grid-cols-4 grid-rows-3 gap-5 h-full">
        {slots}
      </div>
    </div>
  );
}

/**
 * Компонент для отображения одного участника
 */
function ParticipantSlot({ participant }: { participant: Participant }) {
  // Получаем список видеотреков
  const videoTracks = useTracks(
    [Track.Source.Camera],
    { onlySubscribed: true }
  ).filter(track => track.participant.identity === participant.identity);
  
  const hasVideo = videoTracks.length > 0;
  
  return (
    <div className="relative overflow-hidden rounded-xl shadow-md bg-slate-800 h-full border border-slate-700">
      {hasVideo ? (
        <div className="h-full w-full relative">
          {/* Здесь мы используем первый найденный трек */}
          <VideoTrack 
            trackRef={videoTracks[0]}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 ring-1 ring-white/10"></div>
        </div>
      ) : (
        <div className="flex items-center justify-center h-full">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-14 w-14 text-slate-500" 
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
      <div className="absolute bottom-3 left-3 bg-slate-900/80 py-1 px-3 rounded-md text-sm text-white font-medium backdrop-blur-sm">
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
    <div className="relative overflow-hidden rounded-xl shadow-inner bg-slate-800/20 border border-slate-700/30 h-full">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center justify-center">
          <div className="bg-slate-800/40 p-3 rounded-full mb-2">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-12 w-12 text-slate-500" 
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
          <div className="bg-slate-800/60 px-3 py-1 rounded-md">
            <span className="text-sm font-medium text-slate-400">Слот {index + 1}</span>
          </div>
        </div>
      </div>
    </div>
  );
}