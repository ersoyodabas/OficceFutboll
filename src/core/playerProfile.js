import { validatePlayerName } from '../../shared/playerName.js';

// Preserve the existing name storage key for installed extension users.
const NAME_STORAGE_KEY = 'officeFootballPlayerName';
export function loadPlayerName() {
  try { return validatePlayerName(localStorage.getItem(NAME_STORAGE_KEY)).name || ''; }
  catch { return ''; }
}
export function savePlayerName(name) {
  const result = validatePlayerName(name);
  if (result.error) return;
  try { localStorage.setItem(NAME_STORAGE_KEY, result.name); } catch { /* Storage may be disabled. */ }
}
