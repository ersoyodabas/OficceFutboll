// Lobby body language for the procedural footballer rig (src/gameplay/player.js).
// Pure functions: a pose maps a time in seconds to joint angles and the stage
// eases the figure towards them, so nobody stands frozen and no two players hit
// the same beat. These are calm presentation poses, never gameplay animations.

// Joints the lobby drives, as a path on the footballer plus the property/axis.
export const JOINTS = [
  { key: 'bodyY', path: ['body'], prop: 'position', axis: 'y', rate: 9 },
  { key: 'bodyPitch', path: ['body'], prop: 'rotation', axis: 'x', rate: 6 },
  { key: 'bodyTurn', path: ['body'], prop: 'rotation', axis: 'y', rate: 4 },
  { key: 'bodyLean', path: ['body'], prop: 'rotation', axis: 'z', rate: 5 },
  ...['L', 'R'].flatMap((side) => [
    { key: `arm${side}Out`, path: [`arm${side}`, 'shoulder'], prop: 'rotation', axis: 'z', rate: 7 },
    { key: `arm${side}Forward`, path: [`arm${side}`, 'upper'], prop: 'rotation', axis: 'x', rate: 7 },
    { key: `arm${side}In`, path: [`arm${side}`, 'upper'], prop: 'rotation', axis: 'z', rate: 7 },
    { key: `arm${side}Elbow`, path: [`arm${side}`, 'lower'], prop: 'rotation', axis: 'x', rate: 8 },
    { key: `arm${side}Wrist`, path: [`arm${side}`, 'lower'], prop: 'rotation', axis: 'z', rate: 8 },
    { key: `leg${side}Out`, path: [`leg${side}`, 'hip'], prop: 'rotation', axis: 'z', rate: 6 },
    { key: `leg${side}Lift`, path: [`leg${side}`, 'thigh'], prop: 'rotation', axis: 'x', rate: 6 },
    { key: `leg${side}Knee`, path: [`leg${side}`, 'shin'], prop: 'rotation', axis: 'x', rate: 6 },
  ]),
];

// Positive values read the same on both sides: out = away from the body,
// forward = towards the viewer, in = across the chest, elbow/knee = bend.
function arm(side, { out = 0, forward = 0, inward = 0, elbow = 0, wrist = 0 }) {
  const mirror = side === 'L' ? 1 : -1;
  return {
    [`arm${side}Out`]: -mirror * out,
    [`arm${side}Forward`]: -forward,
    [`arm${side}In`]: mirror * inward,
    [`arm${side}Elbow`]: -elbow,
    [`arm${side}Wrist`]: mirror * wrist,
  };
}
function leg(side, { out = 0, lift = 0, knee = 0 }) {
  const mirror = side === 'L' ? 1 : -1;
  return { [`leg${side}Out`]: -mirror * out, [`leg${side}Lift`]: -lift, [`leg${side}Knee`]: knee };
}
// Breathing and a slow weight shift, shared by the calm poses.
function alive(t, seed, scale = 1) {
  const sway = Math.sin(t * .55 + seed);
  return {
    bodyY: .005 * Math.sin(t * 1.5 + seed) * scale,
    bodyLean: .022 * sway * scale,
    sway,
  };
}

const POSES = {
  relaxed(t, seed) {
    const { bodyY, bodyLean, sway } = alive(t, seed);
    return {
      bodyY, bodyLean, bodyTurn: .05 * Math.sin(t * .37 + seed * 1.7),
      ...arm('L', { out: .03, forward: .05 + .03 * sway, elbow: .2 }),
      ...arm('R', { out: .03, forward: .05 - .03 * sway, elbow: .2 }),
      ...leg('L', { out: .035 + .02 * sway }),
      ...leg('R', { out: .035 - .02 * sway }),
    };
  },
  lookAround(t, seed) {
    const { bodyY, bodyLean, sway } = alive(t, seed);
    // Long looks to either side with a pause between them.
    const look = Math.sin(t * .5 + seed);
    return {
      bodyY, bodyLean, bodyTurn: .34 * Math.sign(look) * Math.abs(look) ** 1.6,
      ...arm('L', { out: .04, forward: .06, elbow: .24 }),
      ...arm('R', { out: .04, forward: .06, elbow: .24 }),
      ...leg('L', { out: .04 + .02 * sway }),
      ...leg('R', { out: .04 - .02 * sway }),
    };
  },
  armsCrossed(t, seed) {
    const { bodyY, bodyLean } = alive(t, seed, .7);
    return {
      bodyY: bodyY - .004, bodyLean, bodyTurn: .04 * Math.sin(t * .31 + seed),
      ...arm('L', { out: .12, forward: .34, inward: .3, elbow: 1.55, wrist: .92 }),
      ...arm('R', { out: .12, forward: .42, inward: .3, elbow: 1.62, wrist: .98 }),
      ...leg('L', { out: .06 }),
      ...leg('R', { out: .06 }),
    };
  },
  handsOnHips(t, seed) {
    const { bodyY, bodyLean, sway } = alive(t, seed, .8);
    return {
      bodyY, bodyLean, bodyTurn: .07 * Math.sin(t * .42 + seed),
      ...arm('L', { out: .58, forward: -.12, elbow: 1.42, wrist: 1.05 }),
      ...arm('R', { out: .58, forward: -.12, elbow: 1.42, wrist: 1.05 }),
      ...leg('L', { out: .08 + .015 * sway }),
      ...leg('R', { out: .08 - .015 * sway }),
    };
  },
  stretch(t, seed) {
    // Rolls the shoulders and shakes the legs loose, the way players wait.
    const amount = Math.sin(Math.PI * Math.min(1, t / 4.2)) ** 1.2;
    const roll = Math.sin(t * 1.9 + seed);
    const { bodyY, bodyLean } = alive(t, seed, .5);
    return {
      bodyY: bodyY + .008 * amount, bodyLean: bodyLean + .06 * roll * amount,
      bodyPitch: -.04 * amount, bodyTurn: .1 * roll * amount,
      ...arm('L', { out: .1 + .34 * amount, forward: .2 + .3 * amount * (.5 + .5 * roll), elbow: .5 + .7 * amount }),
      ...arm('R', { out: .1 + .34 * amount, forward: .2 + .3 * amount * (.5 - .5 * roll), elbow: .5 + .7 * amount }),
      ...leg('L', { out: .05, lift: .1 * amount * Math.max(0, roll), knee: .22 * amount * Math.max(0, roll) }),
      ...leg('R', { out: .05, lift: .1 * amount * Math.max(0, -roll), knee: .22 * amount * Math.max(0, -roll) }),
    };
  },
  readyStance(t, seed) {
    // Light on the toes, knees soft, ready to walk out.
    const bounce = Math.abs(Math.sin(t * 3 + seed));
    return {
      bodyY: -.036 + .014 * bounce, bodyPitch: .1, bodyLean: .012 * Math.sin(t * 1.5 + seed),
      bodyTurn: .05 * Math.sin(t * .6 + seed),
      ...arm('L', { out: .18, forward: .26, elbow: .85 }),
      ...arm('R', { out: .18, forward: .26, elbow: .85 }),
      ...leg('L', { out: .06, lift: .3, knee: .6 }),
      ...leg('R', { out: .06, lift: .3, knee: .6 }),
    };
  },
  clap(t, seed) {
    const beat = Math.max(0, Math.sin(t * 9 + seed));
    return {
      bodyY: .004 * beat, bodyPitch: .04,
      ...arm('L', { out: .1, forward: .95, inward: .26 + .2 * beat, elbow: 1.2, wrist: .9 + .3 * beat }),
      ...arm('R', { out: .1, forward: .95, inward: .26 + .2 * beat, elbow: 1.2, wrist: .9 + .3 * beat }),
      ...leg('L', { out: .05 }),
      ...leg('R', { out: .05 }),
    };
  },
  fistPump(t, seed) {
    // Short celebration when the player confirms they are ready.
    const pump = Math.sin(t * 9 + seed);
    return {
      bodyY: .02 * Math.abs(Math.sin(t * 4.5)), bodyPitch: -.07, bodyLean: -.05,
      ...arm('L', { out: .3, forward: .4, elbow: .8 }),
      ...arm('R', { out: 1.15 + .12 * pump, forward: .5, inward: .35, elbow: 1.75 }),
      ...leg('L', { out: .06 }),
      ...leg('R', { out: .06 }),
    };
  },
};

// Seconds a pose runs before the next one is picked: [min, max].
const DURATIONS = {
  relaxed: [7, 12], lookAround: [5, 9], armsCrossed: [8, 14], stretch: [4.2, 4.2],
  readyStance: [6, 11], handsOnHips: [7, 12], clap: [2.8, 2.8], fistPump: [1.4, 1.4],
};
export const IDLE_POSES = Object.freeze(['relaxed', 'lookAround', 'armsCrossed', 'stretch']);
export const READY_POSES = Object.freeze(['readyStance', 'handsOnHips', 'armsCrossed', 'clap']);

export function samplePose(name, time, seed = 0) {
  return (POSES[name] || POSES.relaxed)(time, seed);
}
export function poseDuration(name, random = Math.random) {
  const [min, max] = DURATIONS[name] || DURATIONS.relaxed;
  return min + (max - min) * random();
}
// Next calm pose for a player, never the same one twice in a row.
export function nextPose(ready, current, random = Math.random) {
  const list = (ready ? READY_POSES : IDLE_POSES).filter((pose) => pose !== current);
  return list[Math.floor(random() * list.length) % list.length];
}
