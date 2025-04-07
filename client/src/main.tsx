import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Инициализация глобальных переменных
(window as any).currentUserIdentity = '';
(window as any).messageHandlers = [];

createRoot(document.getElementById("root")!).render(<App />);
