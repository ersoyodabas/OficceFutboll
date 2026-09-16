import { PORT, TICK_HZ } from './config.js';
import { createGameState } from './gameState.js';
import { createBroadcast } from '../network/broadcast.js';
import { createLobbyManager } from '../lobby/lobbyManager.js';
import { createReadyManager } from '../lobby/readyManager.js';
import { createChatManager } from '../lobby/chatManager.js';
import { createInvitationHandler } from '../lobby/invitationManager.js';
import { buildWorld, createBallPhysics } from '../gameplay/ballPhysics.js';
import { createPlayerManager } from '../gameplay/playerManager.js';
import { createActions } from '../gameplay/actions.js';
import { createMatchManager } from '../gameplay/matchManager.js';
import { createSimulation } from '../gameplay/simulation.js';
import { createConnectionHandler } from '../network/messageHandler.js';
import { createHttpServer } from '../network/httpServer.js';
import { createWebSocketServer } from '../network/websocketServer.js';
import { getLanIPv4Addresses } from '../network/lan.js';

export function createServer() {
  const state = createGameState();
  const transport = createBroadcast({ state });
  const lobby = createLobbyManager({ state, ...transport });
  const ready = createReadyManager({ state, ...transport, ...lobby });
  const chat = createChatManager({ ...transport });
  const players = createPlayerManager({ state });
  const physics = createBallPhysics({ state });
  const actions = createActions({ state, ...transport });
  const match = createMatchManager({ state, ...transport, ...lobby, buildWorld, ...players });
  const simulation = createSimulation({ state, ...transport, ...lobby, players, physics, actions, match });
  const invitation = createInvitationHandler({ state, getLanIPv4Addresses,
    getPort: () => httpServer.address()?.port || PORT });
  const httpServer = createHttpServer(invitation);
  const connection = createConnectionHandler({ state, ...transport, ...lobby, ready, actions, match, lobby, chat });
  const wss = createWebSocketServer({ httpServer, ...connection });
  let interval;

  function listen(port = PORT, host = '0.0.0.0') {
    return new Promise((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(port, host, () => {
        httpServer.removeListener('error', reject);
        interval = setInterval(simulation.tick, 1000 / TICK_HZ);
        resolve(httpServer.address());
      });
    });
  }
  async function close() {
    clearInterval(interval);
    for (const ws of wss.clients) ws.terminate();
    await new Promise((resolve) => wss.close(resolve));
    await new Promise((resolve) => httpServer.close(resolve));
  }
  return { listen, close };
}

export async function startServer() {
  const server = createServer();
  const { port } = await server.listen();
  console.log('========================================\n OFFICE FUTBOLL SERVER\n========================================');
  console.log(`Local:\n  ws://localhost:${port}\n\nLAN:`);
  const addresses = getLanIPv4Addresses();
  if (addresses.length) addresses.forEach((ip) => console.log(`  ws://${ip}:${port}`));
  else console.log('  (LAN arayuzu bulunamadi)');
  console.log(`\nPort: ${port}\n\nWaiting for players...\n========================================`);
  return server;
}
