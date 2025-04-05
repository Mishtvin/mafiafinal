import { useState, useEffect } from 'react';
import { Room, VideoPresets, RoomOptions, VideoCodec } from 'livekit-client';
import { fetchToken } from '../lib/livekit';
import { decodePassphrase, encodePassphrase, generateRoomId } from '../lib/utils';

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

  const roomOptions: RoomOptions = {
    publishDefaults: {
      videoSimulcastLayers: [VideoPresets.h540, VideoPresets.h216],
      red: !isE2EEEnabled,
      videoCodec: codec,
    },
    adaptiveStream: { pixelDensity: 'screen' },
    dynacast: true,
    // E2EE is handled separately
  };

  const handleRoomConnection = (room: Room) => {
    console.log('Connected to LiveKit room:', room.name);
    
    room.on('participantConnected', (participant) => {
      console.log('Remote participant connected:', participant.identity);
    });

    room.on('participantDisconnected', (participant) => {
      console.log('Remote participant disconnected:', participant.identity);
    });
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-white">
      {!hasJoined ? (
        <div className="flex items-center justify-center h-screen">
          <div className="text-center p-8 max-w-md">
            <h1 className="text-3xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              Direct Connection
            </h1>
            <p className="mb-8">
              Basic VideoConference without custom components.
            </p>
            <button 
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              onClick={handleJoin}
            >
              Join Conference
            </button>
          </div>
        </div>
      ) : token ? (
        <div>
          <p>Implementing base LiveKit connection</p>
          {/* We would implement direct LiveKit components here */}
        </div>
      ) : (
        <div className="flex items-center justify-center h-screen">
          <div className="text-center text-white">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p>Connecting to conference...</p>
          </div>
        </div>
      )}
    </div>
  );
}