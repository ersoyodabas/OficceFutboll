// Server-owned values cached for presentation. This is not a simulation.
export function createGameState() {
return { myId: null, myTeam: null, myPosition: 'OOS', myReady: false, mySlot: null, isHost: false, phase: 'idle', positionsData: null, joined: false, waitingInLobby: false, serverMatchStartedAt: 0, pendingJoin: null, autoJoinRequested: false, lastScore: { blue: 0, red: 0 } };
}
