import { useState, useEffect } from 'react';
import { VideoCodec } from 'livekit-client';
import { fetchToken } from '../lib/livekit';
import { VideoConferenceClient } from '../components/LiveVideo/VideoConferenceClient';

type Role = 'player' | 'host';

export default function VideoConferencePage() {
  const [token, setToken] = useState<string | null>(null);
  const [roomId] = useState('mafialive-room');
  const [username, setUsername] = useState('');
  const [hasJoined, setHasJoined] = useState(false);
  const [role, setRole] = useState<Role>('player');
  
  // LiveKit server URL и кодек
  const serverUrl = 'wss://livekit.nyavkin.site';
  const codec: VideoCodec = 'vp8';

  // Получаем токен когда пользователь присоединяется
  useEffect(() => {
    if (hasJoined && username) {
      // Добавляем префикс к имени пользователя для идентификации роли
      const nameWithRole = role === 'host' ? `Host-${username}` : `Player-${username}`;
      fetchToken(nameWithRole, roomId)
        .then(setToken)
        .catch(err => console.error('Error fetching token:', err));
    }
  }, [hasJoined, username, roomId, role]);

  // Обработчик входа в комнату
  const handleJoin = () => {
    if (!username.trim()) {
      // Если пользователь не ввел имя, используем случайное
      setUsername(Math.floor(Math.random() * 10000) + '-' + Math.floor(Math.random() * 10000));
    }
    setHasJoined(true);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-white">
      {!hasJoined ? (
        <div className="flex items-center justify-center h-screen">
          <div className="text-center p-8 max-w-md">
            <h1 className="text-3xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              MafiaLive
            </h1>
            <p className="mb-8">
              Видеоконференция с сеткой 4x3 (12 слотов)
            </p>
            
            <div className="flex flex-col space-y-4 mb-6">
              {/* Выбор роли */}
              <div className="bg-slate-800/70 p-4 rounded mb-2">
                <h3 className="text-lg font-medium mb-3 text-left">Выберите роль:</h3>
                <div className="flex flex-col space-y-3">
                  <div
                    className={`p-3 border rounded-lg flex items-center cursor-pointer transition-colors ${
                      role === 'player' ? 'border-blue-500 bg-blue-900/30' : 'border-gray-700 hover:border-gray-500'
                    }`}
                    onClick={() => setRole('player')}
                  >
                    <div className={`w-4 h-4 rounded-full mr-3 ${role === 'player' ? 'bg-blue-500' : 'bg-gray-700'}`}></div>
                    <div className="text-left">
                      <p className="font-medium">Игрок</p>
                      <p className="text-sm text-gray-400">Обычный участник игры</p>
                    </div>
                  </div>
                  
                  <div
                    className={`p-3 border rounded-lg flex items-center cursor-pointer transition-colors ${
                      role === 'host' ? 'border-purple-500 bg-purple-900/30' : 'border-gray-700 hover:border-gray-500'
                    }`}
                    onClick={() => setRole('host')}
                  >
                    <div className={`w-4 h-4 rounded-full mr-3 ${role === 'host' ? 'bg-purple-500' : 'bg-gray-700'}`}></div>
                    <div className="text-left">
                      <p className="font-medium">Ведущий</p>
                      <p className="text-sm text-gray-400">Модератор игры (слот 12)</p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Поле для ввода имени */}
              <div className="bg-slate-800/70 p-4 rounded mb-2">
                <h3 className="text-lg font-medium mb-3 text-left">Введите ваше имя:</h3>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 text-white rounded border border-slate-600 focus:border-blue-500 focus:outline-none"
                  placeholder="Введите ваше имя"
                />
                <p className="text-xs text-gray-400 mt-2 text-left">
                  Если поле оставить пустым, будет сгенерировано случайное имя
                </p>
              </div>
            </div>
            
            <button 
              className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                role === 'host' 
                  ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
              onClick={handleJoin}
            >
              {role === 'host' ? 'Войти как ведущий' : 'Войти как игрок'}
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
            <div className={`animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 mx-auto mb-4 ${
              role === 'host' ? 'border-purple-500' : 'border-blue-500'
            }`}></div>
            <p>Подключение к видеоконференции...</p>
            <p className="text-sm mt-2">Комната: {roomId}</p>
            <p className="text-sm">Пользователь: {username}</p>
            <p className={`text-sm font-medium ${role === 'host' ? 'text-purple-400' : 'text-blue-400'}`}>
              Роль: {role === 'host' ? 'Ведущий' : 'Игрок'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}