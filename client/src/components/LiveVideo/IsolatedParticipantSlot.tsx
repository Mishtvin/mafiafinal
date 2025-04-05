import React, { useMemo } from 'react';
import { Participant } from 'livekit-client';
import { IsolatedVideoTrack } from './IsolatedVideoTrack';
import { useSlots } from '../../hooks/use-slots';

interface IsolatedParticipantSlotProps {
  participant: Participant;
  slotNumber: number;
}

/**
 * Компонент для отображения одного слота с участником
 */
export const IsolatedParticipantSlot: React.FC<IsolatedParticipantSlotProps> = ({
  participant,
  slotNumber,
}) => {
  // Проверяем, является ли участник локальным
  const isLocal = participant.isLocal;
  
  console.log(`[PARTICIPANT_SLOT] Рендер слота ${slotNumber} для ${participant.identity}, isLocal: ${isLocal}`);
  
  // Мемоизируем рендер для оптимизации
  const slotContent = useMemo(() => {
    return (
      <div className="video-slot relative overflow-hidden rounded-xl shadow-inner bg-slate-800/20 border border-slate-700/30">
        {/* Видеотрек */}
        <IsolatedVideoTrack 
          participant={participant}
          isLocal={isLocal}
        />
        
        {/* Информация об участнике */}
        <div className="absolute bottom-2 left-2 flex items-center gap-2 z-10">
          {/* Номер слота + имя участника */}
          <div className="bg-slate-900/80 py-0.5 px-2 rounded-md text-xs text-white font-medium backdrop-blur-sm">
            {slotNumber === 12 ? "Ведущий" : slotNumber}
            {participant.name && <span className="ml-1">• {participant.name}</span>}
          </div>
          
          {/* Индикатор локального пользователя */}
          {isLocal && (
            <div className="bg-blue-600/80 py-0.5 px-2 rounded-md text-xs text-white font-medium backdrop-blur-sm">
              Вы
            </div>
          )}
        </div>
      </div>
    );
  }, [participant, slotNumber, isLocal]);
  
  return slotContent;
};