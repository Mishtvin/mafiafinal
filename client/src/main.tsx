import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Если на глобальном уровне нет идентификатора пользователя,
// добавляем его для совместимости с компонентами LiveKit
declare global {
  interface Window {
    currentUserIdentity: string;
  }
}

// Исправление проблемы с WebSocket в Vite dev
// Фикс для ошибки "Failed to construct 'WebSocket': The URL 'wss://localhost:undefined/?token=...' is invalid"
// Фикс применяется ПЕРЕД первым подключением WebSocket, чтобы предотвратить ошибки
(() => {
  try {
    // Сохраняем оригинальный конструктор
    const OriginalWebSocket = window.WebSocket;
    
    // Перехватываем все создания WebSocket для исправления URL
    window.WebSocket = function PatchedWebSocket(this: WebSocket, url: string | URL, protocols?: string | string[]) {
      // Исправляем URL, если он содержит "localhost:undefined"
      let finalUrl = url;
      
      if (typeof url === 'string') {
        // Проверяем наличие проблемы с URL
        if (url.includes('localhost:undefined')) {
          // Используем текущий хост для исправления URL
          const currentHost = window.location.host;
          finalUrl = url.replace('localhost:undefined', currentHost);
          console.log('[WebSocket патч]', url, '→', finalUrl);
        }
        
        // Обрабатываем случай, когда порт не определен (websocket.js:5 Uncaught DOMException)
        if (url.match(/localhost:\/?(\?|$)/)) {
          finalUrl = url.replace(/localhost:\/?(\?|$)/, `${window.location.host}$1`);
          console.log('[WebSocket патч порта]', url, '→', finalUrl);
        }
      }
      
      // Вызываем оригинальный конструктор
      return new OriginalWebSocket(finalUrl, protocols);
    } as any;
    
    // Копируем все свойства и прототип оригинального WebSocket
    window.WebSocket.prototype = OriginalWebSocket.prototype;
    Object.setPrototypeOf(window.WebSocket, OriginalWebSocket);

    console.log('[WebSocket патч] Установлен успешно');
  } catch (e) {
    console.error('[WebSocket патч] Ошибка при установке патча:', e);
  }
})();

createRoot(document.getElementById("root")!).render(<App />);
