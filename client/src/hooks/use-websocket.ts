import { useState, useEffect, useCallback, useRef } from 'react';
import { webSocketService } from '../lib/websocket';
import { useWebSocketContext } from '../contexts/WebSocketContext';

/**
 * Хук для работы с WebSocket соединением
 */
export function useWebSocket() {
  const context = useWebSocketContext();
  return context;
}

/**
 * Хук для прослушивания WebSocket сообщений определенного типа
 */
export function useWebSocketMessage<T = any>(messageType: string, defaultValue?: T) {
  const [message, setMessage] = useState<T | undefined>(defaultValue);
  const messageTypeRef = useRef(messageType);

  useEffect(() => {
    // Обновляем ref при изменении типа сообщения
    messageTypeRef.current = messageType;
  }, [messageType]);

  useEffect(() => {
    const messageListener = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.type === messageTypeRef.current) {
          console.log(`[useWebSocketMessage] Получено сообщение типа ${messageTypeRef.current}:`, data);
          setMessage(data);
        }
      } catch (error) {
        console.error('[useWebSocketMessage] Ошибка при обработке сообщения:', error);
      }
    };

    // Добавляем слушателя сообщений
    webSocketService.addMessageListener(messageListener);

    return () => {
      // Удаляем слушателя при размонтировании
      webSocketService.removeMessageListener(messageListener);
    };
  }, []); // Пустой массив зависимостей, так как используем ref

  return message;
}