// Shirt number derived from the player id, so the same person keeps the same
// number in the lobby lineup and on the pitch.
export function shirtNumberFor(id) {
  const text = String(id ?? '');
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return (hash % 23) + 1;
}
