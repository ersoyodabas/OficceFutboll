import { getClub, getKit } from './clubs.js';

function rgb(hex) { return [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255); }
function colorDistance(a, b) {
  const x = rgb(a), y = rgb(b);
  return Math.sqrt(x.reduce((sum, channel, i) => sum + (channel - y[i]) ** 2, 0));
}
export function kitsClash(a, b) {
  if (!a || !b) return true;
  const palette = (kit) => [[kit.primaryColor, kit.primaryCoverage], [kit.secondaryColor, 1 - kit.primaryCoverage]];
  // Compare the shirt area occupied by similar colors in either arrangement.
  // Dark navy vs black and predominantly white vs white are intentionally rejected.
  const x = palette(a), y = palette(b);
  const match = (i, j) => colorDistance(x[i][0], y[j][0]) < .34 ? Math.min(x[i][1], y[j][1]) : 0;
  const overlap = Math.max(match(0, 0) + match(1, 1), match(0, 1) + match(1, 0));
  return colorDistance(a.primaryColor, b.primaryColor) < .3 || overlap >= .58;
}
export function validateClubSelections(teams) {
  const home = teams?.blue, away = teams?.red;
  if (!getClub(home?.clubId) || !getClub(away?.clubId)) return 'İki taraf için de bir kulüp seç.';
  if (home.clubId === away.clubId) return 'Aynı kulüp iki tarafta seçilemez.';
  const a = getKit(home.clubId, home.kitId), b = getKit(away.clubId, away.kitId);
  if (!a || !b) return 'Geçerli bir forma seç.';
  if (kitsClash(a, b)) return 'Formalar çok benzer. Lütfen başka bir forma seç.';
  return null;
}
