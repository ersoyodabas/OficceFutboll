import { createClubSelector } from './clubSelector.js';
import { clubIdentity } from '../../shared/clubs.js';
import { createProfile } from './profile.js';
import { createReadyRoster } from './readyRoster.js';
import { validatePlayerName } from '../../shared/playerName.js';
import { isMatchPhase } from '../../shared/matchPhases.js';
import { CLIENT, SERVER } from '../network/protocol.js';
import { FIELD } from '../../shared/field.js';
import { LobbyView } from './lobbyView.js';
import { normalizeServerUrl } from '../network/urls.js';
export function createLobby({ state, ui, network, events, audio, grassMat, createGrassGeometry, createPitchMarkings, createFootballer }) {
const clubs = createClubSelector({ state, ui, network, events });
const profile = createProfile({ state, ui, network, events });
const renderRoster = createReadyRoster(ui.dom.$('readyRoster'));
let lobbyView = null;
let joinInProgress = false;
let lastLobbySfxSentAt = 0;
function renderLobby(msg) {
  ui.dom.scoreBlueEl.textContent = msg.score.blue;
  ui.dom.scoreRedEl.textContent = msg.score.red;
  const players = msg.players.filter((p) => !p.isAI);
  const me = players.find((p) => p.id === state.myId);
  clubs.render(msg);
  renderRoster(players, state.myId, msg.teams);
  if (me) {
    profile.sync(me);
    state.myTeam = me.team;
    state.myPosition = me.position;
    state.mySlot = me.slot;
    state.myReady = !!me.ready;
    ui.dom.$('profileRole').textContent = Number.isInteger(state.mySlot)
      ? `${clubIdentity(msg.teams?.[state.myTeam])?.name || 'Takım'}${msg.teams?.[state.myTeam]?.captainId === state.myId ? ' • KAPTAN' : ''}`
      : 'Sahada bir yer seç';
  }
  const inCountdown = msg.phase === 'countdown';
  const matchInProgress = isMatchPhase(msg.phase) || msg.phase === 'ended';
  const readyCount = players.filter((p) => p.ready).length;
  const selected = Number.isInteger(state.mySlot);
  ui.dom.$('lobbyPlayerCount').textContent = `${players.length} oyuncu`;
  for (const team of ['blue', 'red']) {
    ui.dom.$(team + 'RosterCount').textContent = `${players.filter((p) => p.team === team && Number.isInteger(p.slot)).length} / 5`;
  }
  if (!lobbyView) {
    lobbyView = new LobbyView({
      container: ui.dom.$('lobbyPitch'), slotsElement: ui.dom.$('pitchSlots'), field: FIELD,
      grassMaterial: grassMat, grassGeometry: createGrassGeometry, drawMarkings: createPitchMarkings,
      createFootballer: (team, number, target) => createFootballer(team, number, '', false, target),
      onSelect: (team, slot) => {
        if (!network.isOpen()) return;
        audio.playSfx('click');
        if (team === state.myTeam && slot === state.mySlot) {
          // clicking your own placed character just gives a click cue to nearby players too
          const now = Date.now();
          if (now - lastLobbySfxSentAt > 3000) { lastLobbySfxSentAt = now; network.send({ type: CLIENT.LOBBY_SFX }); }
          return;
        }
        ui.dom.slotStatus.textContent = '';
        network.send({ type: CLIENT.SELECT_SLOT, team, slot });
      },
    });
  }
  lobbyView.update(players, state.myId, inCountdown || !!me?.inMatch, msg.teams);
  ui.dom.slotStatus.textContent = '';
  ui.dom.readyBtn.disabled = !selected || inCountdown || matchInProgress;
  ui.dom.readyBtn.textContent = matchInProgress ? 'MAÇ BEKLENİYOR' : state.myReady ? '✔ HAZIR • İPTAL ET' : 'HAZIRIM';
  ui.dom.readyBtn.classList.toggle('isReady', state.myReady);
  ui.dom.$('readyMeterFill').style.width = `${players.length ? readyCount / players.length * 100 : 0}%`;
  if (matchInProgress) {
    ui.dom.lobbyStatus.textContent = 'Devam eden maç bitince yeni maça katılabilirsin.';
  } else if (inCountdown) {
    ui.dom.lobbyStatus.textContent = 'Herkes hazır! Maç başlıyor…';
  } else {
    ui.dom.lobbyStatus.textContent = selected ? 'Yerini aldın. Hazırsan sahaya çıkalım.' : 'Takımına katılmak için sahada boş bir yere tıkla.';
  }
  ui.dom.readyProgress.textContent = `${readyCount} / ${players.length} oyuncu hazır`;
}
ui.dom.connectBtn.addEventListener('click', joinLobby);
ui.dom.nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinLobby();
});
async function joinLobby() {
  if (joinInProgress || state.joined) return;
  console.log('[JOIN] Join button clicked');
  const validation = validatePlayerName(ui.dom.nameInput.value);
  const name = validation.name;
  const serverUrl = normalizeServerUrl(ui.dom.serverInput.value);
  console.log('[JOIN] Invite state:', state.autoJoinRequested);
  console.log('[JOIN] Lobby:', 'existing server lobby');
  console.log('[JOIN] Server:', serverUrl);
  console.log('[JOIN] Player:', name);
  if (!name) {
    const error = validation.error;
    ui.dom.connStatus.textContent = error;
    return;
  }
  joinInProgress = true;
  ui.dom.connectBtn.disabled = true;
  ui.dom.connectBtn.textContent = 'Katılıyor…';
  if (state.autoJoinRequested) ui.updateConnectionStatus('connecting');
  try {
    await network.ensureConnected();
    if (!network.isOpen()) throw new Error('Sunucuya bağlanılamadı.');
    state.myTeam = null;
    state.mySlot = null;
    const accepted = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Lobiye katılım zaman aşımına uğradı.')), 10000);
      state.pendingJoin = {
        resolve: () => { clearTimeout(timeout); resolve(); },
        reject: (error) => { clearTimeout(timeout); reject(error); },
      };
    });
    console.log('[JOIN] Sending join request');
    network.send({ type: CLIENT.JOIN, name });
    await accepted;
  } catch (error) {
    if (state.pendingJoin) state.pendingJoin = null;
    state.joined = false;
    state.myId = null;
    network.dispose();
    const status = ui.dom.connStatus;
    status.textContent = error.message || 'Lobiye katılım başarısız oldu.';
    status.classList.add('error');
    ui.showOverlay(ui.dom.connectOverlay);
    state.autoJoinRequested = false;
  } finally {
    joinInProgress = false;
    ui.dom.connectBtn.disabled = false;
    ui.dom.connectBtn.textContent = 'Lobiye Katıl';
  }
}
ui.dom.readyBtn.addEventListener('click', () => {
  if (ui.dom.readyBtn.disabled) return; // countdown already running
  audio.playSfx('confirm');
  network.send({ type: CLIENT.READY, ready: !state.myReady });
});

function appendChatMessage(entry) {
  const row = document.createElement('div');
  row.className = 'chat-message';
  const sender = document.createElement('span');
  sender.className = 'chat-sender' + (entry.team === 'blue' ? ' blue' : entry.team === 'red' ? ' red' : '');
  sender.textContent = entry.senderName;
  const text = document.createElement('span');
  text.className = 'chat-text';
  text.textContent = entry.message;
  row.append(sender, document.createTextNode(': '), text);
  ui.dom.chatMessages.appendChild(row);
  ui.dom.chatMessages.scrollTop = ui.dom.chatMessages.scrollHeight;
}
events.on(SERVER.NEW_CHAT_MESSAGE, (msg) => appendChatMessage(msg.message));
events.on(SERVER.LOBBY_SFX, (msg) => { if (msg.senderId !== state.myId) audio.playSfx(msg.sfx || 'click'); });
ui.dom.chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = ui.dom.chatInput.value.trim();
  if (!text || !network.isOpen()) return;
  network.send({ type: CLIENT.SEND_CHAT_MESSAGE, message: text });
  ui.dom.chatInput.value = '';
});
ui.dom.chatToggleBtn.addEventListener('click', () => {
  const collapsed = ui.dom.chatPanel.classList.toggle('collapsed');
  ui.dom.chatToggleBtn.setAttribute('aria-expanded', String(!collapsed));
  ui.dom.chatToggleBtn.textContent = collapsed ? '▸' : '▾';
});

// Easter egg: three quick clicks on the lobby logo trigger a crowd cheer.
let logoClickTimes = [];
function handleLogoActivate() {
  const now = Date.now();
  logoClickTimes = logoClickTimes.filter((t) => now - t < 1500).concat(now);
  if (logoClickTimes.length >= 3) {
    logoClickTimes = [];
    audio.playSfx('applause');
  }
}
ui.dom.lobbyLogo.addEventListener('click', handleLogoActivate);
ui.dom.lobbyLogo.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handleLogoActivate(); }
});

function start() { if (state.autoJoinRequested) joinLobby(); }
function render(now) { if (lobbyView) lobbyView.render(now); }

return { renderLobby, render, start };
}
