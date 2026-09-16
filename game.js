(() => {
  'use strict';

  // ---------- Shared pitch coordinates: X width, Z length, Y up ----------
  const FIELD = globalThis.OfficeField;
  const { HALF_W, HALF_L, GOAL_HALF_W, BALL_R } = FIELD;

  const TEAM_COLOR = { blue: 0x2d8fe0, red: 0xe0503d };

  // ---------- Broadcast camera tuning (FIFA/EA FC style sideline camera) ----------
  // The camera sits off to one side of the pitch (beyond the touchline) and pans
  // along the pitch's length (Z) as play moves, so the pitch reads horizontally
  // on screen — this is a fixed sideline "TV" framing, not a per-player chase cam,
  // and it does not mirror by team (a real broadcast camera doesn't flip ends
  // depending on who has the ball).
  const CAMERA_HEIGHT = 20;
  const CAMERA_SIDE_DISTANCE = 30;
  const CAMERA_FOV = 36;
  const PLAYER_ROTATION_SPEED = 9;

  // ---------- Visual-only scale (kept separate from server physics dimensions) ----------
  const PLAYER_VISUAL_SCALE = 1.18;
  const BALL_VISUAL_SCALE = 0.9;

  // ---------- Default LAN server ----------
  const DEFAULT_SERVER_URL = 'ws://10.17.12.93:3000';
  const SERVER_STORAGE_KEY = 'officeFootballServer';

  // Accepts "10.17.12.93:3000" or "ws://10.17.12.93:3000" and always returns a
  // ready-to-use ws:// URL. Falls back to DEFAULT_SERVER_URL on empty input.
  function normalizeServerUrl(value) {
    let url = (value || '').trim();
    if (!url) url = DEFAULT_SERVER_URL;
    if (!/^wss?:\/\//i.test(url)) url = 'ws://' + url;
    return url;
  }

  // The invite link's landing page (server.js's GET /join) shares the same
  // host/port as the WebSocket server — no second port. Given
  // ws://host:port -> http://host:port, wss://host:port -> https://host:port.
  function deriveHttpBaseUrl(wsUrl) {
    return wsUrl.replace(/^ws:\/\//i, 'http://').replace(/^wss:\/\//i, 'https://').replace(/\/$/, '');
  }

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const hud = $('hud');
  const hint = $('hint');
  const scoreBlueEl = $('scoreBlue');
  const scoreRedEl = $('scoreRed');
  const myFlagBlue = $('myFlagBlue');
  const myFlagRed = $('myFlagRed');
  const matchClockEl = $('matchClock');
  const posLabelEl = $('posLabel');

  const connectOverlay = $('connectOverlay');
  const lobbyOverlay = $('lobbyOverlay');
  const endOverlay = $('endOverlay');
  const disconnectOverlay = $('disconnectOverlay');
  const matchMenu = $('matchMenu');
  const resumeBtn = $('resumeBtn');
  const leaveMatchBtn = $('leaveMatchBtn');

  const serverInput = $('serverInput');
  const nameInput = $('nameInput');
  const connectBtn = $('connectBtn');
  const connStatus = $('connStatus');

  const lobbyStatus = $('lobbyStatus');
  const slotStatus = $('slotStatus');
  const readyBtn = $('readyBtn');
  const readyProgress = $('readyProgress');

  const endResultEl = $('endResult');
  const endScoreEl = $('endScore');
  const disconnectMsg = $('disconnectMsg');
  const reconnectBtn = $('reconnectBtn');

  const copyInviteLinkBtn = $('copyInviteLinkBtn');
  const inviteLinkStatus = $('inviteLinkStatus');

  const countdownOverlay = $('countdownOverlay');
  const countdownNumber = $('countdownNumber');
  const countdownSub = $('countdownSub');

  function showOverlay(el) {
    setMatchMenu(false);
    [connectOverlay, lobbyOverlay, endOverlay, disconnectOverlay].forEach((o) => { o.hidden = (o !== el); });
  }

  // Synchronous on purpose: this runs once, at script load, directly against
  // the DOM element the connect button also reads from — no async race with
  // chrome.storage.local's callback that could leave the input empty for the
  // brief window before it resolves.
  (function initServerInput() {
    let savedServer = null;
    try { savedServer = localStorage.getItem(SERVER_STORAGE_KEY); } catch (e) { /* storage not available */ }
    serverInput.value = savedServer?.trim() || DEFAULT_SERVER_URL;
  })();
  try {
    const savedName = localStorage.getItem('officeFootballPlayerName');
    if (savedName) nameInput.value = savedName;
  } catch (e) { /* storage not available */ }

  // ---------- Invite handoff: game.html?server=...&from=...&name=...&join=1 ----------
  // server.js serves this same page to invitees, so they use the extension's
  // existing lobby without needing to know a machine-specific extension ID.
  const inviteParams = new URLSearchParams(window.location.search);
  let autoJoinRequested = inviteParams.get('join') === '1';
  (function readInviteParams() {
    const params = inviteParams;
    const server = params.get('server');
    const from = params.get('from');
    if (server) serverInput.value = normalizeServerUrl(server);
    if (params.get('name')) nameInput.value = params.get('name').trim().slice(0, 20);
    if (from) {
      const inviteNote = $('inviteNote');
      inviteNote.textContent = `⚽ ${from} seni maça davet etti!`;
      inviteNote.hidden = false;
    }
  })();

  // ---------- Renderer / scene / camera ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  document.getElementById('app').prepend(renderer.domElement);
  renderer.domElement.tabIndex = 0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x829fa4);
  scene.fog = new THREE.Fog(0x829fa4, 115, 220);

  // Sideline broadcast camera: fixed off to one side (+X, beyond the touchline),
  // panning along Z as play moves — see updateBroadcastCamera() below.
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, window.innerWidth / window.innerHeight, 0.1, 250);
  camera.position.set(CAMERA_SIDE_DISTANCE, CAMERA_HEIGHT, 0);
  camera.lookAt(-HALF_W * .35, 0.3, 0);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---------- Lighting ----------
  scene.add(new THREE.HemisphereLight(0xe5f4ff, 0x365a38, 1.15));
  const sun = new THREE.DirectionalLight(0xfff5df, 2.25);
  sun.position.set(-25, 55, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -55;
  sun.shadow.camera.right = 55;
  sun.shadow.camera.top = 55;
  sun.shadow.camera.bottom = -55;
  sun.shadow.camera.far = 130;
  sun.shadow.bias = -0.0015;
  scene.add(sun);

  globalThis.OfficeStadium.create(scene, FIELD);

  // ---------- Canvas texture helper ----------
  function makeCanvasTexture(w, h, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    draw(ctx, w, h);
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // ---------- Local tiled grass + markings and mowing direction ----------
  const grassLoader = new THREE.TextureLoader();
  function loadLocalTexture(url, onError) {
    return grassLoader.load(url, undefined, undefined, onError);
  }
  const grassTex = loadLocalTexture('assets/textures/pitch/grass_diffuse.png', () => {
    grassMat.map = null; grassMat.color.set(0x31854a); grassMat.needsUpdate = true;
  });
  const grassNormal = loadLocalTexture('assets/textures/pitch/grass_normal.png', () => {
    grassMat.normalMap = null; grassMat.needsUpdate = true;
  });
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
  grassNormal.wrapS = grassNormal.wrapT = THREE.RepeatWrapping;
  grassTex.repeat.set(10, 16);
  grassNormal.repeat.copy(grassTex.repeat);
  grassTex.colorSpace = THREE.SRGBColorSpace;
  grassTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  grassNormal.anisotropy = grassTex.anisotropy;
  const grassMat = new THREE.MeshStandardMaterial({ map: grassTex, normalMap: grassNormal, normalScale: new THREE.Vector2(.2, .2), color: 0xe9ffe9, roughness: .92 });
  const pitch = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF_W * 2, HALF_L * 2),
    grassMat
  );
  pitch.rotation.x = -Math.PI / 2;
  pitch.receiveShadow = true;
  scene.add(pitch);

  // ---------- Slide-tackle grass spray ----------
  const slideGrassGeometry = new THREE.BoxGeometry(0.045, 0.13, 0.025);
  const slideGrassMaterials = [0x2f7d3b, 0x4d963f, 0x72ad4c].map((color) => (
    new THREE.MeshBasicMaterial({ color })
  ));
  const slideGrassParticles = [];
  const MAX_SLIDE_GRASS_PARTICLES = 360;

  function emitSlideGrass(entity, dt) {
    entity.slideGrassAccumulator = (entity.slideGrassAccumulator || 0) + dt * 58;
    let directionX = Number.isFinite(entity.facingX) ? entity.facingX : entity.netVel.x;
    let directionZ = Number.isFinite(entity.facingZ) ? entity.facingZ : entity.netVel.y;
    const directionLength = Math.hypot(directionX, directionZ);
    if (directionLength < 0.01) return;
    directionX /= directionLength;
    directionZ /= directionLength;
    const sideX = -directionZ;
    const sideZ = directionX;

    while (entity.slideGrassAccumulator >= 1 && slideGrassParticles.length < MAX_SLIDE_GRASS_PARTICLES) {
      entity.slideGrassAccumulator -= 1;
      const sideScatter = (Math.random() - 0.5) * 0.8;
      const trailDistance = 0.2 + Math.random() * 0.75;
      const shard = new THREE.Mesh(
        slideGrassGeometry,
        slideGrassMaterials[Math.floor(Math.random() * slideGrassMaterials.length)]
      );
      shard.position.set(
        entity.renderPos.x - directionX * trailDistance + sideX * sideScatter,
        0.05,
        entity.renderPos.z - directionZ * trailDistance + sideZ * sideScatter
      );
      shard.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      const scale = 0.65 + Math.random() * 0.85;
      shard.scale.setScalar(scale);
      scene.add(shard);

      const maxLife = 0.38 + Math.random() * 0.28;
      slideGrassParticles.push({
        mesh: shard,
        life: maxLife,
        maxLife,
        scale,
        velocity: new THREE.Vector3(
          -directionX * (0.3 + Math.random() * 0.9) + sideX * (Math.random() - 0.5) * 1.8,
          1.25 + Math.random() * 1.45,
          -directionZ * (0.3 + Math.random() * 0.9) + sideZ * (Math.random() - 0.5) * 1.8
        ),
        spin: new THREE.Vector3(
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 12
        ),
      });
    }
  }

  function updateSlideGrass(dt) {
    for (let i = slideGrassParticles.length - 1; i >= 0; i--) {
      const particle = slideGrassParticles[i];
      particle.life -= dt;
      if (particle.life <= 0) {
        scene.remove(particle.mesh);
        slideGrassParticles.splice(i, 1);
        continue;
      }

      particle.velocity.y -= 5.6 * dt;
      particle.mesh.position.addScaledVector(particle.velocity, dt);
      particle.mesh.rotation.x += particle.spin.x * dt;
      particle.mesh.rotation.y += particle.spin.y * dt;
      particle.mesh.rotation.z += particle.spin.z * dt;
      const remaining = Math.max(0.12, particle.life / particle.maxLife);
      particle.mesh.scale.setScalar(particle.scale * remaining);
    }
  }

  // Full FIFA-style pitch markings: touchlines/goal lines, halfway line, center
  // circle + spot, both penalty areas + six-yard boxes + spots + arcs, corner
  // arcs. Proportions are scaled from real pitch ratios (105x68m) onto our
  // gameplay-sized field, then drawn as one transparent overlay texture.
  function createPitchMarkings(ctx, s) {
    const scaleX = s / (HALF_W * 2);
    const scaleZ = s / (HALF_L * 2);
    const toPx = (x, z) => [s / 2 + x * scaleX, s / 2 + z * scaleZ];
    // draws a box given world-space X half-width and a Z range [z0, z1]
    const strokeBoxXZ = (halfW, z0, z1) => {
      const [xLeft] = toPx(-halfW, 0);
      const [xRight] = toPx(halfW, 0);
      const [, yTop] = toPx(0, Math.min(z0, z1));
      const [, yBottom] = toPx(0, Math.max(z0, z1));
      ctx.strokeRect(xLeft, yTop, xRight - xLeft, yBottom - yTop);
    };

    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 4;

    // touchlines + goal lines
    ctx.strokeRect(6, 6, s - 12, s - 12);
    // halfway line
    ctx.beginPath(); ctx.moveTo(0, s / 2); ctx.lineTo(s, s / 2); ctx.stroke();
    // center circle + spot
    const centerRadiusX = FIELD.CENTER_CIRCLE_R * scaleX;
    const centerRadiusZ = FIELD.CENTER_CIRCLE_R * scaleZ;
    ctx.beginPath(); ctx.ellipse(s / 2, s / 2, centerRadiusX, centerRadiusZ, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(s / 2, s / 2, 4, 0, Math.PI * 2); ctx.fill();

    // penalty area, six-yard box, spot and arc — mirrored for both ends
    const penaltyHalfW = FIELD.PENALTY_HALF_W, penaltyDepth = FIELD.PENALTY_DEPTH;
    const sixYardHalfW = FIELD.SIX_YARD_HALF_W, sixYardDepth = FIELD.SIX_YARD_DEPTH;
    const penaltySpotDist = FIELD.PENALTY_SPOT_DISTANCE;
    const arcRadiusX = FIELD.CENTER_CIRCLE_R * scaleX;
    const arcRadiusZ = FIELD.CENTER_CIRCLE_R * scaleZ;

    [1, -1].forEach((sign) => {
      // sign === 1: goal at +Z (blue's own goal), sign === -1: goal at -Z (red's own goal)
      const goalLineZ = sign * HALF_L;
      const inward = -sign; // direction from the goal line toward the pitch center

      strokeBoxXZ(penaltyHalfW, goalLineZ, goalLineZ + inward * penaltyDepth);
      strokeBoxXZ(sixYardHalfW, goalLineZ, goalLineZ + inward * sixYardDepth);

      const [spotX, spotZ] = toPx(0, goalLineZ + inward * penaltySpotDist);
      ctx.beginPath(); ctx.arc(spotX, spotZ, 4, 0, Math.PI * 2); ctx.fill();

      // penalty arc: the portion of the circle around the spot that bulges
      // toward the pitch center (away from the goal line). Canvas angles: 0 =
      // +x (right), increasing clockwise since Y grows downward, so "toward
      // center" is 270°/-90° when the goal is at the bottom edge (sign===1)
      // and 90° when the goal is at the top edge (sign===-1).
      const centerAngle = sign === 1 ? Math.PI * 1.5 : Math.PI * 0.5;
      const spread = Math.PI * 0.23;
      ctx.beginPath();
      ctx.ellipse(spotX, spotZ, arcRadiusX, arcRadiusZ, 0, centerAngle - spread, centerAngle + spread);
      ctx.stroke();
    });

    // corner arcs
    const cornerRX = FIELD.CORNER_ARC_R * scaleX;
    const cornerRZ = FIELD.CORNER_ARC_R * scaleZ;
    [[-HALF_W, -HALF_L, 0, Math.PI / 2], [HALF_W, -HALF_L, Math.PI / 2, Math.PI],
      [-HALF_W, HALF_L, -Math.PI / 2, 0], [HALF_W, HALF_L, Math.PI, Math.PI * 1.5]]
      .forEach(([x, z, a0, a1]) => {
        const [cx, cz] = toPx(x, z);
        ctx.beginPath(); ctx.ellipse(cx, cz, cornerRX, cornerRZ, 0, a0, a1); ctx.stroke();
      });
  }
  const linesTex = makeCanvasTexture(1024, 1024, createPitchMarkings);
  const lines = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF_W * 2, HALF_L * 2),
    new THREE.MeshBasicMaterial({ map: linesTex, transparent: true, depthWrite: false })
  );
  lines.rotation.x = -Math.PI / 2;
  lines.position.y = 0.006;
  scene.add(lines);

  // Subtle alternating mowing stripes (bands across the width, repeating along
  // the length) — a low-opacity light/dark overlay, cheap and gameplay-neutral.
  function createGrassStripes() {
    const stripeCount = 12;
    const tex = makeCanvasTexture(64, 1024, (ctx, w, h) => {
      for (let y = 0; y < h; y++) {
        const shade = Math.cos(y / h * stripeCount * Math.PI);
        ctx.fillStyle = shade >= 0 ? `rgba(255,255,255,${shade * .025})` : `rgba(0,0,0,${-shade * .025})`;
        ctx.fillRect(0, y, w, 1);
      }
    });
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF_W * 2, HALF_L * 2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.003;
    return mesh;
  }
  scene.add(createGrassStripes());

  // ---------- Walls ----------
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x154529, roughness: 0.85 });
  function makeSideWall(x) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, HALF_L * 2 + 0.5), wallMat);
    wall.position.set(x, 0.45, 0);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
  }
  makeSideWall(-HALF_W - 0.15);
  makeSideWall(HALF_W + 0.15);

  // Boundary walls around the goal mouth (gameplay edge — mirrors the server's
  // pitch bounds so the ball visually can't leave except through a goal).
  function createBoundaryWalls(z) {
    const segW = (HALF_W * 2 - GOAL_HALF_W * 2) / 2;
    [-1, 1].forEach((side) => {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(segW, 0.9, 0.25), wallMat);
      seg.position.set(side * (HALF_W - segW / 2), 0.45, z);
      seg.castShadow = true;
      scene.add(seg);
    });
  }

  // A real goal structure: two posts, a crossbar, and a netted back — not just
  // a wireframe placeholder box.
  function createGoal(z, sign) {
    const GOAL_HEIGHT = FIELD.GOAL_HEIGHT;
    const postR = 0.045;
    const frameColor = sign > 0 ? TEAM_COLOR.blue : TEAM_COLOR.red;
    const postMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, emissive: frameColor, emissiveIntensity: 0.15, roughness: 0.4 });

    const group = new THREE.Group();
    [-1, 1].forEach((side) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, GOAL_HEIGHT, 12), postMat);
      post.position.set(side * GOAL_HALF_W, GOAL_HEIGHT / 2, z);
      post.castShadow = true;
      group.add(post);
    });
    const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, GOAL_HALF_W * 2, 12), postMat);
    crossbar.rotation.z = Math.PI / 2;
    crossbar.position.set(0, GOAL_HEIGHT, z);
    crossbar.castShadow = true;
    group.add(crossbar);

    const netDepth = 1.42;
    const netMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.45 });
    const backNet = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_HALF_W * 2, GOAL_HEIGHT, 8, 6), netMat);
    backNet.position.set(0, GOAL_HEIGHT / 2, z + sign * netDepth);
    group.add(backNet);
    const topNet = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_HALF_W * 2, netDepth, 8, 6), netMat);
    topNet.rotation.x = Math.PI / 2;
    topNet.position.set(0, GOAL_HEIGHT, z + sign * netDepth / 2);
    group.add(topNet);
    [-1, 1].forEach((side) => {
      const sideNet = new THREE.Mesh(new THREE.PlaneGeometry(netDepth, GOAL_HEIGHT, 6, 6), netMat);
      sideNet.rotation.y = Math.PI / 2;
      sideNet.position.set(side * GOAL_HALF_W, GOAL_HEIGHT / 2, z + sign * netDepth / 2);
      group.add(sideNet);
    });

    scene.add(group);
  }

  createBoundaryWalls(HALF_L + 0.15);
  createBoundaryWalls(-HALF_L - 0.15);
  createGoal(HALF_L, 1);
  createGoal(-HALF_L, -1);

  // ---------- Ball ----------
  const ballTex = makeCanvasTexture(256, 256, (ctx, s) => {
    ctx.fillStyle = '#f5f5ed';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#a7aaa7'; ctx.lineWidth = 3;
    ctx.fillStyle = '#172028';
    for (let yy = -1; yy < 4; yy++) {
      for (let xx = -1; xx < 5; xx++) {
        const cx = xx * 72 + (yy % 2 ? 36 : 0), cy = yy * 72;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const angle = -Math.PI / 2 + i * Math.PI * 2 / 5;
          const px = cx + Math.cos(angle) * 20, py = cy + Math.sin(angle) * 20;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
  });
  ballTex.colorSpace = THREE.SRGBColorSpace;
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_R, 24, 24),
    new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.5 })
  );
  ball.castShadow = true;
  ball.position.set(0, BALL_R, 0);
  // rendering scale only — server physics still uses BALL_R for its collider
  ball.scale.setScalar(BALL_VISUAL_SCALE);
  scene.add(ball);
  const ballNet = { serverPos: new THREE.Vector3(0, BALL_R, 0), serverVel: new THREE.Vector3(), lastUpdate: performance.now() };

  // ---------- Footballer factory (jointed rig + jersey texture + name tag) ----------
  const SKIN_COLOR = 0xe3ab7f;
  const skinMat = new THREE.MeshStandardMaterial({ color: SKIN_COLOR, roughness: 0.7 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 0.8 });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.5 });
  const shortsMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.75 });

  function jerseyTextures(teamHex, number) {
    const teamCss = '#' + teamHex.toString(16).padStart(6, '0');
    function draw() {
      return makeCanvasTexture(256, 256, (ctx, s) => {
        ctx.fillStyle = teamCss;
        ctx.fillRect(0, 0, s, s);
        const grad = ctx.createLinearGradient(0, 0, s, 0);
        grad.addColorStop(0, 'rgba(0,0,0,0.18)');
        grad.addColorStop(0.5, 'rgba(255,255,255,0.05)');
        grad.addColorStop(1, 'rgba(0,0,0,0.18)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, s, s);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, s, s * 0.08);
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 4;
        ctx.font = 'bold 150px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText(String(number), s / 2, s * 0.56);
        ctx.fillText(String(number), s / 2, s * 0.56);
      });
    }
    return { front: draw(), back: draw(), plain: makeCanvasTexture(64, 64, (ctx, s) => { ctx.fillStyle = teamCss; ctx.fillRect(0, 0, s, s); }) };
  }

  function nameSprite(name) {
    const tex = makeCanvasTexture(512, 128, (ctx, s, h) => {
      ctx.clearRect(0, 0, s, h);
      ctx.font = 'bold 64px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const text = name.length > 14 ? name.slice(0, 13) + '…' : name;
      const textW = ctx.measureText(text).width;
      const padX = 36;
      const boxW = Math.min(s, textW + padX * 2);
      const boxX = (s - boxW) / 2;
      ctx.fillStyle = 'rgba(8,10,14,0.68)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(boxX, h * 0.18, boxW, h * 0.64, 16);
      else ctx.rect(boxX, h * 0.18, boxW, h * 0.64);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, s / 2, h / 2 + 1);
    });
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.4, 0.6, 1);
    sprite.renderOrder = 10;
    return sprite;
  }

  function limb(radiusTop, radiusBottom, length, material, segments) {
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, length, segments || 8), material);
    mesh.position.y = -length / 2;
    mesh.castShadow = true;
    pivot.add(mesh);
    const end = new THREE.Group();
    end.position.y = -length;
    pivot.add(end);
    return { pivot, end };
  }

  function createFootballer(team, number, name, isMe, targetScene = scene) {
    const teamHex = TEAM_COLOR[team];
    const jersey = jerseyTextures(teamHex, number);
    const jerseyMat = new THREE.MeshStandardMaterial({ map: jersey.front, roughness: 0.75 });
    const jerseyBackMat = new THREE.MeshStandardMaterial({ map: jersey.back, roughness: 0.75 });
    const jerseyPlainMat = new THREE.MeshStandardMaterial({ map: jersey.plain, roughness: 0.75 });
    const sleeveMat = new THREE.MeshStandardMaterial({ color: teamHex, roughness: 0.75 });
    const sockMat = new THREE.MeshStandardMaterial({ color: teamHex, roughness: 0.75 });

    // Keep world-space movement/yaw separate from the animated body pose.
    // This prevents the slide lean from mixing with the player's direction.
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);

    const hips = new THREE.Group();
    hips.position.y = 0.9;
    body.add(hips);

    function makeLeg(sideX) {
      const hip = new THREE.Group();
      hip.position.x = sideX;
      const thigh = limb(0.1, 0.09, 0.4, shortsMat);
      hip.add(thigh.pivot);
      const knee = thigh.end;
      const shin = limb(0.08, 0.06, 0.42, sockMat);
      knee.add(shin.pivot);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.24), bootMat);
      boot.position.set(0, -0.46, 0.05);
      boot.castShadow = true;
      shin.pivot.add(boot);
      hips.add(hip);
      return { hip, thigh: thigh.pivot, shin: shin.pivot };
    }
    const legL = makeLeg(-0.12);
    const legR = makeLeg(0.12);

    const shorts = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.3), shortsMat);
    shorts.position.y = 0.02;
    shorts.castShadow = true;
    hips.add(shorts);
    [-1, 1].forEach((s) => {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.24, 0.31), new THREE.MeshStandardMaterial({ color: teamHex }));
      stripe.position.set(s * 0.21, 0.02, 0);
      hips.add(stripe);
    });

    const torsoGeo = new THREE.BoxGeometry(0.46, 0.54, 0.28);
    const torso = new THREE.Mesh(torsoGeo, [sleeveMat, sleeveMat, jerseyPlainMat, jerseyPlainMat, jerseyMat, jerseyBackMat]);
    torso.position.y = 0.27 + 0.12;
    torso.castShadow = true;
    hips.add(torso);

    const shoulderY = 0.9 + 0.27 + 0.12 + 0.22;

    function makeArm(sideX) {
      const shoulder = new THREE.Group();
      shoulder.position.set(sideX, shoulderY, 0);
      const upper = limb(0.075, 0.065, 0.3, sleeveMat);
      shoulder.add(upper.pivot);
      const elbow = upper.end;
      const lower = limb(0.06, 0.05, 0.28, skinMat);
      elbow.add(lower.pivot);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), skinMat);
      hand.position.y = -0.28;
      lower.pivot.add(hand);
      body.add(shoulder);
      return { shoulder, upper: upper.pivot, lower: lower.pivot };
    }
    const armL = makeArm(-0.29);
    const armR = makeArm(0.29);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.08, 8), skinMat);
    neck.position.y = shoulderY + 0.06;
    body.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 14), skinMat);
    head.position.y = shoulderY + 0.06 + 0.16;
    head.castShadow = true;
    body.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    hair.position.copy(head.position);
    body.add(hair);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.56, 24),
      new THREE.MeshBasicMaterial({ color: teamHex, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    root.add(ring);

    // the wider camera makes it harder to tell who you are — a bright marker
    // under the controlled player's feet makes them easy to pick out at a glance
    let highlight = null;
    if (isMe) {
      highlight = new THREE.Mesh(
        new THREE.RingGeometry(0.62, 0.72, 28),
        new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
      );
      highlight.rotation.x = -Math.PI / 2;
      highlight.position.y = 0.025;
      root.add(highlight);
      const marker = new THREE.Mesh(
        new THREE.ConeGeometry(.18, .28, 3),
        new THREE.MeshBasicMaterial({ color: 0xffe066, depthTest: false })
      );
      marker.rotation.z = Math.PI;
      marker.position.y = head.position.y + .48;
      marker.renderOrder = 12;
      root.add(marker);
    }

    // name tag is added as a sibling (not scaled with the body) so its
    // on-screen size stays consistent regardless of PLAYER_VISUAL_SCALE —
    // its world position is updated manually each frame (see render loop)
    const tagOffsetY = (head.position.y + 0.34) * PLAYER_VISUAL_SCALE;
    const tag = nameSprite(name || 'Oyuncu');

    root.scale.setScalar(PLAYER_VISUAL_SCALE);
    targetScene.add(root);
    targetScene.add(tag);

    return {
      root, body, legL, legR, armL, armR, tag, tagOffsetY, highlight,
      gaitPhase: Math.random() * Math.PI * 2,
      kickTimer: 0,
    };
  }

  function animateFootballer(f, speed, kicking, sliding, dt) {
    const poseBlend = 1 - Math.exp(-dt * 18);

    if (sliding) {
      // Feet-first slide tackle: right leg reaches the ball while the left
      // leg opens to the side and folds underneath the body.
      f.legR.hip.rotation.z = THREE.MathUtils.lerp(f.legR.hip.rotation.z, 0.08, poseBlend);
      f.legR.thigh.rotation.x = THREE.MathUtils.lerp(f.legR.thigh.rotation.x, -0.08, poseBlend);
      f.legR.shin.rotation.x = THREE.MathUtils.lerp(f.legR.shin.rotation.x, 0.06, poseBlend);

      f.legL.hip.rotation.z = THREE.MathUtils.lerp(f.legL.hip.rotation.z, -0.5, poseBlend);
      f.legL.thigh.rotation.x = THREE.MathUtils.lerp(f.legL.thigh.rotation.x, 0.88, poseBlend);
      f.legL.shin.rotation.x = THREE.MathUtils.lerp(f.legL.shin.rotation.x, 1.55, poseBlend);

      f.armL.shoulder.rotation.z = THREE.MathUtils.lerp(f.armL.shoulder.rotation.z, -0.78, poseBlend);
      f.armR.shoulder.rotation.z = THREE.MathUtils.lerp(f.armR.shoulder.rotation.z, 0.62, poseBlend);
      f.armL.upper.rotation.x = THREE.MathUtils.lerp(f.armL.upper.rotation.x, -0.35, poseBlend);
      f.armR.upper.rotation.x = THREE.MathUtils.lerp(f.armR.upper.rotation.x, 0.3, poseBlend);
      f.armL.lower.rotation.x = THREE.MathUtils.lerp(f.armL.lower.rotation.x, 0.48, poseBlend);
      f.armR.lower.rotation.x = THREE.MathUtils.lerp(f.armR.lower.rotation.x, 0.7, poseBlend);
      f.body.rotation.z = THREE.MathUtils.lerp(f.body.rotation.z, -0.08, poseBlend);
      f.kickTimer = 0;
      return;
    }

    const moving = speed > 0.35;
    const swingMax = THREE.MathUtils.clamp(speed / 8, 0, 1) * 0.9;
    if (moving) f.gaitPhase += dt * (5.5 + speed * 0.6);
    const s = Math.sin(f.gaitPhase);
    const targetLegL = moving ? s * swingMax : 0;
    const targetLegR = moving ? -s * swingMax : 0;
    const kneeL = moving ? Math.max(0, -Math.sin(f.gaitPhase + 0.6)) * swingMax * 1.3 : 0;
    const kneeR = moving ? Math.max(0, -Math.sin(f.gaitPhase - Math.PI + 0.6)) * swingMax * 1.3 : 0;

    f.legL.thigh.rotation.x = THREE.MathUtils.lerp(f.legL.thigh.rotation.x, targetLegL, 0.35);
    f.legR.thigh.rotation.x = THREE.MathUtils.lerp(f.legR.thigh.rotation.x, targetLegR, 0.35);
    f.legL.shin.rotation.x = THREE.MathUtils.lerp(f.legL.shin.rotation.x, kneeL, 0.35);
    f.legR.shin.rotation.x = THREE.MathUtils.lerp(f.legR.shin.rotation.x, kneeR, 0.35);
    f.legL.hip.rotation.z = THREE.MathUtils.lerp(f.legL.hip.rotation.z, 0, poseBlend);
    f.legR.hip.rotation.z = THREE.MathUtils.lerp(f.legR.hip.rotation.z, 0, poseBlend);

    f.armL.upper.rotation.x = THREE.MathUtils.lerp(f.armL.upper.rotation.x, -targetLegL * 0.7, 0.35);
    f.armR.upper.rotation.x = THREE.MathUtils.lerp(f.armR.upper.rotation.x, -targetLegR * 0.7, 0.35);
    f.armL.lower.rotation.x = THREE.MathUtils.lerp(f.armL.lower.rotation.x, moving ? 0.3 : 0.15, 0.35);
    f.armR.lower.rotation.x = THREE.MathUtils.lerp(f.armR.lower.rotation.x, moving ? 0.3 : 0.15, 0.35);
    f.armL.shoulder.rotation.z = THREE.MathUtils.lerp(f.armL.shoulder.rotation.z, 0, poseBlend);
    f.armR.shoulder.rotation.z = THREE.MathUtils.lerp(f.armR.shoulder.rotation.z, 0, poseBlend);

    if (kicking && f.kickTimer <= 0) f.kickTimer = 0.38;
    if (f.kickTimer > 0) {
      f.kickTimer -= dt;
      const t = 1 - Math.max(f.kickTimer, 0) / 0.38;
      const kickAngle = Math.sin(t * Math.PI) * 1.5;
      f.legR.thigh.rotation.x = -kickAngle * 0.8;
      f.legR.shin.rotation.x = Math.max(0, kickAngle) * 0.9;
    }

    if (!moving) {
      f.body.rotation.z = Math.sin(performance.now() * 0.0015) * 0.03;
    } else {
      f.body.rotation.z = THREE.MathUtils.lerp(f.body.rotation.z, 0, 0.1);
    }
  }

  // ---------- Networking ----------
  let ws = null;
  let myId = null;
  let myTeam = null;
  let myPosition = 'OOS';
  let myReady = false;
  let mySlot = null;
  let lobbyView = null;
  let isHost = false;
  let phase = 'idle';
  let positionsData = null;
  let joined = false;
  let waitingInLobby = false;
  // Match clock is driven by the server's 'matchStart' timestamp (wall-clock,
  // Date.now()-based) rather than each client's own performance.now() at
  // whatever moment its first 'state' packet happens to arrive — see
  // handleMessage()'s 'matchStart' case and the render loop's clock line.
  let serverMatchStartedAt = 0;
  let countdownEndAt = 0;
  let countdownRafId = null;
  const entities = new Map();

  // States: 'connecting' | 'connected' | 'failed' | 'disconnected' | 'idle'
  function updateConnectionStatus(state, detail) {
    connStatus.classList.remove('error', 'success');
    switch (state) {
      case 'connecting':
        connStatus.textContent = 'Bağlanıyor…';
        break;
      case 'connected':
        connStatus.textContent = detail ? `Bağlandı — ${detail}` : 'Bağlandı';
        connStatus.classList.add('success');
        break;
      case 'failed':
        connStatus.textContent = 'Sunucuya bağlanılamadı. Adresi kontrol et.';
        connStatus.classList.add('error');
        break;
      case 'disconnected':
        connStatus.textContent = 'Bağlantı kesildi.';
        connStatus.classList.add('error');
        break;
      default:
        connStatus.textContent = '';
    }
  }

  let connecting = false;
  let joinInProgress = false;
  let pendingJoin = null;

  // Closes/cleans up any previous socket so repeated clicks on "Bağlan" (or a
  // reconnect after failure) never leave a stray open connection or let a
  // stale socket's callbacks fire after it's been replaced.
  function disposeSocket() {
    if (!ws) return;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
    ws = null;
    connecting = false;
    connectBtn.disabled = false;
  }

  function connectToServer() {
    if (connecting) return; // guards against duplicate connections from repeated clicks/Enter
    const name = nameInput.value.trim() || 'Oyuncu';

    // Single source of truth: #serverInput. If it's ever unexpectedly empty
    // (e.g. storage cleared, user deleted the text), self-heal by falling
    // back to the default and writing it back into the same input, rather
    // than blocking the user with a validation error.
    let serverUrl = serverInput.value.trim();
    if (!serverUrl) {
      serverUrl = DEFAULT_SERVER_URL;
      serverInput.value = serverUrl;
    }
    serverUrl = normalizeServerUrl(serverUrl);
    serverInput.value = serverUrl;

    console.log('[Office Futboll] Server input:', serverInput);
    console.log('[Office Futboll] Server input value:', serverInput?.value);
    console.log('[Office Futboll] Connecting to:', serverUrl);
    console.log('[JOIN] Connecting WebSocket:', serverUrl);

    disposeSocket();
    connecting = true;
    connectBtn.disabled = true;
    updateConnectionStatus('connecting');

    try {
      ws = new WebSocket(serverUrl);
    } catch (e) {
      connecting = false;
      connectBtn.disabled = false;
      updateConnectionStatus('failed');
      return;
    }

    ws.onopen = () => {
      console.log('[JOIN] WebSocket OPEN');
      connecting = false;
      connectBtn.disabled = false;
      updateConnectionStatus('connected', serverUrl);
      // only a *successful* connection is remembered as the preferred server
      try {
        localStorage.setItem(SERVER_STORAGE_KEY, serverUrl);
        localStorage.setItem('officeFootballPlayerName', name);
      } catch (e) {}

    };
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      handleMessage(msg);
    };
    ws.onclose = () => {
      phase = 'idle';
      waitingInLobby = false;
      hideCountdownOverlay();
      setMatchMenu(false);
      if (pendingJoin) pendingJoin.reject(new Error('Sunucuyla bağlantı kesildi.'));
      connecting = false;
      connectBtn.disabled = false;
      if (joined) {
        disconnectMsg.textContent = 'Sunucuyla bağlantı koptu.';
        updateConnectionStatus('disconnected');
        showOverlay(disconnectOverlay);
        hud.hidden = true; hint.hidden = true;
        clearEntities();
        joined = false; myId = null;
      } else {
        updateConnectionStatus('failed');
      }
    };
    ws.onerror = () => {};
  }

  function removeEntity(e) {
    scene.remove(e.footballer.root);
    scene.remove(e.footballer.tag);
  }

  function clearEntities() {
    for (const e of entities.values()) removeEntity(e);
    entities.clear();
  }

  function ensureEntity(id, team, name) {
    let e = entities.get(id);
    if (!e) {
      const number = (hashCode(id) % 23) + 1;
      e = {
        footballer: createFootballer(team, number, name, id === myId),
        netPos: new THREE.Vector3(0, 0, 0),
        netVel: new THREE.Vector2(0, 0),
        renderPos: new THREE.Vector3(0, 0, 0),
        team,
      };
      entities.set(id, e);
    }
    return e;
  }
  function hashCode(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return h;
  }

  function handleMessage(msg) {
    if (msg.type === 'lobby') {
      if (msg.positions) positionsData = msg.positions;
      phase = msg.phase;
      isHost = msg.hostId === myId;
      if (!joined) return;
      const self = msg.players.find((p) => p.id === myId);
      if (phase === 'playing' && self && !self.inMatch) waitingInLobby = true;
      if (pendingJoin && msg.players.some((p) => p.id === myId)) {
        console.log('[JOIN] Lobby accepted');
        pendingJoin.resolve();
        pendingJoin = null;
      }
      renderLobby(msg);
      if (phase === 'lobby' || phase === 'countdown') waitingInLobby = false;
      if (phase === 'lobby' || phase === 'countdown' || waitingInLobby) {
        if (lobbyOverlay.hidden) console.log('[JOIN] Switching UI to lobby');
        showOverlay(lobbyOverlay);
        hud.hidden = true; hint.hidden = true;
        clearEntities();
        ballNet.serverPos.set(0, BALL_R, 0);
        ballNet.serverVel.set(0, 0, 0);
        if (phase === 'lobby') hideCountdownOverlay();
      }
    } else if (msg.type === 'slot_error') {
      slotStatus.textContent = msg.message;
    } else if (msg.type === 'welcome') {
      myId = msg.id;
      isHost = msg.isHost;
      joined = true;
      positionsData = msg.positions;
    } else if (msg.type === 'lobby_returned') {
      waitingInLobby = true;
      clearGameInput();
      showOverlay(lobbyOverlay);
      hud.hidden = true; hint.hidden = true;
      clearEntities();
      hideCountdownOverlay();
      $('pitchSlots').querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
    } else if (msg.type === 'countdownStart') {
      showCountdownOverlay(msg.startAt, msg.duration);
    } else if (msg.type === 'countdownCancelled') {
      hideCountdownOverlay();
    } else if (msg.type === 'matchStart') {
      waitingInLobby = false;
      clearGameInput();
      // Server-authoritative transition: every client switches to the pitch
      // because the server said so, not because each one independently
      // decided its first 'state' packet had arrived.
      serverMatchStartedAt = msg.startedAt;
      hideCountdownOverlay();
      phase = 'playing';
      showOverlay(null);
      hud.hidden = false; hint.hidden = false;
      renderer.domElement.focus({ preventScroll: true });
    } else if (msg.type === 'state') {
      if (waitingInLobby || !joined) return;
      if (typeof msg.startedAt === 'number' && msg.startedAt > 0) serverMatchStartedAt = msg.startedAt;
      if (phase !== 'playing') {
        // fallback for a client that connects mid-match and so never saw the
        // one-shot 'matchStart' (e.g. reconnect, or a late joiner who ends up
        // spectating since they can't be placed into an already-running match)
        phase = 'playing';
        showOverlay(null);
        hud.hidden = false; hint.hidden = false;
        renderer.domElement.focus({ preventScroll: true });
      }
      applyState(msg);
    } else if (msg.type === 'match_end') {
      phase = 'ended';
      if (waitingInLobby) return;
      const won = msg.winner === myTeam;
      const draw = msg.score.blue === msg.score.red;
      endResultEl.textContent = draw ? 'BERABERE' : (won ? 'TAKIMIN KAZANDI! 🏆' : 'TAKIMIN KAYBETTİ 😅');
      endResultEl.className = 'result ' + (draw ? 'draw' : (won ? 'win' : 'lose'));
      endScoreEl.textContent = `${msg.score.blue} - ${msg.score.red}`;
      showOverlay(endOverlay);
      hud.hidden = true; hint.hidden = true;
    }
  }

  function renderLobby(msg) {
    scoreBlueEl.textContent = msg.score.blue;
    scoreRedEl.textContent = msg.score.red;
    const players = msg.players.filter((p) => !p.isAI);
    const me = players.find((p) => p.id === myId);
    if (me) {
      myTeam = me.team;
      myPosition = me.position;
      mySlot = me.slot;
      myReady = !!me.ready;
      $('profileName').textContent = me.name;
      $('profileAvatar').textContent = Array.from(me.name)[0].toLocaleUpperCase('tr');
      $('profileRole').textContent = Number.isInteger(mySlot)
        ? `${myTeam === 'blue' ? 'Mavi tak?m' : 'K?rm?z? tak?m'}${me.isHost ? ' ? Lobi y?neticisi' : ''}`
        : 'Sahada bir yer se?';
    }
    const inCountdown = msg.phase === 'countdown';
    const matchInProgress = msg.phase === 'playing' || msg.phase === 'ended';
    const readyCount = players.filter((p) => p.ready).length;
    const selected = Number.isInteger(mySlot);
    $('lobbyPlayerCount').textContent = `${players.length} oyuncu`;
    for (const team of ['blue', 'red']) {
      $(team + 'RosterCount').textContent = `${players.filter((p) => p.team === team && Number.isInteger(p.slot)).length} / 5`;
    }
    if (!lobbyView) {
      lobbyView = new OfficeLobby({
        container: $('lobbyPitch'), slotsElement: $('pitchSlots'), field: FIELD,
        grassMaterial: grassMat, drawMarkings: createPitchMarkings,
        createFootballer: (team, number, target) => createFootballer(team, number, '', false, target),
        onSelect: (team, slot) => {
          if (ws?.readyState !== WebSocket.OPEN) return;
          slotStatus.textContent = '';
          ws.send(JSON.stringify({ type: 'select_slot', team, slot }));
        },
      });
    }
    lobbyView.update(players, myId, inCountdown || !!me?.inMatch);
    slotStatus.textContent = '';
    readyBtn.disabled = !selected || inCountdown || matchInProgress;
    readyBtn.textContent = matchInProgress ? 'MA? BEKLEN?YOR' : myReady ? '? HAZIR ? ?PTAL ET' : 'HAZIRIM';
    readyBtn.classList.toggle('isReady', myReady);
    $('readyMeterFill').style.width = `${players.length ? readyCount / players.length * 100 : 0}%`;
    if (matchInProgress) {
      lobbyStatus.textContent = 'Devam eden ma? bitince yeni ma?a kat?labilirsin.';
    } else if (inCountdown) {
      lobbyStatus.textContent = 'Herkes haz?r! Ma? ba?l?yor?';
    } else {
      lobbyStatus.textContent = selected ? 'Yerini ald?n. Haz?rsan sahaya ??kal?m.' : 'Tak?m?na kat?lmak i?in sahada bo? bir yere t?kla.';
    }
    readyProgress.textContent = `${readyCount} / ${players.length} oyuncu haz?r`;
  }

  function applyState(msg) {
    scoreBlueEl.textContent = msg.score.blue;
    scoreRedEl.textContent = msg.score.red;
    if (!matchMenu.hidden) $('menuScore').textContent = `${msg.score.blue} : ${msg.score.red}`;
    myFlagBlue.hidden = myTeam !== 'blue';
    myFlagRed.hidden = myTeam !== 'red';
    if (positionsData && positionsData[myPosition]) {
      posLabelEl.textContent = `Mevkin: ${myPosition} — ${positionsData[myPosition].label}`;
    }

    const seen = new Set();
    for (const p of msg.players) {
      seen.add(p.id);
      const e = ensureEntity(p.id, p.team, p.name);
      e.netPos.set(p.x, 0, p.z);
      e.netVel.set(p.vx, p.vz);
      e.kicking = p.action === 'shot' || p.action === 'pass' || p.action === 'cross';
      e.sliding = !!p.sliding;
      e.hasBall = !!p.hasBall;
      e.facingX = p.facingX;
      e.facingZ = p.facingZ;
    }
    for (const [id, e] of entities) {
      if (!seen.has(id)) { removeEntity(e); entities.delete(id); }
    }

    ballNet.serverPos.set(msg.ball.x, msg.ball.y, msg.ball.z);
    ballNet.serverVel.set(msg.ball.vx, msg.ball.vy, msg.ball.vz);
    ballNet.lastUpdate = performance.now();
  }

  connectBtn.addEventListener('click', joinLobby);
  [serverInput, nameInput].forEach((el) => el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinLobby();
  }));

  function ensureWebSocketConnected() {
    if (ws?.readyState === WebSocket.OPEN) return Promise.resolve();
    if (!ws || ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) connectToServer();
    const socket = ws;
    if (!socket) return Promise.reject(new Error('Sunucuya bağlanılamadı.'));
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        socket.removeEventListener('open', onOpen);
        socket.removeEventListener('error', onFailure);
        socket.removeEventListener('close', onFailure);
      };
      const onOpen = () => { cleanup(); resolve(); };
      const onFailure = () => { cleanup(); reject(new Error('Sunucuya bağlanılamadı.')); };
      const timeout = setTimeout(() => { cleanup(); reject(new Error('Bağlantı zaman aşımına uğradı.')); }, 10000);
      socket.addEventListener('open', onOpen);
      socket.addEventListener('error', onFailure);
      socket.addEventListener('close', onFailure);
      if (socket.readyState === WebSocket.OPEN) onOpen();
    });
  }

  async function joinLobby() {
    if (joinInProgress || joined) return;
    console.log('[JOIN] Join button clicked');
    const name = nameInput.value.trim();
    const serverUrl = normalizeServerUrl(serverInput.value);
    console.log('[JOIN] Invite state:', autoJoinRequested);
    console.log('[JOIN] Lobby:', 'existing server lobby');
    console.log('[JOIN] Server:', serverUrl);
    console.log('[JOIN] Player:', name);
    if (!name) {
      const error = 'Katılmadan önce adını yaz.';
      connStatus.textContent = error;
      return;
    }
    joinInProgress = true;
    connectBtn.disabled = true;
    connectBtn.textContent = 'Kat?l?yor?';
    if (autoJoinRequested) updateConnectionStatus('connecting');
    try {
      await ensureWebSocketConnected();
      if (ws.readyState !== WebSocket.OPEN) throw new Error('Sunucuya bağlanılamadı.');
      myTeam = null;
      mySlot = null;
      const accepted = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Lobiye katılım zaman aşımına uğradı.')), 10000);
        pendingJoin = {
          resolve: () => { clearTimeout(timeout); resolve(); },
          reject: (error) => { clearTimeout(timeout); reject(error); },
        };
      });
      console.log('[JOIN] Sending join request');
      ws.send(JSON.stringify({ type: 'join', name }));
      await accepted;
    } catch (error) {
      if (pendingJoin) pendingJoin = null;
      joined = false;
      myId = null;
      disposeSocket();
      const status = connStatus;
      status.textContent = error.message || 'Lobiye katılım başarısız oldu.';
      status.classList.add('error');
      showOverlay(connectOverlay);
      autoJoinRequested = false;
    } finally {
      joinInProgress = false;
      joinBtn.disabled = false;
      joinBtn.textContent = 'Lobiye Katıl';
    }
  }

  if (autoJoinRequested) joinLobby();

  readyBtn.addEventListener('click', () => {
    if (readyBtn.disabled) return; // countdown already running
    ws.send(JSON.stringify({ type: 'ready', ready: !myReady }));
  });

  // ---------- Synchronized countdown overlay ----------
  // Driven entirely by the server's countdownStart{startAt, duration} — a
  // rAF loop just re-renders "time left" from that fixed timestamp each
  // frame, so it can't drift into its own independent countdown.
  function showCountdownOverlay(startAt, duration) {
    countdownEndAt = startAt + duration;
    countdownOverlay.hidden = false;
    if (countdownRafId) cancelAnimationFrame(countdownRafId);
    const tick = () => {
      const remainingMs = countdownEndAt - Date.now();
      if (remainingMs <= 0) {
        countdownNumber.textContent = 'MAÇ BAŞLIYOR!';
        countdownNumber.classList.add('go');
        countdownSub.textContent = '';
        countdownRafId = null;
        return; // matchStart (or the next 'state') will hide the overlay
      }
      const secondsLeft = Math.ceil(remainingMs / 1000);
      countdownNumber.textContent = String(secondsLeft);
      countdownNumber.classList.remove('go');
      countdownSub.textContent = 'MAÇ BAŞLIYOR';
      countdownRafId = requestAnimationFrame(tick);
    };
    tick();
  }

  function hideCountdownOverlay() {
    if (countdownRafId) { cancelAnimationFrame(countdownRafId); countdownRafId = null; }
    countdownOverlay.hidden = true;
    countdownNumber.classList.remove('go');
  }

  // ---------- Copy invite link ----------
  // No email/server round-trip needed: the link is built entirely client-side
  // from whatever server address this lobby is already using, and points at
  // server.js's GET /join landing page, which opens the same game client.
  function buildInviteLink() {
    const serverUrl = normalizeServerUrl(serverInput.value);
    const base = deriveHttpBaseUrl(serverUrl);
    const from = nameInput.value.trim() || 'Bir oyuncu';
    return `${base}/join?server=${encodeURIComponent(serverUrl)}&from=${encodeURIComponent(from)}`;
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fallback for contexts where the async Clipboard API is unavailable
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch {
        return false;
      }
    }
  }

  let inviteStatusTimer = null;
  function setInviteLinkStatus(state, message) {
    clearTimeout(inviteStatusTimer);
    inviteLinkStatus.classList.remove('success', 'error');
    if (state === 'success') {
      inviteLinkStatus.textContent = message;
      inviteLinkStatus.classList.add('success');
    } else if (state === 'error') {
      inviteLinkStatus.textContent = message;
      inviteLinkStatus.classList.add('error');
    } else {
      inviteLinkStatus.textContent = '';
      return;
    }
    inviteStatusTimer = setTimeout(() => setInviteLinkStatus('idle'), 3000);
  }

  copyInviteLinkBtn.addEventListener('click', async () => {
    copyInviteLinkBtn.disabled = true; // guards against rapid repeated clicks
    const link = buildInviteLink();
    const ok = await copyToClipboard(link);
    setInviteLinkStatus(ok ? 'success' : 'error', ok ? '✓ Bağlantı kopyalandı!' : 'Bağlantı kopyalanamadı.');
    copyInviteLinkBtn.disabled = false;
  });

  reconnectBtn.addEventListener('click', () => {
    showOverlay(connectOverlay);
    updateConnectionStatus('idle');
  });

  // ---------- Input ----------
  const keys = Object.create(null);
  const gameKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);
  function clearGameInput() {
    for (const code of gameKeys) keys[code] = false;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', x: 0, z: 0, sprint: false }));
    }
  }
  function setMatchMenu(open) {
    if (open && (phase !== 'playing' || waitingInLobby || !joined)) return;
    const wasOpen = !matchMenu.hidden;
    matchMenu.hidden = !open;
    hud.inert = open;
    renderer.domElement.inert = open;
    if (open || wasOpen) clearGameInput();
    if (open) {
      $('menuScore').textContent = `${scoreBlueEl.textContent} : ${scoreRedEl.textContent}`;
      resumeBtn.focus({ preventScroll: true });
    } else if (wasOpen) {
      renderer.domElement.focus({ preventScroll: true });
    }
  }
  $('menuBtn').addEventListener('click', () => setMatchMenu(true));
  resumeBtn.addEventListener('click', () => setMatchMenu(false));
  leaveMatchBtn.addEventListener('click', () => {
    if (ws?.readyState !== WebSocket.OPEN) return;
    clearGameInput();
    ws.send(JSON.stringify({ type: 'leave_match' }));
  });
  function isTypingTarget(target) {
    return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
  }
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && phase === 'playing' && !waitingInLobby && joined) {
      e.preventDefault();
      if (!e.repeat) setMatchMenu(matchMenu.hidden);
      return;
    }
    if (!matchMenu.hidden && e.code === 'Tab') {
      e.preventDefault();
      (document.activeElement === resumeBtn ? leaveMatchBtn : resumeBtn).focus();
      return;
    }
    if (phase !== 'playing' || waitingInLobby || !matchMenu.hidden || !joined || isTypingTarget(e.target) || !gameKeys.has(e.code)) return;
    e.preventDefault();
    if (!keys[e.code] && ['KeyA', 'KeyS', 'KeyD'].includes(e.code) && ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'action', key: e.code.slice(-1) }));
    }
    keys[e.code] = true;
  });
  window.addEventListener('keyup', (e) => { if (gameKeys.has(e.code)) keys[e.code] = false; });
  window.addEventListener('blur', clearGameInput);

  let lastInputSend = 0;
  function sendInput(now) {
    if (waitingInLobby || !matchMenu.hidden || !joined) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (now - lastInputSend < 50) return;
    lastInputSend = now;
    let ix = 0, iz = 0;
    // Camera-relative controls for the fixed +X sideline broadcast camera:
    // screen up/down maps to world -X/+X, screen left/right to +Z/-Z.
    if (keys['ArrowUp']) ix -= 1;
    if (keys['ArrowDown']) ix += 1;
    if (keys['ArrowLeft']) iz += 1;
    if (keys['ArrowRight']) iz -= 1;
    const length = Math.hypot(ix, iz) || 1;
    ws.send(JSON.stringify({ type: 'input', x: ix / length, z: iz / length, sprint: !!keys['KeyW'] }));
  }

  // ---------- Render loop ----------
  const clock = new THREE.Clock();
  const _predicted = new THREE.Vector3();
  const _camLook = new THREE.Vector3(0, 0.3, 0);

  function formatClock(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  // Follow the rendered ball on the same frame. The camera translates with
  // the ball along the touchline and pans/tilts directly to its full XYZ
  // position, so the ball remains the center of the broadcast composition.
  function updateBroadcastCamera() {
    camera.position.set(CAMERA_SIDE_DISTANCE, CAMERA_HEIGHT, ball.position.z);
    _camLook.set(ball.position.x, ball.position.y, ball.position.z);
    camera.lookAt(_camLook);
  }

  function render() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const now = performance.now();

    if (phase === 'playing' && !waitingInLobby) {
      sendInput(now);
      // wall-clock (Date.now()), not performance.now() — comparable against
      // the server's Date.now()-based serverMatchStartedAt so every client's
      // clock reads the same elapsed time regardless of when its own render
      // loop happened to start
      if (serverMatchStartedAt > 0) {
        matchClockEl.textContent = formatClock(Date.now() - serverMatchStartedAt);
      }

      const elapsed = (now - ballNet.lastUpdate) / 1000;
      _predicted.set(
        ballNet.serverPos.x + ballNet.serverVel.x * elapsed,
        Math.max(BALL_R, ballNet.serverPos.y + ballNet.serverVel.y * elapsed),
        ballNet.serverPos.z + ballNet.serverVel.z * elapsed
      );
      ball.position.lerp(_predicted, Math.min(1, dt * 14));
      const ballSpeed = ballNet.serverVel.length();
      if (ballSpeed > 0.05) {
        const axis = new THREE.Vector3(-ballNet.serverVel.z, 0, ballNet.serverVel.x).normalize();
        ball.rotateOnWorldAxis(axis, (ballSpeed * dt) / BALL_R);
      }

      for (const [id, e] of entities) {
        e.renderPos.lerp(e.netPos, Math.min(1, dt * 14));
        e.footballer.root.position.set(e.renderPos.x, 0, e.renderPos.z);
        e.footballer.body.position.y = THREE.MathUtils.damp(e.footballer.body.position.y, e.sliding ? .18 : 0, 12, dt);
        e.footballer.tag.position.set(e.renderPos.x, e.footballer.tagOffsetY, e.renderPos.z);
        const spd = e.netVel.length();
        if (Number.isFinite(e.facingX) && Number.isFinite(e.facingZ)) {
          const targetAngle = Math.atan2(e.facingX, e.facingZ);
          let cur = e.footballer.root.rotation.y;
          let diff = Math.atan2(Math.sin(targetAngle - cur), Math.cos(targetAngle - cur));
          e.footballer.root.rotation.y = cur + diff * (1 - Math.exp(-dt * PLAYER_ROTATION_SPEED));
        }
        e.footballer.body.rotation.x = THREE.MathUtils.damp(e.footballer.body.rotation.x, e.sliding ? -1.38 : 0, 15, dt);
        animateFootballer(e.footballer, spd, e.kicking, e.sliding, dt);
        if (e.sliding) emitSlideGrass(e, dt);
        else e.slideGrassAccumulator = 0;
      }
    }

    updateSlideGrass(dt);

    if (!lobbyOverlay.hidden && lobbyView) {
      lobbyView.render(now);
    } else {
      updateBroadcastCamera();
      renderer.render(scene, camera);
    }
    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
})();
