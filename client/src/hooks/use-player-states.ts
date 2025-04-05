import { useCallback, useEffect, useState } from "react";
import { PlayerStates } from "@shared/schema";

/**
 * Хук для управления состояниями игроков (убит/жив)
 * @param wsRef Ссылка на WebSocket соединение
 * @param userId ID текущего пользователя
 */
export function usePlayerStates(wsRef: React.MutableRefObject<WebSocket | null>, userId: string) {
  const [playerStates, setPlayerStates] = useState<PlayerStates>({ killedPlayers: {} });
  const [isHost, setIsHost] = useState<boolean>(userId.startsWith('Host-'));

  useEffect(() => {
    // Устанавливаем флаг ведущего на основе ID пользователя
    setIsHost(userId.startsWith('Host-'));

    // Проверяем, что websocket существует
    if (!wsRef.current) {
      console.log('WebSocket не инициализирован');
      return;
    }

    // Обработчик сообщений для обновления состояний игроков
    const messageHandler = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'player_states_update') {
          console.log('Получено обновление состояний игроков:', data.playerStates);
          setPlayerStates(data.playerStates);
        }
      } catch (error) {
        console.error('Ошибка обработки сообщения WebSocket:', error);
      }
    };

    // Добавляем обработчик сообщений
    wsRef.current.addEventListener('message', messageHandler);

    // При монтировании запрашиваем текущие состояния
    if (wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'get_player_states' }));
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.removeEventListener('message', messageHandler);
      }
    };
  }, [wsRef, userId]);

  /**
   * Отметить игрока как убитого
   * @param targetUserId ID пользователя, которого нужно отметить
   * @returns true если сообщение отправлено успешно
   */
  const killPlayer = useCallback((targetUserId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket не подключен');
      return false;
    }

    console.log(`Отправка запроса на пометку игрока ${targetUserId} как убитого`);
    wsRef.current.send(JSON.stringify({
      type: 'kill_player',
      targetUserId
    }));

    return true;
  }, [wsRef]);

  /**
   * Отметить игрока как живого
   * @param targetUserId ID пользователя, которого нужно отметить
   * @returns true если сообщение отправлено успешно
   */
  const revivePlayer = useCallback((targetUserId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket не подключен');
      return false;
    }

    console.log(`Отправка запроса на пометку игрока ${targetUserId} как живого`);
    wsRef.current.send(JSON.stringify({
      type: 'revive_player',
      targetUserId
    }));

    return true;
  }, [wsRef]);

  /**
   * Сбросить все отметки "убит"
   * @returns true если сообщение отправлено успешно
   */
  const resetAllPlayerStates = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket не подключен');
      return false;
    }

    console.log('Отправка запроса на сброс всех состояний игроков');
    wsRef.current.send(JSON.stringify({
      type: 'reset_player_states'
    }));

    return true;
  }, [wsRef]);

  /**
   * Проверить, убит ли игрок
   * @param playerId ID пользователя
   * @returns true если игрок отмечен как убитый
   */
  const isPlayerKilled = useCallback((playerId: string) => {
    return !!playerStates.killedPlayers?.[playerId];
  }, [playerStates]);

  return {
    playerStates,
    isHost,
    killPlayer,
    revivePlayer,
    resetAllPlayerStates,
    isPlayerKilled
  };
}