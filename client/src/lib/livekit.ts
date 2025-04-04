// Token endpoint details
// Используем локальный эндпоинт для генерации токенов
const TOKEN_ENDPOINT = '/api/token';

/**
 * Fetches a LiveKit token from the token service
 * 
 * @param identity The participant's identity/username
 * @param roomName Optional room name to join (defaults to server-side default)
 * @returns A Promise resolving to a LiveKit token
 */
export async function fetchToken(identity: string, roomName?: string): Promise<string> {
  try {
    // Build URL with query parameters
    let url = `${TOKEN_ENDPOINT}?identity=${encodeURIComponent(identity)}`;
    if (roomName) {
      url += `&room=${encodeURIComponent(roomName)}`;
    }
    
    // Make request to token endpoint
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token request failed: ${response.status} ${errorText}`);
    }
    
    // Parse response
    const data = await response.json();
    
    // The server returns { token, identity, room }
    if (!data.token) {
      throw new Error('No token returned from server');
    }
    
    return data.token;
  } catch (error) {
    console.error('Error fetching LiveKit token:', error);
    throw error;
  }
}
