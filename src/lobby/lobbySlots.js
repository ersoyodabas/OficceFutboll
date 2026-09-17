// The player cards under the 3D line-up. Each card is the button that claims
// that slot; the stage tells it where its footballer stands on screen, so the
// cards stay aligned at any window size instead of using fixed coordinates.
const STATE_TEXT = { inMatch: 'SAHADA', ready: '✓ HAZIR', notReady: 'HAZIR DEĞİL' };

export function createLobbySlots({ container, centreElement, slotCount, onSelect, onHover }) {
  const cards = new Map();
  for (const team of ['blue', 'red']) {
    for (let index = 0; index < slotCount; index++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `slot-card ${team}`;
      button.dataset.team = team;
      button.dataset.slot = String(index);
      button.innerHTML = `<span class="slot-figure" aria-hidden="true"></span>
        <span class="slot-plate">
          <span class="slot-head"><span class="slot-pos"></span><span class="slot-tags"></span></span>
          <span class="slot-name"></span>
          <span class="slot-state"></span>
        </span>`;
      const find = (selector) => button.querySelector(selector);
      button.addEventListener('click', () => onSelect(team, index));
      button.addEventListener('pointerenter', () => onHover(`${team}:${index}`));
      button.addEventListener('pointerleave', () => onHover(null));
      button.addEventListener('focus', () => onHover(`${team}:${index}`));
      button.addEventListener('blur', () => onHover(null));
      container.append(button);
      cards.set(`${team}:${index}`, {
        button, pos: find('.slot-pos'), tags: find('.slot-tags'), name: find('.slot-name'), state: find('.slot-state'),
      });
    }
  }

  // lineup entries: { key, team, index, position, positionLabel, teamName, player }
  function update(lineup, { locked = false, emptyHint = 'Katılmak için tıkla' } = {}) {
    for (const entry of lineup) {
      const card = cards.get(entry.key);
      if (!card) continue;
      const { player } = entry;
      const mine = !!player?.isMe;
      card.button.classList.toggle('occupied', !!player);
      card.button.classList.toggle('me', mine);
      card.button.classList.toggle('ready', !!player?.ready && !player?.inMatch);
      card.button.classList.toggle('not-ready', !!player && !player.ready && !player.inMatch);
      card.button.classList.toggle('in-match', !!player?.inMatch);
      card.button.disabled = locked || (!!player && !mine);
      card.button.setAttribute('aria-pressed', String(mine));
      card.pos.textContent = entry.position;
      card.name.textContent = player ? player.name : 'BOŞ YER';
      card.state.textContent = player
        ? (player.inMatch ? STATE_TEXT.inMatch : player.ready ? STATE_TEXT.ready : STATE_TEXT.notReady)
        : emptyHint;
      card.tags.replaceChildren();
      if (player?.captain) card.tags.append(tag('K', 'captain', 'Takım kaptanı'));
      if (mine) card.tags.append(tag('SEN', 'me'));
      card.button.setAttribute('aria-label', player
        ? `${entry.teamName}, ${entry.positionLabel}: ${player.name}${mine ? ', sen' : ''}, ${player.inMatch ? 'sahada' : player.ready ? 'hazır' : 'hazır değil'}`
        : `${entry.teamName}, ${entry.positionLabel}, boş yer — katılmak için seç`);
    }
  }
  function tag(text, kind, title) {
    const element = document.createElement('span');
    element.className = `slot-tag ${kind}`;
    element.textContent = text;
    if (title) element.title = title;
    return element;
  }

  // anchors from the stage: where each footballer's feet and head are on screen.
  function place({ anchors, centre, mode }) {
    container.dataset.mode = mode;
    const width = Math.min(...anchors.map((anchor) => anchor.spacing)) * .95;
    for (const anchor of anchors) {
      const card = cards.get(anchor.key);
      if (!card) continue;
      card.button.style.setProperty('--x', anchor.x.toFixed(1));
      card.button.style.setProperty('--head', Math.max(0, anchor.headY - 12).toFixed(1));
      card.button.style.setProperty('--feet', anchor.rowY.toFixed(1));
      card.button.style.setProperty('--w', Math.max(74, width).toFixed(1));
    }
    if (centreElement) {
      centreElement.style.setProperty('--x', centre.x.toFixed(1));
      centreElement.style.setProperty('--y', centre.y.toFixed(1));
    }
  }
  function focusFirstAvailable() {
    for (const [, card] of cards) if (!card.button.disabled) { card.button.focus({ preventScroll: true }); return; }
  }
  return { update, place, focusFirstAvailable };
}
