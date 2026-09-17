import { kitsClash } from './kitClash.js';

// The club catalogue has no goalkeeper kits, so keepers wear one of these
// original OFFICE FUTBOLL sets. The first set that clashes with neither team is
// used; if every set clashes (only possible with unusual colours) the last one
// is the safe fallback, so a keeper is never left without a kit.
const PALETTES = [
  ['gk-lime', '#c9f43f', '#16200c'],
  ['gk-amber', '#ff9d2e', '#241206'],
  ['gk-teal', '#2ad3c5', '#07242a'],
  ['gk-violet', '#b46bff', '#1a0f2b'],
  ['gk-slate', '#8fa2b6', '#151b23'],
];

const KITS = Object.freeze(PALETTES.map(([id, primaryColor, secondaryColor]) => Object.freeze({
  id, kitType: 'goalkeeper', primaryColor, secondaryColor,
  shortsColor: secondaryColor, socksColor: primaryColor,
  pattern: 'panel', texture: null, primaryCoverage: .85, goalkeeper: true,
})));

// A goalkeeper kit that reads apart from both teams on the pitch, and from any
// kit in `avoid` (the other keeper, so the two are never dressed the same).
export function goalkeeperKit(teamKit, opponentKit, avoid = []) {
  const clear = (kit) => !kitsClash(kit, teamKit) && !kitsClash(kit, opponentKit)
    && avoid.every((other) => other && kit !== other && !kitsClash(kit, other));
  return KITS.find(clear)
    || KITS.find((kit) => !kitsClash(kit, teamKit) && !kitsClash(kit, opponentKit) && !avoid.includes(kit))
    || KITS.at(-1);
}
export const GOALKEEPER_KITS = KITS;
