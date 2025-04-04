import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

export async function registerRoutes(app: Express): Promise<Server> {
  // Token proxy endpoint if needed
  app.get('/api/token', async (req, res) => {
    try {
      const identity = req.query.identity as string;
      
      if (!identity) {
        return res.status(400).json({ error: 'Missing identity parameter' });
      }
      
      // Proxy the request to the original token service
      const response = await fetch(`http://mish.leb1gamafia.com/token?identity=${encodeURIComponent(identity)}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ error: `Token service error: ${errorText}` });
      }
      
      const tokenData = await response.json();
      return res.json(tokenData);
    } catch (error) {
      console.error('Error proxying token request:', error);
      return res.status(500).json({ error: 'Failed to obtain token' });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
