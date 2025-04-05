// Token endpoint details
// Используем локальный эндпоинт для генерации токенов
const TOKEN_ENDPOINT = '/api/livekit/token';

// Ключ для хранения уникального device ID в localStorage
const DEVICE_ID_KEY = 'mafia_device_id';

/**
 * Получает стабильный ID устройства из localStorage или создает новый,
 * если такового еще нет. Этот ID сохраняется между сессиями.
 */
function getStableDeviceId(): string {
  // Проверяем, есть ли уже сохраненный идентификатор в localStorage
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  
  if (!deviceId) {
    // Если идентификатора нет, генерируем новый
    // Используем более надежный формат с двумя частями
    const randomPart1 = Math.floor(Math.random() * 9000) + 1000; // 1000-9999
    const randomPart2 = Math.floor(Math.random() * 9000) + 1000; // 1000-9999
    deviceId = `${randomPart1}-${randomPart2}`;
    
    // Сохраняем в localStorage для последующих сессий
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
    console.log('🆕 Создан новый стабильный ID устройства:', deviceId);
  } else {
    console.log('✅ Использован существующий стабильный ID устройства:', deviceId);
  }
  
  return deviceId;
}

/**
 * Генерирует стабильный идентификатор пользователя, который сохраняется
 * между перезагрузками страницы, но уникален для каждого устройства
 */
function generateStableIdentity(baseIdentity: string): string {
  // Получаем или создаем стабильный ID устройства
  const deviceId = getStableDeviceId();
  
  // Формируем идентификатор в формате base-deviceId
  return `${baseIdentity}-${deviceId}`;
}

/**
 * Глобальный тип для window, добавляем свойство для хранения идентификатора пользователя
 */
declare global {
  interface Window {
    currentUserIdentity: string;
  }
}

/**
 * Fetches a LiveKit token from the token service
 * 
 * @param identity The participant's identity/username
 * @param roomName Optional room name to join (defaults to server-side default)
 * @returns A Promise resolving to a LiveKit token
 */
export async function fetchToken(identity: string, roomName?: string): Promise<string> {
  try {
    // Создаем стабильный идентификатор, который не меняется между перезагрузками
    const stableIdentity = generateStableIdentity(identity);
    
    // Сохраняем идентификатор для последующего использования в веб-сокетах и компонентах
    window.currentUserIdentity = stableIdentity;
    
    console.log('🔑 Запрос токена для стабильного ID:', { identity: stableIdentity, roomName });
    console.log('💾 Сохранен глобальный идентификатор пользователя:', stableIdentity);
    
    // Получаем сохраненный ID сессии из localStorage, если есть
    let sessionId = localStorage.getItem('mafia_session_id');
    
    // Используем POST запрос с JSON телом
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        identity: stableIdentity,
        roomName,
        sessionId,  // Передаем ID сессии для сохранения данных между перезагрузками
        deviceId: getStableDeviceId()  // Передаем deviceId для дополнительной идентификации
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Ошибка получения токена:', errorText);
      throw new Error(`Token request failed: ${response.status} ${errorText}`);
    }
    
    // Parse response
    const data = await response.json();
    
    // The server returns { token, identity, room, sessionId }
    if (!data.token) {
      throw new Error('❌ Сервер не вернул токен авторизации');
    }
    
    // Если сервер вернул ID сессии, сохраняем его
    if (data.sessionId) {
      localStorage.setItem('mafia_session_id', data.sessionId);
      console.log('🔑 Сохранен ID сессии:', data.sessionId);
    }
    
    // Выводим информацию о слоте, если она есть
    if (data.slot) {
      console.log('🎯 Сервер предлагает использовать слот:', data.slot);
      
      // Сохраняем слот в localStorage 
      // (это дублирование на случай, если сервер не сможет сохранить данные)
      try {
        localStorage.setItem('mafia_user_slot', JSON.stringify({
          userId: stableIdentity,
          slotNumber: data.slot,
          timestamp: Date.now()
        }));
        console.log('💾 Сохранили рекомендованный слот в localStorage:', data.slot);
      } catch (e) {
        console.error('❌ Не удалось сохранить информацию о слоте в localStorage:', e);
      }
    }
    
    console.log('✅ Токен получен для комнаты:', data.room, 'начало токена:', data.token.substring(0, 20) + '...');
    
    return data.token;
  } catch (error) {
    console.error('❌ Ошибка при получении токена LiveKit:', error);
    throw error;
  }
}
