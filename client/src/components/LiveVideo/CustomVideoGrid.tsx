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
            slotNumber={i + 1}
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
    <div className="h-full w-full p-4">
      <div className="video-grid">
        {slots}
      </div>
    </div>
  );
}

/**
 * Компонент для отображения одного участника
 */
function ParticipantSlot({ participant, slotNumber }: { participant: Participant, slotNumber: number }) {
  // Получаем список видеотреков
  const videoTracks = useTracks(
    [Track.Source.Camera],
    { onlySubscribed: true }
  ).filter(track => track.participant.identity === participant.identity);
  
  const hasVideo = videoTracks.length > 0;
  
  return (
    <div className="video-slot relative overflow-hidden rounded-xl shadow-md bg-slate-800 border border-slate-700">
      {hasVideo ? (
        <div className="h-full w-full relative flex items-center justify-center">
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
      )}
      {/* Номер слота в левом нижнем углу */}
      <div className="absolute bottom-2 left-2 bg-slate-900/80 py-0.5 px-2 rounded-md text-xs text-white font-medium backdrop-blur-sm z-10">
        {slotNumber}
      </div>
      
      {/* Имя пользователя рядом с номером слота */}
      <div className="absolute bottom-2 left-8 bg-slate-900/80 py-0.5 px-2 rounded-md text-xs text-white font-medium backdrop-blur-sm">
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
    <div className="video-slot relative overflow-hidden rounded-xl shadow-inner bg-slate-800/20 border border-slate-700/30">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center justify-center">
          <div className="bg-slate-800/40 p-2 rounded-full mb-1">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-10 w-10 text-slate-500" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={1} 
                d="M12 4v16m8-8H4" 
              />
            </svg>
          </div>
          <div className="bg-slate-800/60 px-2 py-0.5 rounded-md">
            <span className="text-xs font-medium text-slate-400">Ожидание</span>
          </div>
        </div>
      </div>
      {/* Только номер слота для пустого слота */}
      <div className="absolute bottom-2 left-2 bg-slate-900/80 py-0.5 px-2 rounded-md text-xs text-white font-medium backdrop-blur-sm z-10">
        {index + 1}
      </div>
    </div>
  );
}