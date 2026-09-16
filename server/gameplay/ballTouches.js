// Only authoritative possession, actions and physical contacts call this.
export function recordBallTouch(state, player, controlled = false) {
  if (!player?.inMatch || !['blue', 'red'].includes(player.team)) return;
  // A deflection preserves the attacking touch; established opposing control
  // starts a new attack, so a later own goal cannot credit a stale attacker.
  if (controlled) state.lastTouches[player.team === 'blue' ? 'red' : 'blue'] = null;
  state.lastTouches[player.team] = { id: player.id, name: player.name, at: Date.now() };
}
