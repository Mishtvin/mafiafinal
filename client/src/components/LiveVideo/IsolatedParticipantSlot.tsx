import React from 'react';
import { Participant } from 'livekit-client';
import { IsolatedVideoTrack } from './IsolatedVideoTrack';

interface ParticipantSlotProps {
  participant: Participant;
  slotNumber: number;
}

/**
 * Изолированный компонент слота участника
 * Мемоизирован для предотвращения лишних перерисовок  
 */
export const IsolatedParticipantSlot = React.memo(
  ({ participant, slotNumber }: ParticipantSlotProps) => {
    // Получаем неизменяемые пропсы
    const isLocal = participant.isLocal;
    const identity = participant.identity;
    
    console.log(`[PARTICIPANT_SLOT] Рендер слота ${slotNumber} для ${identity}, isLocal: ${isLocal}`);
    
    return (
      <div className="video-slot relative overflow-hidden rounded-xl shadow-md bg-slate-800 border border-slate-700">
        {/* Изолированный видеотрек, который обновляется независимо */}
        <IsolatedVideoTrack participant={participant} />
        
        {/* Номер слота в левом нижнем углу */}
        <div 
          className={`absolute bottom-2 left-2 py-0.5 px-2 rounded-md text-xs text-white font-medium backdrop-blur-sm z-10 
            ${isLocal ? 'bg-purple-700/90' : 'bg-slate-900/80'}`}
        >
          {slotNumber === 12 ? "Ведучий" : slotNumber}
        </div>
        
        {/* Имя пользователя рядом с номером слота */}
        <div className="absolute bottom-2 left-8 bg-slate-900/80 py-0.5 px-2 rounded-md text-xs text-white font-medium backdrop-blur-sm">
          {identity}
        </div>
      </div>
    );
  },
  // Строгий компаратор для сравнения только ключевых свойств
  (prevProps, nextProps) => {
    return (
      prevProps.slotNumber === nextProps.slotNumber &&
      prevProps.participant.identity === nextProps.participant.identity &&
      prevProps.participant.isLocal === nextProps.participant.isLocal
    );
  }
);