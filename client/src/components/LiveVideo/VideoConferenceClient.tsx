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
  
  // Следим за состоянием камеры
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
      
      // Устанавливаем выбранную камеру, если есть хотя бы одна
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
    
    // Повторный запрос через 2 секунды (для случаев, когда пользователь только что дал разрешение)
    const delayedRequest = setTimeout(() => {
      getCameras();
    }, 2000);
    
    return () => clearTimeout(delayedRequest);
  }, []);
  
  // Обновляем статус камеры при изменении состояния локального участника
  useEffect(() => {
    const updateCameraState = () => {
      if (room && room.localParticipant) {
        setCameraEnabled(room.localParticipant.isCameraEnabled);
        
        // Получаем текущее активное устройство ввода через LiveKit API
        room.getActiveDevice('videoinput')
          .then(activeDevice => {
            if (activeDevice) {
              console.log('Активное устройство через LiveKit API:', activeDevice);
              setSelectedCamera(activeDevice);
            } else {
              // Запасной вариант - получение через media tracks
              const videoTracks = room.localParticipant.getTrackPublications().filter(
                track => track.kind === 'video' && !track.isMuted
              );
              
              if (videoTracks.length > 0 && videoTracks[0].track) {
                try {
                  const mediaStreamTrack = videoTracks[0].track.mediaStreamTrack;
                  const currentSettings = mediaStreamTrack.getSettings();
                  
                  if (currentSettings.deviceId) {
                    console.log('Определена активная камера через settings:', currentSettings.deviceId);
                    setSelectedCamera(currentSettings.deviceId);
                  }
                } catch (err) {
                  console.error('Ошибка при определении ID камеры через медиатрек:', err);
                }
              }
            }
          })
          .catch(err => {
            console.error('Ошибка при получении активного устройства:', err);
          });
      }
    };
    
    // Слушаем изменения состояния камеры
    if (room && room.localParticipant) {
      room.localParticipant.on('trackMuted', updateCameraState);
      room.localParticipant.on('trackUnmuted', updateCameraState);
      room.localParticipant.on('trackPublished', updateCameraState);
      room.localParticipant.on('trackUnpublished', updateCameraState);
      
      // Инициализируем начальное состояние
      setCameraEnabled(room.localParticipant.isCameraEnabled);
      
      // Вызываем немедленно для обновления состояния селекта
      updateCameraState();
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
  
  // Функция переключения камеры с задержкой для избежания моргания
  const toggleCamera = () => {
    if (room && room.localParticipant) {
      console.log('Переключаем камеру из', cameraEnabled, 'в', !cameraEnabled);
      
      // Обновляем UI состояние немедленно
      setCameraEnabled(!cameraEnabled);
      
      // Затем отправляем команду LiveKit с небольшой задержкой
      setTimeout(() => {
        room.localParticipant.setCameraEnabled(!cameraEnabled)
          .then(() => console.log('Камера переключена успешно'))
          .catch(err => {
            console.error('Ошибка переключения камеры:', err);
            // Восстанавливаем состояние UI в случае ошибки
            setCameraEnabled(cameraEnabled);
          });
      }, 10); // Минимальная задержка
    }
  };
  
  // Функция для смены используемой камеры
  const switchCamera = async (deviceId: string) => {
    if (room && room.localParticipant) {
      try {
        console.log('Переключаем на камеру с ID:', deviceId);
        
        // Обновляем UI немедленно
        setSelectedCamera(deviceId);
        
        // Самый простой способ - использовать стандартный API LiveKit
        // для переключения камеры с новыми опциями
        await room.switchActiveDevice('videoinput', deviceId);
        
        console.log('Камера успешно переключена на:', deviceId);
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
        video={true}
      >
        <div className="flex flex-col h-screen bg-slate-900">        
          {/* Main content with custom grid */}
          <main className="flex-1 relative overflow-hidden">
            <CustomVideoGrid />
          </main>
        </div>
      </LiveKitRoom>
      
      {/* Рендерим элементы управления отдельно */}
      <ControlDrawer room={room} />
    </>
  );
}