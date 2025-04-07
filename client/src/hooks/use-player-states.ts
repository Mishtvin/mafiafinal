import { useCallback, useEffect, useState, useRef } from "react";
import { PlayerStates } from "@shared/schema";
import { WebSocketMessage } from "./use-resilient-websocket";

/**
 * Хук для управления состояниями игроков (убит/жив)
 * @param sendMessage Функция отправки сообщений через WebSocket
 * @param userId ID текущего пользователя
 */
export function usePlayerStates(
  sendMessage: (message: WebSocketMessage) => boolean,
  userId: string
) {
  const [playerStates, setPlayerStates] = useState<PlayerStates>({ killedPlayers: {} });
  const [isHost, setIsHost] = useState<boolean>(userId.startsWith('Host-'));
  const handlerRef = useRef<((data: any) => void) | null>(null);

  // Обработчик сообщений о состоянии игроков
  const handlePlayerStatesMessage = useCallback((data: any) => {
    if (data.type === 'player_states_update') {
      console.log('Получено обновление состояний игроков:', data.playerStates);
      setPlayerStates(data.playerStates);
    }
  }, []);

  // Устанавливаем флаг ведущего при изменении userId
  useEffect(() => {
    setIsHost(userId.startsWith('Host-'));
  }, [userId]);

  // Регистрация обработчика сообщений о состоянии игроков в глобальном массиве
  useEffect(() => {
    // Сохраняем ссылку на обработчик для последующего удаления
    handlerRef.current = handlePlayerStatesMessage;
    
    // Добавляем обработчик в глобальный массив
    if (window.messageHandlers) {
      window.messageHandlers.push(handlePlayerStatesMessage);
      console.log('Зарегистрирован обработчик сообщений о состоянии игроков');
    }
    
    // Очистка при размонтировании
    return () => {
      if (window.messageHandlers && handlerRef.current) {
        const index = window.messageHandlers.indexOf(handlerRef.current);
        if (index !== -1) {
          window.messageHandlers.splice(index, 1);
          console.log('Удален обработчик сообщений о состоянии игроков');
        }
      }
    };
  }, [handlePlayerStatesMessage]);

  // Запрашиваем текущие состояния при монтировании
  useEffect(() => {
    // При монтировании запрашиваем текущие состояния игроков
    console.log('Запрашиваем текущие состояния игроков');
    sendMessage({ type: 'get_player_states' });
  }, [sendMessage]);

  /**
   * Отметить игрока как убитого
   * @param targetUserId ID пользователя, которого нужно отметить
   * @returns true если сообщение отправлено успешно
   */
  const killPlayer = useCallback((targetUserId: string) => {
    console.log(`Отправка запроса на пометку игрока ${targetUserId} как убитого`);
    return sendMessage({
      type: 'kill_player',
      targetUserId
    });
  }, [sendMessage]);

  /**
   * Отметить игрока как живого
   * @param targetUserId ID пользователя, которого нужно отметить
   * @returns true если сообщение отправлено успешно
   */
  const revivePlayer = useCallback((targetUserId: string) => {
    console.log(`Отправка запроса на пометку игрока ${targetUserId} как живого`);
    return sendMessage({
      type: 'revive_player',
      targetUserId
    });
  }, [sendMessage]);

  /**
   * Сбросить все отметки "убит"
   * @returns true если сообщение отправлено успешно
   */
  const resetAllPlayerStates = useCallback(() => {
    console.log('Отправка запроса на сброс всех состояний игроков');
    return sendMessage({
      type: 'reset_player_states'
    });
  }, [sendMessage]);

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
    isPlayerKilled,
    handlePlayerStatesMessage, // Экспортируем обработчик для использования в других компонентах
  };
}