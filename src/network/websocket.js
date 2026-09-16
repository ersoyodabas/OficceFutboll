import { normalizeServerUrl } from './urls.js';

// Transport owns the socket. Presentation and session transitions are callbacks.
export function createWebSocketClient({ getConnection, onStatus, onMessage, onClose }) {
  let ws = null;
  let connecting = false;

  function dispose() {
    if (!ws) return;
    ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
    ws = null;
    connecting = false;
  }

  function connect() {
    if (connecting) return;
    const { serverUrl: input } = getConnection();
    const serverUrl = normalizeServerUrl(input);
    dispose();
    connecting = true;
    onStatus('connecting', serverUrl);
    try {
      ws = new WebSocket(serverUrl);
    } catch {
      connecting = false;
      onStatus('failed');
      return;
    }
    ws.onopen = () => {
      connecting = false;
      onStatus('connected', serverUrl);
    };
    ws.onmessage = (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message && typeof message.type === 'string') onMessage(message);
    };
    ws.onclose = () => { connecting = false; onClose(); };
    ws.onerror = () => {};
  }

  function ensureConnected() {
    if (isOpen()) return Promise.resolve();
    if (!ws || ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) connect();
    const socket = ws;
    if (!socket) return Promise.reject(new Error('Sunucuya bağlanılamadı.'));
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        socket.removeEventListener('open', onOpen);
        socket.removeEventListener('error', onFailure);
        socket.removeEventListener('close', onFailure);
      };
      const onOpen = () => { cleanup(); resolve(); };
      const onFailure = () => { cleanup(); reject(new Error('Sunucuya bağlanılamadı.')); };
      const timeout = setTimeout(() => { cleanup(); reject(new Error('Bağlantı zaman aşımına uğradı.')); }, 10000);
      socket.addEventListener('open', onOpen);
      socket.addEventListener('error', onFailure);
      socket.addEventListener('close', onFailure);
      if (socket.readyState === WebSocket.OPEN) onOpen();
    });
  }

  const isOpen = () => ws?.readyState === WebSocket.OPEN;
  function send(message) { if (isOpen()) ws.send(JSON.stringify(message)); }
  return { ensureConnected, send, isOpen, dispose };
}
