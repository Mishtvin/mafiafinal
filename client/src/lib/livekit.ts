// Token endpoint details
const TOKEN_ENDPOINT = 'http://mish.leb1gamafia.com/token';

/**
 * Fetches a LiveKit token from the token service
 * 
 * @param identity The participant's identity/username
 * @returns A Promise resolving to a LiveKit token
 */
export async function fetchToken(identity: string): Promise<string> {
  try {
    // Make request to token endpoint
    const response = await fetch(`${TOKEN_ENDPOINT}?identity=${encodeURIComponent(identity)}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token request failed: ${response.status} ${errorText}`);
    }
    
    // Parse response
    const data = await response.json();
    
    // Check if token exists in the response
    if (!data.token) {
      throw new Error('No token returned from server');
    }
    
    return data.token;
  } catch (error) {
    console.error('Error fetching LiveKit token:', error);
    throw error;
  }
}
