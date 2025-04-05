import React, { useMemo, useCallback } from 'react';
import { Participant } from 'livekit-client';
import { useParticipants } from '@livekit/components-react';
import { useSlots } from '../../hooks/use-slots';
import { IsolatedParticipantSlot } from './IsolatedParticipantSlot';
import { CameraProvider } from '../../contexts/CameraContext';
import { CameraController } from './CameraController';
import { CameraToggle } from './CameraToggle';
import { ConnectionIndicator } from './ConnectionIndicator';

/**
 * Компонент для пустого слота
 */
const EmptySlot = React.memo(({ index, onClick }: { index: number; onClick?: () => void }) => {
  return (
    <div 
      className="video-slot relative overflow-hidden rounded-xl shadow-inner bg-slate-800/20 border border-slate-700/30 cursor-pointer"
      onClick={onClick}
    >
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
        </div>
      </div>
      {/* Только номер слота для пустого слота */}
      <div className="absolute bottom-2 left-2 bg-slate-900/80 py-0.5 px-2 rounded-md text-xs text-white font-medium backdrop-blur-sm z-10">
        {index + 1 === 12 ? "Ведучий" : index + 1}
      </div>
    </div>
  );
});

/**
 * Основной компонент сетки видео с изолированным состоянием камер
 */
export const IsolatedVideoGrid = React.memo(() => {
  const participants = useParticipants();
  const [currentLocalParticipant] = participants.filter(p => p.isLocal);
  
  // Получаем идентификатор текущего пользователя
  const userIdentity = currentLocalParticipant?.identity || 'unknown-user';
  const slotsManager = useSlots(userIdentity);
  
  console.log('[ISOLATED_GRID] Рендер основной сетки, всего участников:', participants.length);
  
  // Создаем мапу участников для быстрого доступа
  const participantsMap = useMemo(() => {
    console.log('[ISOLATED_GRID] Создание новой мапы участников');
    const map = new Map<string, Participant>();
    participants.forEach(p => {
      map.set(p.identity, p);
    });
    return map;
  }, [participants]);
  
  // Обработчик клика по пустому слоту
  const handleSlotClick = useCallback((slotNumber: number) => {
    if (slotsManager.connected) {
      slotsManager.selectSlot(slotNumber);
    }
  }, [slotsManager]);
  
  // Создаем массив слотов для сетки 4x3
  const slotNumbers = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => i + 1);
  }, []);
  
  return (
    <CameraProvider localParticipantId={userIdentity}>
      {/* Контроллер камеры для обработки событий */}
      <CameraController userId={userIdentity} />
      
      {/* Индикатор соединения */}
      <ConnectionIndicator />
      
      {/* Кнопка переключения камеры в боковой панели */}
      <CameraToggle />
      
      {/* Сетка видео */}
      <div className="h-full w-full p-4">
        <div className="video-grid">
          {slotNumbers.map((slotNumber) => {
            // Получаем ID пользователя из слота
            const userId = slotsManager.slots[slotNumber];
            
            // Если это слот текущего пользователя, используем локального участника
            const isCurrentUserSlot = slotsManager.userSlot === slotNumber && currentLocalParticipant;
            
            // Получаем объект участника из мапы или локального участника
            const participant = isCurrentUserSlot 
              ? currentLocalParticipant 
              : (userId ? participantsMap.get(userId) : undefined);
            
            // Мемоизируем каждый отдельный рендер слота для оптимизации
            return useMemo(() => {
              console.log(`[ISOLATED_GRID] Создание слота ${slotNumber}, есть ли участник:`, !!participant);
              
              return participant ? (
                <IsolatedParticipantSlot 
                  key={`slot-${slotNumber}`}
                  participant={participant}
                  slotNumber={slotNumber}
                />
              ) : (
                <EmptySlot 
                  key={`empty-${slotNumber}`} 
                  index={slotNumber - 1}
                  onClick={() => handleSlotClick(slotNumber)}
                />
              );
            }, [participant, slotNumber, handleSlotClick]);
          })}
        </div>
      </div>
    </CameraProvider>
  );
});