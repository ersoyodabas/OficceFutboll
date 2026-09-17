import { createClubSelector } from './clubSelector.js';
import { clubIdentity, getClub, getKit } from '../../shared/clubs.js';
import { goalkeeperKit } from '../../shared/goalkeeperKit.js';
import { teamAccent } from './teamAccent.js';
import { createProfile } from './profile.js';
import { createReadyRoster } from './readyRoster.js';
import { createLobbySlots } from './lobbySlots.js';
import { createLobbyStage } from './lobbyStage.js';
import { validatePlayerName } from '../../shared/playerName.js';
import { isMatchPhase } from '../../shared/matchPhases.js';
import { CLIENT, SERVER } from '../network/protocol.js';
import { FIELD } from '../../shared/field.js';
import { normalizeServerUrl } from '../network/urls.js';

const SLOT_COUNT = FIELD.LOBBY_SLOTS.length;
const TEAM_LABEL = { blue: 'EV SAHİBİ', red: 'DEPLASMAN' };

// The pre-match lobby: a 3D line-up drawn by the game's own renderer with a
// glass overlay on top. Everything it shows comes from the server's lobby
// broadcast; it only sends the player's intent (slot, club/kit, ready, chat).
export function createLobby({ state, ui, network, events, audio, renderer, createFootballer }) {
const $ = ui.dom.$;
const clubs = createClubSelector({ state, ui, network, events });
const profile = createProfile({ state, ui, network, events });
const renderRoster = createReadyRoster($('readyRoster'));
let stage = null, slotsView = null, needsLayout = true, lastMessage = null;
let joinInProgress = false, lastLobbySfxSentAt = 0, readyPending = false, unreadChat = 0;

function ensureStage() {
  if (stage) return;
  stage = createLobbyStage({ renderer, createFootballer, slotCount: SLOT_COUNT });
  slotsView = createLobbySlots({
    container: $('lobbySlots'), centreElement: $('lobbyCentre'), slotCount: SLOT_COUNT,
    onSelect: (team, slot) => {
      if (!network.isOpen()) return;
      audio.playSfx('click');
      if (team === state.myTeam && slot === state.mySlot) {
        // Tapping your own place is a quick cue the rest of the lobby hears too.
        const now = Date.now();
        if (now - lastLobbySfxSentAt > 3000) { lastLobbySfxSentAt = now; network.send({ type: CLIENT.LOBBY_SFX }); }
        return;
      }
      ui.dom.slotStatus.textContent = '';
      network.send({ type: CLIENT.SELECT_SLOT, team, slot });
    },
    onHover: (key) => stage?.setHover(key),
  });
  new ResizeObserver(() => { needsLayout = true; }).observe(ui.dom.lobbyOverlay);
}
function disposeStage() {
  stage?.dispose();
  stage = null;
  if (slotsView) $('lobbySlots').replaceChildren();
  slotsView = null;
  needsLayout = true;
}

// Camera framing keeps the line-up between the top identities and the bottom
// bar; the cards are then placed where each footballer actually stands.
function applyLayout() {
  if (!stage || ui.dom.lobbyOverlay.hidden) return;
  const overlay = ui.dom.lobbyOverlay.getBoundingClientRect();
  if (!overlay.width || !overlay.height) return;
  const sides = $('clubSides').getBoundingClientRect();
  const bottom = ui.dom.lobbyOverlay.querySelector('.lobby-bottom').getBoundingClientRect();
  const card = parseFloat(getComputedStyle(ui.dom.lobbyOverlay).getPropertyValue('--card-h')) || 96;
  stage.layout(
    { width: overlay.width, height: overlay.height },
    { top: Math.max(0, sides.bottom - overlay.top), bottom: Math.max(0, overlay.bottom - bottom.top), card },
    (anchors) => slotsView.place(anchors),
  );
  needsLayout = false;
}

function teamsPresentation(msg) {
  const presentation = {};
  for (const team of ['blue', 'red']) {
    const selection = msg.teams?.[team];
    const club = getClub(selection?.clubId);
    const kit = getKit(selection?.clubId, selection?.kitId);
    presentation[team] = { club, kit, accent: teamAccent(kit, club), identity: clubIdentity(selection) };
  }
  // The two keepers must also differ from each other, so the away one picks second.
  const taken = [];
  for (const team of ['blue', 'red']) {
    const other = team === 'blue' ? 'red' : 'blue';
    const kit = presentation[team].kit && presentation[other].kit
      ? goalkeeperKit(presentation[team].kit, presentation[other].kit, taken) : null;
    presentation[team].gkKit = kit;
    if (kit) taken.push(kit);
  }
  return presentation;
}

function renderLobby(msg) {
  lastMessage = msg;
  ensureStage();
  ui.dom.scoreBlueEl.textContent = msg.score.blue;
  ui.dom.scoreRedEl.textContent = msg.score.red;
  const players = msg.players.filter((p) => !p.isAI);
  const me = players.find((p) => p.id === state.myId);
  clubs.render(msg);
  renderRoster(players, state.myId, msg.teams);
  const teams = teamsPresentation(msg);
  if (me) {
    profile.sync(me);
    state.myTeam = me.team;
    state.myPosition = me.position;
    state.mySlot = me.slot;
    state.myReady = !!me.ready;
  }
  const inCountdown = msg.phase === 'countdown';
  const matchInProgress = isMatchPhase(msg.phase) || msg.phase === 'ended';
  const locked = inCountdown || matchInProgress;
  const readyCount = players.filter((p) => p.ready).length;
  const selected = Number.isInteger(state.mySlot);

  // Top identities and fixture line.
  $('fixtureHome').textContent = teams.blue.identity?.name || 'EV SAHİBİ';
  $('fixtureAway').textContent = teams.red.identity?.name || 'DEPLASMAN';
  ui.dom.lobbyOverlay.style.setProperty('--home-team', teams.blue.accent);
  ui.dom.lobbyOverlay.style.setProperty('--away-team', teams.red.accent);
  $('lobbyFormat').textContent = `${SLOT_COUNT} VS ${SLOT_COUNT} · ${matchInProgress ? 'MAÇ SÜRÜYOR' : inCountdown ? 'GERİ SAYIM' : 'MAÇ ÖNCESİ'}`;
  $('lobbyPlayerCount').textContent = `${players.length} oyuncu`;
  for (const team of ['blue', 'red']) {
    $(team + 'RosterCount').textContent = `${players.filter((p) => p.team === team && Number.isInteger(p.slot)).length} / ${SLOT_COUNT}`;
  }

  // The line-up itself: every slot, with whoever the server put in it.
  const lineup = [];
  for (const team of ['blue', 'red']) {
    FIELD.LOBBY_SLOTS.forEach((place, index) => {
      const player = players.find((p) => p.team === team && p.slot === index);
      lineup.push({
        key: `${team}:${index}`, team, index, position: place.position,
        positionLabel: state.positionsData?.[place.position]?.label || place.position,
        teamName: teams[team].identity?.name || TEAM_LABEL[team],
        accent: teams[team].accent,
        player: player ? {
          id: player.id, name: player.name, ready: !!player.ready, inMatch: !!player.inMatch,
          isMe: player.id === state.myId, captain: msg.teams?.[team]?.captainId === player.id,
        } : null,
      });
    });
  }
  slotsView.update(lineup, {
    locked,
    emptyHint: matchInProgress ? 'Maç sürüyor' : inCountdown ? 'Geri sayım' : 'Katılmak için tıkla',
  });
  stage.setTeams({
    blue: { kit: teams.blue.kit, gkKit: teams.blue.gkKit, accent: teams.blue.accent },
    red: { kit: teams.red.kit, gkKit: teams.red.gkKit, accent: teams.red.accent },
  });
  stage.setLineup(lineup);
  stage.setCountdown(inCountdown);
  ui.dom.lobbyOverlay.classList.toggle('is-countdown', inCountdown);

  // Bottom bar: profile, club/kit access and the ready button.
  $('profileRole').textContent = selected
    ? `${teams[state.myTeam]?.identity?.name || 'Takım'} · ${state.positionsData?.[state.myPosition]?.label || state.myPosition}`
    : 'Sahada bir yer seç';
  $('clubKitBtn').disabled = !clubs.canEditMyTeam();
  $('clubKitBtn').title = clubs.canEditMyTeam() ? '' : 'Kulüp ve formayı takım kaptanı seçer.';
  ui.dom.readyBtn.textContent = matchInProgress ? 'MAÇ SÜRÜYOR' : state.myReady ? '✓ HAZIR' : 'HAZIRIM';
  ui.dom.readyBtn.classList.toggle('is-ready', state.myReady);
  ui.dom.readyBtn.disabled = readyPending || matchInProgress || !selected || (inCountdown && !state.myReady);
  ui.dom.readyBtn.title = state.myReady ? 'Hazır durumunu iptal etmek için tıkla' : '';
  $('readyMeterFill').style.width = `${players.length ? readyCount / players.length * 100 : 0}%`;
  ui.dom.readyProgress.textContent = `${readyCount} / ${players.length} OYUNCU HAZIR`;
  const waiting = players.filter((p) => !Number.isInteger(p.slot)).map((p) => p.name);
  ui.dom.lobbyStatus.textContent = matchInProgress ? 'Devam eden maç bitince yeni maça katılabilirsin.'
    : inCountdown ? 'Herkes hazır! Maç başlıyor…'
    : !selected ? 'Dizilişte boş bir yere tıklayarak sahaya çık.'
    : waiting.length ? `${waiting.join(', ')} henüz yer seçmedi.`
    : state.myReady ? 'Rakiplerin hazır olması bekleniyor.'
    : 'Yerini aldın. Hazırsan başlayalım.';
  ui.dom.slotStatus.textContent = '';
  readyPending = false;
  needsLayout = true;
}

// ---------- joining ----------
ui.dom.connectBtn.addEventListener('click', joinLobby);
ui.dom.nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinLobby(); });
async function joinLobby() {
  if (joinInProgress || state.joined) return;
  console.log('[JOIN] Join button clicked');
  const validation = validatePlayerName(ui.dom.nameInput.value);
  const name = validation.name;
  const serverUrl = normalizeServerUrl(ui.dom.serverInput.value);
  console.log('[JOIN] Invite state:', state.autoJoinRequested);
  console.log('[JOIN] Server:', serverUrl);
  console.log('[JOIN] Player:', name);
  if (!name) {
    ui.dom.connStatus.textContent = validation.error;
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

// ---------- bottom menu ----------
ui.dom.readyBtn.addEventListener('click', () => {
  if (ui.dom.readyBtn.disabled) return;
  audio.playSfx('confirm');
  readyPending = true;                       // the server's next broadcast decides
  ui.dom.readyBtn.disabled = true;
  network.send({ type: CLIENT.READY, ready: !state.myReady });
});
$('clubKitBtn').addEventListener('click', () => { audio.playSfx('click'); clubs.openMyTeam(); });

function setDrawer(open) {
  ui.dom.chatPanel.classList.toggle('collapsed', !open);
  ui.dom.chatToggleBtn.setAttribute('aria-expanded', String(open));
  if (open) { unreadChat = 0; $('chatUnread').hidden = true; ui.dom.chatInput.focus({ preventScroll: true }); }
  needsLayout = true;
}
ui.dom.chatToggleBtn.addEventListener('click', () => setDrawer(ui.dom.chatPanel.classList.contains('collapsed')));

// ---------- chat ----------
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
  if (ui.dom.chatPanel.classList.contains('collapsed')) {
    unreadChat += 1;
    $('chatUnread').textContent = String(unreadChat);
    $('chatUnread').hidden = false;
  }
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

// Easter egg: three quick clicks on the wordmark bring a crowd cheer.
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
function render(now, dt) {
  if (!stage || ui.dom.lobbyOverlay.hidden) return;
  if (needsLayout) applyLayout();
  stage.render(now, dt);
}
function focusFirstSlot() { slotsView?.focusFirstAvailable(); }

return { renderLobby, render, start, disposeStage, focusFirstSlot, get lastMessage() { return lastMessage; } };
}
