import { clubIdentity } from '../../shared/clubs.js';
import { TEAMS } from '../../shared/teams.js';
import { GOAL_TAUNTS, goalTaunt } from '../../shared/goalTaunts.js';

// Stitched football used next to the scorer's name (inline SVG, no asset load).
const BALL_ICON = `<svg viewBox="0 0 64 64" aria-hidden="true">
  <circle cx="32" cy="32" r="30" fill="#fbfbf7" stroke="#0d1520" stroke-width="2.5"/>
  <polygon points="32,19 44,28 39.5,42 24.5,42 20,28" fill="#0d1520"/>
  <g stroke="#0d1520" stroke-width="2.4" stroke-linecap="round">
    <line x1="32" y1="19" x2="32" y2="3"/><line x1="44" y1="28" x2="59" y2="23"/>
    <line x1="39.5" y1="42" x2="49" y2="56"/><line x1="24.5" y1="42" x2="15" y2="56"/><line x1="20" y1="28" x2="5" y2="23"/>
  </g>
  <path d="M22 5 32 3 42 5 32 11Z M58 18 60 30 56 38 52 27Z M53 51 44 59 36 60 42 53Z M11 51 20 59 28 60 22 53Z M6 18 4 30 8 38 12 27Z" fill="#0d1520"/>
</svg>`;

// One reusable DOM tree, cached badges, no presentation timers or socket listeners.
export function createGoalPresentation({ parent = document.body } = {}) {
  const root = document.createElement('section');
  root.id = 'goalPresentation';
  root.className = 'goal-presentation';
  root.hidden = true;
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.innerHTML = `<div class="goal-wash"></div><div class="goal-rays"></div><div class="goal-line goal-line-top"></div>
    <div class="goal-card"><div class="goal-eyebrow">OFFICE FUTBOLL <span>•</span> GOL ANI</div>
    <div class="goal-title" data-text="GOOOL!">GOOOL!</div>
    <div class="goal-scorer-row"><span class="goal-ball">${BALL_ICON}</span><span class="goal-scorer"></span></div>
    <div class="goal-taunt"><span class="goal-quote">“</span><span class="goal-taunt-text"></span><span class="goal-quote">”</span></div>
    <div class="goal-club"><div class="goal-badge"><span class="goal-initials"></span></div><div class="goal-team"></div></div>
    <div class="goal-score"><span class="goal-home-label"></span><strong class="goal-home"></strong>
    <span class="goal-score-divider">–</span><strong class="goal-away"></strong><span class="goal-away-label"></span></div>
    <div class="goal-footer">SANTRA YAPILIYOR</div></div>
    <div class="goal-line goal-line-bottom"></div>`;
  const find = (name) => root.querySelector('.goal-' + name);
  const badge = find('badge');
  const images = new Map();
  function cacheLogo(path) {
    if (!path) return null;
    if (images.has(path)) return images.get(path);
    const img = document.createElement('img');
    img.alt = ''; img.hidden = true;
    img.onload = () => { img.dataset.loaded = 'true'; img.hidden = root.dataset.logo !== path; };
    img.onerror = () => { img.hidden = true; img.dataset.loaded = 'false'; };
    img.src = new URL('../../assets/' + path, import.meta.url).href;
    badge.append(img); images.set(path, img);
    return img;
  }
  Object.values(TEAMS).forEach((team) => cacheLogo(team.logo));
  parent.append(root);
  function show(goal, serverTime) {
    const team = clubIdentity(goal.teams?.[goal.teamId]) || TEAMS[goal.teamId] || {};
    root.style.setProperty('--goal-color', goal.teamColor || team.color || '#b5f5ff');
    root.dataset.logo = goal.teamLogo || '';
    for (const img of images.values()) img.hidden = true;
    const logo = cacheLogo(goal.teamLogo);
    if (logo) logo.hidden = logo.dataset.loaded !== 'true';
    find('initials').textContent = goal.teamInitials || team.initials || goal.teamName?.split(/\s+/).map((part) => part[0]).join('').slice(0, 3) || 'FC';
    find('team').textContent = goal.teamName || team.name || 'FC';
    find('scorer').textContent = goal.scorerName || '';
    find('scorer').hidden = !goal.scorerName;
    find('scorer-row').hidden = !goal.scorerName;
    // Server-chosen line, identical on every client; older servers get a random one.
    const taunt = Number.isInteger(goal.tauntIndex) ? goalTaunt(goal.tauntIndex) : GOAL_TAUNTS[Math.floor(Math.random() * GOAL_TAUNTS.length)];
    find('taunt-text').textContent = taunt;
    find('home-label').textContent = clubIdentity(goal.teams?.blue)?.name || TEAMS.blue.name;
    find('away-label').textContent = clubIdentity(goal.teams?.red)?.name || TEAMS.red.name;
    find('home').textContent = goal.score.blue;
    find('away').textContent = goal.score.red;
    const duration = Math.max(1, goal.endsAt - goal.startedAt);
    root.style.setProperty('--goal-duration', duration + 'ms');
    root.style.setProperty('--goal-delay', -Math.max(0, Math.min(duration, serverTime - goal.startedAt)) + 'ms');
    root.hidden = false;
    root.classList.remove('is-active');
    void root.offsetWidth;
    root.classList.add('is-active');
  }
  function hide() { root.hidden = true; root.classList.remove('is-active'); }
  function dispose() { root.remove(); images.clear(); }
  return { show, hide, dispose };
}
