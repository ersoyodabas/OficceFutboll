// In-process presentation events, independent of the WebSocket wire contract.
export function createEvents() {
  const listeners = new Map();
  function on(type, listener) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(listener);
    return () => listeners.get(type)?.delete(listener);
  }
  function emit(type, payload) {
    for (const listener of listeners.get(type) || []) listener(payload);
  }
  return { on, emit };
}
