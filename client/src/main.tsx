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
if (import.meta.hot) {
  // Оригинальный WebSocket
  const OriginalWebSocket = window.WebSocket;
  
  // Переопределяем WebSocket
  window.WebSocket = class PatchedWebSocket extends OriginalWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      // Исправляем URL, если он содержит "localhost:undefined"
      if (typeof url === 'string' && url.includes('localhost:undefined')) {
        // Заменяем неопределенный порт на корректный
        const host = window.location.host;
        const fixedUrl = url.replace('localhost:undefined', host);
        console.log('[WebSocket patched URL]', url, '→', fixedUrl);
        super(fixedUrl, protocols);
      } else {
        super(url, protocols);
      }
    }
  } as any;
}

createRoot(document.getElementById("root")!).render(<App />);
