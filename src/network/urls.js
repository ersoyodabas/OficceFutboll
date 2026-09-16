import { DEFAULT_SERVER_URL } from '../core/config.js';
export function normalizeServerUrl(value) {
  let url = (value || '').trim();
  if (!url) url = DEFAULT_SERVER_URL;
  if (!/^wss?:\/\//i.test(url)) url = 'ws://' + url;
  return url;
}

// The invite link's landing page (server.js's GET /join) shares the same
// host/port as the WebSocket server — no second port. Given
// ws://host:port -> http://host:port, wss://host:port -> https://host:port.
export function deriveHttpBaseUrl(wsUrl) {
  return wsUrl.replace(/^ws:\/\//i, 'http://').replace(/^wss:\/\//i, 'https://').replace(/\/$/, '');
}
