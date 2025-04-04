import { useState, useEffect, useRef } from 'react';
import { LiveKitRoom } from '@livekit/components-react';
import ParticipantGrid from '../components/VideoConference/ParticipantGrid';
import ControlBar from '../components/VideoConference/ControlBar';
import ConnectionIndicator from '../components/VideoConference/ConnectionIndicator';
import SettingsModal from '../components/VideoConference/SettingsModal';
import JoinModal from '../components/VideoConference/JoinModal';
import ErrorModal from '../components/VideoConference/ErrorModal';
import { fetchToken } from '../lib/livekit';
import { Room, VideoPresets, LogLevel, RoomOptions } from 'livekit-client';
import { decodePassphrase, encodePassphrase, generateRoomId } from '../lib/utils';

export default function VideoConference() {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [connectionState, setConnectionState] = useState('disconnected');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasJoined, setHasJoined] = useState(false);
  const [initialAudio, setInitialAudio] = useState(true);
  const [initialVideo, setInitialVideo] = useState(true);
  // Всегда используем default-room, как в вашем рабочем примере
  const [roomId, setRoomId] = useState('default-room');
  const [isE2EEEnabled, setIsE2EEEnabled] = useState(false);
  const [e2eePassphrase, setE2eePassphrase] = useState<string | null>(null);

  // Reuse Room instance
  const roomRef = useRef<Room | null>(null);

  // LiveKit server URL
  const serverUrl = 'wss://livekit.nyavkin.site/';

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
          setConnectionState('connecting');
        })
        .catch((err) => {
          console.error('Error fetching token:', err);
          setError(new Error(`Failed to fetch token: ${err.message}`));
        });
    }
  }, [hasJoined, username, roomId]);

  const handleJoin = (name: string, audioEnabled: boolean, videoEnabled: boolean) => {
    setUsername(name);
    setInitialAudio(audioEnabled);
    setInitialVideo(videoEnabled);
    setHasJoined(true);
  };

  const handleError = (err: Error) => {
    console.error('LiveKit error:', err);
    setError(err);
    setConnectionState('disconnected');
  };

  const handleLeave = () => {
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    setHasJoined(false);
    setToken(null);
    setConnectionState('disconnected');
  };

  // Room configuration options
  const roomOptions: RoomOptions = {
    adaptiveStream: { pixelDensity: 'screen' },
    dynacast: true,
    publishDefaults: {
      simulcast: true,
      videoSimulcastLayers: [
        VideoPresets.h540,
        VideoPresets.h216
      ],
      red: !isE2EEEnabled, // Redundant video packets, should be disabled for E2EE
    },
    // E2EE settings would be configured here in a real app
  };

  // Handle room events
  const handleRoomConnection = (room: Room) => {
    roomRef.current = room;
    setConnectionState('connected');
    
    console.log('Connected to LiveKit room:', {
      roomId: room.name,
      url: serverUrl,
      participantCount: room.numParticipants + 1 // +1 for local participant
    });
    
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
  


  return (
    <div className="flex flex-col h-screen bg-slate-900 text-white">
      {!hasJoined && (
        <JoinModal 
          isOpen={!hasJoined} 
          onJoin={handleJoin} 
        />
      )}

      {error && (
        <ErrorModal 
          isOpen={!!error} 
          error={error} 
          onDismiss={() => setError(null)} 
          onRetry={() => {
            setError(null);
            if (username) {
              fetchToken(username, roomId)
                .then(setToken)
                .catch(handleError);
            }
          }} 
        />
      )}

      {token ? (
        <LiveKitRoom
          serverUrl={serverUrl}
          token={token}
          connect={true}
          onError={handleError}
          options={roomOptions}
          data-lk-theme="default"
          onConnected={() => {
            console.log('Connected to LiveKit room component');
          }}
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
                <h1 className="text-xl font-semibold">MafiaLive</h1>

                {isE2EEEnabled && (
                  <div className="flex items-center ml-2">
                    <span className="bg-green-500 text-white text-xs px-2 py-1 rounded flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                      </svg>
                      E2EE
                    </span>
                  </div>
                )}
              </div>
              
              <ConnectionIndicator connectionState={connectionState} />

              <div className="flex items-center space-x-3">
                <button 
                  className="bg-slate-700 hover:bg-slate-600 p-2 rounded"
                  onClick={() => setIsSettingsOpen(true)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                  </svg>
                </button>
              </div>
            </header>

            {/* Main content area with participant videos */}
            <main className="flex-1 overflow-hidden p-4">
              <ParticipantGrid />
            </main>

            {/* Controls section */}
            <footer className="bg-slate-800 px-4 py-3 border-t border-gray-800">
              <ControlBar onLeave={handleLeave} />
            </footer>

            {/* Settings modal */}
            <SettingsModal 
              isOpen={isSettingsOpen} 
              onClose={() => setIsSettingsOpen(false)} 
            />
          </div>
        </LiveKitRoom>
      ) : (
        <div className="flex items-center justify-center h-screen bg-slate-900">
          {hasJoined && !error && (
            <div className="text-center text-white">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p>Подключение к конференции...</p>
            </div>
          )}
          
          {!hasJoined && !error && (
            <div className="text-center text-white p-8 max-w-md">
              <h1 className="text-3xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                MafiaLive
              </h1>
              <p className="mb-8">
                Видеоконференции для игры "Мафия" с возможностью шифрования.
              </p>
              <button 
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                onClick={() => setHasJoined(true)}
              >
                Начать конференцию
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
