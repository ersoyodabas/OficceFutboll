// A stage-light colour for a club: the most colourful of its kit and club
// colours, lifted to a mid lightness so white, black or pale kits still glow on
// the dark lobby stage instead of washing it out.
const ACCENT_FALLBACK = '#79c6ff';

function toHsl(hex) {
  const value = /^#([0-9a-f]{6})$/i.exec(String(hex));
  if (!value) return null;
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(value[1].slice(at, at + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
  }
  return { h: (h * 60 + 360) % 360, s, l };
}
function toHex({ h, s, l }) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r, g, b].map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('');
}

export function teamAccent(kit, club) {
  const candidates = [kit?.primaryColor, kit?.secondaryColor, club?.primaryColor, club?.secondaryColor]
    .map(toHsl).filter(Boolean);
  if (!candidates.length) return ACCENT_FALLBACK;
  // Prefer colour over brightness: a white/black kit falls back to its second colour.
  const best = candidates.reduce((a, b) => (b.s * (1 - Math.abs(b.l - .5)) > a.s * (1 - Math.abs(a.l - .5)) ? b : a));
  if (best.s < .12) return ACCENT_FALLBACK;
  return toHex({ h: best.h, s: Math.max(best.s, .6), l: Math.min(Math.max(best.l, .48), .62) });
}
