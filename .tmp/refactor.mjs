import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(path.join(os.tmpdir(), 'office-futboll-refactor-tools/package.json'));
const acorn = require('acorn');
const walk = require('acorn-walk');
const scope = require('eslint-scope');
const read = p => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const g = read('.tmp/game.js').split('\n');
const s = read('.tmp/server-original.js').split('\n');
const G = (a,b) => g.slice(a-1,b).map(x=>x.startsWith('  ')?x.slice(2):x).join('\n')+'\n';
const S = (a,b) => s.slice(a-1,b).join('\n')+'\n';
function write(p,t) { fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,t.trim()+'\n'); }
function analysis(code) {
  const ast=acorn.parse(code,{ecmaVersion:2022,sourceType:'module',ranges:true});
  const parents=new Map(); walk.fullAncestor(ast,(n,_,anc)=>parents.set(n,anc.at(-2)));
  return {parents,refs:scope.analyze(ast,{ecmaVersion:2022,sourceType:'module'}).globalScope.through};
}
function rewrite(code,map) {
  const {parents,refs}=analysis(code); const edits=new Map();
  for(const {identifier:n} of refs) if(map[n.name]) {
    const p=parents.get(n); const replacement=(p?.type==='Property'&&p.shorthand?`${n.name}: `:'')+map[n.name];
    edits.set(n.start,{end:n.end,text:replacement});
  }
  for(const [start,e] of [...edits].sort((a,b)=>b[0]-a[0])) code=code.slice(0,start)+e.text+code.slice(e.end);
  return code;
}
const configNames=['TEAM_COLOR','CAMERA_HEIGHT','CAMERA_SIDE_DISTANCE','CAMERA_FOV','PLAYER_ROTATION_SPEED','PLAYER_VISUAL_SCALE','BALL_VISUAL_SCALE','DEFAULT_SERVER_URL','SERVER_STORAGE_KEY'];
function client(p,code,map={}) {
  code=rewrite(code,map);
  const names=new Set(analysis(code).refs.map(x=>x.identifier.name));
  const cs=configNames.filter(n=>names.has(n));
  const field=['FIELD','HALF_W','HALF_L','GOAL_HALF_W','BALL_R'].filter(n=>names.has(n));
  let header=cs.length?`import { ${cs.join(', ')} } from '../core/config.js';\n`:'';
  if(names.has('THREE')) header+="import { THREE } from '../engine/three.js';\n";
  if(field.length) header+=`import { ${field.join(', ')} } from '../../shared/field.js';\n`;
  if(names.has('makeCanvasTexture')) header+="import { makeCanvasTexture } from '../engine/assetLoader.js';\n";
  write(p,header+code);
}
const factory=(name,args,body,exports)=>`export function ${name}(${args}) {\n${body}\nreturn { ${exports} };\n}\n`;
const stateNames=['myId','myTeam','myPosition','myReady','mySlot','isHost','phase','positionsData','joined','waitingInLobby','serverMatchStartedAt','pendingJoin','autoJoinRequested'];
const st=Object.fromEntries(stateNames.map(n=>[n,`state.${n}`]));
const domNames=[...G(47,84).matchAll(/const (\w+|\$) =/g)].map(m=>m[1]);
const dom=Object.fromEntries(domNames.map(n=>[n,`ui.dom.${n}`]));
dom.$='ui.dom.$';
const uim=Object.fromEntries(['showOverlay','updateConnectionStatus','setMatchMenu','showCountdownOverlay','hideCountdownOverlay'].map(n=>[n,`ui.${n}`]));
write('package.json',JSON.stringify({name:'office-futboll',private:true,type:'module',scripts:{test:'npm --prefix server test',check:'node scripts/check-modules.js'}},null,2));
let field=read('.tmp/field.js'); field=field.slice(field.indexOf('  return Object.freeze(')+9,field.lastIndexOf('\n});')).trim();
write('shared/field.js',`// Shared geometry only. Server gameplay tuning lives in server/core/config.js.\nexport const FIELD = ${field}\nexport const { HALF_W, HALF_L, GOAL_HALF_W, GOAL_HEIGHT, BALL_R, PLAYER_R } = FIELD;`);
write('src/core/config.js',G(8,27).replace(/^const /gm,'export const '));
write('src/engine/three.js',`// Compatibility adapter for the existing vendored build; the only app module\n// that reads its global. game.html loads this local library before the entrypoint.\nexport const THREE = globalThis.THREE;\nif (!THREE) throw new Error('Local lib/three.min.js must load before the game module.');`);
client('src/engine/assetLoader.js',G(168,178).replace('function makeCanvasTexture','export function makeCanvasTexture')+`\nexport const assetUrl = (file) => new URL('../../assets/' + file, import.meta.url).href;`);
client('src/engine/renderer.js',factory('createRenderer','',G(124,134),'renderer').replace('return { renderer };','return renderer;'));
client('src/engine/scene.js',factory('createScene','',G(136,138),'scene').replace('return { scene };','return scene;'));
client('src/engine/lighting.js',`export function initializeLighting(scene) {\n${G(152,163)}\n}`);
client('src/engine/camera.js',factory('createCamera','{ renderer }',G(141,149)+`const _camLook = new THREE.Vector3(0, .3, 0);\n`+G(1268,1272).replace('function updateBroadcastCamera()','function updateBroadcastCamera(ball)'),'camera, updateBroadcastCamera'));
client('src/world/field.js',`import { assetUrl } from '../engine/assetLoader.js';\n`+factory('createField','{ scene, renderer }',G(180,305).replace("'assets/textures/pitch/grass_diffuse.png'","assetUrl('textures/pitch/grass_diffuse.png')").replace("'assets/textures/pitch/grass_normal.png'","assetUrl('textures/pitch/grass_normal.png')"),'grassMat, createPitchMarkings'));
client('src/world/goals.js',`export function createGoals({ scene }) {\n${G(307,374)}\n}`);
let stadium=read('.tmp/stadium.js'); stadium=stadium.slice(stadium.indexOf('  function create('),stadium.indexOf('\n  globalThis.OfficeStadium'));
stadium=stadium.replace('function create(scene, field)','export function createStadium({ scene, field })').replace('    const THREE = globalThis.THREE;\n','');
client('src/world/stadium.js',stadium);
let lobbyView=read('.tmp/lobby.js'); lobbyView=lobbyView.slice(lobbyView.indexOf('  globalThis.OfficeLobby = class'),lobbyView.lastIndexOf('\n})();')).replace('globalThis.OfficeLobby = class','export class LobbyView').replace(/};\s*$/,'}');
client('src/lobby/lobbyView.js',lobbyView);
client('src/gameplay/ball.js',factory('createBall','{ scene }',G(377,405)+`const _predicted = new THREE.Vector3();\nfunction update(dt, now) {\n${G(1288,1299)}\n}\nfunction applySnapshot(snapshot) {\nballNet.serverPos.set(snapshot.x, snapshot.y, snapshot.z);\nballNet.serverVel.set(snapshot.vx, snapshot.vy, snapshot.vz);\nballNet.lastUpdate = performance.now();\n}\nfunction reset() { ballNet.serverPos.set(0, BALL_R, 0); ballNet.serverVel.set(0, 0, 0); }`,'mesh: ball, net: ballNet, update, applySnapshot, reset'));
client('src/gameplay/player.js',factory('createPlayerFactory','{ scene }',G(408,666),'createFootballer, animateFootballer'));
client('src/gameplay/players.js',factory('createPlayers','{ scene, state, createFootballer, animateFootballer }',`const entities = new Map();\n`+G(807,837)+`function applySnapshot(players) {\n${G(981,995).replace('msg.players','players')}\n}\nfunction update(dt) {\n${G(1301,1315)}\n}\n`,'clearEntities, applySnapshot, update'),st);
// UI keeps its DOM, overlays, menu, scoreboard, clock and countdown presentation.
let uiBody=G(47,84)+G(86,89)+G(691,712)+G(1090,1116)+G(1191,1204)+G(1258,1263);
uiBody=`const $ = (id) => document.getElementById(id);\nlet countdownEndAt = 0, countdownRafId = null;\n`+uiBody;
uiBody+=`\n${G(1207,1211)}\n`;
uiBody+=`function applyStateHUD(msg) {\n${G(972,980)}\n}\nfunction updateClock() { if (state.serverMatchStartedAt > 0) matchClockEl.textContent = formatClock(Date.now() - state.serverMatchStartedAt); }\n`;
uiBody+=`$('menuBtn').addEventListener('click', () => setMatchMenu(true));\nresumeBtn.addEventListener('click', () => setMatchMenu(false));\nreconnectBtn.addEventListener('click', () => { showOverlay(connectOverlay); updateConnectionStatus('idle'); });\n`;
uiBody=uiBody.replace(/if \(ws\?\.readyState !== WebSocket.OPEN\) return;\n\s*clearGameInput\(\);\n\s*ws.send\(JSON.stringify\(\{ type: 'leave_match' \}\)\);/,'onClearInput();\n    onLeaveMatch();');
client('src/ui/hud.js',factory('createUI','{ state, canvas, onClearInput, onLeaveMatch }',uiBody,`dom: { $, ${domNames.join(', ')} }, showOverlay, updateConnectionStatus, setMatchMenu, showCountdownOverlay, hideCountdownOverlay, applyStateHUD, updateClock`),{...st,clearGameInput:'onClearInput',renderer:'enginePlaceholder'});
// renderer was the only engine dependency in UI.
write('src/ui/hud.js',read('src/ui/hud.js').replaceAll('enginePlaceholder.domElement','canvas'));
let controls=G(1183,1190)+G(1212,1251);
controls=controls.replaceAll('ws?.readyState === WebSocket.OPEN','network.isOpen()').replace('if (!ws || ws.readyState !== WebSocket.OPEN) return;','if (!network.isOpen()) return;').replace(/ws.send\(JSON.stringify\((.*)\)\);/g,'network.send($1);');
client('src/gameplay/controls.js',factory('createControls','{ state, ui, network }',controls,'clearGameInput, sendInput'),{...st,...dom,...uim});
client('src/lobby/invitation.js',G(31,43).replace('function normalizeServerUrl','export function normalizeServerUrl')+factory('initializeInvitations','{ ui, state }',G(95,121)+G(1122,1176),'buildInviteLink'),{...st,...dom});
// Move the lobby presentation and join handshake into the lobby domain.
let lobbyBody=`let lobbyView = null;\nlet joinInProgress = false;\n`+G(919,969)+G(1002,1005)+G(1029,1077)+G(1081,1084);
lobbyBody=lobbyBody.replace('new OfficeLobby','new LobbyView').replaceAll('joinBtn','connectBtn').replaceAll('ws?.readyState !== WebSocket.OPEN','!network.isOpen()').replaceAll('ws.readyState !== WebSocket.OPEN','!network.isOpen()').replace(/ws.send\(JSON.stringify\((.*)\)\);/g,'network.send($1);');
lobbyBody+=`\nfunction start() { if (state.autoJoinRequested) joinLobby(); }\nfunction render(now) { if (lobbyView) lobbyView.render(now); }\n`;
client('src/lobby/lobby.js',`import { LobbyView } from './lobbyView.js';\nimport { normalizeServerUrl } from './invitation.js';\n`+factory('createLobby','{ state, ui, network, grassMat, createPitchMarkings, createFootballer }',lobbyBody,'renderLobby, render, start'),{...st,...dom,...uim,ensureWebSocketConnected:'network.ensureConnected',disposeSocket:'network.dispose'});
// Dispatch messages through explicit subsystem interfaces. No geometry here.
let messages=G(838,917).replace(/ballNet.serverPos.set\(0, BALL_R, 0\);\n\s*ballNet.serverVel.set\(0, 0, 0\);/,'ball.reset();');
messages=messages.replace('function handleMessage(msg) {',`function handleMessage(msg) {\n    events.emit(msg.type, msg);`);
client('src/network/messages.js',factory('createMessageHandler','{ state, ui, lobby, players, ball, controls, canvas, events }',messages,'handleMessage'),{...st,...dom,...uim,renderLobby:'lobby.renderLobby',clearEntities:'players.clearEntities',clearGameInput:'controls.clearGameInput',applyState:'applyState'});
write('src/network/messages.js',read('src/network/messages.js').replace('renderer.domElement','canvas').replace('return { handleMessage };',`function applyState(msg) { ui.applyStateHUD(msg); players.applySnapshot(msg.players); ball.applySnapshot(msg.ball); }\nreturn { handleMessage };`));
write('src/core/gameState.js',`// Server-owned values cached for presentation. This is not a simulation.\nexport function createGameState() {\nreturn { myId: null, myTeam: null, myPosition: 'OOS', myReady: false, mySlot: null, isHost: false, phase: 'idle', positionsData: null, joined: false, waitingInLobby: false, serverMatchStartedAt: 0, pendingJoin: null, autoJoinRequested: false };\n}`);
// CSS ownership leaves the entry HTML small and stable.
let html=read('game.html'); const css=html.match(/<style>\n([\s\S]*?)<\/style>/)[1];
write('src/ui/styles.css',css); html=html.replace(/<style>[\s\S]*?<\/style>/,'<link rel="stylesheet" href="src/ui/styles.css" />').replace(/  <script src="field.js"><\/script>[\s\S]*?  <script src="game.js"><\/script>/,'  <script type="module" src="src/core/game.js"></script>');
write('game.html',html);
// Server modules retain the exact simulation formulas and tick ordering.
const svNames=['clients','hostId','phase','countdownRemaining','countdownStartAt','matchStartedAt','matchEndsAt','goalPauseRemaining','endPauseRemaining','pendingServe','score','matchActive','world','ballBody','ballOwnerId','looseBallUntil'];
const sv=Object.fromEntries(svNames.map(n=>[n,`state.${n}`]));
const serverConfig=S(15,77);
const sn=[...serverConfig.matchAll(/^const ([A-Z_]+)/gm)].map(m=>m[1]); sn.push('positionFor');
write('server/core/config.js',`import { FIELD } from '../../shared/field.js';\n`+serverConfig.replace(/^const /gm,'export const ').replace('function positionFor','export function positionFor'));
function server(p,code,map={}) {
  code=rewrite(code,{...sv,...map}); const ns=new Set(analysis(code).refs.map(x=>x.identifier.name));
  const conf=sn.filter(n=>ns.has(n)); const dims=['HALF_W','HALF_L','GOAL_HALF_W','GOAL_HEIGHT','BALL_R','PLAYER_R','FIELD'].filter(n=>ns.has(n));
  let header=conf.length?`import { ${conf.join(', ')} } from '../core/config.js';\n`:'';
  if(dims.length) header+=`import { ${dims.join(', ')} } from '../../shared/field.js';\n`;
  if(ns.has('CANNON')) header+="import * as CANNON from 'cannon-es';\n";
  write(p,header+code);
}
write('server/core/gameState.js',`export function createGameState() { return { clients: new Map(), hostId: null, phase: 'lobby', countdownRemaining: 0, countdownStartAt: 0, matchStartedAt: 0, matchEndsAt: 0, goalPauseRemaining: 0, endPauseRemaining: 0, pendingServe: 'blue', score: { blue: 0, red: 0 }, matchActive: false, world: null, ballBody: null, ballOwnerId: null, looseBallUntil: 0 }; }`);
server('server/network/broadcast.js',factory('createBroadcast','{ state }',S(115,124),'send, broadcast'));
server('server/lobby/lobbyManager.js',factory('createLobbyManager','{ state, broadcast }',S(126,144),'rosterPayload, broadcastLobby'));
server('server/lobby/readyManager.js',factory('createReadyManager','{ state, broadcast, broadcastLobby }',S(347,378),'cancelCountdown, checkAutoStart'));
server('server/gameplay/ballPhysics.js',S(159,203).replace('function buildWorld','export function buildWorld')+factory('createBallPhysics','{ state }',S(629,652),'resolvePlayerBallContact'));
server('server/gameplay/playerManager.js',factory('createPlayerManager','{ state }',S(205,234)+S(384,465),'placeAllPlayers, applyPlayerControl'));
server('server/gameplay/actions.js',factory('createActions','{ state, broadcast }',S(467,622),'releaseBall, performAction, updateBallControl'));
server('server/gameplay/matchManager.js',factory('createMatchManager','{ state, broadcast, broadcastLobby, buildWorld, placeAllPlayers }',S(236,342),'startMatch, resetAfterGoal, endMatch, abortMatchToLobby, backToLobby'));
let tick=S(657,745).replace('setInterval(() => {','function tick() {').replace('}, 1000 / TICK_HZ);','}');
server('server/gameplay/simulation.js',factory('createSimulation','{ state, broadcast, broadcastLobby, players, physics, actions, match }',tick,'tick'),Object.fromEntries(['startMatch','resetAfterGoal','endMatch','backToLobby'].map(n=>[n,`match.${n}`]).concat([['applyPlayerControl','players.applyPlayerControl'],['updateBallControl','actions.updateBallControl'],['resolvePlayerBallContact','physics.resolvePlayerBallContact']])));
server('server/lobby/invitationManager.js',factory('createInvitationHandler','{ state, getLanIPv4Addresses, getPort }',S(755,818).replaceAll('${PORT}','${getPort()}'),'handleJoinLanding'));
server('server/network/lan.js',`import os from 'node:os';\n`+S(967,976).replace('function getLanIPv4Addresses','export function getLanIPv4Addresses'));
let connection=S(853,961);
server('server/network/messageHandler.js',`import crypto from 'node:crypto';\n`+factory('createConnectionHandler','{ state, send, broadcastLobby, rosterPayload, ready, actions, match }',`function onConnection(ws) {\n${connection}\n}\n`,'onConnection'),{cancelCountdown:'ready.cancelCountdown',checkAutoStart:'ready.checkAutoStart',performAction:'actions.performAction',releaseBall:'actions.releaseBall',abortMatchToLobby:'match.abortMatchToLobby'});
// Preserve the npm entrypoint while making the composition root independently importable.
write('server/server.js',`import { startServer } from './core/server.js';\nstartServer();`);
const pkg=JSON.parse(read('server/package.json')); pkg.type='module'; write('server/package.json',JSON.stringify(pkg,null,2));
let test=read('server/test/match-lobby.test.js');
test=test.replace("const { test } = require('node:test');",`import { createRequire } from 'node:module';\nimport { fileURLToPath } from 'node:url';\nconst require = createRequire(import.meta.url);\nconst __dirname = fileURLToPath(new URL('.', import.meta.url));\nconst { test } = require('node:test');`);
test=test.replace("const welcome = await wait((m) => m.type === 'welcome');",`const welcome = await wait((m) => m.type === 'welcome');\n    send({ type: 'select_slot', team, slot: 1 });\n    await wait((m) => m.type === 'lobby' && m.players.some((p) => p.id === welcome.id && p.team === team && p.slot === 1));`);
test=test.replace("{ type: 'update_self', team: 'red', position: 'ST' }","{ type: 'select_slot', team: 'red', slot: 2 }"); write('server/test/match-lobby.test.js',test);
fs.renameSync('textures/grass.jpg','assets/textures/pitch/grass.jpg');
fs.rmdirSync('textures');
// The implementations now live solely in the modules above.
for(const f of ['game.js','field.js','stadium.js','lobby.js']) fs.unlinkSync(f);
console.log('Extracted client and server implementations.');
