import { DEFAULT_SERVER_URL } from '../core/config.js';

// A page served by the game server (http://host:3000/) connects back to that
// same host; the extension page has no such host and uses the fixed LAN address.
export function pageServerUrl() {
  const page = globalThis.location;
  if (page?.protocol === 'http:' || page?.protocol === 'https:') {
    return `${page.protocol === 'https:' ? 'wss' : 'ws'}://${page.host}`;
  }
  return DEFAULT_SERVER_URL;
}

export function normalizeServerUrl(value) {
  let url = (value || '').trim();
  if (!url) url = pageServerUrl();
  if (!/^wss?:\/\//i.test(url)) url = 'ws://' + url;
  return url;
}
