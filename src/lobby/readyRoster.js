import { clubIdentity } from '../../shared/clubs.js';
// A view of the existing server roster, including players without a pitch slot.
export function createReadyRoster(container) {
  const rows = new Map();
  return function render(players, myId, teams) {
    const seen = new Set();
    for (const player of players) {
      seen.add(player.id);
      let row = rows.get(player.id);
      if (!row) {
        const root = document.createElement('li'); root.className = 'ready-player'; root.dataset.playerId = player.id;
        const badge = document.createElement('span'); badge.className = 'ready-badge';
        const name = document.createElement('strong'); name.className = 'ready-player-name';
        const detail = document.createElement('span'); detail.className = 'ready-player-detail';
        root.append(badge, name, detail); container.append(root);
        row = { root, badge, name, detail }; rows.set(player.id, row);
      }
      const mode = player.inMatch ? 'in-match' : player.ready ? 'ready' : 'not-ready';
      row.root.dataset.status = mode;
      row.badge.textContent = player.inMatch ? 'SAHADA' : player.ready ? '✓ HAZIR' : '! HAZIR DEĞİL';
      row.name.textContent = player.name;
      row.detail.textContent = [player.id === myId ? 'SEN' : null,
        teams?.[player.team]?.captainId === player.id ? 'KAPTAN' : null,
        Number.isInteger(player.slot) ? (clubIdentity(teams?.[player.team])?.name || 'Takım') : 'Yer seçiyor'].filter(Boolean).join(' · ');
    }
    for (const [id, row] of rows) if (!seen.has(id)) { row.root.remove(); rows.delete(id); }
  };
}
