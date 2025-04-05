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
} from 'livekit-client';
import { decodePassphrase } from '../../lib/utils';
import { CustomVideoGrid } from './CustomVideoGrid';

// Фиксированные кнопки управления
const FixedControls = ({ room }: { room: Room }) => {
  // Состояние для отображения текущего статуса камеры
  const [cameraEnabled, setCameraEnabled] = useState(true);
  
  // Обновляем статус при изменении состояния локального участника
  useEffect(() => {
    const updateCameraState = () => {
      if (room && room.localParticipant) {
        setCameraEnabled(room.localParticipant.isCameraEnabled);
      }
    };
    
    // Слушаем изменения состояния
    if (room && room.localParticipant) {
      room.localParticipant.on('trackMuted', updateCameraState);
      room.localParticipant.on('trackUnmuted', updateCameraState);
      
      // Инициализируем начальное состояние
      setCameraEnabled(room.localParticipant.isCameraEnabled);
    }
    
    return () => {
      if (room && room.localParticipant) {
        room.localParticipant.off('trackMuted', updateCameraState);
        room.localParticipant.off('trackUnmuted', updateCameraState);
      }
    }
  }, [room]);
  
  return (
    <>
      {/* Кнопка управления камерой */}
      <div className="fixed-camera-control">
        <button 
          className="control-button"
          onClick={() => {
            // Плавное переключение через setTimeout
            setTimeout(() => {
              if (room && room.localParticipant) {
                room.localParticipant.setCameraEnabled(!cameraEnabled);
              }
            }, 10);
          }}
        >
          {cameraEnabled ? (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 7 16 12 23 17z"></path>
                <rect width="15" height="14" x="1" y="5" rx="2" ry="2"></rect>
              </svg>
              <div className="control-tooltip">Выключить камеру</div>
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m2 2 20 20"></path>
                <path d="M9 9a3 3 0 0 1 5.12-2.12"></path>
                <path d="M22 12 A10 10 0 0 0 12 2v0a10 10 0 0 0-2 19.5"></path>
              </svg>
              <div className="control-tooltip">Включить камеру</div>
            </>
          )}
        </button>
      </div>
      
      {/* Кнопка выхода из комнаты */}
      <div className="fixed-exit-control">
        <button 
          className="control-button danger"
          onClick={() => {
            if (room) {
              room.disconnect();
            }
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" x2="9" y1="12" y2="12"></line>
          </svg>
          <div className="control-tooltip">Выйти</div>
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
      
      {/* Рендерим фиксированные элементы управления отдельно */}
      <FixedControls room={room} />
    </>
  );
}