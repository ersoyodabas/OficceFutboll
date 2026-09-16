// Presentation follows snapshots. It never advances the match or resets gameplay.
export function createGoalSequence({ presentation, camera, audio, controls }) {
  let latestGoal = 0, completedGoal = 0, kickoffAt = 0;
  function sync(msg) {
    const goal = msg.goalEvent;
    const id = goal?.id || 0;
    if (id && id < latestGoal) return { ignore: true };
    if (msg.phase === 'goalCelebration' && goal) {
      if (id <= completedGoal) return { ignore: true };
      if (id > latestGoal) {
        latestGoal = id;
        controls.clearGameInput();
        presentation.show(goal, msg.serverTime);
        camera.beginGoal(goal.position);
        // Optional cues are no-ops when their buffers are absent.
        if (msg.serverTime - goal.startedAt < 1200) {
          audio.playSfx('goal'); audio.playSfx('crowd_goal'); audio.playSfx('goal_presentation');
        }
      }
    } else if (msg.phase === 'kickoff' || (msg.phase === 'playing' && id > completedGoal)) {
      completedGoal = Math.max(completedGoal, id);
      latestGoal = Math.max(latestGoal, id);
      if (msg.kickoffEndsAt > kickoffAt) {
        kickoffAt = msg.kickoffEndsAt;
        presentation.hide(); controls.clearGameInput(); camera.beginKickoff();
        audio.playSfx('kickoff');
        return { snap: true };
      }
    }
    return {};
  }
  function clear(resetHistory = false) {
    presentation.hide(); camera.resetMode();
    completedGoal = latestGoal;
    if (resetHistory) latestGoal = completedGoal = kickoffAt = 0;
  }
  return { sync, clear };
}
