import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import { WebSocket } from "ws";
import { 
  tokenManager, 
  connectionManager, 
  slotManager, 
  cameraManager 
} from "./managers";

export async function registerRoutes(app: Express): Promise<Server> {
  // API endpoints
  app.get('/api/healthcheck', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(), 
      livekit: { 
        configured: tokenManager.isConfigured(),
        url: tokenManager.getLiveKitUrl()
      },
      connections: connectionManager.getConnectionCount(),
      slots: slotManager.getOccupiedSlotsCount()
    });
  });
  
  // Эндпоинт для создания токена LiveKit (GET)
  app.get('/api/token', async (req, res) => {
    try {
      const identity = req.query.identity as string;
      const roomName = req.query.roomName as string || 'mafialive-room';
      
      if (!identity) {
        return res.status(400).json({ error: 'Missing identity parameter' });
      }
      
      if (!tokenManager.isConfigured()) {
        return res.status(500).json({ error: 'LiveKit API credentials are not configured' });
      }
      
      // Генерируем токен через TokenManager
      try {
        const tokenResult = await tokenManager.generateToken(identity, roomName);
        return res.json(tokenResult);
      } catch (tokenError) {
        console.error('Error generating token:', tokenError);
        return res.status(500).json({ error: 'Failed to generate token' });
      }
    } catch (error) {
      console.error('Error handling GET request for LiveKit token:', error);
      return res.status(500).json({ error: 'Failed to generate token' });
    }
  });
  
  // Эндпоинт для создания токена LiveKit (POST)
  app.post('/api/livekit/token', async (req, res) => {
    try {
      const { identity, roomName } = req.body;
      
      if (!identity) {
        return res.status(400).json({ error: 'Missing identity parameter' });
      }
      
      if (!tokenManager.isConfigured()) {
        return res.status(500).json({ error: 'LiveKit API credentials are not configured' });
      }
      
      // Генерируем токен через TokenManager
      try {
        const tokenResult = await tokenManager.generateToken(identity, roomName);
        return res.json(tokenResult);
      } catch (tokenError) {
        console.error('Error generating token:', tokenError);
        return res.status(500).json({ error: 'Failed to generate token' });
      }
    } catch (error) {
      console.error('Error handling POST request for LiveKit token:', error);
      return res.status(500).json({ error: 'Failed to generate token' });
    }
  });
  
  // Создаем HTTP сервер
  const httpServer = createServer(app);
  
  // Создаем WebSocket сервер на отдельном пути
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  console.log('WebSocket server initialized on path /ws');
  
  // Обработчик подключений WebSocket
  wss.on('connection', (ws: WebSocket) => {
    let userId: string | null = null;
    
    // Обработка входящих сообщений
    ws.on('message', (message: Buffer | string) => {
      try {
        const messageStr = message.toString();
        const data = JSON.parse(messageStr);
        
        // Обработка регистрации пользователя
        if (data.type === 'register') {
          // Получаем ID пользователя из сообщения
          userId = data.userId;
          
          if (userId) {
            // Регистрируем соединение в менеджере
            connectionManager.registerConnection(userId, ws);
            console.log(`Пользователь зарегистрирован: ${userId}`);
            
            // Находим или назначаем слот для пользователя
            const assignedSlot = slotManager.assignFirstAvailableSlot(userId);
            console.log(`Автоматически назначен слот ${assignedSlot} для ${userId}`);
            
            // Выводим отладочную информацию
            slotManager.logCurrentAssignments();
          }
        } else if (userId) {
          // Если есть userId, передаем сообщение в ConnectionManager для обработки
          connectionManager.handleMessage(userId, data);
        }
      } catch (error) {
        console.error('Ошибка обработки сообщения WebSocket:', error);
      }
    });
    
    // Обработка закрытия соединения обрабатывается в ConnectionManager
    
    // Обработка ошибок
    ws.on('error', (error) => {
      console.error('WebSocket ошибка:', error);
      if (userId) {
        connectionManager.disconnectUser(userId);
      }
    });
  });
  
  // Возвращаем HTTP сервер
  return httpServer;
}
