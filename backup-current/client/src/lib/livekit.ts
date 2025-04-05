// Token endpoint details
// Используем локальный эндпоинт для генерации токенов
const TOKEN_ENDPOINT = '/api/livekit/token';

/**
 * Генерирует уникальный идентификатор пользователя с случайным суффиксом
 * Это помогает избежать конфликтов между разными вкладками браузера
 */
function generateUniqueIdentity(baseIdentity: string): string {
  // Добавляем случайный суффикс для уникальности между вкладками
  const tabId = Math.floor(Math.random() * 10000);
  return `${baseIdentity}-${tabId}`;
}

/**
 * Глобальный тип для window объявлен в main.tsx
 * чтобы избежать конфликтов типов
 */

/**
 * Fetches a LiveKit token from the token service
 * 
 * @param identity The participant's identity/username
 * @param roomName Optional room name to join (defaults to server-side default)
 * @returns A Promise resolving to a LiveKit token
 */
export async function fetchToken(identity: string, roomName?: string): Promise<string> {
  try {
    // Создаем уникальный идентификатор для каждой вкладки
    const uniqueIdentity = generateUniqueIdentity(identity);
    
    // Сохраняем идентификатор для последующего использования в веб-сокетах
    window.currentUserIdentity = uniqueIdentity;
    
    console.log('Fetching token for', { identity: uniqueIdentity, roomName });
    console.log('Сохранен глобальный идентификатор пользователя:', uniqueIdentity);
    
    // Используем POST запрос с JSON телом
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        identity: uniqueIdentity,
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
