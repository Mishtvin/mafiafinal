import React, { useMemo, useState } from 'react';
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

/**
 * Компонент для видеоконференции LiveKit с поддержкой E2EE
 * Основан на оригинальном коде MafiaLive
 */
export function VideoConferenceClient(props: {
  liveKitUrl: string;
  token: string;
  codec: VideoCodec | undefined;
}) {
  // Состояние для открытия/закрытия панели управления
  const [controlsOpen, setControlsOpen] = useState(false);
  
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
          
          {/* Кнопка-триггер для открытия панели управления */}
          <button 
            className="drawer-trigger"
            onClick={() => setControlsOpen(!controlsOpen)}
            aria-label="Toggle Controls"
          >
            {controlsOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 15 12 9 6 15"></polyline>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            )}
          </button>
          
          {/* Выдвижная панель управления */}
          <div className={`control-drawer ${controlsOpen ? 'open' : ''}`}>
            <div className="controls-container">
              <button 
                className="control-button" 
                aria-label="Toggle Camera"
                onClick={() => room.localParticipant.setCameraEnabled(!room.localParticipant.isCameraEnabled)}
              >
                {room.localParticipant.isCameraEnabled ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 7 16 12 23 17z"></path>
                      <rect width="15" height="14" x="1" y="5" rx="2" ry="2"></rect>
                    </svg>
                    <span>Камера вкл.</span>
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m2 2 20 20"></path>
                      <path d="M9 9a3 3 0 0 1 5.12-2.12"></path>
                      <path d="M22 12 A10 10 0 0 0 12 2v0a10 10 0 0 0-2 19.5"></path>
                    </svg>
                    <span>Камера выкл.</span>
                  </>
                )}
              </button>
              
              <button 
                className="control-button danger" 
                aria-label="Leave Room"
                onClick={() => room.disconnect()}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" x2="9" y1="12" y2="12"></line>
                </svg>
                <span>Выйти</span>
              </button>
            </div>
          </div>
        </main>
      </div>
    </LiveKitRoom>
  );
}