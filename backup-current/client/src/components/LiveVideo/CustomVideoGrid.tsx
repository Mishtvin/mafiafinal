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
  // ВНИМАНИЕ: Не используем метод напрямую для предотвращения циклов
  useEffect(() => {
    if (currentLocalParticipant && slotsManager.userSlot && slotsManager.connected) {
      // Проверяем, нужно ли обновление
      const needsUpdate = slotsManager.slots[slotsManager.userSlot] !== currentLocalParticipant.identity;
      
      if (needsUpdate) {
        console.log(`Принудительное обновление: слот ${slotsManager.userSlot} для ${currentLocalParticipant.identity}`);
        // Не модифицируем slotsManager.slots напрямую!
        // Вместо этого явно регистрируем пользователя
        slotsManager.registerUser();
      }
    }
  }, [currentLocalParticipant, slotsManager]);
  
  // Обработчик клика по пустому слоту
  const handleSlotClick = useCallback((slotNumber: number) => {
    if (slotsManager.connected) {
      slotsManager.selectSlot(slotNumber);
    }
  }, [slotsManager]);

  // Логируем рендер контейнера
  console.log('[RENDER] CustomVideoGrid контейнер - перерисовывается при любых изменениях состояния');
  
  // Получаем все видео треки для проверки локальной камеры
  const localVideoTracks = useTracks(
    [Track.Source.Camera],
    { onlySubscribed: false }
  ).filter(track => track.participant.isLocal);
  
  // Определяем, включена ли локальная камера, даже если это еще не отражено в cameraStates
  const localCameraEnabled = localVideoTracks.length > 0 && localVideoTracks[0].publication.isEnabled;
  
  // Принудительно синхронизируем локальную камеру в cameraStates
  // НО! Только когда мы точно знаем состояние камеры (она включена)
  // Если камера выключена, мы не обновляем состояние, чтобы избежать моргания
  useEffect(() => {
    if (currentLocalParticipant) {
      const localUserId = currentLocalParticipant.identity;
      const currentSavedState = slotsManager.cameraStates[localUserId];
      
      // Синхронизируем ТОЛЬКО если камера реально ВКЛЮЧЕНА
      // Если камера выключена по LiveKit API, но была включена в нашем состоянии,
      // мы не меняем наше состояние - это может быть временная задержка публикации
      if (localCameraEnabled && localCameraEnabled !== currentSavedState) {
        console.log(`Синхронизируем включенную локальную камеру: ${localCameraEnabled ? 'включена' : 'выключена'}`);
        // Синхронизируем состояние без отправки WebSocket сообщений
        slotsManager.setCameraEnabled(localCameraEnabled);
      }
    }
  }, [currentLocalParticipant, localCameraEnabled, slotsManager]);

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
        localCameraEnabled={localCameraEnabled}
      />
    </div>
  );
}

/**
 * Мемоизированный компонент каждого слота, который обновляется отдельно
 * Эта оптимизация предотвращает перерисовку всей сетки при изменении состояния одной камеры
 */
const MemoizedSlot = React.memo(
  function SingleSlot({
    slotNumber,
    userId,
    isCurrentUserSlot,
    currentLocalParticipant,
    participantsMap,
    cameraStates,
    localCameraEnabled,
    lastUpdatedCamera,
    cameraUpdateTimestamp,
    onSlotClick
  }: {
    slotNumber: number;
    userId?: string;
    isCurrentUserSlot: boolean;
    currentLocalParticipant?: Participant;
    participantsMap: Map<string, Participant>;
    cameraStates: Record<string, boolean>;
    localCameraEnabled: boolean;
    lastUpdatedCamera?: string;
    cameraUpdateTimestamp?: number;
    onSlotClick: (slotNumber: number) => void;
  }) {
    // Получаем объект участника по ID или локального участника для его слота
    const participant = isCurrentUserSlot 
      ? currentLocalParticipant 
      : (userId ? participantsMap.get(userId) : undefined);
      
    // Проверка наличия участника - нужна для типизации
    if (!participant) {
      return (
        <EmptySlot 
          key={`empty-${slotNumber}`}
          index={slotNumber - 1}
          onClick={() => onSlotClick(slotNumber)}
        />
      );
    }

    // Определяем, включена ли камера
    // Особый случай для локального участника: используем локальное состояние
    const cameraOn: boolean = isCurrentUserSlot 
      ? localCameraEnabled 
      : (userId ? cameraStates[userId] || false : false);
          
    // Проверяем, требуется ли обновление этой камеры
    const needsUpdate = userId && lastUpdatedCamera === userId && cameraUpdateTimestamp;
    const updateKey = needsUpdate ? `update-${cameraUpdateTimestamp}` : '';
    
    // Для отладки - показываем, когда слот был перерисован
    // console.log(`[RENDER] MemoizedSlot ${slotNumber} ${participant ? 'с участником' : 'пустой'}`);

    if (participant) {
      return (
        <ParticipantSlot 
          key={`slot-${slotNumber}-${updateKey}`}
          participant={participant}
          slotNumber={slotNumber}
          cameraOn={cameraOn}
        />
      );
    } else {
      return (
        <EmptySlot 
          key={`empty-${slotNumber}`}
          index={slotNumber - 1}
          onClick={() => onSlotClick(slotNumber)}
        />
      );
    }
  },
  // Оптимизированный компаратор для отдельного слота
  (prevProps, nextProps) => {
    // Если изменился номер слота или участника - обновляем
    if (prevProps.slotNumber !== nextProps.slotNumber) return false;
    
    // Если в одном случае есть ID, а в другом нет - обновляем
    if (Boolean(prevProps.userId) !== Boolean(nextProps.userId)) return false;
    
    // Если ID разные - обновляем
    if (prevProps.userId !== nextProps.userId) return false;
    
    // Если это локальный слот и изменилось состояние локальной камеры - обновляем
    if (prevProps.isCurrentUserSlot && prevProps.localCameraEnabled !== nextProps.localCameraEnabled) return false;

    // Для этого конкретного слота обновляем, если его камера изменилась
    if (prevProps.userId && nextProps.userId && 
        prevProps.userId === nextProps.lastUpdatedCamera) {
      const prevCameraState = prevProps.cameraStates[prevProps.userId] || false;
      const nextCameraState = nextProps.cameraStates[nextProps.userId] || false;
      if (prevCameraState !== nextCameraState) return false;
    }
    
    // По умолчанию не обновляем
    return true;
  }
);

/**
 * Мемоизированный компонент самой сетки - теперь использует мемоизированные слоты
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
    cameraUpdateTimestamp,
    localCameraEnabled
  }: {
    slots: Record<number, string>;
    userSlot: number | null;
    participantsMap: Map<string, Participant>;
    currentLocalParticipant: Participant | undefined;
    onSlotClick: (slotNumber: number) => void;
    cameraStates: Record<string, boolean>;
    lastUpdatedCamera?: string;
    cameraUpdateTimestamp?: number;
    localCameraEnabled: boolean;
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
          const isCurrentUserSlot = userSlot === slotNumber && Boolean(currentLocalParticipant);
          
          return (
            <MemoizedSlot
              key={`slot-container-${slotNumber}`}
              slotNumber={slotNumber}
              userId={userId}
              isCurrentUserSlot={isCurrentUserSlot}
              currentLocalParticipant={currentLocalParticipant}
              participantsMap={participantsMap}
              cameraStates={cameraStates}
              localCameraEnabled={localCameraEnabled}
              lastUpdatedCamera={lastUpdatedCamera}
              cameraUpdateTimestamp={cameraUpdateTimestamp}
              onSlotClick={onSlotClick}
            />
          );
        })}
      </div>
    );
  },
  // Специальный компаратор, который теперь проверяет только базовые изменения структуры сетки
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
    
    // Теперь перерисовываем только при структурных изменениях сетки
    const shouldNotUpdate = slotsEqual && userSlotEqual && participantsMapSizeEqual && localParticipantEqual;
    
    if (!shouldNotUpdate) {
      console.log('[GRID CHANGE] Причина перерисовки сетки:', 
        !slotsEqual ? 'изменились слоты' : 
        !userSlotEqual ? 'изменился userSlot' : 
        !participantsMapSizeEqual ? 'изменилось количество участников' : 
        !localParticipantEqual ? 'изменился локальный участник' : 
        'неизвестная причина');
    }
    
    // Перерисовываем только при структурных изменениях
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
      { onlySubscribed: isLocal ? false : true }
    ).filter(track => track.participant.identity === identity);
    
    // Явное логирование для отладки
    if (isLocal) {
      console.log(`Локальный участник ${identity}: треков ${videoTracks.length}, cameraOn=${cameraOn}`);
      if (videoTracks.length > 0) {
        console.log(`Статус публикации: ${videoTracks[0].publication.isEnabled ? 'включена' : 'выключена'}`);
      }
    }
    
    // Для локального участника дополнительно проверяем трек напрямую
    const hasVideo = videoTracks.length > 0 && (isLocal ? videoTracks[0].publication.isEnabled : cameraOn);

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
          {identity} {isLocal ? '(Вы)' : ''}
        </div>
      </div>
    );
  },
  // Сравниваем только необходимые пропсы, включая состояние камеры
  // Этот компаратор определяет, когда компонент должен обновиться
  (prevProps, nextProps) => {
    // Базовое сравнение идентификации слота
    const slotSame = prevProps.slotNumber === nextProps.slotNumber;
    const idSame = prevProps.participant.identity === nextProps.participant.identity;
    const localSame = prevProps.participant.isLocal === nextProps.participant.isLocal;
    
    // Самое главное сравнение - состояние камеры
    const cameraSame = prevProps.cameraOn === nextProps.cameraOn;
    
    // Если что-то изменилось - перерисовываем
    const shouldUpdate = !(slotSame && idSame && localSame && cameraSame);
    
    if (shouldUpdate) {
      console.log(`[SLOT UPDATE] ${prevProps.slotNumber} - причина:`, 
        !slotSame ? 'изменился номер слота' :
        !idSame ? 'изменился идентификатор участника' :
        !localSame ? 'изменился статус local' :
        !cameraSame ? 'изменилось состояние камеры' : 'неизвестная причина');
    }
    
    // В React.memo true означает "НЕ обновлять", false - "обновить"
    return !shouldUpdate;
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
