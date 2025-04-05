import { 
  ParticipantTile, 
  useParticipants, 
  useTracks,
  VideoTrack
} from '@livekit/components-react';
import { Track, Participant, Room } from 'livekit-client';
import React, { useEffect, useState } from 'react';
import { useSlots } from '../../hooks/use-slots';

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
    <div className="h-full w-full p-4">
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
            />
          ) : (
            <EmptySlot 
              key={`empty-${slotNumber}`} 
              index={slotNumber - 1}
              onClick={() => handleSlotClick(slotNumber)}
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
function ParticipantSlot({ participant, slotNumber }: { participant: Participant, slotNumber: number }) {
  // Получаем список видеотреков
  const videoTracks = useTracks(
    [Track.Source.Camera],
    { onlySubscribed: true }
  ).filter(track => track.participant.identity === participant.identity);
  
  const hasVideo = videoTracks.length > 0;
  const slotsManager = useSlots(participant.identity);

  // Состояния для поддержки drag and drop
  const [isDragging, setIsDragging] = useState(false);
  
  // Обработчики событий drag and drop
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', participant.identity);
    e.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
    
    // Добавляем класс для стилизации при перетаскивании
    e.currentTarget.classList.add('dragging');
    
    // Создаем и отображаем красивую превью для перетаскивания
    try {
      const previewDiv = document.createElement('div');
      previewDiv.className = 'drag-preview';
      previewDiv.textContent = `${participant.identity} (Слот ${slotNumber})`;
      previewDiv.style.cssText = `
        position: absolute; 
        left: -9999px;
        background-color: rgba(30, 41, 59, 0.8);
        color: white;
        border-radius: 8px;
        padding: 10px;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        pointer-events: none;
        z-index: 9999;
      `;
      document.body.appendChild(previewDiv);
      e.dataTransfer.setDragImage(previewDiv, 75, 25);
      setTimeout(() => {
        document.body.removeChild(previewDiv);
      }, 0);
    } catch (error) {
      console.log('Error creating drag preview:', error);
    }
  };
  
  const handleDragEnd = (e: React.DragEvent) => {
    setIsDragging(false);
    e.currentTarget.classList.remove('dragging');
  };
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drop-target');
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('drop-target');
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drop-target');
    
    const draggedUserId = e.dataTransfer.getData('text/plain');
    
    // Перемещаем пользователя на новый слот
    if (draggedUserId && draggedUserId !== participant.identity) {
      console.log(`Перемещаем пользователя ${draggedUserId} в слот ${slotNumber}`);
      slotsManager.moveUserToSlot(slotNumber, draggedUserId);
    }
  };
  
  return (
    <div 
      className={`video-slot relative overflow-hidden rounded-xl shadow-md bg-slate-800 border border-slate-700 ${isDragging ? 'opacity-50' : ''}`}
      draggable="true"
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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
      {/* Номер слота в левом нижнем углу */}
      <div 
        className={`absolute bottom-2 left-2 py-0.5 px-2 rounded-md text-xs text-white font-medium backdrop-blur-sm z-10 
          ${participant.isLocal ? 'bg-purple-700/90' : 'bg-slate-900/80'}`}
      >
        {slotNumber === 12 ? "Ведучий" : slotNumber}
      </div>
      
      {/* Имя пользователя рядом с номером слота */}
      <div className="absolute bottom-2 left-8 bg-slate-900/80 py-0.5 px-2 rounded-md text-xs text-white font-medium backdrop-blur-sm">
        {participant.identity}
      </div>
      
      {/* Индикатор перетаскивания */}
      {isDragging && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
          <div className="text-white font-medium">Перетаскивание...</div>
        </div>
      )}
    </div>
  );
}

/**
 * Компонент для отображения пустого слота
 */
function EmptySlot({ index, onClick }: { index: number, onClick?: () => void }) {
  const slotNumber = index + 1;
  const participants = useParticipants();
  const slotsManager = useSlots('');
  
  // Обработчики drag-and-drop для пустого слота
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drop-target');
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('drop-target');
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drop-target');
    
    const draggedUserId = e.dataTransfer.getData('text/plain');
    
    // Если получен идентификатор пользователя, перемещаем его в этот пустой слот
    if (draggedUserId) {
      console.log(`Перемещаем пользователя ${draggedUserId} в слот ${slotNumber}`);
      slotsManager.moveUserToSlot(slotNumber, draggedUserId);
    }
  };
  
  return (
    <div 
      className="video-slot relative overflow-hidden rounded-xl shadow-inner bg-slate-800/20 border border-slate-700/30 
                cursor-pointer hover:border-slate-500/50 transition-colors"
      onClick={onClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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
        {slotNumber === 12 ? "Ведучий" : slotNumber}
      </div>
      
      {/* Визуальная подсказка для drag-and-drop */}
      <div className="absolute inset-0 bg-slate-900/20 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
        <div className="text-white text-xs font-medium bg-slate-900/60 py-1 px-3 rounded-full">
          Перетащите сюда участника
        </div>
      </div>
    </div>
  );
}