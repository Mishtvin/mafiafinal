import React, { useMemo, useState, useEffect } from 'react';
import {
  formatChatMessageLinks,
  LiveKitRoom,
  ControlBar,
} from '@livekit/components-react';
import {
  ExternalE2EEKeyProvider,
  LogLevel,
  Room,
  RoomConnectOptions,
  RoomOptions,
  VideoPresets,
  type VideoCodec,
  ConnectionState,
  createLocalVideoTrack,
} from 'livekit-client';
import { decodePassphrase } from '../../lib/utils';
import { CustomVideoGrid } from './CustomVideoGrid';
import { useSlots } from '../../hooks/use-slots';

import { SlotsState } from '../../hooks/use-slots';

/**
 * Контроллер для выдвижной панели управления, размещенный ВНЕ LiveKitRoom
 * для предотвращения проблем с переподключением
 */ 
const ControlDrawer = ({ room, slotsState }: { room: Room; slotsState: ReturnType<typeof useSlots> }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  // Проверяем сохраненное состояние для инициализации
  const savedState = typeof window !== 'undefined' ? 
    window.sessionStorage.getItem('camera-state') : null;
    
  // Инициализируем камеру как ВКЛЮЧЕННУЮ по умолчанию
  // или используем сохраненное состояние, если оно есть
  const initialCameraState = savedState !== null ? savedState === 'true' : true;
  
  console.log('Инициализация состояния камеры:', initialCameraState, 
              'на основе сохраненного значения:', savedState);
  
  const [cameraEnabled, setCameraEnabled] = useState(initialCameraState);
  
  // Состояние для выбора камеры
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null);
  
  // Функция для получения списка доступных камер
  async function getCameras() {
    try {
      // Запрашиваем разрешение на использование камеры, если его еще нет
      await navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
          // Закрываем потоки после получения разрешения
          stream.getTracks().forEach(track => track.stop());
        })
        .catch(err => {
          console.error('Пользователь отклонил доступ к камере:', err);
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
      
      // Если до сих пор не смогли определить активную камеру, используем первую доступную
      if (videoDevices.length > 0 && !selectedCamera) {
        setSelectedCamera(videoDevices[0].deviceId);
        console.log('Выбрана камера по умолчанию:', videoDevices[0].deviceId);
      }
      
      return videoDevices;
    } catch (err) {
      console.error('Ошибка при получении списка камер:', err);
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
    if (!room || !room.localParticipant) return;
    
    // Флаги для контроля подключения и инициализации камеры
    let isConnected = false;
    let cameraInitialized = false;
    let cameraInitializationTimer: NodeJS.Timeout | null = null;
    
    // Обработчик события подключения к комнате
    const handleConnected = () => {
      console.log('СОБЫТИЕ: Комната подключена, планируем инициализацию камеры');
      isConnected = true;
      
      // Задержка перед инициализацией камеры для стабильности
      if (!cameraInitialized) {
        // Отменяем любые предыдущие таймеры
        if (cameraInitializationTimer) {
          clearTimeout(cameraInitializationTimer);
        }
        
        cameraInitializationTimer = setTimeout(() => {
          initializeCamera();
        }, 1000);
      }
    };
    
    // Функция инициализации камеры (выполняется один раз после подключения)
    const initializeCamera = () => {
      if (!room || !room.localParticipant || cameraInitialized) return;
      
      console.log('ИНИЦИАЛИЗАЦИЯ: Настраиваем камеру после подключения');
      cameraInitialized = true;
      
      // Получаем состояние камеры из хранилища
      const savedState = window.sessionStorage.getItem('camera-state');
      const shouldEnableCamera = savedState !== 'false'; // По умолчанию включено
      
      console.log('ИНИЦИАЛИЗАЦИЯ: Целевое состояние камеры:', shouldEnableCamera);
      
      // Устанавливаем UI состояние сразу
      setCameraEnabled(shouldEnableCamera);
      
      // Обновляем реальное состояние камеры через LiveKit API с задержкой
      setTimeout(() => {
        console.log('ИНИЦИАЛИЗАЦИЯ: Применяем состояние камеры через LiveKit API');
        
        room.localParticipant.setCameraEnabled(shouldEnableCamera)
          .then(() => {
            console.log('ИНИЦИАЛИЗАЦИЯ: Камера успешно настроена, состояние:', shouldEnableCamera);
            
            // Синхронизируем с WebSocket только если камера включена
            if (shouldEnableCamera && slotsState && typeof slotsState.setCameraState === 'function') {
              slotsState.setCameraState(true);
            }
            
            // Проверяем и синхронизируем еще раз через некоторое время
            setTimeout(syncCameraState, 1000);
          })
          .catch(err => {
            console.error('ОШИБКА ИНИЦИАЛИЗАЦИИ КАМЕРЫ:', err);
            // Если произошла ошибка, пробуем еще раз через некоторое время
            setTimeout(() => {
              console.log('ПОВТОРНАЯ ПОПЫТКА настройки камеры');
              room.localParticipant.setCameraEnabled(shouldEnableCamera)
                .catch(err => console.error('ПОВТОРНАЯ ОШИБКА настройки камеры:', err));
            }, 2000);
          });
      }, 1500);
    };
    
    // Функция для синхронизации состояния UI с реальным состоянием камеры
    const syncCameraState = () => {
      if (!room || !room.localParticipant) return;
      
      // Получаем реальное состояние камеры
      const apiCameraEnabled = room.localParticipant.isCameraEnabled;
      
      // Если состояния не совпадают, синхронизируем UI
      if (cameraEnabled !== apiCameraEnabled) {
        console.log('СИНХРОНИЗАЦИЯ: Обнаружено рассогласование состояний камеры (UI/API):', 
                    cameraEnabled, '/', apiCameraEnabled);
        setCameraEnabled(apiCameraEnabled);
        window.sessionStorage.setItem('camera-state', String(apiCameraEnabled));
      }
      
      // Обновляем список камер, если камера включена
      if (apiCameraEnabled) {
        getCameras();
      }
    };
    
    // Обработчик событий изменения состояния треков
    const handleTrackChange = () => {
      // Вызываем синхронизацию только если камера уже инициализирована
      if (cameraInitialized) {
        syncCameraState();
      }
    };
    
    // Регистрируем обработчики событий
    room.on('connected', handleConnected);
    room.localParticipant.on('trackMuted', handleTrackChange);
    room.localParticipant.on('trackUnmuted', handleTrackChange);
    room.localParticipant.on('trackPublished', handleTrackChange);
    room.localParticipant.on('trackUnpublished', handleTrackChange);
    
    // Если комната уже подключена, инициализируем камеру
    if (room.state === 'connected') {
      handleConnected();
    }
    
    return () => {
      // Очищаем все таймеры
      if (cameraInitializationTimer) {
        clearTimeout(cameraInitializationTimer);
      }
      
      // Удаляем обработчики событий
      room.off('connected', handleConnected);
      
      if (room.localParticipant) {
        room.localParticipant.off('trackMuted', handleTrackChange);
        room.localParticipant.off('trackUnmuted', handleTrackChange);
        room.localParticipant.off('trackPublished', handleTrackChange);
        room.localParticipant.off('trackUnpublished', handleTrackChange);
      }
    };
  }, [room, slotsState, cameraEnabled]);
  
  // Функция переключения камеры с надежной проверкой переключения
  const toggleCamera = async () => {
    if (room && room.localParticipant) {
      // Получаем текущий идентификатор пользователя
      const currentUserId = window.currentUserIdentity || '';
      
      // Инвертируем текущее состояние UI
      const newCameraState = !cameraEnabled;
      console.log('ЛОКАЛЬНОЕ Переключение камеры из UI состояния:', cameraEnabled, 'в', newCameraState);
      
      // Обновляем UI состояние немедленно
      setCameraEnabled(newCameraState);
      
      // Сохраняем желаемое состояние камеры в sessionStorage
      // для восстановления после перезагрузки или переподключения
      window.sessionStorage.setItem('camera-state', String(newCameraState));
      console.log('Сохранено ЛОКАЛЬНОЕ состояние камеры:', newCameraState);
      
      try {
        // Защитная проверка - нельзя переключать камеру слишком часто
        const lastToggleTime = parseInt(sessionStorage.getItem('last-camera-toggle') || '0', 10);
        const currentTime = Date.now();
        
        if (currentTime - lastToggleTime < 500) {
          console.log('Слишком частое переключение камеры, пропускаем запрос');
          return; // Пропускаем переключение, если прошло менее 500 мс
        }
        
        // Запоминаем время последнего переключения
        sessionStorage.setItem('last-camera-toggle', String(currentTime));
        
        // Увеличенная задержка для предотвращения потенциальных проблем синхронизации
        console.log('Ожидаем перед переключением камеры через LiveKit API...');
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // ВАЖНО: Сначала управляем камерой через LiveKit API
        // а потом отправляем обновление через WebSocket
        // Это предотвращает ситуацию, когда WebSocket обновление
        // придет раньше, чем камера будет физически включена/выключена
        
        // Переключаем камеру через LiveKit API
        await room.localParticipant.setCameraEnabled(newCameraState);
        console.log('Камера переключена успешно через LiveKit API:', newCameraState);
        
        // Проверяем реальное состояние после переключения
        const realCameraEnabled = room.localParticipant.isCameraEnabled;
        if (realCameraEnabled !== newCameraState) {
          console.log('ВНИМАНИЕ: Реальное состояние камеры не соответствует запрошенному!', 
                      'запрошено:', newCameraState, 'реальное:', realCameraEnabled);
          // Синхронизируем состояние UI с реальным состоянием
          setCameraEnabled(realCameraEnabled);
          window.sessionStorage.setItem('camera-state', String(realCameraEnabled));
          return; // Прерываем дальнейшее выполнение
        }
        
        // После успешного переключения, вызываем slotsState для синхронизации 
        // состояния через WebSocket с другими пользователями
        if (slotsState && typeof slotsState.setCameraState === 'function') {
          console.log('Синхронизируем состояние СВОЕЙ камеры через WebSocket:', newCameraState);
          
          // Явно обновляем также состояние в локальном slotsState, чтобы избежать несоответствия
          if (slotsState.cameraStates && currentUserId) {
            console.log(`Обновляем локальное состояние камеры для ID=${currentUserId}:`, newCameraState);
          }
          
          // ВАЖНО: Обновляем сохраненное состояние ещё раз перед отправкой
          // Это защищает от перезаписи при возможных входящих обновлениях
          window.sessionStorage.setItem('camera-state', String(newCameraState));
          
          // Отправляем обновление на сервер для всех других клиентов
          slotsState.setCameraState(newCameraState);
        }
        
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
            
            // Обновляем сохраненное состояние
            window.sessionStorage.setItem('camera-state', String(realCameraState));
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
          
          // Обновляем сохраненное состояние
          window.sessionStorage.setItem('camera-state', String(realState));
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
      {/* Выдвижная панель управления */}
      <div 
        className={`control-drawer ${isOpen ? 'open' : ''}`}
      >
        <div className="controls-container">
          <div className="left-controls">
            <button 
              className="control-button" 
              aria-label="Toggle Camera"
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
            </button>
            
            {/* Селектор камеры */}
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
            <button 
              className="control-button danger" 
              aria-label="Leave Room"
              onClick={() => {
                if (room) {
                  // Создаем и диспатчим событие для оповещения о выходе из комнаты
                  const event = new Event('roomDisconnected');
                  window.dispatchEvent(event);
                  
                  // Отключаемся от комнаты только если соединение установлено
                  if (room.state === 'connected') {
                    console.log('Выполняем корректное отключение от комнаты');
                    room.disconnect();
                  } else {
                    console.log('Соединение не установлено, пропускаем disconnect');
                  }
                  
                  // Редирект на главную (на случай, если слушатель событий не сработает)
                  setTimeout(() => {
                    window.location.href = '/';
                  }, 300);
                }
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" x2="9" y1="12" y2="12"></line>
              </svg>
            </button>
          </div>
        </div>
      </div>
      
      {/* Кнопка-триггер для открытия/закрытия панели */}
      <div className="drawer-trigger-container">
        <button 
          className="drawer-trigger"
          onClick={(e) => {
            e.stopPropagation(); // Предотвращаем всплытие
            setIsOpen(!isOpen);
          }}
          aria-label="Toggle Controls"
        >
          {isOpen ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          )}
        </button>
      </div>
    </>
  );
};

/**
 * Компонент для видеоконференции LiveKit с поддержкой E2EE
 * Основан на оригинальном коде MafiaLive
 */
export function VideoConferenceClient(props: {
  liveKitUrl: string;
  token: string;
  codec: VideoCodec | undefined;
}) {
  // Состояние для уникальной идентификации пользователя
  
  // Создаем Worker для E2EE
  const worker =
    typeof window !== 'undefined' &&
    new Worker(new URL('livekit-client/e2ee-worker', import.meta.url));
  const keyProvider = new ExternalE2EEKeyProvider();

  // Проверяем, есть ли passphrase в хеше URL
  const e2eePassphrase =
    typeof window !== 'undefined' ? decodePassphrase(window.location.hash.substring(1)) : undefined;
  const e2eeEnabled = !!(e2eePassphrase && worker);
  
  // Настраиваем параметры комнаты (в точности как в оригинале)
  const roomOptions = useMemo((): RoomOptions => {
    return {
      publishDefaults: {
        videoSimulcastLayers: [VideoPresets.h540, VideoPresets.h216],
        red: !e2eeEnabled,
        videoCodec: props.codec,
      },
      adaptiveStream: { pixelDensity: 'screen' },
      dynacast: true,
      e2ee: e2eeEnabled
        ? {
            keyProvider,
            worker,
          }
        : undefined,
    };
  }, [e2eeEnabled, keyProvider, worker, props.codec]);

  // Создаем комнату с заданными параметрами
  const room = useMemo(() => new Room(roomOptions), [roomOptions]);
  
  // Применяем шифрование, если оно включено
  if (e2eeEnabled && e2eePassphrase) {
    keyProvider.setKey(e2eePassphrase);
    room.setE2EEEnabled(true);
  }
  
  // Генерируем и инициализируем идентификатор пользователя
  const userId = useMemo(() => {
    if (typeof window !== 'undefined') {
      // Проверка на существование глобальной переменной
      if (!window.currentUserIdentity) {
        // Проверяем, есть ли идентификатор в localStorage
        const storedId = window.localStorage.getItem('user-identity');
        
        if (storedId) {
          // Используем сохранённый ID
          console.log(`Используем сохранённый идентификатор: ${storedId}`);
          window.currentUserIdentity = storedId;
        } else {
          // Генерация нового уникального ID
          const newId = `User-${Math.floor(Math.random() * 10000)}-${Math.floor(Math.random() * 10000)}`;
          console.log(`Сгенерирован новый идентификатор: ${newId}`);
          window.localStorage.setItem('user-identity', newId);
          window.currentUserIdentity = newId;
        }
      }
      
      // Теперь у нас точно есть идентификатор в window.currentUserIdentity
      return window.currentUserIdentity;
    }
    return 'unknown-user';
  }, []);
  
  // Используем хук для слотов
  const slotsState = useSlots(userId);
  
  // Отслеживаем идентификатор LiveKit после подключения к комнате
  useEffect(() => {
    if (room && room.localParticipant) {
      const livekitId = room.localParticipant.identity;
      
      if (livekitId && livekitId !== 'undefined') {
        console.log(`Обнаружен идентификатор LiveKit: ${livekitId}`);
        
        // Если идентификаторы отличаются, обновляем глобальную переменную и localStorage
        if (livekitId !== window.currentUserIdentity) {
          console.log(`Синхронизирую идентификаторы: LiveKit=${livekitId}, текущий=${window.currentUserIdentity}`);
          window.localStorage.setItem('user-identity', livekitId);
          window.currentUserIdentity = livekitId;
          
          // Заново регистрируем пользователя с новым ID через WebSocket
          if (slotsState.connected && slotsState.registerUser) {
            console.log('Переопределяем регистрацию с новым идентификатором LiveKit');
            slotsState.registerUser();
          }
        }
      }
    }
    
    // Правильная очистка ресурсов при размонтировании компонента
    return () => {
      // Отключаемся от комнаты только если соединение установлено
      if (room && room.state === 'connected') {
        console.log('Выполняем корректное отключение при размонтировании компонента');
        try {
          room.disconnect();
        } catch (err) {
          console.error('Ошибка при отключении от комнаты:', err);
        }
      }
    };
  }, [room?.localParticipant, slotsState]);
  
  // Автоматически регистрируем пользователя при подключении
  useEffect(() => {
    if (slotsState.connected) {
      // При необходимости можно добавить дополнительную логику
    }
  }, [slotsState.connected]);
  
  // Параметры подключения к комнате
  const connectOptions = useMemo((): RoomConnectOptions => {
    return {
      autoSubscribe: true,
    };
  }, []);

  // Состояние для отслеживания готовности LiveKitRoom
  const [isLiveKitReady, setLiveKitReady] = useState(false);
  
  // Обрабатываем события подключения для предотвращения ошибок
  useEffect(() => {
    // Проверка и обработка состояния комнаты
    const handleRoomStatusChange = () => {
      if (!room) return;
      
      // Безопасно проверяем состояние комнаты с учетом типов
      const roomState = room.state; // Получаем текущее состояние
      
      // Проверяем, что комната подключена
      if (roomState === 'connected') {
        if (!isLiveKitReady) {
          console.log('LiveKit комната подключена, обновляем состояние готовности');
          setLiveKitReady(true);
        }
      } 
      // Проверяем любое состояние кроме connected
      else {
        if (isLiveKitReady) {
          console.log('LiveKit комната не подключена, обновляем состояние готовности');
          setLiveKitReady(false);
        }
      }
    };
    
    // Прослушиваем события комнаты
    if (room) {
      room.on('connected', handleRoomStatusChange);
      room.on('disconnected', handleRoomStatusChange);
      
      // Проверяем текущее состояние при монтировании
      if (room.state === 'connected' && !isLiveKitReady) {
        setLiveKitReady(true);
      }
    }
    
    return () => {
      if (room) {
        room.off('connected', handleRoomStatusChange);
        room.off('disconnected', handleRoomStatusChange);
      }
    };
  }, [room, isLiveKitReady]);
  
  // Определяем, нужно ли кэшировать предыдущую комнату между перерендерами
  const isConnecting = room?.state === 'connecting';
  
  return (
    <>
      {/* Используем обычный LiveKitRoom c настройками */}
      <LiveKitRoom
        room={room}
        token={props.token}
        connectOptions={connectOptions}
        serverUrl={props.liveKitUrl}
        audio={false}
        video={false}
      >
        <div className="flex flex-col h-screen bg-slate-900 overflow-hidden">        
          {/* Main content with custom grid */}
          <main className="flex-1 relative overflow-y-auto mobile-scroller">
            <CustomVideoGrid />
          </main>
        </div>
      </LiveKitRoom>
      
      {/* Безопасно монтируем управление только когда комната готова */}
      {room && <ControlDrawer room={room} slotsState={slotsState} />}
    </>
  );
}