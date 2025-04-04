import { useState, useEffect } from 'react';
import { LiveKitRoom } from '@livekit/components-react';
import ParticipantGrid from '../components/VideoConference/ParticipantGrid';
import ControlBar from '../components/VideoConference/ControlBar';
import ConnectionIndicator from '../components/VideoConference/ConnectionIndicator';
import { Room, VideoPresets } from 'livekit-client';
import { fetchToken } from '../lib/livekit';
import { randomString } from '../lib/utils';

export default function DirectConnection() {
  const [connectionState, setConnectionState] = useState('disconnected');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [token, setToken] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  
  // LiveKit server URL
  const serverUrl = 'wss://livekit.nyavkin.site';
  
  // Генерируем случайное имя пользователя
  const username = `User-${randomString(4)}`;
  
  // Получаем токен при загрузке компонента
  useEffect(() => {
    setIsLoading(true);
    fetchToken(username)
      .then(newToken => {
        setToken(newToken);
        setIsLoading(false);
      })
      .catch(err => {
        console.error("Ошибка получения токена:", err);
        setError(new Error(`Ошибка получения токена: ${err.message}`));
        setIsLoading(false);
      });
  }, [username]);

  // Room configuration options
  const roomOptions = {
    adaptiveStream: true,
    dynacast: true,
    publishDefaults: {
      simulcast: true,
      videoSimulcastLayers: [
        VideoPresets.h540,
        VideoPresets.h216
      ]
    }
  };

  // Параметры по умолчанию для аудио/видео
  const initialAudio = true;
  const initialVideo = true;

  const handleError = (err: Error | any) => {
    console.error('LiveKit error:', err);
    
    // Создаем копию ошибки или создаем новую, если объект ошибки некорректный
    const error = err instanceof Error 
      ? err 
      : new Error(err && err.message ? err.message : 'Неизвестная ошибка подключения');
      
    setError(error);
    setConnectionState('disconnected');
  };

  const handleRoomConnection = (room: Room) => {
    if (!room) {
      console.error('Room object is undefined in handleRoomConnection');
      return;
    }
    
    console.log('Connected to LiveKit room direct connection:', {
      roomId: room.name || 'unknown',
      url: serverUrl,
      participantCount: (room.numParticipants || 0) + 1
    });
    
    setConnectionState('connected');
    
    // Enable audio and video based on initial settings
    if (room.localParticipant) {
      room.localParticipant.setMicrophoneEnabled(initialAudio);
      room.localParticipant.setCameraEnabled(initialVideo);
    }
    
    // Set up listeners for connection state changes
    room.on('disconnected', () => {
      console.log('Disconnected from LiveKit room');
      setConnectionState('disconnected');
    });
    room.on('reconnecting', () => {
      console.log('Reconnecting to LiveKit room...');
      setConnectionState('reconnecting');
    });
    room.on('reconnected', () => {
      console.log('Reconnected to LiveKit room');
      setConnectionState('connected');
    });
  };

  const handleLeave = () => {
    setConnectionState('disconnected');
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-white">
      {error && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 p-6 rounded-lg shadow-xl max-w-md w-full">
            <h3 className="text-xl font-semibold mb-4 text-red-500">Ошибка подключения</h3>
            <p className="mb-6">{error.message}</p>
            <div className="flex justify-end space-x-3">
              <button
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                onClick={() => setError(null)}
              >
                Закрыть
              </button>
              <button
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded transition-colors"
                onClick={() => {
                  setError(null);
                  // Повторно запрашиваем токен
                  setIsLoading(true);
                  fetchToken(username)
                    .then(newToken => {
                      setToken(newToken);
                      setIsLoading(false);
                    })
                    .catch(err => {
                      console.error("Ошибка получения токена:", err);
                      setError(new Error(`Ошибка получения токена: ${err.message}`));
                      setIsLoading(false);
                    });
                }}
              >
                Повторить
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-xl">Загрузка...</p>
          </div>
        </div>
      )}

      {!isLoading && token && (
        <LiveKitRoom
          serverUrl={serverUrl}
          token={token}
          connect={true}
          onError={handleError}
          options={roomOptions}
          data-lk-theme="default"
          // @ts-ignore - LiveKit типы некорректно определяют параметры для onConnected
          onConnected={handleRoomConnection}
        >
          <div className="flex flex-col h-screen">
            {/* Header section */}
            <header className="bg-slate-800 px-4 py-3 flex justify-between items-center border-b border-gray-800">
              <div className="flex items-center space-x-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
                <h1 className="text-xl font-semibold">MafiaLive - Прямое подключение</h1>
                <span className="ml-2 px-2 py-1 bg-blue-900 rounded text-xs">
                  {username}
                </span>
              </div>
              
              <ConnectionIndicator connectionState={connectionState} />
            </header>

            {/* Main content area with participant videos */}
            <main className="flex-1 overflow-hidden p-4">
              <ParticipantGrid />
            </main>

            {/* Controls section */}
            <footer className="bg-slate-800 px-4 py-3 border-t border-gray-800">
              <ControlBar onLeave={handleLeave} />
            </footer>
          </div>
        </LiveKitRoom>
      )}
    </div>
  );
}