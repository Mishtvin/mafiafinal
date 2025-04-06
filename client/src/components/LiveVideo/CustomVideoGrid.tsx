import { 
  ParticipantTile, 
  useParticipants, 
  useTracks,
  VideoTrack
} from '@livekit/components-react';
import { Track, Participant, Room } from 'livekit-client';
import React, { useEffect, useState, DragEvent } from 'react';
import { useSlots } from '../../hooks/use-slots';
import { usePlayerStates } from '../../hooks/use-player-states';

/**
 * Компонент сетки видео 4x3 для отображения до 12 участников
 */
export function CustomVideoGrid() {
  const participants = useParticipants();
  const [currentLocalParticipant] = participants.filter(p => p.isLocal);
  
  // Используем хук для синхронизации слотов с реальным идентификатором
  const userIdentity = currentLocalParticipant?.identity || 'unknown-user';
  console.log('Local participant identity:', userIdentity);
  const slotsManager = useSlots(userIdentity);
  
  // Состояние для drag and drop
  const [draggedUser, setDraggedUser] = useState<{userId: string, slotNumber: number} | null>(null);
  
  // Получаем ссылку на WebSocket из хука useSlots
  const wsRef = slotsManager.wsRef;
  
  // Подключаем хук usePlayerStates для работы с "убитыми" игроками
  const playerStatesManager = usePlayerStates(wsRef, userIdentity);
  
  // Проверяем, является ли текущий пользователь ведущим
  const isHost = slotsManager.userSlot === 12;
  
  // Принудительное обновление компонента при изменении слотов
  const [forceUpdate, setForceUpdate] = useState<number>(0);
  
  // Пересоздаем функцию обновления при изменении слотов
  useEffect(() => {
    console.log('Сработал эффект принудительного обновления', Object.keys(slotsManager.slots).length);
    setForceUpdate(prev => prev + 1);
  }, [slotsManager.slots, slotsManager.userSlot]);
  
  // Обработчик клика по пустому слоту
  const handleSlotClick = (slotNumber: number) => {
    if (slotsManager.connected) {
      slotsManager.selectSlot(slotNumber);
    }
  };
  
  // Обработчики для drag and drop
  const handleDragStart = (e: DragEvent<HTMLDivElement>, userId: string, slotNumber: number) => {
    // Проверяем, является ли текущий пользователь ведущим и разрешено ли ему перемещать участников
    if (isHost) {
      console.log(`Начато перетаскивание пользователя ${userId} из слота ${slotNumber}`);
      setDraggedUser({ userId, slotNumber });
      
      // Устанавливаем данные перетаскивания
      if (e.dataTransfer) {
        e.dataTransfer.setData('userId', userId);
        e.dataTransfer.setData('slotNumber', slotNumber.toString());
        e.dataTransfer.effectAllowed = 'move';
      }
    } else {
      // Если не ведущий, отменяем перетаскивание
      e.preventDefault();
      console.log('Только ведущий может перемещать участников');
    }
  };
  
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (isHost && draggedUser) {
      e.preventDefault(); // Разрешаем сброс
      e.dataTransfer.dropEffect = 'move';
    }
  };
  
  const handleDrop = (e: DragEvent<HTMLDivElement>, targetSlot: number) => {
    e.preventDefault();
    
    if (!isHost || !draggedUser) return;
    
    const userId = e.dataTransfer.getData('userId');
    const sourceSlot = parseInt(e.dataTransfer.getData('slotNumber'));
    
    if (userId && targetSlot !== sourceSlot) {
      console.log(`Перемещение пользователя ${userId} из слота ${sourceSlot} в слот ${targetSlot}`);
      slotsManager.moveUserToSlot(userId, targetSlot);
    }
    
    // Очищаем состояние перетаскивания
    setDraggedUser(null);
  };
  
  const handleDragEnd = () => {
    setDraggedUser(null);
  };
  
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
  
  // Создаем сетку из 12 слотов
  const slotNumbers = Array.from({ length: 12 }, (_, i) => i + 1);
  
  // Создаем мапу для участников в нужных слотах
  // Создаем мапу для всех участников
  const participantsMap = new Map<string, Participant>();
  participants.forEach(p => {
    participantsMap.set(p.identity, p);
    console.log(`Найден участник: ${p.identity}, isLocal: ${p.isLocal}`);
  });
  
  // Добавляем текущего локального участника в мапу слотов
  if (currentLocalParticipant && slotsManager.connected && slotsManager.userSlot) {
    console.log(
      `Принудительно добавляем локального участника в слот ${slotsManager.userSlot}: ${currentLocalParticipant.identity}`
    );
  }
  
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

  return (
    <div className="h-full w-full p-4 relative">
      <div className="video-grid">
        {slotNumbers.map(slotNumber => {
          // Получаем ID пользователя, занимающего слот
          const userId = slotsManager.slots[slotNumber];
          // Проверяем, является ли этот слот слотом текущего локального участника
          const isCurrentUserSlot = slotsManager.userSlot === slotNumber && currentLocalParticipant;
          // Получаем объект участника по ID или локального участника для его слота
          const participant = isCurrentUserSlot 
            ? currentLocalParticipant 
            : (userId ? participantsMap.get(userId) : undefined);
          
          return participant ? (
            <ParticipantSlot 
              key={`slot-${slotNumber}`}
              participant={participant}
              slotNumber={slotNumber}
              isHost={isHost}
              onDragStart={(e: DragEvent<HTMLDivElement>) => handleDragStart(e, participant.identity, slotNumber)}
              onDragOver={slotNumber !== 12 ? handleDragOver : undefined} // Запрещаем дроп в слот 12
              onDrop={slotNumber !== 12 ? (e: DragEvent<HTMLDivElement>) => handleDrop(e, slotNumber) : undefined}
              onDragEnd={handleDragEnd}
              isDraggable={isHost && slotNumber !== 12} // Запрещаем перетаскивать из слота 12
              isKilled={playerStatesManager.isPlayerKilled(participant.identity)}
              playerStatesManager={playerStatesManager}
              slotsManager={slotsManager} // Передаем slotsManager
            />
          ) : (
            <EmptySlot 
              key={`empty-${slotNumber}`} 
              index={slotNumber - 1}
              onClick={() => handleSlotClick(slotNumber)}
              onDragOver={isHost && slotNumber !== 12 ? handleDragOver : undefined} // Запрещаем дроп в слот 12
              onDrop={isHost && slotNumber !== 12 ? (e: DragEvent<HTMLDivElement>) => handleDrop(e, slotNumber) : undefined}
              isDragTarget={isHost && slotNumber !== 12} // Визуальный индикатор только для разрешенных слотов
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * Компонент для отображения одного участника
 */
interface ParticipantSlotProps {
  participant: Participant;
  slotNumber: number;
  isHost?: boolean;
  isDraggable?: boolean;
  isKilled?: boolean;
  playerStatesManager?: any;
  slotsManager?: any; // Добавляем slotsManager
  onDragStart?: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver?: (e: DragEvent<HTMLDivElement>) => void;
  onDrop?: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
}

function ParticipantSlot({ 
  participant, 
  slotNumber,
  isHost = false,
  isDraggable = false,
  isKilled = false,
  playerStatesManager,
  slotsManager, // Добавляем slotsManager
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd
}: ParticipantSlotProps) {
  // Получаем список видеотреков
  const videoTracks = useTracks(
    [Track.Source.Camera],
    { onlySubscribed: true }
  ).filter(track => track.participant.identity === participant.identity);
  
  const hasVideo = videoTracks.length > 0;
  
  // Добавляем стили и атрибуты для drag and drop, но только если пользователь - ведущий
  const dragProps = isDraggable ? {
    draggable: true,
    onDragStart,
    onDragEnd,
  } : {};
  
  // Все слоты могут быть целью для дропа, если пользователь - ведущий
  const dropProps = isHost ? {
    onDragOver,
    onDrop
  } : {};
  
  // Визуальное отображение возможности перетаскивания
  const dragIndicatorClass = isDraggable 
    ? 'ring-2 ring-blue-500/50 hover:ring-blue-500 cursor-grab active:cursor-grabbing' 
    : '';
  
  return (
    <div 
      className={`video-slot relative overflow-hidden rounded-xl shadow-md bg-slate-800 border border-slate-700 ${dragIndicatorClass}`}
      {...dragProps}
      {...dropProps}
    >
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
      
      {/* Индикатор возможности перетаскивания */}
      {isDraggable && (
        <div className="absolute top-2 right-2 bg-blue-500/80 text-white rounded-full p-1 shadow-md">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-4 w-4" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" 
            />
          </svg>
        </div>
      )}
      
      {/* Индикатор "убит" с черепом - разное отображение для своего и чужого видео */}
      {isKilled && participant.isLocal ? (
        // Для локального участника: небольшая метка в углу на красном фоне с белым текстом
        <div className="absolute top-2 left-2 bg-red-600 text-white px-2 py-1 font-bold text-lg rounded-md">
          УБИТ
        </div>
      ) : isKilled && (
        // Для остальных участников: большая диагональная надпись на черном фоне
        <div className="absolute inset-0 bg-black flex items-center justify-center">
          <div className="transform -rotate-45 border-2 border-red-500 text-red-500 text-5xl font-extrabold px-4 py-2">
            УБИТ
          </div>
        </div>
      )}
      
      {/* Кнопки управления состоянием игрока (только для ведущего) */}
      {isHost && slotNumber !== 12 && playerStatesManager && (
        <div className="absolute top-2 left-2 flex space-x-1">
          <button
            className="bg-red-600/80 hover:bg-red-700/90 text-white p-1 rounded-md shadow-md"
            onClick={() => playerStatesManager.killPlayer(participant.identity)}
            title="Отметить как убитого"
          >
            <span>💀</span>
          </button>
          <button
            className="bg-green-600/80 hover:bg-green-700/90 text-white p-1 rounded-md shadow-md"
            onClick={() => playerStatesManager.revivePlayer(participant.identity)}
            title="Отметить как живого"
          >
            <span>❤️</span>
          </button>
          <button
            className="bg-blue-600/80 hover:bg-blue-700/90 text-white p-1 rounded-md shadow-md"
            onClick={() => {
              // Получаем текущее имя без префикса и суффикса
              let currentName = participant.identity;
              
              // Проверяем, не задано ли уже отображаемое имя через slotsManager
              if (slotsManager.displayNames && slotsManager.displayNames[participant.identity]) {
                currentName = slotsManager.displayNames[participant.identity];
              } else {
                // Убираем префикс Player- или Host-
                if (currentName.startsWith('Player-')) {
                  currentName = currentName.substring(7);
                } else if (currentName.startsWith('Host-')) {
                  currentName = currentName.substring(5);
                }
                
                // Убираем суффикс с цифрами (ID) в конце имени
                const lastDashIndex = currentName.lastIndexOf('-');
                if (lastDashIndex > 0) {
                  const afterDash = currentName.substring(lastDashIndex + 1);
                  // Проверяем, что после тире идут только цифры
                  if (/^\d+$/.test(afterDash)) {
                    currentName = currentName.substring(0, lastDashIndex);
                  }
                }
              }
              
              // Запрашиваем новое имя
              const newName = prompt(`Введите новое имя для ${currentName}:`, currentName);
              
              // Если имя не пустое и изменилось
              if (newName && newName.trim() !== '' && newName.trim() !== currentName) {
                console.log(`Переименование пользователя: ${participant.identity} -> ${newName.trim()}`);
                
                // Используем функцию renameUser из slotsManager вместо прямой отправки сообщения
                slotsManager.renameUser(participant.identity, newName.trim());
              }
            }}
            title="Изменить имя пользователя"
          >
            <span>✏️</span>
          </button>
        </div>
      )}
      
      {/* Номер слота в левом нижнем углу */}
      <div 
        className={`absolute bottom-2 left-2 py-0.5 px-2 rounded-md text-xs text-white font-medium backdrop-blur-sm z-10 
          ${participant.isLocal ? 'bg-purple-700/90' : 'bg-slate-900/80'}`}
      >
        {slotNumber === 12 ? "Ведущий" : slotNumber}
      </div>
      
      {/* Имя пользователя рядом с номером слота (с поддержкой отображаемых имен) */}
      <div className={`absolute bottom-2 ${slotNumber === 12 ? 'right-2' : 'left-8'} bg-slate-900/80 py-0.5 px-2 rounded-md text-xs text-white font-medium backdrop-blur-sm`}>
        {/* Проверяем наличие отображаемого имени в slotsManager или извлекаем имя вручную */}
        {(() => {
          // Сначала проверяем, есть ли кастомное отображаемое имя
          if (slotsManager && slotsManager.displayNames && slotsManager.displayNames[participant.identity]) {
            return slotsManager.displayNames[participant.identity];
          }
          
          // Если нет, извлекаем имя вручную из identity
          let cleanName = participant.identity;
          
          // Убираем префикс Player- или Host-
          if (cleanName.startsWith('Player-')) {
            cleanName = cleanName.substring(7);
          } else if (cleanName.startsWith('Host-')) {
            cleanName = cleanName.substring(5);
          }
          
          // Убираем суффикс с цифрами (ID) в конце имени
          const lastDashIndex = cleanName.lastIndexOf('-');
          if (lastDashIndex > 0) {
            const afterDash = cleanName.substring(lastDashIndex + 1);
            // Проверяем, что после тире идут только цифры
            if (/^\d+$/.test(afterDash)) {
              cleanName = cleanName.substring(0, lastDashIndex);
            }
          }
          
          return cleanName;
        })()}
      </div>
    </div>
  );
}

/**
 * Компонент для отображения пустого слота
 */
interface EmptySlotProps {
  index: number;
  onClick?: () => void;
  onDragOver?: (e: DragEvent<HTMLDivElement>) => void;
  onDrop?: (e: DragEvent<HTMLDivElement>) => void;
  isDragTarget?: boolean;
}

function EmptySlot({ index, onClick, onDragOver, onDrop, isDragTarget = false }: EmptySlotProps) {
  // Визуальное отображение возможности дропа
  const dropIndicatorClass = isDragTarget 
    ? 'ring-2 ring-blue-500/30 hover:ring-blue-500/70 hover:bg-blue-500/10' 
    : '';
  
  return (
    <div 
      className={`video-slot relative overflow-hidden rounded-xl shadow-inner bg-slate-800/20 border border-slate-700/30 cursor-pointer ${dropIndicatorClass}`}
      onClick={onClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
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
      
      {/* Если слот может быть целью для дропа, показываем индикатор */}
      {isDragTarget && (
        <div className="absolute top-2 right-2 bg-blue-500/50 text-white rounded-full p-1">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-4 w-4" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M19 13l-7 7-7-7m14-8l-7 7-7-7" 
            />
          </svg>
        </div>
      )}
      
      {/* Только номер слота для пустого слота */}
      <div className="absolute bottom-2 left-2 bg-slate-900/80 py-0.5 px-2 rounded-md text-xs text-white font-medium backdrop-blur-sm z-10">
        {index + 1 === 12 ? "Ведущий" : index + 1}
      </div>
    </div>
  );
}