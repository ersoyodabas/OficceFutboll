// Shared by the Chrome client, invited browser clients and Node server.
// X is pitch width, Z is length, Y is vertical. Blue defends +Z.
(function (root, factory) {
  const field = factory();
  if (typeof module === 'object' && module.exports) module.exports = field;
  else root.OfficeField = field;
})(globalThis, function () {
  return Object.freeze({
    HALF_W: 24,
    HALF_L: 38,
    // Scaled from a regulation 7.32 m × 2.44 m goal on a 68 m-wide pitch.
    GOAL_HALF_W: 2.58,
    GOAL_HEIGHT: 1.72,
    BALL_R: 0.25,
    PLAYER_R: 0.48,
    PENALTY_HALF_W: 14.2,
    PENALTY_DEPTH: 11.8,
    SIX_YARD_HALF_W: 6.4,
    SIX_YARD_DEPTH: 4.2,
    PENALTY_SPOT_DISTANCE: 8,
    CENTER_CIRCLE_R: 6.4,
    CORNER_ARC_R: 0.7,
  });
});
