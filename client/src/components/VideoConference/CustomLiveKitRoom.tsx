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
  
  // Отслеживаем состояние каждого активного трека
  const trackStatsRef = useRef(new Map<string, {
    lastActive: number;
    restartAttempts: number;
    frozen: boolean;
    bytesReceived: number;
    bytesSent: number;
  }>());
  
  // Функция для проверки состояния трека по его SID
  const checkTrackHealth = async (track: any, pub: TrackPublication) => {
    try {
      // Только видеотреки
      if (track.kind !== 'video') return;
      
      const trackSid = pub.trackSid;
      let trackStats = trackStatsRef.current.get(trackSid);
      
      if (!trackStats) {
        // Инициализируем статистику для нового трека
        trackStats = {
          lastActive: Date.now(),
          restartAttempts: 0,
          frozen: false,
          bytesReceived: 0,
          bytesSent: 0
        };
        trackStatsRef.current.set(trackSid, trackStats);
      }
      
      // Получаем статистику, если возможно
      let currentBytes = 0;
      try {
        // Так как getStats не гарантированно существует на всех треках,
        // проверяем наличие метода перед вызовом
        if ('getStats' in track && typeof (track as any).getStats === 'function') {
          const stats = await (track as any).getStats();
          if (stats && Array.isArray(stats)) {
            stats.forEach((stat: any) => {
              // Для локальных треков важен bytesSent, для удаленных - bytesReceived
              if ('bytesSent' in stat && typeof stat.bytesSent === 'number') {
                currentBytes = stat.bytesSent;
              } else if ('bytesReceived' in stat && typeof stat.bytesReceived === 'number') {
                currentBytes = stat.bytesReceived;
              }
            });
          }
        }
      } catch (e) {
        console.warn('Failed to get stats for track', trackSid, e);
      }
      
      // Локальный трек - сравниваем bytesSent
      if (track instanceof LocalTrack) {
        if (currentBytes > trackStats.bytesSent) {
          // Трек активен, обновляем статус
          if (trackStats.frozen) {
            console.log(`Track ${trackSid} is no longer frozen. Data is flowing again.`);
            trackStats.frozen = false;
          }
          trackStats.lastActive = Date.now();
          trackStats.bytesSent = currentBytes;
        } else if (!trackStats.frozen && (Date.now() - trackStats.lastActive > 3000)) {
          // Если трек не отправляет данные более 3 секунд, считаем его замороженным
          console.warn(`Local track ${trackSid} appears to be frozen (no bytes sent in 3+ seconds).`);
          trackStats.frozen = true;
          
          // Пытаемся перезапустить трек
          if (trackStats.restartAttempts < 3 && roomRef.current?.localParticipant) {
            trackStats.restartAttempts++;
            console.log(`Attempting to restart frozen camera track (attempt ${trackStats.restartAttempts})...`);
            
            try {
              await roomRef.current.localParticipant.setCameraEnabled(false);
              setTimeout(async () => {
                if (roomRef.current?.localParticipant) {
                  await roomRef.current.localParticipant.setCameraEnabled(true);
                  console.log('Camera track restarted after freeze');
                }
              }, 1000);
            } catch (err) {
              console.error('Failed to restart frozen camera track:', err);
            }
          }
        }
      }
      // Удаленный трек - сравниваем bytesReceived
      else if (track instanceof RemoteTrack) {
        if (currentBytes > trackStats.bytesReceived) {
          // Трек активен, обновляем статус
          if (trackStats.frozen) {
            console.log(`Remote track ${trackSid} is no longer frozen. Data is flowing again.`);
            trackStats.frozen = false;
          }
          trackStats.lastActive = Date.now();
          trackStats.bytesReceived = currentBytes;
        } else if (!trackStats.frozen && (Date.now() - trackStats.lastActive > 5000)) {
          // Для удаленных треков даем больший таймаут - 5 секунд
          console.warn(`Remote track ${trackSid} appears to be frozen (no bytes received in 5+ seconds).`);
          trackStats.frozen = true;
          
          // Для удаленных треков пытаемся переподписаться
          if (track.attachedElements && track.attachedElements.length > 0) {
            console.log('Attempting to reattach frozen remote track...');
            const elements = [...track.attachedElements];
            elements.forEach(el => {
              track.detach(el);
              setTimeout(() => {
                try {
                  track.attach(el);
                  console.log('Reattached remote track to element');
                } catch (e) {
                  console.error('Failed to reattach remote track:', e);
                }
              }, 500);
            });
          }
        }
      }
    } catch (err) {
      console.error('Error in track health check:', err);
    }
  };
  
  // Эта функция проверяет все треки и их состояния
  const verifyTracks = (room: Room) => {
    if (!room) return;
    
    console.log('Verifying tracks in room...', room.name);
    
    // Проверяем локального участника
    if (room.localParticipant) {
      const localTracks = room.localParticipant.getTrackPublications();
      console.log('Local participant tracks:', localTracks.length);
      
      localTracks.forEach(pub => {
        console.log('Local track:', {
          sid: pub.trackSid,
          kind: pub.kind,
          source: pub.track?.source,
          muted: pub.isMuted,
          hasTrack: !!pub.track
        });
        
        // Проверяем здоровье трека
        if (pub.track) {
          checkTrackHealth(pub.track as any, pub).catch(e => 
            console.warn('Error checking track health:', e)
          );
        }
        
        // Если видеотрек заглушен и должен быть включен, пробуем включить
        if (pub.kind === 'video' && 
            pub.track?.source === Track.Source.Camera && 
            pub.isMuted && 
            video) {
          console.log('Re-enabling muted camera');
          room.localParticipant.setCameraEnabled(true)
            .catch(err => console.warn('Failed to enable camera:', err));
        }
        
        // Если аудиотрек заглушен и должен быть включен, пробуем включить
        if (pub.kind === 'audio' && 
            pub.track?.source === Track.Source.Microphone && 
            pub.isMuted && 
            audio) {
          console.log('Re-enabling muted microphone');
          room.localParticipant.setMicrophoneEnabled(true)
            .catch(err => console.warn('Failed to enable microphone:', err));
        }
      });
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
        
        // Настраиваем интервалы для периодической проверки состояния треков
        // Быстрый интервал для проверки здоровья треков
        const fastCheckInterval = setInterval(() => {
          if (room.state === ConnectionState.Connected) {
            // Проверяем только активные видеотреки, не выводя полный лог
            if (room.localParticipant) {
              const localTracks = room.localParticipant.getTrackPublications();
              localTracks.forEach(pub => {
                if (pub.track && pub.kind === 'video') {
                  checkTrackHealth(pub.track as any, pub).catch(e => 
                    console.warn('Error checking track health in fast interval:', e)
                  );
                }
              });
            }
          } else {
            clearInterval(fastCheckInterval);
          }
        }, 2000); // Быстрая проверка каждые 2 секунды
        
        // Полная проверка всех треков и состояния комнаты
        const fullCheckInterval = setInterval(() => {
          if (room.state === ConnectionState.Connected) {
            verifyTracks(room);
            
            // Дополнительно проверяем общее состояние комнаты
            console.log('Debug Room Status:', {
              name: room.name,
              state: room.state === ConnectionState.Connected ? 'подключено' : 'отключено',
              roomState: room.state,
              numParticipants: room.numParticipants, // В LiveKit нет публичного метода participants, используем numParticipants
              metadata: room.metadata || ''
            });
          } else {
            clearInterval(fullCheckInterval);
            
            // Если комната отключена - пытаемся переподключиться
            if (room.state === ConnectionState.Disconnected) {
              console.log('Room disconnected unexpectedly, attempting to reconnect...');
              // Очищаем статус отслеживания треков
              trackStatsRef.current.clear();
              
              try {
                // Переподключение происходит автоматически через onDisconnected колбэк
                // Отправляем сообщение о необходимости переподключения
                if (onDisconnected) onDisconnected();
              } catch (e) {
                console.error('Error during reconnection attempt:', e);
              }
            }
          }
        }, 5000); // Полная проверка каждые 5 секунд
        
        // Очистка интервалов при размонтировании
        return () => {
          clearInterval(fastCheckInterval);
          clearInterval(fullCheckInterval);
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