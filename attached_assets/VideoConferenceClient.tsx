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
  createLocalVideoTrack,
} from 'livekit-client';
import { decodePassphrase } from '../../lib/utils';
import { CustomVideoGrid } from './CustomVideoGrid';

/**
 * Контроллер для выдвижной панели управления, размещенный ВНЕ LiveKitRoom
 * для предотвращения проблем с переподключением
 */ 
const ControlDrawer = ({ room }: { room: Room }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  // Принудительно устанавливаем начальное состояние камеры как включенное
  // Это состояние управляет отображением иконки
  const [cameraEnabled, setCameraEnabled] = useState(true);
  
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
                  
                  // Отключаемся от комнаты
                  room.disconnect();
                  
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
  // Удалили неиспользуемое состояние для панели
  

  
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
  
  // Параметры подключения к комнате
  const connectOptions = useMemo((): RoomConnectOptions => {
    return {
      autoSubscribe: true,
    };
  }, []);

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
          {/* Main content with custom grid */}
          <main className="flex-1 relative overflow-y-auto mobile-scroller">
            <CustomVideoGrid />
          </main>
        </div>
      </LiveKitRoom>
      
      {/* Рендерим элементы управления отдельно */}
      <ControlDrawer room={room} />
    </>
  );
}