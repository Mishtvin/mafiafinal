import React from 'react';
import { useWebSocketContext } from '../../contexts/WebSocketContext';

/**
 * Компонент для отображения статуса соединения WebSocket
 * Показывает различные индикаторы в зависимости от состояния соединения
 */
export const ConnectionIndicator: React.FC = () => {
  const { status } = useWebSocketContext();
  
  // Определяем классы и текст в зависимости от статуса
  let indicatorClass = '';
  let indicatorText = '';
  
  switch (status) {
    case 'connected':
      indicatorClass = 'bg-green-500';
      indicatorText = 'Подключено';
      break;
    case 'connecting':
      indicatorClass = 'bg-yellow-500 animate-pulse';
      indicatorText = 'Подключение...';
      break;
    case 'reconnecting':
      indicatorClass = 'bg-yellow-500 animate-pulse';
      indicatorText = 'Переподключение...';
      break;
    case 'disconnected':
      indicatorClass = 'bg-red-500';
      indicatorText = 'Отключено';
      break;
  }
  
  return (
    <div className="absolute top-4 right-4 z-20 flex items-center">
      <div className={`w-3 h-3 rounded-full mr-2 ${indicatorClass}`}></div>
      <span className="text-xs text-white bg-black/50 px-2 py-1 rounded-md backdrop-blur-sm">
        {indicatorText}
      </span>
    </div>
  );
};