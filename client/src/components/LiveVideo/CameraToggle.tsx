import React from 'react';

/**
 * Компонент для переключения камеры
 * 
 * @param enabled - текущее состояние камеры (включена/выключена)
 * @param onToggle - функция для переключения состояния камеры
 * @param className - дополнительные классы стилей
 */
export const CameraToggle: React.FC<{
  enabled: boolean;
  onToggle: () => void;
  className?: string;
}> = ({ enabled, onToggle, className = '' }) => {
  
  return (
    <button 
      className={`flex items-center justify-center p-2 rounded-full transition-colors ${className} ${
        enabled ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
      }`}
      onClick={onToggle}
    >
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        className="h-6 w-6 text-white" 
        fill="none" 
        viewBox="0 0 24 24" 
        stroke="currentColor"
      >
        {enabled ? (
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" 
          />
        ) : (
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z M3 3l18 18" 
          />
        )}
      </svg>
    </button>
  );
};