import { 
  ParticipantTile, 
  useParticipants, 
  useTracks,
  VideoTrack
} from '@livekit/components-react';
import { Track, Participant, Room } from 'livekit-client';
import React, { useEffect, useState, useRef, DragEvent, useMemo } from 'react';
import { useSlots } from '../../hooks/use-slots';
import { usePlayerStates } from '../../hooks/use-player-states';

/**
 * Компонент сітки відео 4x3 для відображення до 12 учасників
 */
export function CustomVideoGrid() {
  const participants = useParticipants();
  const [currentLocalParticipant] = participants.filter(p => p.isLocal);
  
  // Используем хук для синхронизации слотов с реальным идентификатором
  const userIdentity = currentLocalParticipant?.identity || window.currentUserIdentity || 'unknown-user';
  
  // Сохраняем идентификатор в глобальной переменной для избегания перерендеров
  if (currentLocalParticipant?.identity && window.currentUserIdentity !== currentLocalParticipant.identity) {
    window.currentUserIdentity = currentLocalParticipant.identity;
  }
  
  // Используем useMemo для предотвращения лишних рендеров
  const slotsManager = useSlots(userIdentity);
  
  // Состояние для drag and drop
  const [draggedUser, setDraggedUser] = useState<{userId: string, slotNumber: number} | null>(null);
  
  // Подключаем хук usePlayerStates для работы с "убитыми" игроками
  const playerStatesManager = usePlayerStates(slotsManager.sendMessage, userIdentity);
  
  // Проверяем, является ли текущий пользователь ведущим
  const isHost = slotsManager.userSlot === 12;
  
  // Используем useRef для отслеживания состояния слотов без вызова ре-рендеринга всего компонента
  const slotsRef = React.useRef({
    slots: slotsManager.slots,
    userSlot: slotsManager.userSlot
  });
  
  // Только обновляем ссылку при изменении слотов, без вызова полного перерендеринга
  useEffect(() => {
    // Проверяем, действительно ли изменилось значение, чтобы избежать лишних обновлений
    if (
      JSON.stringify(slotsRef.current.slots) !== JSON.stringify(slotsManager.slots) ||
      slotsRef.current.userSlot !== slotsManager.userSlot
    ) {
      // Отключаем логирование для повышения производительности
      // console.log('Обновление информации о слотах:', Object.keys(slotsManager.slots).length);
      slotsRef.current = {
        slots: slotsManager.slots,
        userSlot: slotsManager.userSlot
      };
      // Не вызываем setForceUpdate, что раньше приводило к полному перерендерингу и зависанию
    }
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
      // Отключаем логирование для повышения производительности
      // console.log(`Начато перетаскивание пользователя ${userId} из слота ${slotNumber}`);
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
      // Отключаем логирование для повышения производительности
      // console.log('Только ведущий может перемещать участников');
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
      // Отключаем логирование для повышения производительности
      // console.log(`Перемещение пользователя ${userId} из слота ${sourceSlot} в слот ${targetSlot}`);
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
    // Отключаем логирование для повышения производительности
    // console.log(`Найден участник: ${p.identity}, isLocal: ${p.isLocal}`);
  });
  
  // Добавляем текущего локального участника в мапу слотов
  if (currentLocalParticipant && slotsManager.connected && slotsManager.userSlot) {
    // Отключаем логирование для повышения производительности
    // console.log(
    //   `Принудительно добавляем локального участника в слот ${slotsManager.userSlot}: ${currentLocalParticipant.identity}`
    // );
  }
  
  // Debug
  useEffect(() => {
    if (slotsManager.connected) {
      // Отключаем логирование для повышения производительности
      // console.log('Slots state:', Object.entries(slotsManager.slots));
      // console.log('User slot:', slotsManager.userSlot);
    }
  }, [slotsManager.slots, slotsManager.userSlot, slotsManager.connected]);

  // Создаем копию слотов с корректным локальным участником для отображения
  // вместо прямого изменения slotsManager.slots
  const slotsWithLocalParticipant = useMemo(() => {
    const slots = {...slotsManager.slots};
    
    if (currentLocalParticipant && slotsManager.userSlot && slotsManager.connected) {
      // Проверяем, нужно ли обновить локальный слот
      if (slots[slotsManager.userSlot] !== currentLocalParticipant.identity) {
        slots[slotsManager.userSlot] = currentLocalParticipant.identity;
        // Отключаем логирование для повышения производительности
        // console.log(`Локальный участник гарантированно добавлен в слот ${slotsManager.userSlot}: ${currentLocalParticipant.identity}`);
      }
    }
    
    return slots;
  }, [currentLocalParticipant, slotsManager.userSlot, slotsManager.connected, slotsManager.slots]);

  return (
    <div className="h-full w-full p-4 relative">
      <div className="video-grid">
        {slotNumbers.map(slotNumber => {
          // Получаем ID пользователя, занимающего слот, из нашей оптимизированной копии слотов
          const userId = slotsWithLocalParticipant[slotNumber];
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
 * Компонент для відображення одного учасника
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
  
  // Референс для хранения состояния последнего обновления видео
  const lastVideoUpdateRef = useRef(Date.now());
  // Референс для счетчика времени без изменения кадра
  const videoFreezeCounterRef = useRef(0);
  // Получаем комнату из контекста LiveKit
  const room = (participant as any).room as Room | undefined;
  
  // Эффект для периодической проверки "замерзания" видео и его перезапуска
  useEffect(() => {
    if (!participant || !hasVideo || !videoTracks[0]) return;
    
    // Функция для проверки и "размораживания" видео
    const checkAndRefreshVideo = () => {
      try {
        // Находим элемент видео по специальному атрибуту data-participant-id
        const videoEl = document.querySelector(`[data-participant-id="${participant.identity}"] video`);
        
        if (videoEl) {
          const videoElement = videoEl as HTMLVideoElement;
          
          // Проверка 1: Обычные ошибки воспроизведения
          if (videoElement.paused || videoElement.readyState < 2) {
            // Отключаем некритическое логирование для повышения производительности
            // console.log(`Видео для ${participant.identity} не воспроизводится, пробуем перезапустить`);
            
            videoElement.play().catch(err => {
              console.warn(`Не удалось возобновить видео для ${participant.identity}:`, err);
            });
          }
          
          // Проверка 2: "Замерзание" видео (не изменяется currentTime)
          const now = Date.now();
          const lastCurrentTime = videoElement.getAttribute('data-last-time');
          const currentTime = videoElement.currentTime.toFixed(2);
          
          // Сохраняем текущее время для следующей проверки
          videoElement.setAttribute('data-last-time', currentTime);
          
          // Если последнее время совпадает с текущим и прошло более 3 секунд
          if (lastCurrentTime === currentTime && now - lastVideoUpdateRef.current > 3000) {
            videoFreezeCounterRef.current += 1;
            
            // Если счетчик превысил порог (3 проверки), пробуем "разморозить" видео
            if (videoFreezeCounterRef.current >= 3) {
              // Оставляем это логирование для важных событий связанных с восстановлением видео
              console.log(`Видео для ${participant.identity} замерзло, пробуем переинициализировать`);
              
              // Сбрасываем счетчик
              videoFreezeCounterRef.current = 0;
              
              // Шаг 1: Пробуем перезапустить воспроизведение
              const mediaStream = videoElement.srcObject as MediaStream;
              
              if (mediaStream) {
                // Временно отключаем источник и снова подключаем
                videoElement.srcObject = null;
                
                // Запускаем таймер для повторного подключения
                setTimeout(() => {
                  if (videoElement) {
                    videoElement.srcObject = mediaStream;
                    videoElement.play().catch(e => console.warn(`Ошибка воспроизведения видео:`, e));
                  }
                }, 50);
              }
              
              // Шаг 2: Если доступно, запрашиваем ключевой кадр (только для удаленных участников)
              if (!participant.isLocal && videoTracks[0]) {
                try {
                  // Пробуем обновить подписку на трек (это может запросить новый ключевой кадр)
                  if (room && room.localParticipant) {
                    room.localParticipant.setTrackSubscriptionPermissions(true);
                  }
                } catch (err) {
                  console.warn(`Ошибка при запросе обновления трека:`, err);
                }
              }
            }
          } else {
            // Сбрасываем счетчик, если время изменилось
            videoFreezeCounterRef.current = 0;
            lastVideoUpdateRef.current = now;
          }
        }
      } catch (err) {
        console.warn(`Ошибка при проверке видео для ${participant?.identity}:`, err);
      }
    };
    
    // Запускаем проверку каждые 6.7 секунд (простое число, чтобы избежать совпадения с другими интервалами)
    const intervalId = setInterval(checkAndRefreshVideo, 6700);
    
    // Очистка при размонтировании
    return () => {
      clearInterval(intervalId);
    };
  }, [participant, hasVideo, videoTracks]);
  
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
            data-participant-id={participant.identity}
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
      
      {/* Індикатор "вбито" з черепом - різне відображення для свого та чужого відео */}
      {isKilled && participant.isLocal ? (
        // Для локального учасника: невелика мітка в куті на червоному фоні з білим текстом
        <div className="absolute top-2 left-2 bg-red-600 text-white px-2 py-1 font-bold text-lg rounded-md">
          ВБИТО
        </div>
      ) : isKilled && (
        // Для інших учасників: велика діагональна надпис на чорному тлі
        <div className="absolute inset-0 bg-black flex items-center justify-center">
          <div className="transform -rotate-45 border-2 border-red-500 text-red-500 text-5xl font-extrabold px-4 py-2">
            ВБИТО
          </div>
        </div>
      )}
      
      {/* Кнопки керування станом гравця (тільки для ведучого) */}
      {isHost && slotNumber !== 12 && playerStatesManager && (
        <div className="absolute top-2 left-2 flex space-x-1">
          <button
            className="bg-red-600/80 hover:bg-red-700/90 text-white p-1 rounded-md shadow-md"
            onClick={() => playerStatesManager.killPlayer(participant.identity)}
            title="Відмітити як вбитого"
          >
            <span>💀</span>
          </button>
          <button
            className="bg-green-600/80 hover:bg-green-700/90 text-white p-1 rounded-md shadow-md"
            onClick={() => playerStatesManager.revivePlayer(participant.identity)}
            title="Відмітити як живого"
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
              
              // Запитуємо нове ім'я
              const newName = prompt(`Введіть нове ім'я для ${currentName}:`, currentName);
              
              // Якщо ім'я не пусте і змінилося
              if (newName && newName.trim() !== '' && newName.trim() !== currentName) {
                // Отключаем логирование для повышения производительности
                // console.log(`Перейменування користувача: ${participant.identity} -> ${newName.trim()}`);
                
                // Використовуємо функцію renameUser із slotsManager замість прямого відправлення повідомлення
                slotsManager.renameUser(participant.identity, newName.trim());
              }
            }}
            title="Змінити ім'я користувача"
          >
            <span>✏️</span>
          </button>
        </div>
      )}
      
      {/* Номер слота у лівому нижньому куті */}
      <div 
        className={`absolute bottom-2 left-2 py-0.5 px-2 rounded-md text-white font-medium backdrop-blur-sm z-10 
          ${participant.isLocal ? 'bg-purple-700/90' : 'bg-slate-900/80'}`}
        style={{ fontSize: '1rem' }}
      >
        {slotNumber === 12 ? "Ведуча" : slotNumber}
      </div>
      
      {/* Ім'я користувача поруч з номером слота (з підтримкою відображуваних імен) */}
      <div className={`absolute bottom-2 ${slotNumber === 12 ? 'right-2' : 'left-8'} bg-slate-900/80 py-0.5 px-2 rounded-md text-white font-medium backdrop-blur-sm`} style={{ fontSize: '1rem' }}>
        {/* Перевіряємо наявність відображуваного імені в slotsManager або видобуваємо ім'я вручну */}
        {(() => {
          // Спочатку перевіряємо, чи є кастомне відображуване ім'я
          if (slotsManager && slotsManager.displayNames && slotsManager.displayNames[participant.identity]) {
            return slotsManager.displayNames[participant.identity];
          }
          
          // Якщо ні, видобуваємо ім'я вручну з identity
          let cleanName = participant.identity;
          
          // Видаляємо префікс Player- або Host-
          if (cleanName.startsWith('Player-')) {
            cleanName = cleanName.substring(7);
          } else if (cleanName.startsWith('Host-')) {
            cleanName = cleanName.substring(5);
          }
          
          // Видаляємо суфікс з цифрами (ID) в кінці імені
          const lastDashIndex = cleanName.lastIndexOf('-');
          if (lastDashIndex > 0) {
            const afterDash = cleanName.substring(lastDashIndex + 1);
            // Перевіряємо, що після тире йдуть тільки цифри
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
 * Компонент для відображення порожнього слота
 */
interface EmptySlotProps {
  index: number;
  onClick?: () => void;
  onDragOver?: (e: DragEvent<HTMLDivElement>) => void;
  onDrop?: (e: DragEvent<HTMLDivElement>) => void;
  isDragTarget?: boolean;
}

function EmptySlot({ index, onClick, onDragOver, onDrop, isDragTarget = false }: EmptySlotProps) {
  // Візуальне відображення можливості дропу
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
      
      {/* Якщо слот може бути ціллю для дропу, показуємо індикатор */}
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
      
      {/* Тільки номер слота для порожнього слота */}
      <div className="absolute bottom-2 left-2 bg-slate-900/80 py-0.5 px-2 rounded-md text-white font-medium backdrop-blur-sm z-10" style={{ fontSize: '1rem' }}>
        {index + 1 === 12 ? "Ведуча" : index + 1}
      </div>
    </div>
  );
}