// Original OFFICE FUTBOLL palettes/designs. No official badges, sponsor marks or
// licensed jersey graphics. badge/texture can point to licensed assets later.
const definitions = [
  ['arsenal', 'Arsenal', 'England', 'ARS', '#c92e40', '#f4eee5'],
  ['liverpool', 'Liverpool', 'England', 'LIV', '#ba2639', '#e6d8a6'],
  ['man-city', 'Manchester City', 'England', 'MCI', '#83cce5', '#25344b'],
  ['man-united', 'Manchester United', 'England', 'MUN', '#ce3540', '#282b35'],
  ['chelsea', 'Chelsea', 'England', 'CHE', '#2859b7', '#e7eff3'],
  ['tottenham', 'Tottenham', 'England', 'TOT', '#eeeef3', '#273752'],
  ['real-madrid', 'Real Madrid', 'Spain', 'RMA', '#f4f1e9', '#c4a567'],
  ['barcelona', 'Barcelona', 'Spain', 'BAR', '#253b79', '#b73951'],
  ['atletico', 'Atletico Madrid', 'Spain', 'ATM', '#c33b4b', '#edf0e9'],
  ['juventus', 'Juventus', 'Italy', 'JUV', '#eceee9', '#262b34'],
  ['ac-milan', 'AC Milan', 'Italy', 'MIL', '#b82d44', '#222630'],
  ['inter', 'Inter Milan', 'Italy', 'INT', '#3067b4', '#242934'],
  ['napoli', 'Napoli', 'Italy', 'NAP', '#66c4e0', '#e5f2ee'],
  ['bayern', 'Bayern Munich', 'Germany', 'BAY', '#c52f48', '#e1e6f0'],
  ['dortmund', 'Borussia Dortmund', 'Germany', 'BVB', '#ebd43e', '#282d37'],
  ['psg', 'Paris Saint-Germain', 'France', 'PSG', '#233555', '#c53e58'],
  ['marseille', 'Marseille', 'France', 'OM', '#edf0ec', '#59b9d4'],
  ['galatasaray', 'Galatasaray', 'Türkiye', 'GS', '#b93640', '#efb940'],
  ['fenerbahce', 'Fenerbahçe', 'Türkiye', 'FB', '#eacb43', '#253a60'],
  ['besiktas', 'Beşiktaş', 'Türkiye', 'BJK', '#272c34', '#efefeb'],
  ['trabzonspor', 'Trabzonspor', 'Türkiye', 'TS', '#78354d', '#7bc4df'],
];
const makeKit = (id, primaryColor, secondaryColor, shortsColor, socksColor, pattern) => Object.freeze({
  id, kitType: id, primaryColor, secondaryColor, shortsColor, socksColor, pattern, texture: null,
  // Relative covered area used by the clash check, matching our procedural shirt.
  primaryCoverage: pattern === 'split' ? .55 : pattern === 'bars' ? .7 : .85,
});
export const CLUBS = Object.freeze(definitions.map(([id, name, country, shortName, primaryColor, secondaryColor], index) => Object.freeze({
  id, name, country, shortName, primaryColor, secondaryColor, badge: null,
  kits: Object.freeze([
    makeKit('home', primaryColor, secondaryColor, secondaryColor, primaryColor, ['panel', 'bars', 'split'][index % 3]),
    makeKit('away', '#e7efe9', primaryColor, '#e7efe9', '#e7efe9', 'panel'),
    makeKit('third', '#242d41', secondaryColor, '#242d41', secondaryColor, 'panel'),
  ]),
})));
const byId = new Map(CLUBS.map((club) => [club.id, club]));
export const getClub = (id) => byId.get(id) || null;
export const getKit = (clubId, kitId) => getClub(clubId)?.kits.find((kit) => kit.id === kitId) || null;
export const KIT_LABELS = Object.freeze({ home: 'İç saha', away: 'Deplasman', third: 'Alternatif' });
export function defaultClubSelections() {
  return { blue: { clubId: 'arsenal', kitId: 'home' }, red: { clubId: 'man-city', kitId: 'home' } };
}
export function clubIdentity(selection) {
  const club = getClub(selection?.clubId);
  if (!club) return null;
  return { name: club.name, initials: club.shortName, logo: club.badge, color: club.primaryColor, clubId: club.id,
    kit: getKit(club.id, selection.kitId) };
}
