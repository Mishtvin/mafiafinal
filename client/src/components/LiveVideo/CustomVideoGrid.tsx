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
      const updatedSlots = {...slotsManager.slots};
      updatedSlots[slotsManager.userSlot] = currentLocalParticipant.identity;
      
      // Проверяем, сколько слотов изменилось
      const slotEntries = Object.entries(updatedSlots);
      console.log(`Сработал эффект принудительного обновления`, slotEntries.length);
      
      console.log(`Принудительное обновление: слот ${slotsManager.userSlot} для ${currentLocalParticipant.identity}`);
    }
  }, [currentLocalParticipant, slotsManager.userSlot, slotsManager.connected, slotsManager.slots]);

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
  
  // Используем общий slotsManager из главного компонента
  const slotsManager = useSlots(participant.identity);
  const [isDragging, setIsDragging] = useState(false);
  
  // Обработчики для drag and drop
  const handleDragStart = (e: React.DragEvent) => {
    // Только локальный пользователь может инициировать перетаскивание
    if (!participant.isLocal) {
      e.preventDefault();
      return;
    }
    
    // Сохраняем информацию о перетаскиваемом слоте
    e.dataTransfer.setData('text/plain', String(slotNumber));
    e.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
    
    // Добавляем информацию, что это локальный пользователь
    e.dataTransfer.setData('application/json', JSON.stringify({
      isLocal: true,
      identity: participant.identity
    }));
  };
  
  const handleDragEnd = () => {
    setIsDragging(false);
  };
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    
    try {
      const draggedSlotNumber = Number(e.dataTransfer.getData('text/plain'));
      
      // Игнорируем перетаскивание на тот же слот
      if (draggedSlotNumber === slotNumber) {
        console.log('Перетаскивание в тот же слот - игнорируем');
        return;
      }
      
      // Только текущий пользователь может инициировать обмен
      if (participant.isLocal) {
        console.log(`Перетаскивание из слота ${draggedSlotNumber} в слот ${slotNumber}`);
        // Вызываем API для обмена местами с флагом dragAndDrop=true
        slotsManager.selectSlot(slotNumber, true);
      } else {
        console.log(`Получено перетаскивание из слота ${draggedSlotNumber} в слот ${slotNumber} - игнорируем`);
      }
    } catch (error) {
      console.error('Ошибка при обработке drag-and-drop:', error);
    } finally {
      setIsDragging(false);
    }
  };

  return (
    <div 
      className={`video-slot relative overflow-hidden rounded-xl shadow-md bg-slate-800 border border-slate-700 ${
        isDragging ? 'opacity-60' : ''
      }`}
      draggable={true}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
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
    </div>
  );
}

/**
 * Компонент для отображения пустого слота
 */
function EmptySlot({ index, onClick }: { index: number, onClick?: () => void }) {
  // Для поддержки drag-n-drop пустых слотов
  const [isDragOver, setIsDragOver] = useState(false);
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };
  
  const handleDragLeave = () => {
    setIsDragOver(false);
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    
    try {
      const draggedSlotNumber = Number(e.dataTransfer.getData('text/plain'));
      console.log(`Перетаскивание из слота ${draggedSlotNumber} в пустой слот ${index + 1}`);
      
      // Проверяем, является ли перетаскиваемый элемент локальным пользователем
      const jsonData = e.dataTransfer.getData('application/json');
      if (jsonData) {
        const data = JSON.parse(jsonData);
        if (data.isLocal) {
          // Если это локальный пользователь, то вызываем стандартный обработчик клика
          if (onClick) onClick();
        } else {
          console.log('Перетаскивание не-локального пользователя - игнорируем');
        }
      } else {
        // Если нет дополнительных данных, то это тоже обрабатываем
        if (onClick) onClick();
      }
    } catch (error) {
      console.error('Ошибка при обработке drag-and-drop в пустой слот:', error);
    } finally {
      setIsDragOver(false);
    }
  };
  
  return (
    <div 
      className={`video-slot relative overflow-hidden rounded-xl shadow-inner bg-slate-800/20 border ${
        isDragOver ? 'border-purple-500/50 ring-2 ring-purple-500/30' : 'border-slate-700/30'
      } cursor-pointer`}
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
        {index + 1 === 12 ? "Ведучий" : index + 1}
      </div>
    </div>
  );
}