import { 
  ParticipantTile, 
  useParticipants, 
  useTracks,
  VideoTrack,
  TrackReferenceOrPlaceholder
} from '@livekit/components-react';
import { Track, Participant, Room } from 'livekit-client';
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useSlots } from '../../hooks/use-slots';

/**
 * Основной контейнер сетки видео
 * Разделяем логику на контейнер и сам грид для оптимизации перерисовок
 */
export function CustomVideoGrid() {
  const participants = useParticipants();
  const [currentLocalParticipant] = participants.filter(p => p.isLocal);
  
  // Используем хук для синхронизации слотов с реальным идентификатором
  const userIdentity = currentLocalParticipant?.identity || 'unknown-user';
  console.log('Local participant identity:', userIdentity);
  const slotsManager = useSlots(userIdentity);
  
  // Автоматически выбираем слот для локального участника при подключении
  useEffect(() => {
    if (currentLocalParticipant && slotsManager.connected && !slotsManager.userSlot) {
      // Находим первый свободный слот
      for (let i = 0; i < 12; i++) {
        const slotNumber = i + 1;
        if (!slotsManager.slots[slotNumber]) {
          slotsManager.selectSlot(slotNumber);
          break;
        }
      }
    }
  }, [currentLocalParticipant, slotsManager.connected, slotsManager.userSlot]);
  
  // Создаем мапу для участников
  const participantsMap = useMemo(() => {
    const map = new Map<string, Participant>();
    participants.forEach(p => {
      map.set(p.identity, p);
      console.log(`Найден участник: ${p.identity}, isLocal: ${p.isLocal}`);
    });
    return map;
  }, [participants]);
  
  // Debug
  useEffect(() => {
    if (slotsManager.connected) {
      console.log('Slots state:', Object.entries(slotsManager.slots));
      console.log('User slot:', slotsManager.userSlot);
    }
  }, [slotsManager.slots, slotsManager.userSlot, slotsManager.connected]);

  // Принудительно отображаем локального участника в его слоте
  // даже если в мапе слотов не совпадают идентификаторы
  useEffect(() => {
    if (currentLocalParticipant && slotsManager.userSlot && slotsManager.connected) {
      // Добавляем текущего участника принудительно в его слот
      slotsManager.slots[slotsManager.userSlot] = currentLocalParticipant.identity;
      console.log(`Принудительное обновление: слот ${slotsManager.userSlot} для ${currentLocalParticipant.identity}`);
    }
  }, [currentLocalParticipant, slotsManager.userSlot, slotsManager.connected]);
  
  // Обработчик клика по пустому слоту
  const handleSlotClick = useCallback((slotNumber: number) => {
    if (slotsManager.connected) {
      slotsManager.selectSlot(slotNumber);
    }
  }, [slotsManager]);

  // Логируем рендер контейнера
  console.log('[RENDER] CustomVideoGrid контейнер - перерисовывается при любых изменениях состояния');
  
  // Рендерим мемоизированный grid для предотвращения перерисовки
  // при изменении только состояния камеры
  return (
    <div className="h-full w-full p-4">
      <MemoizedVideoGrid 
        slots={slotsManager.slots}
        userSlot={slotsManager.userSlot}
        participantsMap={participantsMap}
        currentLocalParticipant={currentLocalParticipant}
        onSlotClick={handleSlotClick}
        cameraStates={slotsManager.cameraStates}
        lastUpdatedCamera={slotsManager.lastUpdatedCamera}
        cameraUpdateTimestamp={slotsManager.cameraUpdateTimestamp}
      />
    </div>
  );
}

/**
 * Мемоизированный компонент самой сетки - изолирует перерисовки
 * Этот компонент перерисовывается только при изменении слотов или участников,
 * но не при изменении состояния камер
 */
const MemoizedVideoGrid = React.memo(
  function VideoGrid({
    slots,
    userSlot,
    participantsMap,
    currentLocalParticipant,
    onSlotClick,
    cameraStates,
    lastUpdatedCamera,
    cameraUpdateTimestamp
  }: {
    slots: Record<number, string>;
    userSlot: number | null;
    participantsMap: Map<string, Participant>;
    currentLocalParticipant: Participant | undefined;
    onSlotClick: (slotNumber: number) => void;
    cameraStates: Record<string, boolean>;
    lastUpdatedCamera?: string;
    cameraUpdateTimestamp?: number;
  }) {
    // Создаем сетку из 12 слотов
    const slotNumbers = useMemo(() => {
      return Array.from({ length: 12 }, (_, i) => i + 1);
    }, []);

    console.log('[RENDER] MemoizedVideoGrid - должен перерисовываться ТОЛЬКО при изменении слотов или участников');

    return (
      <div className="video-grid">
        {slotNumbers.map((slotNumber: number) => {
          // Получаем ID пользователя, занимающего слот
          const userId = slots[slotNumber];
          // Проверяем, является ли этот слот слотом текущего локального участника
          const isCurrentUserSlot = userSlot === slotNumber && currentLocalParticipant;
          // Получаем объект участника по ID или локального участника для его слота
          const participant = isCurrentUserSlot 
            ? currentLocalParticipant 
            : (userId ? participantsMap.get(userId) : undefined);
            
          // Проверяем, требуется ли обновление этой камеры
          const needsUpdate = userId && lastUpdatedCamera === userId && cameraUpdateTimestamp;
          const updateKey = needsUpdate ? `update-${cameraUpdateTimestamp}` : '';
          
          return participant ? (
            <ParticipantSlot 
              key={`slot-${slotNumber}-${updateKey}`}
              participant={participant}
              slotNumber={slotNumber}
              cameraOn={cameraStates[userId] || false}
            />
          ) : (
            <EmptySlot 
              key={`empty-${slotNumber}`} 
              index={slotNumber - 1}
              onClick={() => onSlotClick(slotNumber)}
            />
          );
        })}
      </div>
    );
  },
  // Специальный компаратор, который игнорирует изменения только в cameraStates
  (prevProps, nextProps) => {
    // Проверяем изменения в слотах
    const slotsEqual = Object.keys(prevProps.slots).length === Object.keys(nextProps.slots).length &&
      Object.keys(prevProps.slots).every(k => {
        const key = Number(k);
        return prevProps.slots[key] === nextProps.slots[key];
      });
    
    // Проверяем изменение userSlot
    const userSlotEqual = prevProps.userSlot === nextProps.userSlot;
    
    // Проверяем изменение размера карты участников
    const participantsMapSizeEqual = prevProps.participantsMap.size === nextProps.participantsMap.size;
    
    // Проверяем изменение локального участника
    const localParticipantEqual = 
      (!prevProps.currentLocalParticipant && !nextProps.currentLocalParticipant) ||
      (prevProps.currentLocalParticipant && nextProps.currentLocalParticipant &&
       prevProps.currentLocalParticipant.identity === nextProps.currentLocalParticipant.identity);
    
    // Если все ключевые значения равны, то не перерисовываем
    const shouldNotUpdate = slotsEqual && userSlotEqual && participantsMapSizeEqual && localParticipantEqual;
    
    if (!shouldNotUpdate) {
      console.log('[GRID CHANGE] Причина перерисовки сетки:', 
        !slotsEqual ? 'изменились слоты' : 
        !userSlotEqual ? 'изменился userSlot' : 
        !participantsMapSizeEqual ? 'изменилось количество участников' : 
        !localParticipantEqual ? 'изменился локальный участник' : 'неизвестная причина');
    }
    
    // Перерисовываем, если изменилось базовое расположение участников
    return shouldNotUpdate === true;
  }
);

/**
 * Интерфейс для пропсов слота участника
 */
interface ParticipantSlotProps {
  participant: Participant;
  slotNumber: number;
  cameraOn: boolean;
}

/**
 * Компонент для отображения одного участника 
 * Обернут в React.memo для предотвращения лишних перерисовок
 */
const ParticipantSlot = React.memo(
  ({ participant, slotNumber, cameraOn }: ParticipantSlotProps) => {
    // Отслеживаем перерисовки
    console.log(`[RENDER] ParticipantSlot ${slotNumber} для ${participant.identity} с камерой ${cameraOn ? 'ON' : 'OFF'}`);
    
    // Получаем только неизменяемые иммутабельные пропсы для стабильности рендеринга
    const isLocal = participant.isLocal;
    const identity = participant.identity;
    
    // Получаем видеотреки участника
    const videoTracks = useTracks(
      [Track.Source.Camera],
      { onlySubscribed: true }
    ).filter(track => track.participant.identity === identity);
    
    const hasVideo = videoTracks.length > 0 && cameraOn;

    return (
      <div className="video-slot relative overflow-hidden rounded-xl shadow-md bg-slate-800 border border-slate-700">
        {/* Отображаем видео, только если оно есть */}
        {hasVideo ? (
          <div className="h-full w-full relative flex items-center justify-center">
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
  // Сравниваем только необходимые пропсы
  (prevProps, nextProps) => {
    return (
      prevProps.slotNumber === nextProps.slotNumber &&
      prevProps.participant.identity === nextProps.participant.identity &&
      prevProps.participant.isLocal === nextProps.participant.isLocal &&
      prevProps.cameraOn === nextProps.cameraOn
    );
  }
);

/**
 * Компонент для отображения пустого слота
 */
const EmptySlot = React.memo(({ index, onClick }: { index: number; onClick?: () => void }) => {
  console.log(`[RENDER] EmptySlot ${index + 1}`);
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
