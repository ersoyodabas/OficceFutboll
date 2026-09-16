import { WebSocketServer } from 'ws';

export function createWebSocketServer({ httpServer, onConnection }) {
  const wss = new WebSocketServer({ server: httpServer });
  wss.on('connection', onConnection);
  return wss;
}
