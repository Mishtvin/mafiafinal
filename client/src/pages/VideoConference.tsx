import { useState, useEffect } from 'react';
import { RoomOptions, VideoPresets, VideoCodec } from 'livekit-client';
import { fetchToken } from '../lib/livekit';
import { decodePassphrase } from '../lib/utils';

export default function VideoConferencePage() {
  const [token, setToken] = useState<string | null>(null);
  const [roomId] = useState('default-room');
  const [username, setUsername] = useState('');
  const [hasJoined, setHasJoined] = useState(false);
  const [isE2EEEnabled, setIsE2EEEnabled] = useState(false);
  
  // LiveKit server URL и кодек
  const serverUrl = 'wss://livekit.nyavkin.site';
  const codec: VideoCodec = 'vp8';

  // Read URL hash for E2EE passphrase
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash && hash.length > 1) {
        try {
          const passphrase = decodePassphrase(hash.substring(1));
          setIsE2EEEnabled(true);
        } catch (err) {
          console.error('Failed to decode E2EE passphrase:', err);
        }
      }
    }
  }, []);

  // Fetch token when joining
  useEffect(() => {
    if (hasJoined && username) {
      fetchToken(username, roomId)
        .then(setToken)
        .catch(err => console.error('Error fetching token:', err));
    }
  }, [hasJoined, username, roomId]);

  const handleJoin = () => {
    setUsername('User-' + Math.floor(Math.random() * 10000));
    setHasJoined(true);
  };

  // Для простоты показываем только начальную страницу без подключения фактической комнаты
  return (
    <div className="flex flex-col h-screen bg-slate-900 text-white">
      {!hasJoined ? (
        <div className="flex items-center justify-center h-screen">
          <div className="text-center p-8 max-w-md">
            <h1 className="text-3xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              MafiaLive Original
            </h1>
            <p className="mb-8">
              Это страница-заглушка. Для использования оригинальной реализации
              LiveKit компонентов, чтобы восстановить всю функциональность по
              архиву MafiaLive, требуется переписать часть кода проекта.
            </p>
            <button 
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              onClick={handleJoin}
            >
              К конференции
            </button>
          </div>
        </div>
      ) : token ? (
        <div className="flex items-center justify-center h-screen">
          <div className="text-center text-white p-8 max-w-md">
            <h2 className="text-2xl font-bold mb-4">LiveKit комната</h2>
            <p>Пользователь: {username}</p>
            <p>Комната: {roomId}</p>
            <p>E2EE: {isE2EEEnabled ? 'Включено' : 'Выключено'}</p>
            <button 
              className="mt-6 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              onClick={() => setHasJoined(false)}
            >
              Вернуться
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center h-screen">
          <div className="text-center text-white">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p>Подключение к конференции...</p>
          </div>
        </div>
      )}
    </div>
  );
}