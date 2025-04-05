import React, { useState } from 'react';
import { useWebSocketContext } from '../../contexts/WebSocketContext';
import { useCameraContext } from '../../contexts/CameraContext';

/**
 * Компонент для переключения состояния камеры
 */
export const CameraToggle: React.FC = () => {
  // Получаем доступ к состоянию и функциям из контекстов
  const { isConnected } = useWebSocketContext();
  const { cameraEnabled, toggleCamera } = useCameraContext();
  
  // Локальное состояние для анимации
  const [animating, setAnimating] = useState(false);
  
  // Функция для обработки нажатия на кнопку
  const handleToggle = () => {
    // Не выполняем действие, если не подключены к серверу
    if (!isConnected) {
      console.log('[CameraToggle] Невозможно переключить камеру: нет соединения с сервером');
      return;
    }
    
    // Запускаем анимацию
    setAnimating(true);
    
    // Новое состояние (инвертируем текущее)
    const newState = !cameraEnabled;
    console.log('[CameraToggle] Переключение камеры на:', newState);
    
    // Обновляем состояние камеры в контексте
    // (это запустит эффект в CameraContext, который отправит WebSocket сообщение)
    toggleCamera();
    
    // Останавливаем анимацию после завершения
    setTimeout(() => {
      setAnimating(false);
    }, 300);
  };
  
  // Определяем классы в зависимости от состояния
  const buttonClass = cameraEnabled 
    ? 'bg-blue-600 hover:bg-blue-700' 
    : 'bg-slate-700 hover:bg-slate-800';
  
  const iconClass = cameraEnabled 
    ? '' 
    : 'opacity-50';
  
  return (
    <button 
      onClick={handleToggle}
      disabled={!isConnected || animating}
      className={`${buttonClass} ${animating ? 'scale-95' : 'scale-100'} 
        transition-all duration-200 rounded-full p-3 focus:outline-none 
        focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 
        text-white shadow-lg`}
      aria-label={cameraEnabled ? "Выключить камеру" : "Включить камеру"}
    >
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        className={`h-6 w-6 ${iconClass}`}
        fill="none" 
        viewBox="0 0 24 24" 
        stroke="currentColor"
      >
        {cameraEnabled ? (
          // Иконка включенной камеры
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={1.5} 
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" 
          />
        ) : (
          // Иконка выключенной камеры
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={1.5} 
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z M3 3l18 18" 
          />
        )}
      </svg>
    </button>
  );
};