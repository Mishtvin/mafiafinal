import { PlayerStates } from "../../shared/schema";
import { WebSocketMessage } from "./ConnectionManager";
import { connectionManager } from "./ConnectionManager";
import { globalEvents } from "./EventEmitter";

/**
 * Менеджер состояний игроков (убит/жив)
 */
export class PlayerStateManager {
  private killedPlayers = new Map<string, boolean>();

  constructor() {
    console.log('Инициализация PlayerStateManager');
  }

  /**
   * Отметить игрока как убитого
   * @param hostId ID пользователя-ведущего
   * @param userId ID пользователя, которого нужно пометить как убитого
   * @returns true если операция успешна
   */
  markPlayerAsKilled(hostId: string, userId: string): boolean {
    // Проверка, является ли пользователь ведущим
    if (!this.isUserHost(hostId)) {
      console.log(`Пользователь ${hostId} не является ведущим и не может отметить игрока как убитого`);
      return false;
    }

    // Ведущий не может быть убит
    if (this.isUserHost(userId)) {
      console.log(`Ведущий ${userId} не может быть отмечен как убитый`);
      return false;
    }

    // Отмечаем игрока как убитого
    this.killedPlayers.set(userId, true);
    console.log(`Игрок ${userId} отмечен как убитый ведущим ${hostId}`);
    
    // Отправляем обновление всем клиентам
    this.broadcastPlayerStates();
    
    return true;
  }

  /**
   * Пометить игрока как живого
   * @param hostId ID пользователя-ведущего
   * @param userId ID пользователя, которого нужно пометить как живого
   * @returns true если операция успешна
   */
  markPlayerAsAlive(hostId: string, userId: string): boolean {
    // Проверка, является ли пользователь ведущим
    if (!this.isUserHost(hostId)) {
      console.log(`Пользователь ${hostId} не является ведущим и не может отметить игрока как живого`);
      return false;
    }

    // Удаляем пометку "убит"
    this.killedPlayers.delete(userId);
    console.log(`Игрок ${userId} отмечен как живой ведущим ${hostId}`);
    
    // Отправляем обновление всем клиентам
    this.broadcastPlayerStates();
    
    return true;
  }

  /**
   * Проверить, убит ли игрок
   * @param userId ID пользователя
   * @returns true если игрок убит
   */
  isPlayerKilled(userId: string): boolean {
    return this.killedPlayers.get(userId) === true;
  }

  /**
   * Получить состояния игроков для отправки клиентам
   */
  getPlayerStates(): PlayerStates {
    // Преобразуем Map в объект для отправки клиентам
    const killedPlayersObj: Record<string, boolean> = {};
    this.killedPlayers.forEach((value, key) => {
      killedPlayersObj[key] = value;
    });
    
    return {
      killedPlayers: killedPlayersObj
    };
  }

  /**
   * Отправить состояния игроков всем клиентам
   */
  broadcastPlayerStates(): void {
    const playerStates = this.getPlayerStates();
    const message: WebSocketMessage = {
      type: "player_states_update",
      playerStates
    };
    
    // Отправляем через WebSocket
    connectionManager.broadcastToAll(message);
    
    // Также отправляем через EventEmitter для обработчиков
    globalEvents.emit("player_states_updated", playerStates);
    
    console.log('Отправлено обновление состояний игроков всем клиентам');
  }

  /**
   * Отправить текущие состояния игроков конкретному клиенту
   * @param userId ID пользователя
   */
  sendPlayerStatesToUser(userId: string): void {
    const message: WebSocketMessage = {
      type: "player_states_update",
      playerStates: this.getPlayerStates()
    };
    
    connectionManager.sendToUser(userId, message);
    console.log(`Отправлено обновление состояний игроков пользователю ${userId}`);
  }

  /**
   * Проверить, является ли пользователь ведущим
   * @param userId ID пользователя
   * @returns true, если пользователь - ведущий
   */
  private isUserHost(userId: string): boolean {
    return userId.startsWith('Host-');
  }

  /**
   * Сбросить все отметки "убит"
   * @param hostId ID пользователя-ведущего
   * @returns true если операция успешна
   */
  resetAllPlayerStates(hostId: string): boolean {
    // Проверка, является ли пользователь ведущим
    if (!this.isUserHost(hostId)) {
      console.log(`Пользователь ${hostId} не является ведущим и не может сбросить состояния игроков`);
      return false;
    }

    // Сбрасываем все отметки
    this.killedPlayers.clear();
    console.log(`Все состояния игроков сброшены ведущим ${hostId}`);
    
    // Отправляем обновление всем клиентам
    this.broadcastPlayerStates();
    
    return true;
  }

  /**
   * Очистить состояние для игрока при отключении
   * @param userId ID пользователя
   */
  clearPlayerState(userId: string): void {
    if (this.killedPlayers.has(userId)) {
      this.killedPlayers.delete(userId);
      console.log(`Состояние удалено для отключившегося пользователя ${userId}`);
      this.broadcastPlayerStates();
    }
  }
}

// Экспортируем глобальный экземпляр менеджера
export const playerStateManager = new PlayerStateManager();