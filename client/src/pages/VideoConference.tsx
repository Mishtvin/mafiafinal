import { useState, useEffect } from 'react';
import { LiveKitRoom } from '@livekit/components-react';
import ParticipantGrid from '@/components/VideoConference/ParticipantGrid';
import ControlBar from '@/components/VideoConference/ControlBar';
import ConnectionIndicator from '@/components/VideoConference/ConnectionIndicator';
import SettingsModal from '@/components/VideoConference/SettingsModal';
import JoinModal from '@/components/VideoConference/JoinModal';
import ErrorModal from '@/components/VideoConference/ErrorModal';
import { fetchToken } from '@/lib/livekit';

export default function VideoConference() {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [connectionState, setConnectionState] = useState('disconnected');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasJoined, setHasJoined] = useState(false);
  const [initialAudio, setInitialAudio] = useState(true);
  const [initialVideo, setInitialVideo] = useState(true);

  const serverUrl = 'wss://livekit.nyavkin.site:7880/';

  useEffect(() => {
    if (hasJoined && username) {
      fetchToken(username)
        .then((fetchedToken) => {
          setToken(fetchedToken);
          setConnectionState('connecting');
        })
        .catch((err) => {
          console.error('Error fetching token:', err);
          setError(new Error(`Failed to fetch token: ${err.message}`));
        });
    }
  }, [hasJoined, username]);

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

  const handleConnectionStateChange = (state: string) => {
    setConnectionState(state);
  };

  const handleLeave = () => {
    setHasJoined(false);
    setToken(null);
    setConnectionState('disconnected');
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
              fetchToken(username)
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
          onConnectionStateChanged={handleConnectionStateChange}
          options={{
            publishDefaults: {
              simulcast: true,
              videoSimulcastLayers: [
                { width: 640, height: 360, encoding: { maxBitrate: 300000, maxFramerate: 30 } },
                { width: 320, height: 180, encoding: { maxBitrate: 100000, maxFramerate: 15 } },
              ],
              dtx: true,
              audioEnabled: initialAudio,
              videoEnabled: initialVideo,
            }
          }}
        >
          <div className="flex flex-col h-screen">
            {/* Header section */}
            <header className="bg-slate-800 px-4 py-3 flex justify-between items-center border-b border-gray-800">
              <div className="flex items-center space-x-2">
                <span className="material-icons text-blue-500">groups</span>
                <h1 className="text-xl font-semibold">MafiaLive</h1>
              </div>
              
              <ConnectionIndicator connectionState={connectionState} />

              <div className="flex items-center space-x-3">
                <button 
                  className="bg-slate-700 hover:bg-slate-600 p-2 rounded"
                  onClick={() => setIsSettingsOpen(true)}
                >
                  <span className="material-icons">settings</span>
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
        <div className="flex items-center justify-center h-screen">
          {hasJoined && !error && (
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p>Connecting to room...</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
