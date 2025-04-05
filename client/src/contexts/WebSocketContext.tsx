import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { webSocketService } from '../lib/websocket';

// Интерфейс для контекста WebSocket
export interface WebSocketContextType {
  status: 'connected' | 'disconnected' | 'connecting' | 'reconnecting';
  isConnected: boolean;
  sendMessage: (message: any) => boolean;
}

// Создаем контекст с дефолтными значениями
const WebSocketContext = createContext<WebSocketContextType>({
  status: 'disconnected',
  isConnected: false,
  sendMessage: () => false,
});

// Провайдер контекста
export const WebSocketProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'connecting' | 'reconnecting'>(
    'disconnected'
  );

  useEffect(() => {
    // Функция для обновления статуса в контексте
    const statusListener = (newStatus: 'connected' | 'disconnected' | 'connecting' | 'reconnecting') => {
      console.log('[WebSocketContext] Status changed to:', newStatus);
      setStatus(newStatus);
    };

    // Добавляем слушателя статуса
    webSocketService.addStatusListener(statusListener);
    
    // Проверяем начальное соединение
    webSocketService.checkConnection();

    // Проверяем соединение периодически
    const intervalId = setInterval(() => {
      webSocketService.checkConnection();
    }, 30000); // Каждые 30 секунд

    return () => {
      webSocketService.removeStatusListener(statusListener);
      clearInterval(intervalId);
    };
  }, []);

  // Определяем, подключены ли мы
  const isConnected = status === 'connected';

  // Функция для отправки сообщений
  const sendMessage = (message: any) => {
    return webSocketService.send(message);
  };

  // Предоставляем состояние и функции через контекст
  const value = {
    status,
    isConnected,
    sendMessage,
  };

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
};

// Хук для использования контекста
export const useWebSocketContext = () => {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
};