import { DEFAULT_SERVER_URL, SERVER_STORAGE_KEY } from '../core/config.js';
import { normalizeServerUrl, deriveHttpBaseUrl } from '../network/urls.js';
export function initializeInvitations({ ui, state }) {
(function initServerInput() {
  let savedServer = null;
  try { savedServer = localStorage.getItem(SERVER_STORAGE_KEY); } catch (e) { /* storage not available */ }
  ui.dom.serverInput.value = savedServer?.trim() || DEFAULT_SERVER_URL;
})();
try {
  const savedName = localStorage.getItem('officeFootballPlayerName');
  if (savedName) ui.dom.nameInput.value = savedName;
} catch (e) { /* storage not available */ }

// ---------- Invite handoff: game.html?server=...&from=...&name=...&join=1 ----------
// server.js serves this same page to invitees, so they use the extension's
// existing lobby without needing to know a machine-specific extension ID.
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
function buildInviteLink() {
  const serverUrl = normalizeServerUrl(ui.dom.serverInput.value);
  const base = deriveHttpBaseUrl(serverUrl);
  const from = ui.dom.nameInput.value.trim() || 'Bir oyuncu';
  return `${base}/join?server=${encodeURIComponent(serverUrl)}&from=${encodeURIComponent(from)}`;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fallback for contexts where the async Clipboard API is unavailable
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

let inviteStatusTimer = null;
function setInviteLinkStatus(state, message) {
  clearTimeout(inviteStatusTimer);
  ui.dom.inviteLinkStatus.classList.remove('success', 'error');
  if (state === 'success') {
    ui.dom.inviteLinkStatus.textContent = message;
    ui.dom.inviteLinkStatus.classList.add('success');
  } else if (state === 'error') {
    ui.dom.inviteLinkStatus.textContent = message;
    ui.dom.inviteLinkStatus.classList.add('error');
  } else {
    ui.dom.inviteLinkStatus.textContent = '';
    return;
  }
  inviteStatusTimer = setTimeout(() => setInviteLinkStatus('idle'), 3000);
}

ui.dom.copyInviteLinkBtn.addEventListener('click', async () => {
  ui.dom.copyInviteLinkBtn.disabled = true; // guards against rapid repeated clicks
  const link = buildInviteLink();
  const ok = await copyToClipboard(link);
  setInviteLinkStatus(ok ? 'success' : 'error', ok ? '✓ Bağlantı kopyalandı!' : 'Bağlantı kopyalanamadı.');
  ui.dom.copyInviteLinkBtn.disabled = false;
});


return { buildInviteLink };
}
