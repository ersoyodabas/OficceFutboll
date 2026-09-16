export function createBroadcast({ state }) {
function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const c of state.clients.values()) {
    if (c.ws && c.ws.readyState === c.ws.OPEN) c.ws.send(data);
  }
}

return { send, broadcast };
}
