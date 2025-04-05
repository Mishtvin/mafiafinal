import { useState, useEffect } from 'react';
import { VideoCodec } from 'livekit-client';
import { fetchToken } from '../lib/livekit';
import { decodePassphrase, encodePassphrase, generateRoomId } from '../lib/utils';
import { VideoConferenceClient } from '../components/LiveVideo/VideoConferenceClient';

export default function VideoConferencePage() {
  const [token, setToken] = useState<string | null>(null);
  const [roomId] = useState('default-room');
  const [username, setUsername] = useState('');
  const [hasJoined, setHasJoined] = useState(false);
  const [isE2EEEnabled, setIsE2EEEnabled] = useState(false);
  const [e2eePassphrase, setE2eePassphrase] = useState<string | null>(null);
  
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
        .then(setToken)
        .catch(err => console.error('Error fetching token:', err));
    }
  }, [hasJoined, username, roomId]);

  const handleJoin = () => {
    setUsername('User-' + Math.floor(Math.random() * 10000));
    setHasJoined(true);
  };

  const toggleE2EE = () => {
    if (!isE2EEEnabled) {
      // Включаем E2EE и генерируем passphrase
      const passphrase = Math.random().toString(36).substring(2, 15) + 
                          Math.random().toString(36).substring(2, 15);
      setE2eePassphrase(passphrase);
      setIsE2EEEnabled(true);
      
      // Добавляем passphrase в хеш URL
      if (typeof window !== 'undefined') {
        window.location.hash = encodePassphrase(passphrase);
      }
    } else {
      // Отключаем E2EE
      setIsE2EEEnabled(false);
      setE2eePassphrase(null);
      
      // Удаляем хеш из URL
      if (typeof window !== 'undefined') {
        window.location.hash = '';
      }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-white">
      {!hasJoined ? (
        <div className="flex items-center justify-center h-screen">
          <div className="text-center p-8 max-w-md">
            <h1 className="text-3xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              MafiaLive LiveKit
            </h1>
            <p className="mb-8">
              Видеоконференция на базе компонентов LiveKit с поддержкой шифрования
            </p>
            
            <div className="flex flex-col space-y-4 mb-6">
              <div className="flex items-center">
                <input
                  id="e2ee"
                  type="checkbox"
                  checked={isE2EEEnabled}
                  onChange={toggleE2EE}
                  className="mr-2"
                />
                <label htmlFor="e2ee">Включить E2EE шифрование</label>
              </div>
              
              {isE2EEEnabled && (
                <div className="bg-green-900/30 p-3 rounded text-left">
                  <p className="text-green-400 font-medium mb-2">Шифрование включено</p>
                  <p className="text-sm">
                    Все данные будут зашифрованы от устройства к устройству
                  </p>
                </div>
              )}
            </div>
            
            <button 
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              onClick={handleJoin}
            >
              Начать конференцию
            </button>
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