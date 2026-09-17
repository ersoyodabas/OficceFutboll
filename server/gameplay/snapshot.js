export function matchSnapshot(state, now = Date.now()) {
  return {
    phase: state.phase, serverTime: now, score: { ...state.score }, teams: state.teams,
    startedAt: state.matchStartedAt, endsAt: state.matchEndsAt,
    goalEvent: state.goalEvent, outEvent: state.outEvent, kickoffTeam: state.pendingServe,
    kickoffEndsAt: state.kickoffEndsAt,
    ball: {
      x: state.ballBody.position.x, y: state.ballBody.position.y, z: state.ballBody.position.z,
      vx: state.ballBody.velocity.x, vy: state.ballBody.velocity.y, vz: state.ballBody.velocity.z,
      // Authoritative spin so every client rotates the ball the same way.
      wx: state.ballBody.angularVelocity.x, wy: state.ballBody.angularVelocity.y, wz: state.ballBody.angularVelocity.z,
    },
    players: Array.from(state.clients.values()).filter((c) => c.inMatch).map((c) => ({
      id: c.id, team: c.team, position: c.position, name: c.name,
      x: c.pos.x, z: c.pos.z, vx: c.vel.x, vz: c.vel.z,
      facingX: c.facing.x, facingZ: c.facing.z, hasBall: state.ballOwnerId === c.id,
      sliding: c.slideRemaining > 0,
      charging: !!c.shotCharge,
      // Server time for charge confirmation; the local UI starts at keydown.
      chargeStartedAt: c.shotCharge ? c.shotCharge.startedAt : null,
      diving: !!c.keeperDive,
      action: c.lastAction && now - c.lastAction.at < 300 ? c.lastAction.type : null,
    })),
  };
}
