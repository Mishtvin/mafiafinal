// Token endpoint details
// Используем локальный эндпоинт для генерации токенов
const TOKEN_ENDPOINT = '/api/livekit/token';

/**
 * Fetches a LiveKit token from the token service
 * 
 * @param identity The participant's identity/username
 * @param roomName Optional room name to join (defaults to server-side default)
 * @returns A Promise resolving to a LiveKit token
 */
export async function fetchToken(identity: string, roomName?: string): Promise<string> {
  try {
    console.log('Fetching token for', { identity, roomName });
    
    // Используем POST запрос с JSON телом
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        identity,
        roomName
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Token request failed with response:', errorText);
      throw new Error(`Token request failed: ${response.status} ${errorText}`);
    }
    
    // Parse response
    const data = await response.json();
    
    // The server returns { token, identity, room }
    if (!data.token) {
      throw new Error('No token returned from server');
    }
    
    console.log('Got token from server for room:', data.room, 'token preview:', data.token.substring(0, 20) + '...');
    
    return data.token;
  } catch (error) {
    console.error('Error fetching LiveKit token:', error);
    throw error;
  }
}
