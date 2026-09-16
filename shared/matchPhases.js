// outOfPlay: the ball left over a goal line without a goal (AUT), before the goal kick.
export const isMatchPhase = (phase) => ['playing', 'goalCelebration', 'kickoff', 'outOfPlay'].includes(phase);
