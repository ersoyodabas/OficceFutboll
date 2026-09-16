import { clubIdentity } from '../../shared/clubs.js';
import { TEAMS } from '../../shared/teams.js';

// One reusable DOM tree, cached badges, no presentation timers or socket listeners.
export function createGoalPresentation({ parent = document.body } = {}) {
  const root = document.createElement('section');
  root.id = 'goalPresentation';
  root.className = 'goal-presentation';
  root.hidden = true;
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.innerHTML = `<div class="goal-wash"></div><div class="goal-line goal-line-top"></div>
    <div class="goal-card"><div class="goal-eyebrow">OFFICE FUTBOLL <span>•</span> MATCH MOMENT</div>
    <div class="goal-badge"><span class="goal-initials"></span></div>
    <div class="goal-title">GOAL!</div><div class="goal-scorer"></div><div class="goal-team"></div>
    <div class="goal-score"><span class="goal-home-label"></span><strong class="goal-home"></strong>
    <span class="goal-score-divider">–</span><strong class="goal-away"></strong><span class="goal-away-label"></span></div>
    <div class="goal-footer">GOAL CONFIRMED <span>•</span> BACK TO THE CENTRE</div></div>
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
