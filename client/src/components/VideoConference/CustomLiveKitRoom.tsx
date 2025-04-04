import { ReactNode, useState, useEffect, useRef, createContext, useContext } from 'react';
import {
  RoomEvent,
  Room,
  ConnectionState,
  RoomOptions,
  Participant,
  TrackPublication,
  Track,
  RemoteTrack,
  LocalTrack
} from 'livekit-client';

// Создаем нашу собственную реализацию createDefaultRoom
function createDefaultRoom(options?: RoomOptions): Room {
  return new Room(options);
}

// Создаём контекст вручную, так как экспорт из библиотеки не работает
// Используем другое имя для контекста, чтобы избежать конфликтов
export const CustomLiveKitContext = createContext<Room | null>(null);

// Хук для использования LiveKit комнаты в других компонентах
export const useRoomContext = () => {
  return useContext(CustomLiveKitContext);
};

interface CustomLiveKitRoomProps {
  children: ReactNode;
  serverUrl: string;
  token: string;
  connect?: boolean;
  options?: RoomOptions;
  onError?: (error: Error) => void;
  onConnected?: (room: Room) => void;
  onDisconnected?: () => void;
  roomName?: string;
  video?: boolean;
  audio?: boolean;
}

/**
 * Кастомная обертка для LiveKitRoom, которая решает проблемы стабильности
 * видеопотоков и обрабатывает специфические сценарии подключения
 */
export default function CustomLiveKitRoom({
  children,
  serverUrl,
  token,
  connect = true,
  options,
  onError,
  onConnected,
  onDisconnected,
  roomName,
  video = true,
  audio = true
}: CustomLiveKitRoomProps) {
  // Явно типизируем все переменные и параметры для устранения TypeScript ошибок
  // Используем ref для хранения комнаты, чтобы избежать проблем с жизненным циклом
  const roomRef = useRef<Room | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [trackSubscriptions, setTrackSubscriptions] = useState<Map<string, TrackPublication>>(
    new Map()
  );
  
  // Эта функция проверяет все треки и их состояния
  const verifyTracks = (room: Room) => {
    if (!room) {
      console.log('TRACK VERIFICATION ERROR: No room available');
      return;
    }
    
    console.log('Verifying tracks in room...', room.name);
    
    // Проверяем локального участника
    if (room.localParticipant) {
      const localParticipant = room.localParticipant;
      const localTracks = localParticipant.getTrackPublications();
      console.log('Local participant tracks:', localTracks.length);
      
      // Проверка общего состояния устройств
      if ((video && !localParticipant.isCameraEnabled) || 
          (audio && !localParticipant.isMicrophoneEnabled)) {
        console.log('DEVICE STATE MISMATCH:', {
          shouldEnableVideo: video,
          shouldEnableAudio: audio,
          actualVideoEnabled: localParticipant.isCameraEnabled,
          actualAudioEnabled: localParticipant.isMicrophoneEnabled,
          identity: localParticipant.identity,
          participantSid: localParticipant.sid,
          participantIdentity: localParticipant.identity
        });
      }
      
      // Подсчет активных треков для диагностики
      const videoTracks = localTracks.filter(pub => 
        pub.kind === 'video' && pub.track?.source === Track.Source.Camera);
      const audioTracks = localTracks.filter(pub => 
        pub.kind === 'audio' && pub.track?.source === Track.Source.Microphone);
      
      // Проверка треков по типам
      if (video && videoTracks.length === 0) {
        console.log('CAMERA TRACK MISSING! Attempting to enable camera...');
        // Камера должна быть включена, но треков нет
        localParticipant.setCameraEnabled(true)
          .then(pub => {
            if (pub) {
              console.log('CAMERA RECOVERY SUCCESSFUL:', {
                sid: pub.trackSid,
                hasTrack: !!pub.track,
                muted: pub.isMuted
              });
            } else {
              console.log('CAMERA RECOVERY FAILED: No publication returned');
            }
          })
          .catch(err => console.error('FAILED TO ENABLE CAMERA:', err));
      }
      
      // Проверка каждого трека
      localTracks.forEach(pub => {
        console.log('Local track:', {
          sid: pub.trackSid,
          kind: pub.kind,
          source: pub.track?.source,
          muted: pub.isMuted,
          hasTrack: !!pub.track
        });
        
        if (!pub.track) {
          console.log('TRACK DATA MISSING for publication:', {
            sid: pub.trackSid,
            kind: pub.kind,
            isEnabled: pub.isEnabled,
            isMuted: pub.isMuted,
            isSubscribed: pub.isSubscribed
          });
          
          // Для видео треков, которые должны быть активны, пробуем восстановить
          if (pub.kind === 'video' && video) {
            console.log('VIDEO TRACK DATA MISSING - attempting recovery');
            localParticipant.setCameraEnabled(true)
              .catch(err => console.error('TRACK RECOVERY FAILED:', err));
          }
          
          return; // Пропускаем дальнейшую проверку для этого трека
        }
        
        // Проверка видеотрека
        if (pub.kind === 'video' && 
            pub.track.source === Track.Source.Camera) {
            
          // Проверка состояния видеотрека
          if (pub.track.mediaStreamTrack) {
            const trackState = {
              readyState: pub.track.mediaStreamTrack.readyState,
              enabled: pub.track.mediaStreamTrack.enabled,
              muted: pub.track.mediaStreamTrack.muted
            };
            
            if (trackState.readyState !== 'live' || !trackState.enabled) {
              console.log('VIDEO TRACK IN BAD STATE:', trackState);
              
              if (video) {
                console.log('Attempting to recover video track...');
                localParticipant.setCameraEnabled(true)
                  .catch(err => console.error('VIDEO RECOVERY FAILED:', err));
              }
            }
          }
          
          // Если видеотрек заглушен и должен быть включен, пробуем включить
          if (pub.isMuted && video) {
            console.log('Re-enabling muted camera');
            localParticipant.setCameraEnabled(true)
              .catch(err => console.warn('Failed to enable camera:', err));
          }
        }
        
        // Проверка аудиотрека
        if (pub.kind === 'audio' && 
            pub.track.source === Track.Source.Microphone && 
            pub.isMuted && 
            audio) {
          console.log('Re-enabling muted microphone');
          localParticipant.setMicrophoneEnabled(true)
            .catch(err => console.warn('Failed to enable microphone:', err));
        }
      });
      
      // Дополнительная информация о локальном участнике
      console.log('Local participant devices status:', 
        `camera=${localParticipant.isCameraEnabled}`,
        `microphone=${localParticipant.isMicrophoneEnabled}`);
    } else {
      console.log('ERROR: No local participant available for track verification');
    }
    
    // Проверяем удаленных участников - в новых версиях LiveKit нет прямого доступа к списку участников
    // через room.participants, поэтому этот участок кода временно отключен
    /*
    // Примечание: ниже закомментированный код, так как LiveKit API изменился
    // и мы не можем напрямую перебирать участников. Эта функциональность
    // теперь реализована в компоненте ParticipantGrid
    */
  };

  // Настройка и подключение к комнате
  useEffect(() => {
    if (!connect || !token || !serverUrl || isConnecting) return;
    
    // Предотвращаем повторные соединения
    setIsConnecting(true);
    
    // Функция для настройки комнаты
    const setupRoom = async () => {
      try {
        console.log('Setting up LiveKit room connection', {
          serverUrl,
          hasToken: !!token,
          options
        });
        
        // Создаем новую комнату или используем существующую
        let room: Room;
        if (roomRef.current) {
          room = roomRef.current;
          
          // Отключаемся если комната уже подключена
          if (room.state === ConnectionState.Connected) {
            console.log('Disconnecting existing room connection before reconnecting');
            await room.disconnect();
          }
        } else {
          room = createDefaultRoom(options);
          roomRef.current = room;
        }
        
        console.log('Room created:', room.name || 'unnamed');
        
        // Настройка обработчиков событий
        room.once(RoomEvent.Disconnected, () => {
          console.log('Room disconnected');
          if (onDisconnected) onDisconnected();
        });
        
        // Мониторинг трекинга для отладки
        room.on(RoomEvent.TrackPublished, (pub: TrackPublication, participant: Participant) => {
          console.log(`Track published by ${participant.identity}:`, pub.trackSid, pub.kind);
          
          // Добавляем трек в отслеживаемые
          setTrackSubscriptions(prev => {
            const newMap = new Map(prev);
            newMap.set(pub.trackSid, pub);
            return newMap;
          });
        });
        
        room.on(RoomEvent.TrackUnpublished, (pub: TrackPublication, participant: Participant) => {
          console.log(`Track unpublished by ${participant.identity}:`, pub.trackSid);
          
          // Удаляем трек из отслеживаемых
          setTrackSubscriptions(prev => {
            const newMap = new Map(prev);
            newMap.delete(pub.trackSid);
            return newMap;
          });
        });
        
        room.on(RoomEvent.TrackSubscribed, 
          (track: RemoteTrack | LocalTrack, pub: TrackPublication, participant: Participant) => {
            console.log(`Subscribed to ${track.kind} track from ${participant.identity}:`, pub.trackSid);
            
            // Если трек видео, убеждаемся что он видим
            if (track.kind === 'video') {
              console.log('Video track subscribed:', {
                trackSid: pub.trackSid,
                hasElements: track.attachedElements?.length || 0,
                source: track.source
              });
              
              // В редких случаях LiveKit не корректно определяет, подписаны ли мы на трек
              setTimeout(() => {
                if (track.attachedElements?.length === 0) {
                  console.log('Video track has no attached elements, attempting to re-attach');
                  // Переподписка на треки - эта функциональность больше не поддерживается
                  // в новой версии LiveKit, поэтому просто логируем сообщение
                  console.log('Track resubscription not supported in this version of LiveKit');
                  // В ParticipantTile реализовано ручное прикрепление видеотрека
                }
              }, 1000);
            }
        });
        
        room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
          console.log('Room connection state changed:', state);
        });
        
        // Особый обработчик ошибок API
        room.on(RoomEvent.MediaDevicesError, (error: Error) => {
          console.error('Media devices error:', error);
          if (onError) onError(error);
        });
        
        // Подключаемся к комнате
        console.log('Connecting to LiveKit room...');
        await room.connect(serverUrl, token, {
          autoSubscribe: true,  // Автоматически подписываться на треки
        });
        console.log('Connected to LiveKit room successfully');
        
        // Дополнительные действия после подключения
        if (room.localParticipant) {
          console.log('Local participant:', {
            identity: room.localParticipant.identity,
            sid: room.localParticipant.sid
          });
          
          // Включаем камеру и микрофон при необходимости
          // с небольшой задержкой для стабильности
          setTimeout(async () => {
            try {
              if (video && !room.localParticipant.isCameraEnabled) {
                console.log('Enabling camera...');
                await room.localParticipant.setCameraEnabled(true);
              }
              
              if (audio && !room.localParticipant.isMicrophoneEnabled) {
                console.log('Enabling microphone...');
                await room.localParticipant.setMicrophoneEnabled(true);
              }
              
              console.log('Local participant devices status:',
                `camera=${room.localParticipant.isCameraEnabled}`,
                `microphone=${room.localParticipant.isMicrophoneEnabled}`
              );
              
              // Проверяем треки через 1 секунду
              setTimeout(() => verifyTracks(room), 1000);
              
              // И еще раз через 3 секунды для большей надежности
              setTimeout(() => verifyTracks(room), 3000);
            } catch (err) {
              console.error('Error enabling devices:', err);
            }
          }, 500);
        }
        
        // Уведомляем родительский компонент о подключении
        if (onConnected) onConnected(room);
        
        // Настраиваем интервал для периодической проверки треков
        const checkInterval = setInterval(() => {
          if (room.state === ConnectionState.Connected) {
            verifyTracks(room);
          } else {
            clearInterval(checkInterval);
          }
        }, 10000); // Проверяем каждые 10 секунд
        
        // Очистка интервала при размонтировании
        return () => {
          clearInterval(checkInterval);
        };
      } catch (error) {
        console.error('Error connecting to LiveKit room:', error);
        if (onError && error instanceof Error) {
          onError(error);
        }
      } finally {
        setIsConnecting(false);
      }
    };
    
    // Запускаем подключение
    setupRoom();
    
    // Очистка при размонтировании
    return () => {
      const room = roomRef.current;
      if (room && room.state === ConnectionState.Connected) {
        console.log('Disconnecting from room on unmount');
        room.disconnect();
      }
    };
  }, [connect, token, serverUrl, options, onConnected, onDisconnected, onError, video, audio]);

  // Рендерим контекст LiveKit и дочерние компоненты
  return (
    <CustomLiveKitContext.Provider value={roomRef.current || createDefaultRoom()}>
      {children}
    </CustomLiveKitContext.Provider>
  );
}