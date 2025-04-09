import { AccessToken, VideoGrant } from 'livekit-server-sdk';

/**
 * Интерфейс для результата генерации токена
 */
export interface TokenResult {
  token: string;
  identity: string;
  room: string;
}

/**
 * Менеджер токенов LiveKit
 */
export class TokenManager {
  private apiKey: string | undefined;
  private apiSecret: string | undefined;
  private liveKitUrl: string;

  constructor() {
    this.apiKey = process.env.LIVEKIT_API_KEY;
    this.apiSecret = process.env.LIVEKIT_API_SECRET;
    this.liveKitUrl = 'wss://mafia.nyavkin.site/';
    
    console.log('TokenManager: Инициализирован');
    console.log(`LiveKit API Key настроен: ${this.isConfigured() ? 'Да' : 'Нет'}`);
  }

  /**
   * Проверить, настроен ли менеджер правильно
   */
  isConfigured(): boolean {
    return !!(this.apiKey && this.apiSecret);
  }

  /**
   * Сгенерировать токен для пользователя и комнаты
   * @param identity Идентификатор пользователя
   * @param roomName Имя комнаты (по умолчанию 'default-room')
   * @param ttl Время жизни токена в секундах (по умолчанию 24 часа)
   */
  async generateToken(identity: string, roomName: string = 'mafialive-room', ttl: number = 3600 * 24): Promise<TokenResult> {
    if (!this.isConfigured()) {
      throw new Error('LiveKit API credentials are not configured');
    }
    
    try {
      // Создание токена доступа
      const at = new AccessToken(this.apiKey!, this.apiSecret!, {
        identity,
        ttl,
      });
      
      // Определяем права доступа
      const videoGrant: VideoGrant = {
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      };
      
      at.addGrant(videoGrant);
      
      // Создаем JWT токен
      const jwt = await Promise.resolve(at.toJwt());
      const tokenString = String(jwt);
      
      console.log(`Сгенерирован токен для пользователя ${identity}, комната: ${roomName}`);
      
      return {
        token: tokenString,
        identity,
        room: roomName
      };
    } catch (error) {
      console.error('Ошибка генерации токена LiveKit:', error);
      throw error;
    }
  }

  /**
   * Получить URL сервера LiveKit
   */
  getLiveKitUrl(): string {
    return this.liveKitUrl;
  }
}

// Создаем глобальный экземпляр менеджера токенов
export const tokenManager = new TokenManager();