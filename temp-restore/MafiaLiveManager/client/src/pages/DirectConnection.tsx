import { useState, useEffect } from 'react';
import { VideoCodec } from 'livekit-client';
import { fetchToken } from '../lib/livekit';
import { decodePassphrase, encodePassphrase, generateRoomId } from '../lib/utils';
import { VideoConferenceClient } from '../components/LiveVideo/VideoConferenceClient';

export default function DirectConnection() {
  const [token, setToken] = useState<string | null>(null);
  const [roomId, setRoomId] = useState('default-room');
  const [username, setUsername] = useState('');
  const [hasJoined, setHasJoined] = useState(false);
  const [isE2EEEnabled, setIsE2EEEnabled] = useState(false);
  const [e2eePassphrase, setE2eePassphrase] = useState<string | null>(null);
  
  // LiveKit server URL
  const serverUrl = 'wss://livekit.nyavkin.site';
  const codec: VideoCodec = 'vp8';

  // Read URL hash for E2EE passphrase
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash && hash.length > 1) {
        try {
          const passphrase = decodePassphrase(hash.substring(1));
          setE2eePassphrase(passphrase);
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
        .then((fetchedToken) => {
          setToken(fetchedToken);
        })
        .catch((err) => {
          console.error('Error fetching token:', err);
        });
    }
  }, [hasJoined, username, roomId]);

  const handleJoin = () => {
    setUsername('User-' + Math.floor(Math.random() * 10000));
    setHasJoined(true);
  };

  const handleCreateRoom = () => {
    const newRoomId = generateRoomId();
    setRoomId(newRoomId);
    
    // Если включено E2EE, генерируем passphrase и добавляем в хеш
    if (isE2EEEnabled) {
      const passphrase = Math.random().toString(36).substring(2, 15) + 
                        Math.random().toString(36).substring(2, 15);
      setE2eePassphrase(passphrase);
      
      // Добавляем passphrase в хеш URL
      if (typeof window !== 'undefined') {
        window.location.hash = encodePassphrase(passphrase);
      }
    }
    
    setHasJoined(true);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-white">
      {!hasJoined ? (
        <div className="flex items-center justify-center h-screen">
          <div className="text-center p-8 max-w-md">
            <h1 className="text-3xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              MafiaLive - Direct Connection
            </h1>
            <p className="mb-8">
              Использует LiveKit компоненты для видеоконференции.
            </p>
            
            <div className="flex flex-col space-y-4 mb-6">
              <div className="flex items-center">
                <input
                  id="e2ee"
                  type="checkbox"
                  checked={isE2EEEnabled}
                  onChange={(e) => setIsE2EEEnabled(e.target.checked)}
                  className="mr-2"
                />
                <label htmlFor="e2ee">Включить E2EE шифрование</label>
              </div>
            </div>
            
            <div className="flex space-x-4">
              <button 
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                onClick={handleJoin}
              >
                Подключиться к существующей комнате
              </button>
              
              <button 
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                onClick={handleCreateRoom}
              >
                Создать новую комнату
              </button>
            </div>
          </div>
        </div>
      ) : token ? (
        <div className="h-screen">
          <VideoConferenceClient 
            liveKitUrl={serverUrl}
            token={token}
            codec={codec}
          />
        </div>
      ) : (
        <div className="flex items-center justify-center h-screen">
          <div className="text-center text-white">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p>Подключение к конференции...</p>
            <p className="text-sm mt-2">Комната: {roomId}</p>
            <p className="text-sm">Пользователь: {username}</p>
            {isE2EEEnabled && <p className="text-sm text-green-400">E2EE шифрование включено</p>}
          </div>
        </div>
      )}
    </div>
  );
}