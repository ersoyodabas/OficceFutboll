// Compatibility adapter for the existing vendored build; the only app module
// that reads its global. game.html loads this local library before the entrypoint.
export const THREE = globalThis.THREE;
if (!THREE) throw new Error('Local lib/three.min.js must load before the game module.');
