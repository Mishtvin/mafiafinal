import { useMemo, useEffect, useState } from "react";
import ParticipantTile from "./ParticipantTileV3";
import { Participant, Track, ConnectionState } from "livekit-client";
// Используем наш кастомный хук контекста
import { useRoomContext } from "./CustomLiveKitRoom";

/**
 * Улучшенный компонент ParticipantGrid с дополнительной логикой стабилизации видео
 * и оптимизацией для правильной работы с треками участников
 */
export default function ParticipantGrid() {
  // Используем стандартный хук для получения комнаты
  const room = useRoomContext();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [localParticipant, setLocalParticipant] = useState<Participant | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  // Используем эффект для подключения вручную к handleRoomConnection
  useEffect(() => {
    if (!room) return;
    
    // Импортируем функцию из родительского компонента
    try {
      // Добавляем логику активации видео для локального участника
      if (room.localParticipant && !room.localParticipant.isCameraEnabled) {
        room.localParticipant.setCameraEnabled(true).catch(e => {
          console.error("Error enabling camera:", e);
        });
      }
    } catch (e) {
      console.error("Error in room setup:", e);
    }
    
    // Установка начального состояния
    console.log("Room connection state:", room.state);
    setIsConnected(room.state === ConnectionState.Connected);
    
    // Если есть локальный участник, добавляем его
    if (room.localParticipant) {
      setLocalParticipant(room.localParticipant);
    }
    
    // Получаем начальный список участников
    const remoteParticipants: Participant[] = [];
    // В новой версии LiveKit нет room.participants, но есть другие методы
    // для получения участников
    
    // Комбинируем с локальным участником, если он есть
    const allParticipants = room.localParticipant 
      ? [...remoteParticipants] 
      : remoteParticipants;
    
    setParticipants(allParticipants);
    
    // Обработчики событий
    const handleConnectionStateChanged = (state: ConnectionState) => {
      console.log("Room connection state changed:", state);
      setIsConnected(state === ConnectionState.Connected);
    };
    
    const handleParticipantConnected = (participant: Participant) => {
      console.log("Participant connected:", participant.identity);
      setParticipants(prev => [...prev, participant]);
    };
    
    const handleParticipantDisconnected = (participant: Participant) => {
      console.log("Participant disconnected:", participant.identity);
      setParticipants(prev => prev.filter(p => p.sid !== participant.sid));
    };
    
    const handleLocalParticipantChanged = () => {
      if (room.localParticipant) {
        setLocalParticipant(room.localParticipant);
      }
    };
    
    // Подписываемся на события
    room.on('connectionStateChanged', handleConnectionStateChanged);
    room.on('participantConnected', handleParticipantConnected);
    room.on('participantDisconnected', handleParticipantDisconnected);
    
    // Очистка при размонтировании
    return () => {
      room.off('connectionStateChanged', handleConnectionStateChanged);
      room.off('participantConnected', handleParticipantConnected);
      room.off('participantDisconnected', handleParticipantDisconnected);
    };
  }, [room]);
  
  // Принудительно убеждаемся, что локальный участник будет обработан особым образом
  // и добавляем дополнительные проверки стабильности
  const sortedParticipants = useMemo(() => {
    console.log("Participant grid rendering with participants:", participants.length);
    
    if (!localParticipant) {
      console.log("No local participant available");
      return [...participants];
    }
    
    // Проверяем, что локальный участник уже доступен в списке участников
    const isLocalParticipantInList = participants.some(p => p.sid === localParticipant.sid);
    console.log("Local participant in participants list:", isLocalParticipantInList);
    
    // Отделяем локального участника от остальных участников
    const remoteParticipants = participants.filter(p => !p.isLocal);
    console.log("Remote participants count:", remoteParticipants.length);
    
    // Диагностика треков для отладки
    for (const p of participants) {
      const videoPubs = p.getTrackPublications()
        .filter(pub => pub.kind === 'video');
      
      if (videoPubs.length > 0) {
        console.log(`Participant ${p.identity} video tracks:`, videoPubs.map(pub => ({
          sid: pub.trackSid,
          source: pub.track?.source,
          muted: pub.isMuted,
          hasTrack: !!pub.track
        })));
      } else {
        console.log(`Participant ${p.identity} has no video tracks`);
      }
    }
    
    // Сортируем удаленных участников: сначала с включенной камерой, потом с выключенной
    const sortedRemoteParticipants = [...remoteParticipants].sort((a, b) => {
      // Проверяем наличие видеотреков через публикации
      const aPubs = a.getTrackPublications();
      const bPubs = b.getTrackPublications();
      
      // Смотрим, есть ли включенная камера
      const aVideo = aPubs.some(pub => 
        pub.track?.source === Track.Source.Camera && !pub.isMuted
      );
      const bVideo = bPubs.some(pub => 
        pub.track?.source === Track.Source.Camera && !pub.isMuted
      );
      
      if (aVideo && !bVideo) return -1;
      if (!aVideo && bVideo) return 1;
      
      // При равенстве статуса видео сортируем по имени
      return a.identity.localeCompare(b.identity);
    });
    
    // Сначала локальный участник, затем все остальные
    return [localParticipant, ...sortedRemoteParticipants];
  }, [participants, localParticipant]);

  // Определяем макет сетки на основе количества участников
  const gridLayout = useMemo(() => {
    const count = sortedParticipants.length;
    console.log("Calculating grid layout for", count, "participants");
    
    if (count === 1) return "grid-cols-1";
    if (count === 2) return "grid-cols-2";
    if (count <= 4) return "grid-cols-2";
    if (count <= 6) return "grid-cols-3";
    if (count <= 9) return "grid-cols-3";
    if (count <= 12) return "grid-cols-4";
    return "grid-cols-4";
  }, [sortedParticipants.length]);

  // Определяем высоту ячеек на основе количества участников
  const cellHeight = useMemo(() => {
    const count = sortedParticipants.length;
    
    if (count === 1) return "h-full";
    if (count === 2) return "h-full";
    if (count <= 4) return "aspect-video md:h-1/2";
    if (count <= 6) return "aspect-video";
    return "aspect-video";
  }, [sortedParticipants.length]);

  // Если нет подключения, показываем сообщение о подключении
  if (!isConnected) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center p-6 bg-slate-800 rounded-lg shadow-lg">
          <div className="mb-4 text-blue-400 animate-bounce">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="40" 
              height="40" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              className="mx-auto"
            >
              <path d="M5 12h14"></path>
              <path d="M12 5v14"></path>
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">Подключение к конференции...</h3>
          <p className="text-slate-300">Пожалуйста, подождите, устанавливаем соединение</p>
        </div>
      </div>
    );
  }

  // Если нет участников, показываем сообщение об ожидании
  if (sortedParticipants.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center p-6 bg-slate-800 rounded-lg shadow-lg">
          <div className="mb-4 text-blue-400">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="40" 
              height="40" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              className="mx-auto"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">Ожидание участников</h3>
          <p className="text-slate-300">Вы первый в этой конференции</p>
        </div>
      </div>
    );
  }

  // Основной рендер сетки участников
  return (
    <div className={`grid ${gridLayout} gap-2 h-full`}>
      {sortedParticipants.map((participant) => {
        // Находим все видеотреки участника (для отладки)
        const videoTracks = participant.getTrackPublications()
          .filter(pub => pub.kind === 'video' && pub.track?.source === Track.Source.Camera);
        
        const hasVideoTrack = videoTracks.length > 0 && 
                            videoTracks.some(track => !track.isMuted && !!track.track);
                            
        console.log(`Rendering participant ${participant.identity}, has video:`, hasVideoTrack);
        
        return (
          <div key={participant.sid} className={`${cellHeight} overflow-hidden`}>
            <ParticipantTile participant={participant} />
          </div>
        );
      })}
    </div>
  );
}