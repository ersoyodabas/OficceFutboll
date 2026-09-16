import { loadPlayerName } from '../core/playerProfile.js';
import { normalizeServerUrl, pageServerUrl } from '../network/urls.js';
export function initializeInvitations({ ui, state }) {
// The server address is fixed and hidden; only a ?server= query parameter overrides it.
ui.dom.serverInput.value = pageServerUrl();
ui.dom.nameInput.value = loadPlayerName();

// ---------- Launch parameters: game.html?server=...&from=...&name=...&join=1 ----------
// The server's /join landing page submits to this same page.
const inviteParams = new URLSearchParams(window.location.search);
state.autoJoinRequested = inviteParams.get('join') === '1';
(function readInviteParams() {
  const params = inviteParams;
  const server = params.get('server');
  const from = params.get('from');
  if (server) ui.dom.serverInput.value = normalizeServerUrl(server);
  if (params.get('name')) ui.dom.nameInput.value = params.get('name').trim().slice(0, 20);
  if (from) {
    const inviteNote = ui.dom.$('inviteNote');
    inviteNote.textContent = `⚽ ${from} seni maça davet etti!`;
    inviteNote.hidden = false;
  }
})();
}
