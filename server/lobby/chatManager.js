import crypto from 'node:crypto';
import { SERVER } from '../../src/network/protocol.js';

const MAX_MESSAGE_LENGTH = 200;

// Strip control characters and angle brackets so broadcast text can never carry
// markup; the client also renders with textContent as a second layer of defense.
function sanitize(rawMessage) {
  return String(rawMessage ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);
}

export function createChatManager({ broadcast }) {
  function addMessage(client, rawMessage) {
    const message = sanitize(rawMessage);
    if (!message) return;
    const entry = { id: crypto.randomUUID(), senderName: client.name, team: client.team, message, timestamp: Date.now() };
    broadcast({ type: SERVER.NEW_CHAT_MESSAGE, message: entry });
  }
  return { addMessage };
}
