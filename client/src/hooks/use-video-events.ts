import { Room, RoomEvent, Track, TrackPublication, RemoteParticipant, LocalParticipant, RemoteTrack, Participant } from 'livekit-client';
import { useCallback, useEffect, useRef } from 'react';
import { debounce, throttle, ConnectionPulse } from '../lib/performance-utils';

/**
 * Тип обработчика события видеопотока
 */
export type VideoEventHandler = (track: Track, publication?: TrackPublication, participant?: Participant) => void;

/**
 * Опции хука для обработки событий видеопотока
 */
export interface UseVideoEventsOptions {
  onTrackSubscribed?: VideoEventHandler;
  onTrackUnsubscribed?: VideoEventHandler;
  onTrackMuted?: VideoEventHandler;
  onTrackUnmuted?: VideoEventHandler;
  onParticipantDisconnected?: (participant: RemoteParticipant) => void;
  onReconnectionNeeded?: () => void;
  onReconnected?: () => void;
  debouncedUpdateDelay?: number; // задержка для debounce в мс
  throttleDelay?: number; // задержка для throttle в мс
}

/**
 * Хук для оптимизированной обработки событий видеопотока с дебаунсингом и троттлингом
 * для предотвращения лишних перерисовок и обработок быстрых последовательных событий
 * 
 * @param room Комната LiveKit
 * @param options Опции обработки событий
 */
export function useVideoEvents(room: Room | null, options: UseVideoEventsOptions = {}) {
  // Храним опции в ref, чтобы иметь доступ к актуальным значениям в замыканиях
  const handlersRef = useRef(options);
  // Обновляем ref при изменении опций
  handlersRef.current = options;
  
  // Ref для пульса соединения
  const connectionPulseRef = useRef<ConnectionPulse | null>(null);

  // Дебаунсированный обработчик событий трека для предотвращения частых обновлений состояния
  const debouncedTrackHandler = useCallback(
    debounce((handler: VideoEventHandler | undefined, track: Track, publication?: TrackPublication, participant?: Participant) => {
      if (handler) {
        handler(track, publication, participant);
      }
    }, options.debouncedUpdateDelay || 150),
    []
  );

  // Троттлированный обработчик для ограничения частоты событий
  const throttledTrackHandler = useCallback(
    throttle((handler: VideoEventHandler | undefined, track: Track, publication?: TrackPublication, participant?: Participant) => {
      if (handler) {
        handler(track, publication, participant);
      }
    }, options.throttleDelay || 200),
    []
  );

  // Обработчик подключения участника
  const handleParticipantConnected = useCallback((participant: RemoteParticipant) => {
    console.log(`Подключен участник: ${participant.identity}`);
    
    // Обработка существующих треков при подключении (они могут уже быть)
    Array.from(participant.trackPublications.values()).forEach(publication => {
      if (publication.track && !publication.isSubscribed) {
        debouncedTrackHandler(
          handlersRef.current.onTrackSubscribed,
          publication.track,
          publication,
          participant
        );
      }
    });

    // Подписываемся на события трека
    participant.on('trackSubscribed', (track: RemoteTrack, publication: TrackPublication) => {
      debouncedTrackHandler(
        handlersRef.current.onTrackSubscribed,
        track,
        publication,
        participant
      );
    });

    participant.on('trackUnsubscribed', (track: RemoteTrack, publication: TrackPublication) => {
      debouncedTrackHandler(
        handlersRef.current.onTrackUnsubscribed,
        track,
        publication,
        participant
      );
    });

    participant.on('trackMuted', (publication: TrackPublication) => {
      if (publication.track) {
        throttledTrackHandler(
          handlersRef.current.onTrackMuted,
          publication.track,
          publication,
          participant
        );
      }
    });

    participant.on('trackUnmuted', (publication: TrackPublication) => {
      if (publication.track) {
        throttledTrackHandler(
          handlersRef.current.onTrackUnmuted,
          publication.track,
          publication,
          participant
        );
      }
    });
  }, [debouncedTrackHandler, throttledTrackHandler]);

  // Обработчик отключения участника
  const handleParticipantDisconnected = useCallback((participant: RemoteParticipant) => {
    console.log(`Отключился участник: ${participant.identity}`);
    if (handlersRef.current.onParticipantDisconnected) {
      handlersRef.current.onParticipantDisconnected(participant);
    }
  }, []);

  // Настройка стратегии переподключения
  const setupReconnection = useCallback(() => {
    if (!room) return;

    // Обработчик отключения
    const handleDisconnected = () => {
      console.log('Комната отключена');
      if (handlersRef.current.onReconnectionNeeded) {
        handlersRef.current.onReconnectionNeeded();
      }
    };

    // Обработчик переподключения
    const handleReconnected = () => {
      console.log('Успешное переподключение к комнате');
      if (handlersRef.current.onReconnected) {
        handlersRef.current.onReconnected();
      }
    };

    // Устанавливаем обработчики событий
    room.on(RoomEvent.Disconnected, handleDisconnected);
    room.on(RoomEvent.Reconnected, handleReconnected);
    
    return () => {
      room.off(RoomEvent.Disconnected, handleDisconnected);
      room.off(RoomEvent.Reconnected, handleReconnected);
    };
  }, [room]);

  // Настройка пульса соединения и keepalive механизма
  const setupConnectionPulse = useCallback(() => {
    if (!room) return;
    
    // Функция проверки состояния соединения и отправки keepalive
    const checkConnection = () => {
      // Проверяем состояние видеотреков
      try {
        const localParticipant = room.localParticipant;
        if (!localParticipant) return;
        
        // Получаем все видеотреки
        const videoTracks = localParticipant.getTrackPublications()
          .filter(track => track.kind === Track.Kind.Video);
        
        // Если есть видеотреки, проверяем их состояние
        if (videoTracks.length > 0) {
          const hasEnabledTracks = videoTracks.some(track => !track.isMuted && track.track);
          
          // Если камера должна быть включена, но треков нет, возможно проблема с соединением
          if (localParticipant.isCameraEnabled && !hasEnabledTracks) {
            console.warn('Обнаружено несоответствие статуса камеры. Проверяем соединение...');
            
            // Переинициализируем видеотрек, если есть несоответствие
            // Это может помочь "разбудить" зависший поток
            setTimeout(() => {
              if (localParticipant.isCameraEnabled) {
                // Отправляем пустой фрейм, чтобы активировать поток
                const randomFrameAction = async () => {
                  try {
                    // Временно переключаем камеру, чтобы заставить перезапустить поток
                    await localParticipant.setCameraEnabled(false);
                    await new Promise(resolve => setTimeout(resolve, 200));
                    await localParticipant.setCameraEnabled(true);
                    console.log('Отправлен пустой фрейм для активации потока');
                  } catch (err) {
                    console.error('Ошибка при отправке пустого фрейма:', err);
                  }
                };
                
                randomFrameAction();
              }
            }, 500);
          }
        }
      } catch (err) {
        console.error('Ошибка при проверке состояния соединения:', err);
      }
    };
    
    // Создаем и запускаем пульс
    if (!connectionPulseRef.current) {
      // Устанавливаем интервал 17 секунд (простое число)
      // для избежания совпадения с другими интервалами в системе
      // и предотвращения синхронизированных циклов обновления
      connectionPulseRef.current = new ConnectionPulse(checkConnection, 17000);
      connectionPulseRef.current.start();
    }
    
    return () => {
      if (connectionPulseRef.current) {
        connectionPulseRef.current.stop();
        connectionPulseRef.current = null;
      }
    };
  }, [room]);
  
  // Основной эффект для настройки обработчиков событий
  useEffect(() => {
    if (!room) return;
    
    // Настраиваем обработчики для локального участника
    const setupLocalParticipant = (participant: LocalParticipant) => {
      participant.on('trackMuted', (publication: TrackPublication) => {
        if (publication.track) {
          throttledTrackHandler(
            handlersRef.current.onTrackMuted,
            publication.track,
            publication,
            participant
          );
        }
      });
      
      participant.on('trackUnmuted', (publication: TrackPublication) => {
        if (publication.track) {
          throttledTrackHandler(
            handlersRef.current.onTrackUnmuted,
            publication.track,
            publication,
            participant
          );
        }
      });
    };
    
    // Настраиваем обработчики для участников в комнате
    setupLocalParticipant(room.localParticipant);
    
    // Подписываемся на существующих участников
    // В LiveKit API нет прямого доступа к списку участников через property participants
    // Вместо этого используем методы, например getParticipants() если он доступен
    // Или итерируем по событиям, когда участники подключаются
    try {
      // Используем свойство remoteParticipants если оно доступно
      if (room.remoteParticipants) {
        // Для LiveKit API свойство remoteParticipants - это Map, не массив
        room.remoteParticipants.forEach(handleParticipantConnected);
      }
    } catch (err) {
      console.warn('Не удалось получить список участников комнаты:', err);
    }
    
    // Подписываемся на события комнаты
    room.on(RoomEvent.ParticipantConnected, handleParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
    
    // Настраиваем стратегию переподключения
    const clearReconnection = setupReconnection();
    
    // Настраиваем пульс соединения
    const clearConnectionPulse = setupConnectionPulse();
    
    // Очистка при размонтировании
    return () => {
      room.off(RoomEvent.ParticipantConnected, handleParticipantConnected);
      room.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
      
      if (clearReconnection) clearReconnection();
      if (clearConnectionPulse) clearConnectionPulse();
    };
  }, [room, handleParticipantConnected, handleParticipantDisconnected, setupReconnection, setupConnectionPulse, throttledTrackHandler]);
  
  // Возвращаем функцию для принудительного обновления состояния видеопотока
  return {
    refreshVideoTracks: useCallback(() => {
      if (!room || !room.localParticipant) return;
      
      // Публикуем видеотрек заново с небольшой задержкой
      // Это может помочь с проблемами зависания видеопотока
      const republishVideoTrack = async () => {
        try {
          // Получаем текущий статус камеры
          const isCameraEnabled = room.localParticipant.isCameraEnabled;
          
          if (isCameraEnabled) {
            // Временно отключаем
            await room.localParticipant.setCameraEnabled(false);
            
            // Небольшая задержка перед повторным включением
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Включаем снова
            await room.localParticipant.setCameraEnabled(true);
            
            console.log('Видеотрек успешно переопубликован');
          }
        } catch (err) {
          console.error('Ошибка при переопубликации видеотрека:', err);
        }
      };
      
      republishVideoTrack();
    }, [room])
  };
}