import { CLUBS, getClub, getKit, KIT_LABELS } from '../../shared/clubs.js';
import { validateClubSelections } from '../../shared/kitClash.js';
import { FIELD } from '../../shared/field.js';
import { CLIENT, SERVER } from '../network/protocol.js';
import { createClubBadge } from '../ui/clubBadge.js';
import { drawKitPreview } from '../gameplay/kitDesign.js';
import { teamAccent } from './teamAccent.js';

const SLOT_COUNT = FIELD.LOBBY_SLOTS.length;

export function createClubSelector({ state, ui, network, events }) {
  const $ = ui.dom.$, container = $('clubSides'), dialog = $('clubDialog');
  const search = $('clubSearch'), country = $('clubCountry'), confirm = $('clubConfirmBtn');
  const status = $('clubSelectionStatus'), cards = new Map();
  const updateBadge = createClubBadge($('clubCandidateBadge'));
  let snapshot = null, editingTeam = null, candidateId = null, candidateKit = 'home', pending = null;
  const options = [...new Set(CLUBS.map((c) => c.country))];
  for (const value of options) { const option = document.createElement('option'); option.value = option.textContent = value; country.append(option); }
  for (const team of ['blue', 'red']) {
    const card = document.createElement('section'); card.className = 'club-side'; card.dataset.side = team;
    // lobby.js fills the roster count by id (blueRosterCount / redRosterCount).
    card.innerHTML = `<div class="club-badge"></div>
      <div class="club-info"><span class="club-side-label">${team === 'blue' ? 'EV SAHİBİ' : 'DEPLASMAN'}<span class="club-captain"></span></span>
        <h2></h2><p class="club-meta"><span class="club-country"></span> · <span class="club-kit-label"></span></p></div>
      <span class="team-count" id="${team}RosterCount">0 / ${SLOT_COUNT}</span>
      <canvas class="kit-preview" width="200" height="200" role="img"></canvas>
      <div class="club-actions"><button class="secondary club-edit" type="button">Kulüp / forma</button><button class="secondary club-join" type="button">Katıl</button></div>`;
    const find = (selector) => card.querySelector(selector);
    const badge = createClubBadge(find('.club-badge'));
    find('.club-edit').addEventListener('click', () => open(team));
    find('.club-join').addEventListener('click', () => {
      const slot = FIELD.LOBBY_SLOTS.findIndex((_, index) => !snapshot.players.some((p) => !p.isAI && p.team === team && p.slot === index));
      if (slot >= 0) network.send({ type: CLIENT.SELECT_SLOT, team, slot });
    });
    container.append(card); cards.set(team, { find, badge, root: card });
  }
  function filtered() {
    const query = search.value.toLocaleLowerCase('tr').trim();
    return CLUBS.filter((club) => (!country.value || club.country === country.value)
      && club.name.toLocaleLowerCase('tr').includes(query));
  }
  function open(team) {
    if (!snapshot || snapshot.phase !== 'lobby' || snapshot.teams[team].captainId !== state.myId) return;
    editingTeam = team; candidateId = snapshot.teams[team].clubId; candidateKit = snapshot.teams[team].kitId;
    pending = null; search.value = country.value = ''; dialog.showModal(); renderCandidate(); search.focus();
  }
  function renderCandidate() {
    const club = getClub(candidateId); const list = filtered();
    $('clubResults').textContent = `${list.length} kulüp · Özgün OFFICE FUTBOLL tasarımları`;
    $('clubCandidate').hidden = !club;
    $('clubPreviousBtn').disabled = $('clubNextBtn').disabled = list.length < 2 || !!pending;
    search.disabled = country.disabled = !!pending;
    if (!club) { confirm.disabled = true; status.textContent = 'Aramana uygun kulüp bulunamadı.'; return; }
    updateBadge(club); $('clubCandidateName').textContent = club.name; $('clubCandidateCountry').textContent = club.country;
    drawKitPreview($('clubKitPreview'), getKit(club.id, candidateKit));
    $('clubKitPreview').setAttribute('aria-label', `${club.name} ${KIT_LABELS[candidateKit]} forma önizlemesi`);
    for (const btn of $('clubKitTabs').querySelectorAll('button')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.kit === candidateKit)); btn.disabled = !!pending;
    }
    const opponent = editingTeam === 'blue' ? 'red' : 'blue';
    const taken = snapshot.teams[opponent].clubId === club.id;
    const error = validateClubSelections({ ...snapshot.teams, [editingTeam]: { clubId: club.id, kitId: candidateKit } });
    confirm.disabled = !!error || !!pending;
    status.textContent = pending ? 'Seçim kaydediliyor…' : taken ? 'RAKİP TARAFINDAN SEÇİLDİ' : error || 'Takım seçimini onayla. Herkes yeniden hazır olmalıdır.';
    status.classList.toggle('selection-error', !!error);
  }
  function navigate(direction) {
    const list = filtered(); if (!list.length) return;
    const index = list.findIndex((club) => club.id === candidateId);
    candidateId = list[(index + direction + list.length) % list.length].id; candidateKit = 'home'; renderCandidate();
  }
  for (const element of [search, country]) element.addEventListener('input', () => {
    candidateId = filtered()[0]?.id || null; candidateKit = 'home'; renderCandidate();
  });
  $('clubPreviousBtn').addEventListener('click', () => navigate(-1));
  $('clubNextBtn').addEventListener('click', () => navigate(1));
  $('clubCloseBtn').addEventListener('click', () => dialog.close());
  for (const btn of $('clubKitTabs').querySelectorAll('button')) btn.addEventListener('click', () => { candidateKit = btn.dataset.kit; renderCandidate(); });
  confirm.addEventListener('click', () => {
    if (confirm.disabled || !network.isOpen()) return;
    pending = { clubId: candidateId, kitId: candidateKit };
    network.send({ type: CLIENT.SELECT_CLUB_KIT, ...pending }); renderCandidate();
  });
  events.on(SERVER.CLUB_ERROR, (msg) => { pending = null; if (dialog.open) { renderCandidate(); status.textContent = msg.message; } });
  function render(msg) {
    snapshot = msg;
    if (!msg.teams) return;
    for (const [team, card] of cards) {
      const selection = msg.teams[team], club = getClub(selection.clubId), kit = getKit(selection.clubId, selection.kitId);
      if (!club || !kit) continue;
      card.badge(club); card.find('h2').textContent = club.name;
      card.root.style.setProperty('--team', teamAccent(kit, club));
      card.find('.club-country').textContent = club.country;
      card.find('.club-kit-label').textContent = KIT_LABELS[kit.id];
      card.find('.kit-preview').setAttribute('aria-label', `${club.name} ${KIT_LABELS[kit.id]}`);
      drawKitPreview(card.find('canvas'), kit);
      const captain = msg.players.find((p) => p.id === selection.captainId);
      card.find('.club-captain').textContent = captain ? `Kaptan: ${captain.name}` : 'Kaptan bekleniyor';
      card.find('.club-edit').disabled = msg.phase !== 'lobby' || selection.captainId !== state.myId;
      const me = msg.players.find((p) => p.id === state.myId);
      card.find('.club-join').disabled = msg.phase !== 'lobby' || me?.team === team || msg.players.filter((p) => !p.isAI && p.team === team && Number.isInteger(p.slot)).length >= SLOT_COUNT;
    }
    if (dialog.open) {
      if (msg.phase !== 'lobby' || msg.teams[editingTeam].captainId !== state.myId) dialog.close();
      else if (pending && msg.teams[editingTeam].clubId === pending.clubId && msg.teams[editingTeam].kitId === pending.kitId) { pending = null; dialog.close(); }
      else renderCandidate();
    }
  }
  // The bottom menu opens the same dialog for the player's own team.
  function canEditMyTeam() {
    return !!state.myTeam && snapshot?.phase === 'lobby' && snapshot.teams?.[state.myTeam]?.captainId === state.myId;
  }
  function openMyTeam() { if (canEditMyTeam()) open(state.myTeam); }
  return { render, openMyTeam, canEditMyTeam };
}
