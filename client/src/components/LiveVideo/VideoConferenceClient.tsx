import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  formatChatMessageLinks,
  LiveKitRoom,
  ControlBar,
} from '@livekit/components-react';
import {
  LogLevel,
  Room,
  RoomConnectOptions,
  RoomOptions,
  VideoPresets,
  type VideoCodec,
  createLocalVideoTrack,
  Track,
  TrackPublication,
  Participant
} from 'livekit-client';
import { CustomVideoGrid } from './CustomVideoGrid';
import { useSlots } from '../../hooks/use-slots';
import { usePlayerStates } from '../../hooks/use-player-states';
import { useVideoEvents } from '../../hooks/use-video-events';
import { useStableVideo } from '../../hooks/use-stable-video';
import { debounce, throttle } from '../../lib/performance-utils';

/**
 * Контролер для висувної панелі керування, розміщений ПОЗА LiveKitRoom
 * для запобігання проблем з перепідключенням
 */ 
const ControlDrawer = ({ room }: { room: Room }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  // Примусово встановлюємо початковий стан камери як увімкнений
  // Цей стан керує відображенням іконки
  const [cameraEnabled, setCameraEnabled] = useState(true);
  
  // Стан для вибору камери
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null);
  
  // Отримання доступу до useState та функції shuffleAllUsers з хука useSlots
  // Визначаємо ідентифікатор поточного користувача
  const userId = room?.localParticipant?.identity || '';
  const slotsManager = useSlots(userId);
  const { shuffleAllUsers, userSlot, slots, sendMessage } = slotsManager;
  
  // Отримання доступу до функцій керування станами гравців
  const { resetAllPlayerStates } = usePlayerStates(sendMessage, userId);
  
  // Функція для отримання списку доступних камер
  async function getCameras() {
    try {
      // Запитуємо дозвіл на використання камери, якщо його ще немає
      await navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
          // Закриваємо потоки після отримання дозволу
          stream.getTracks().forEach(track => track.stop());
        })
        .catch(err => {
          console.error('Користувач відхилив доступ до камери:', err);
        });
      
      // Теперь получаем список устройств
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      console.log('Доступные камеры:', videoDevices);
      
      setCameras(videoDevices);
      
      // Проверяем, какая камера используется сейчас через медиа-треки
      if (room && room.localParticipant) {
        const videoTracks = room.localParticipant.getTrackPublications().filter(
          track => track.kind === 'video' && !track.isMuted && track.track
        );
        
        if (videoTracks.length > 0 && videoTracks[0].track) {
          try {
            const mediaStreamTrack = videoTracks[0].track.mediaStreamTrack;
            const trackSettings = mediaStreamTrack.getSettings();
            
            // Попробуем определить камеру сначала по deviceId
            if (trackSettings.deviceId) {
              const matchingCamera = videoDevices.find(d => d.deviceId === trackSettings.deviceId);
              if (matchingCamera) {
                console.log('Определена активная камера:', matchingCamera.label, 'deviceId:', matchingCamera.deviceId);
                setSelectedCamera(matchingCamera.deviceId);
                return videoDevices;
              }
            }
            
            // Если не удалось по deviceId, попробуем по label
            if (mediaStreamTrack.label) {
              // Сначала попробуем найти точное совпадение по названию
              const cameraLabel = mediaStreamTrack.label;
              console.log('Поиск камеры по label:', cameraLabel);
              
              // Поиск по полному названию
              const exactMatch = videoDevices.find(d => d.label === cameraLabel);
              if (exactMatch) {
                console.log('Найдено точное совпадение по названию:', exactMatch.label);
                setSelectedCamera(exactMatch.deviceId);
                return videoDevices;
              }
              
              // Поиск по частичному совпадению (первое слово названия)
              const firstWord = cameraLabel.split(' ')[0];
              const partialMatch = videoDevices.find(d => d.label && d.label.includes(firstWord));
              if (partialMatch) {
                console.log('Найдено частичное совпадение по названию:', partialMatch.label);
                setSelectedCamera(partialMatch.deviceId);
                return videoDevices;
              }
            }
            
            // Если по label не нашли, попробуем по groupId
            if (trackSettings.groupId) {
              const matchByGroup = videoDevices.find(d => d.groupId === trackSettings.groupId);
              if (matchByGroup) {
                console.log('Найдено совпадение по groupId:', matchByGroup.label);
                setSelectedCamera(matchByGroup.deviceId);
                return videoDevices;
              }
            }
            
            console.log('Не удалось определить активную камеру по параметрам:', 
                        'label:', mediaStreamTrack.label, 
                        'deviceId:', trackSettings.deviceId, 
                        'groupId:', trackSettings.groupId);
          } catch (err) {
            console.error('Ошибка при определении активной камеры через треки:', err);
          }
        }
      }
      
      // Якщо досі не змогли визначити активну камеру, використовуємо першу доступну
      if (videoDevices.length > 0 && !selectedCamera) {
        setSelectedCamera(videoDevices[0].deviceId);
        console.log('Вибрано камеру за замовчуванням:', videoDevices[0].deviceId);
      }
      
      return videoDevices;
    } catch (err) {
      console.error('Помилка при отриманні списку камер:', err);
      return [];
    }
  }
  
  // Получаем список доступных камер при монтировании и когда обновляется разрешение на доступ
  useEffect(() => {
    // Первый запрос при загрузке
    getCameras();
    
    // Также делаем повторные запросы на определение активной камеры
    // с некоторыми интервалами, чтобы гарантированно определить текущую камеру
    const delayedRequest1 = setTimeout(() => {
      getCameras();
    }, 1000);
    
    const delayedRequest2 = setTimeout(() => {
      getCameras();
    }, 2000);
    
    const delayedRequest3 = setTimeout(() => {
      getCameras();
    }, 3000);
    
    return () => {
      clearTimeout(delayedRequest1);
      clearTimeout(delayedRequest2);
      clearTimeout(delayedRequest3);
    };
  }, []);
  
  // Обновляем статус камеры при изменении состояния локального участника
  useEffect(() => {
    const updateCameraState = () => {
      if (room && room.localParticipant) {
        // Проверка состояния камеры напрямую через видеотреки
        const hasActiveVideoTracks = room.localParticipant
          .getTrackPublications()
          .some(track => track.kind === 'video' && !track.isMuted && track.track);
        
        // По умолчанию используем API статус для синхронизации UI
        const apiCameraEnabled = room.localParticipant.isCameraEnabled;
        
        // Проверяем первое ли это подключение
        const isFirstConnection = !window.sessionStorage.getItem('camera-state-initialized');
        
        // При первом подключении устанавливаем камеру как выключенную
        let effectiveState = isFirstConnection ? false : apiCameraEnabled;
        
        // Отмечаем, что инициализация прошла
        if (isFirstConnection) {
          window.sessionStorage.setItem('camera-state-initialized', 'true');
        }
        
        console.log('Состояние камеры обновлено:', 
                    'треки:', hasActiveVideoTracks, 
                    'API:', apiCameraEnabled,
                    'итоговое:', effectiveState,
                    'первое подключение:', isFirstConnection);
        
        setCameraEnabled(effectiveState);
        
        // Этот вызов только обновляет список доступных камер и определяет текущую активную
        // Вызываем только если камера включена, чтобы избежать сброса на другую камеру
        if (effectiveState) {
          getCameras();
        }
      }
    };
    
    // Слушаем изменения состояния камеры
    if (room && room.localParticipant) {
      room.localParticipant.on('trackMuted', updateCameraState);
      room.localParticipant.on('trackUnmuted', updateCameraState);
      room.localParticipant.on('trackPublished', updateCameraState);
      room.localParticipant.on('trackUnpublished', updateCameraState);
      
      // ПРИНУДИТЕЛЬНО устанавливаем камеру как выключенную при инициализации
      setCameraEnabled(false);
      
      // Вызываем немедленно для обновления состояния селекта
      updateCameraState();
      
      // Дополнительно проверяем состояние иконки после небольшой задержки
      setTimeout(() => {
        // Проверяем на рассогласование и если есть - исправляем
        const realCameraState = room.localParticipant.isCameraEnabled;
        // Для выключенной камеры всегда устанавливаем значение false,
        // даже если реально она ещё не отключилась полностью
        if (cameraEnabled !== realCameraState) {
          console.log('Обнаружено рассогласование - синхронизируем UI с реальным состоянием камеры');
          setCameraEnabled(realCameraState);
        }
      }, 1500);
    }
    
    return () => {
      if (room && room.localParticipant) {
        room.localParticipant.off('trackMuted', updateCameraState);
        room.localParticipant.off('trackUnmuted', updateCameraState);
        room.localParticipant.off('trackPublished', updateCameraState);
        room.localParticipant.off('trackUnpublished', updateCameraState);
      }
    }
  }, [room]);
  
  // Функция переключения камеры с надежной проверкой переключения
  const toggleCamera = async () => {
    if (room && room.localParticipant) {
      // Инвертируем текущее состояние UI
      const newCameraState = !cameraEnabled;
      console.log('Переключаем камеру из UI состояния:', cameraEnabled, 'в', newCameraState);
      
      // Обновляем UI состояние немедленно
      setCameraEnabled(newCameraState);
      
      try {
        // Небольшая задержка для предотвращения потенциальных проблем синхронизации
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Переключаем камеру через LiveKit API
        await room.localParticipant.setCameraEnabled(newCameraState);
        console.log('Камера переключена успешно');
        
        // При выключении камеры НЕ изменяем текущую выбранную камеру
        if (!newCameraState) {
          // Сохраняем текущую камеру для возможного будущего включения
          const currentCamera = selectedCamera || '';
          localStorage.setItem('last-active-camera', currentCamera);
          console.log('Сохранили последнюю активную камеру:', currentCamera);
        }
        
        // Проверяем еще раз реальное состояние после переключения
        setTimeout(() => {
          // Проверяем физические треки и статус API
          const realCameraState = room.localParticipant.isCameraEnabled || 
            room.localParticipant
              .getTrackPublications()
              .some(track => track.kind === 'video' && !track.isMuted && track.track);
          
          // Если состояние в UI и реальное состояние не совпадают, исправляем UI
          if (realCameraState !== newCameraState) {
            console.log('Состояние камеры и UI рассинхронизированы, исправляем:', 
                        'реальное:', realCameraState, 'UI:', newCameraState);
            setCameraEnabled(realCameraState);
          }
          
          // Обновляем список камер, но не переключаем на другую при выключении
          if (newCameraState) {
            getCameras(); 
          }
        }, 500); // Проверяем через полсекунды
      } catch (err) {
        console.error('Ошибка переключения камеры:', err);
        // Восстанавливаем состояние UI в случае ошибки на основе реального состояния
        setTimeout(() => {
          const realState = room.localParticipant.isCameraEnabled;
          setCameraEnabled(realState);
        }, 300);
      }
    }
  };
  
  // Функция для смены используемой камеры
  const switchCamera = async (deviceId: string) => {
    if (room && room.localParticipant) {
      try {
        console.log('Переключаем на камеру с ID:', deviceId);
        
        // Находим камеру по deviceId для получения дополнительной информации
        const selectedCameraInfo = cameras.find(cam => cam.deviceId === deviceId);
        
        // Обновляем UI немедленно
        setSelectedCamera(deviceId);
        
        // Самый простой способ - использовать стандартный API LiveKit
        // для переключения камеры с новыми опциями
        await room.switchActiveDevice('videoinput', deviceId);
        
        console.log('Камера успешно переключена на:', selectedCameraInfo?.label || deviceId);
        
        // Повторно запрашиваем списки камер сразу после переключения
        // и снова через небольшой промежуток времени для гарантии синхронизации
        setTimeout(() => {
          getCameras();
          
          // Еще одна проверка через полсекунды для надежности
          setTimeout(getCameras, 500);
        }, 100);
      } catch (err) {
        console.error('Ошибка при переключении камеры:', err);
      }
    }
  };
  
  // Закрытие панели по Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <>
      {/* Висувна панель керування */}
      <div 
        className={`control-drawer ${isOpen ? 'open' : ''}`}
      >
        <div className="controls-container">
          <div className="left-controls">
            <button 
              className="control-button" 
              aria-label="Перемкнути камеру"
              onClick={toggleCamera}
            >
              {cameraEnabled ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 7 16 12 23 17z"></path>
                  <rect width="15" height="14" x="1" y="5" rx="2" ry="2"></rect>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                  <path d="M23 7 16 12 23 17z"></path>
                  <rect width="15" height="14" x="1" y="5" rx="2" ry="2"></rect>
                  <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="2"></line>
                </svg>
              )}
              <span className="sr-only md:not-sr-only md:ml-2 text-xs">Камера</span>
            </button>
            
            {/* Селектор камери */}
            {cameras.length > 1 && (
              <div className="camera-selector">
                <select
                  className="select-camera"
                  value={selectedCamera || ''}
                  onChange={(e) => switchCamera(e.target.value)}
                  key={selectedCamera || 'default-camera'}
                >
                  {cameras.map(camera => (
                    <option key={camera.deviceId} value={camera.deviceId}>
                      {camera.label || `Камера ${cameras.indexOf(camera) + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          
          <div className="right-controls">
            {/* Кнопка скидання всіх станів гравців (тільки для ведучого) */}
            {userSlot === 12 && resetAllPlayerStates && (
              <button 
                className="control-button" 
                aria-label="Скинути стани гравців"
                onClick={() => {
                  if (resetAllPlayerStates) {
                    console.log('Виконуємо скидання всіх станів гравців');
                    resetAllPlayerStates();
                  } else {
                    console.error('Функція скидання станів гравців недоступна');
                  }
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                  <path d="M3 3v5h5"></path>
                </svg>
                <span className="sr-only md:not-sr-only md:ml-2 text-xs">Скинути</span>
              </button>
            )}
            
            {/* Кнопка перемішування користувачів (тільки для ведучого) */}
            {userSlot === 12 && shuffleAllUsers && (
              <button 
                className="control-button dice-button" 
                aria-label="Перемішати гравців"
                onClick={() => {
                  if (shuffleAllUsers) {
                    console.log('Запит на перемішування користувачів відправлено');
                    shuffleAllUsers();
                  } else {
                    console.error('Функція перемішування недоступна');
                  }
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="2" ry="2"></rect>
                  <circle cx="8" cy="8" r="1.5"></circle>
                  <circle cx="16" cy="16" r="1.5"></circle>
                  <circle cx="16" cy="8" r="1.5"></circle>
                  <circle cx="8" cy="16" r="1.5"></circle>
                </svg>
                <span className="sr-only md:not-sr-only md:ml-2">Перемішати</span>
              </button>
            )}
            
            {/* Кнопка виходу */}
            <button 
              className="control-button exit-button" 
              aria-label="Вийти"
              onClick={() => {
                console.log('Вихід з кімнати...');
                
                // Коректно закриваємо з'єднання з кімнатою
                try {
                  if (room) {
                    room.disconnect();
                    console.log('З\'єднання з LiveKit розірвано');
                  }
                  
                  // Редирект на головну (на випадок, якщо обробник подій не спрацює)
                  setTimeout(() => {
                    window.location.href = '/';
                  }, 300);
                } catch (err) {
                  console.error('Помилка при відключенні:', err);
                  window.location.href = '/';
                }
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" x2="9" y1="12" y2="12"></line>
              </svg>
              <span className="sr-only md:not-sr-only md:ml-2 text-xs">Вийти</span>
            </button>
          </div>
        </div>
      </div>
      
      {/* Кнопка-тригер для відкриття/закриття панелі */}
      <div className="drawer-trigger-container">
        <button 
          className="drawer-trigger"
          onClick={(e) => {
            e.stopPropagation(); // Запобігаємо спливанню
            setIsOpen(!isOpen);
          }}
          aria-label="Перемкнути панель керування"
        >
          {isOpen ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
          )}
        </button>
      </div>
    </>
  );
};

/**
 * Компонент для відеоконференції LiveKit
 * Базується на оригінальному коді MafiaLive
 */
export function VideoConferenceClient(props: {
  liveKitUrl: string;
  token: string;
  codec: VideoCodec | undefined;
}) {
  // Налаштовуємо параметри кімнати
  const roomOptions = useMemo((): RoomOptions => {
    return {
      publishDefaults: {
        simulcast: false, // Отключаем simulcast полностью для максимальной стабильности
        // Настраиваем фиксированные параметры видео для предотвращения скачков качества
        videoEncoding: {
          // Возвращаем битрейт к 1 Мбит/с для лучшей стабильности,
          // но сохраняем качество благодаря разрешению 1080p и кодеку VP9
          maxBitrate: 1500 * 1000, // Оптимальный 1 Мбит/с
          // Увеличиваем частоту кадров до 45 FPS для более плавного воспроизведения
          // при условии, что камера это поддерживает
          maxFramerate: 50,
          // Используем высокий приоритет для видеопотока
          priority: 'high' as RTCPriorityType,
        },
        // Отключаем избыточное кодирование (redundant encoding) для снижения нагрузки
        red: false,
        // Отключаем DTX (Discontinuous Transmission) для более плавного видео
        dtx: false,
        // Используем видеокодек VP9 для лучшего баланса между качеством и производительностью
        // VP9 имеет лучшую поддержку в браузерах чем AV1 и обеспечивает хорошее сжатие
        // с меньшим потреблением ресурсов, что уменьшает вероятность фризов
        videoCodec: 'vp9' as VideoCodec,
      },
      // Отключаем динамическую адаптацию качества для более стабильной передачи
      adaptiveStream: false,
      // Отключаем dynacast для стабильности качества
      dynacast: false,
      // Добавляем настройки захвата видео с повышенным разрешением
      videoCaptureDefaults: {
        resolution: VideoPresets.h720, // Используем разрешение 1080p (Full HD) для максимального качества
      },
      // Предотвращаем автоматическое отключение при проблемах
      disconnectOnPageLeave: false,
      stopLocalTrackOnUnpublish: false,
      // В LiveKit настройки RTC задаются в connectOptions
    };
  }, [props.codec]);

  // Створюємо кімнату з заданими параметрами
  const room = useMemo(() => new Room(roomOptions), [roomOptions]);
  
  // Используем наш новый хук для улучшенной обработки видео событий
  const videoEvents = useVideoEvents(room, {
    onTrackSubscribed: (track, publication, participant) => {
      console.log('Трек подписан (оптимизированная обработка):', 
                  track.kind, 'от участника', participant?.identity);
    },
    onTrackUnsubscribed: (track, publication, participant) => {
      console.log('Трек отписан (оптимизированная обработка):', 
                  track.kind, 'от участника', participant?.identity);
    },
    onReconnectionNeeded: () => {
      console.log('Требуется переподключение...');
    },
    onReconnected: () => {
      console.log('Соединение восстановлено!');
    },
    // Используем debounce с задержкой 300мс для предотвращения частых обновлений
    debouncedUpdateDelay: 300,
    // Используем throttle с задержкой 500мс для редких и тяжелых обновлений
    throttleDelay: 500
  });
  
  // Параметри підключення до кімнати
  const connectOptions = useMemo((): RoomConnectOptions => {
    return {
      // Включаем автоматическую подписку на треки
      autoSubscribe: true,
      // Настройки для WebRTC соединения
      rtcConfig: {
        // Принудительно используем все доступные транспорты, включая реле
        iceTransportPolicy: 'all',
        // Максимальное объединение медиапотоков для снижения количества соединений
        bundlePolicy: 'max-bundle',
        // Увеличиваем пул ICE кандидатов для более быстрого и надежного соединения
        iceCandidatePoolSize: 10,
        // Расширенный список STUN и TURN серверов
        iceServers: [
          // Публичные STUN серверы для определения внешнего IP
          { 
            urls: [
              'stun:stun.l.google.com:19302',
              'stun:stun1.l.google.com:19302',
              'stun:stun2.l.google.com:19302',
              'stun:stun3.l.google.com:19302',
              'stun:stun4.l.google.com:19302',
              'stun:stun.stunprotocol.org:3478',
              'stun:stun.voiparound.com',
              'stun:stun.voipbuster.com',
              'stun:stun.voipstunt.com',
              'stun:stun.services.mozilla.com'
            ]
          },
          // Публичные TURN серверы для ретрансляции через NAT и файрволы
          {
            urls: [
              'turn:global.turn.twilio.com:3478?transport=udp',
              'turn:global.turn.twilio.com:3478?transport=tcp',
              'turns:global.turn.twilio.com:443?transport=tcp'
            ],
            username: 'f4b4035eaa76f4a55de5f4351567653ee4ff6fa97b50b6b334fcc1be9c27212d',
            credential: 'w1uxM55V9yVoqyVFjt+mxDBV0F87AUCemaYVQGxsPLw='
          },
          // Общедоступный TURN-сервер от OpenRelay
          {
            urls: [
              'turn:openrelay.metered.ca:80',
              'turn:openrelay.metered.ca:443',
              'turn:openrelay.metered.ca:443?transport=tcp',
              'turns:openrelay.metered.ca:443'
            ],
            username: 'openrelayproject',
            credential: 'openrelayproject'
          }
        ]
      },
      // Включаем быстрое переподключение при проблемах с соединением
      // LiveKit v2 поддерживает автоматическое восстановление соединения
    };
  }, []);
  
  // Добавляем хук useStableVideo для альтернативной обработки видеопотоков
  // (без keepalive механизма, вызывающего фризы)
  const stableVideo = useStableVideo(room, {
    debouncedUpdateDelay: 200
  });
  
  // Добавляем кнопку для принудительного обновления видеотреков при зависании
  const handleRefreshVideoTracks = () => {
    // Используем новый стабильный механизм обновления видеотреков вместо старого
    stableVideo.refreshVideoTracks();
  };

  return (
    <>
      <LiveKitRoom
        room={room}
        token={props.token}
        connectOptions={connectOptions}
        serverUrl={props.liveKitUrl}
        audio={false}
        video={false}
      >
        <div className="flex flex-col h-screen bg-slate-900 overflow-hidden">        
          {/* Основний контент з сіткою відео */}
          <main className="flex-1 relative overflow-y-auto mobile-scroller">
            <CustomVideoGrid />
          </main>
        </div>
      </LiveKitRoom>
      
      {/* Рендеримо елементи керування окремо */}
      <ControlDrawer room={room} />
    </>
  );
}
