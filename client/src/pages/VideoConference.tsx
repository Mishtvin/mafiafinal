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
      // Добавляем префикс к имени пользователя для идентификации роли (только внутренний идентификатор)
      // Префикс будет скрыт от отображения в пользовательском интерфейсе
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
    <div className="flex flex-col min-h-screen bg-slate-900 text-white">
      {!hasJoined ? (
        <div className="flex items-center justify-center min-h-screen px-4 py-8 sm:px-6">
          <div className="w-full max-w-md mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-3xl sm:text-4xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                Mafia
              </h1>
              <p className="text-sm sm:text-base text-gray-300">
                Developed by <a href="https://t.me/Mishtvinn" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">mishtvin</a> | <a href="https://www.twitch.tv/mishtvin" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">Twitch</a>
              </p>
            </div>
            
            <div className="flex flex-col space-y-4 mb-6">
              {/* Вибір ролі - з покращеною адаптивністю */}
              <div className="bg-slate-800/70 p-4 rounded-lg shadow-lg">
                <h3 className="text-lg font-medium mb-3 text-left">Оберіть роль:</h3>
                <div className="flex flex-col space-y-3">
                  <div
                    className={`p-3 border rounded-lg flex items-center cursor-pointer transition-colors ${
                      role === 'player' ? 'border-blue-500 bg-blue-900/30' : 'border-gray-700 hover:border-gray-500'
                    }`}
                    onClick={() => setRole('player')}
                  >
                    <div className={`w-4 h-4 rounded-full mr-3 ${role === 'player' ? 'bg-blue-500' : 'bg-gray-700'}`}></div>
                    <div className="text-left">
                      <p className="font-medium">Гравець</p>
                      <p className="text-xs sm:text-sm text-gray-400">Звичайний учасник гри</p>
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
                      <p className="font-medium">Ведучий</p>
                      <p className="text-xs sm:text-sm text-gray-400">Модератор гри (слот 12)</p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Поле для введення імені */}
              <div className="bg-slate-800/70 p-4 rounded-lg shadow-lg">
                <h3 className="text-lg font-medium mb-3 text-left">Введіть ваше ім'я:</h3>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 text-white rounded-md border border-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Введіть ваше ім'я"
                />
                <p className="text-xs text-gray-400 mt-2 text-left">
                  Якщо поле залишити порожнім, буде згенеровано випадкове ім'я
                </p>
              </div>
            </div>
            
            <div className="flex justify-center">
              <button 
                className={`w-full sm:w-auto px-6 py-3 rounded-lg font-medium transition-colors shadow-lg ${
                  role === 'host' 
                    ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
                onClick={handleJoin}
              >
                {role === 'host' ? 'Увійти як ведучий' : 'Увійти як гравець'}
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
        <div className="flex items-center justify-center min-h-screen px-4 py-8">
          <div className="w-full max-w-md mx-auto text-center bg-slate-800/50 p-6 rounded-lg shadow-lg">
            <div className={`animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 mx-auto mb-6 ${
              role === 'host' ? 'border-purple-500' : 'border-blue-500'
            }`}></div>
            <p className="text-lg font-medium mb-4">Підключення до відеоконференції...</p>
            <div className="space-y-2 text-left bg-slate-800/70 p-4 rounded-lg">
              <p className="text-sm flex justify-between">
                <span className="text-gray-400">Кімната:</span>
                <span className="font-medium">{roomId}</span>
              </p>
              <p className="text-sm flex justify-between">
                <span className="text-gray-400">Користувач:</span>
                <span className="font-medium">{username}</span>
              </p>
              <p className="text-sm flex justify-between">
                <span className="text-gray-400">Роль:</span>
                <span className={`font-medium ${role === 'host' ? 'text-purple-400' : 'text-blue-400'}`}>
                  {role === 'host' ? 'Ведучий' : 'Гравець'}
                </span>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}