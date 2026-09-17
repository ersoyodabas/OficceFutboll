import { THREE } from '../engine/three.js';
import { makeCanvasTexture } from '../engine/assetLoader.js';
import { JOINTS, samplePose, poseDuration, nextPose } from './lobbyPoses.js';
import { shirtNumberFor } from '../gameplay/playerNumber.js';

// The OFFICE FUTBOLL pre-match stage: both line-ups standing in a dark arena,
// drawn with the game's own renderer into its own scene and camera. It only
// presents the authoritative lobby state it is given; it never decides anything.

const SPACING = 1.02;          // m between neighbouring players in a line
const TEAM_GAP = 2.3;          // m of open floor between the two lines
const FIGURE_HEIGHT = 2.2;     // m, head top of a footballer at visual scale
const TIER_HEIGHT = 2.75;      // m, height of the upper row in the stacked (portrait) layout
const ENTER_MS = 480, EXIT_MS = 300, MOVE_MS = 420;
const easeOut = (t) => 1 - (1 - t) ** 3;

export function createLobbyStage({ renderer, createFootballer, slotCount, random = Math.random }) {
  const { damp, clamp, lerp } = THREE.MathUtils;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05080e);
  scene.fog = new THREE.FogExp2(0x05080e, .04);
  const camera = new THREE.PerspectiveCamera(30, 1, .1, 140);
  const disposables = [];      // geometries, materials and textures this stage owns
  const keep = (thing) => { disposables.push(thing); return thing; };

  // ---------- environment ----------
  const glowTexture = keep(makeCanvasTexture(128, 128, (ctx, size) => {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
    gradient.addColorStop(.45, 'rgba(255,255,255,0.28)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }));
  const floor = new THREE.Mesh(
    keep(new THREE.CircleGeometry(30, 64)),
    keep(new THREE.MeshStandardMaterial({ color: 0x070c13, roughness: .46, metalness: .38 })),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Backdrop: night arena haze, floodlight glows and a band of crowd silhouettes.
  const backdropTexture = keep(makeCanvasTexture(2048, 512, (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#03050a');         // roof shadow
    sky.addColorStop(.42, '#070d16');
    sky.addColorStop(.74, '#0a1320');
    sky.addColorStop(1, '#04070d');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {           // floodlight haze along the roof line
      const x = (i + .5) * w / 9, y = h * .3, r = h * .5;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
      glow.addColorStop(0, 'rgba(126,164,214,0.14)');
      glow.addColorStop(1, 'rgba(126,164,214,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // Crowd: small, dim, tightly packed silhouettes in tiers behind thin rails.
    for (let tier = 0; tier < 7; tier++) {
      const top = h * (.28 + tier * .102), depth = tier / 6;
      ctx.fillStyle = `rgba(7,12,20,${.55 + depth * .3})`;
      ctx.fillRect(0, top, w, h * .102);
      for (let i = 0; i < 520; i++) {
        const x = Math.random() * w, y = top + Math.random() * h * .088;
        const size = 2.4 + Math.random() * 2.2;
        const shade = 24 + Math.random() * 24 + depth * 12;
        ctx.fillStyle = `rgba(${shade | 0}, ${shade + 6 | 0}, ${shade + 16 | 0}, .78)`;
        ctx.beginPath();
        ctx.arc(x, y, size * .45, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x - size * .45, y, size * .9, size);
      }
      ctx.fillStyle = 'rgba(120,160,210,0.05)';
      ctx.fillRect(0, top + h * .094, w, 1.5);
    }
  }));
  const backdrop = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(19, 19, 22, 48, 1, true)),
    keep(new THREE.MeshBasicMaterial({ map: backdropTexture, side: THREE.BackSide, fog: true })),
  );
  backdrop.position.y = 4.6;
  scene.add(backdrop);

  // Soft pool of light on the floor under each line-up, tinted per team.
  const teamGlow = {};
  for (const team of ['blue', 'red']) {
    const glow = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(14, 9)),
      keep(new THREE.MeshBasicMaterial({ map: glowTexture, transparent: true, opacity: .3, depthWrite: false, blending: THREE.AdditiveBlending, color: 0x4a86c8 })),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = .02;
    scene.add(glow);
    teamGlow[team] = glow;
  }
  // Halfway marker between the teams.
  const centreBeam = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(.5, 7)),
    keep(new THREE.MeshBasicMaterial({ map: glowTexture, transparent: true, opacity: .5, depthWrite: false, blending: THREE.AdditiveBlending, color: 0x7be0b6 })),
  );
  centreBeam.rotation.x = -Math.PI / 2;
  centreBeam.position.y = .03;
  scene.add(centreBeam);

  // Slow dust drifting through the spotlights.
  const dustCount = 160;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustSpeed = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    dustPositions[i * 3] = (random() - .5) * 20;
    dustPositions[i * 3 + 1] = random() * 5;
    dustPositions[i * 3 + 2] = (random() - .5) * 10 - 1;
    dustSpeed[i] = .05 + random() * .12;
  }
  const dustGeometry = keep(new THREE.BufferGeometry());
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeometry, keep(new THREE.PointsMaterial({
    map: glowTexture, size: .07, transparent: true, opacity: .35, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xbcd8ff,
  })));
  scene.add(dust);

  // ---------- lighting: one shadow caster plus cheap accents ----------
  scene.add(new THREE.HemisphereLight(0x6f8bb0, 0x05070b, .55));
  const keyLight = new THREE.DirectionalLight(0xfff1dc, 1.45);
  keyLight.position.set(2.5, 7, 8.5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  Object.assign(keyLight.shadow.camera, { left: -11, right: 11, top: 6, bottom: -2, near: 1, far: 26 });
  keyLight.shadow.bias = -.0012;
  scene.add(keyLight, keyLight.target);
  const fillLight = new THREE.DirectionalLight(0x9fc6ff, .38);
  fillLight.position.set(-6, 3.5, 7);
  scene.add(fillLight);
  const rimLight = new THREE.DirectionalLight(0xdfe9ff, .5);
  rimLight.position.set(0, 4, -8);
  scene.add(rimLight);
  // One tinted spotlight per team, from behind and above its line.
  const teamLight = {};
  for (const team of ['blue', 'red']) {
    const spot = new THREE.SpotLight(0x4a86c8, 26, 24, .62, .8, 1.4);
    spot.position.set(0, 6.2, -5.5);
    scene.add(spot, spot.target);
    teamLight[team] = spot;
  }

  // ---------- slot pedestals ----------
  const pedestalGeometry = keep(new THREE.CylinderGeometry(.42, .47, .06, 36));
  const ringGeometry = keep(new THREE.RingGeometry(.44, .53, 44));
  const beamGeometry = keep(new THREE.CylinderGeometry(.4, .52, 2.4, 20, 1, true));
  const pedestalMaterial = keep(new THREE.MeshStandardMaterial({ color: 0x131c27, roughness: .5, metalness: .6 }));
  const gloveMaterial = keep(new THREE.MeshStandardMaterial({ color: 0xe8eef5, roughness: .55 }));
  const slots = [];            // one per team slot, in screen order
  for (const team of ['blue', 'red']) {
    for (let index = 0; index < slotCount; index++) {
      const group = new THREE.Group();
      const base = new THREE.Mesh(pedestalGeometry, pedestalMaterial);
      base.position.y = .035;
      base.receiveShadow = true;
      const ringMaterial = keep(new THREE.MeshBasicMaterial({ color: 0x3d5e7d, transparent: true, opacity: .3, side: THREE.DoubleSide, depthWrite: false }));
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = .075;
      const glowMaterial = keep(new THREE.MeshBasicMaterial({ map: glowTexture, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: 0x8fd8ff }));
      const glow = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.3, 2.3)), glowMaterial);
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = .04;
      const beamMaterial = keep(new THREE.MeshBasicMaterial({ map: glowTexture, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: 0x8fd8ff, side: THREE.DoubleSide }));
      const beam = new THREE.Mesh(beamGeometry, beamMaterial);
      beam.position.y = 1.3;
      group.add(base, ring, glow, beam);
      scene.add(group);
      slots.push({
        key: `${team}:${index}`, team, index, group, ringMaterial, glowMaterial, beamMaterial,
        position: new THREE.Vector3(), rotationY: 0, occupied: false, ready: false, isMe: false, accent: new THREE.Color(0x3d5e7d),
      });
    }
  }
  const slotByKey = new Map(slots.map((slot) => [slot.key, slot]));

  // ---------- state ----------
  const figures = new Map();   // player id -> figure standing on the stage
  const teamState = {
    blue: { accent: new THREE.Color(0x58baff), kit: null, gkKit: null },
    red: { accent: new THREE.Color(0xff7d8f), kit: null, gkKit: null },
  };
  let mode = 'wide', hovered = null, countdown = false, viewport = { width: 0, height: 0 };
  let layoutRequest = null, anchorsCallback = null;
  const projection = new THREE.Vector3();

  function positionSlots() {
    for (const slot of slots) {
      const side = slot.team === 'blue' ? -1 : 1;
      if (mode === 'wide') {
        // Goalkeeper on the outside, striker nearest the halfway line.
        const fromCentre = TEAM_GAP / 2 + (slotCount - 1 - slot.index) * SPACING;
        slot.position.set(side * fromCentre, 0, -(slotCount - 1 - slot.index) * .22);
        slot.rotationY = side * -.34;
      } else {
        // Portrait: the home line stands on a raised tier above the away line.
        const step = (slot.index - (slotCount - 1) / 2) * SPACING * 1.05;
        slot.position.set(side * -step, slot.team === 'blue' ? TIER_HEIGHT : 0, slot.team === 'blue' ? -1.4 : .4);
        slot.rotationY = side * -.12;
      }
      slot.group.position.copy(slot.position);
    }
    const inner = TEAM_GAP / 2 + (slotCount - 1) * SPACING / 2;
    for (const team of ['blue', 'red']) {
      const side = team === 'blue' ? -1 : 1;
      const glow = teamGlow[team], light = teamLight[team];
      if (mode === 'wide') {
        glow.position.set(side * inner, .02, -.5);
        light.position.set(side * 6.5, 6.4, -5.2);
        light.target.position.set(side * inner, 1.1, 0);
      } else {
        const y = team === 'blue' ? TIER_HEIGHT : 0;
        glow.position.set(0, y + .02, team === 'blue' ? -1.4 : .4);
        light.position.set(side * 5, y + 5, -4.5);
        light.target.position.set(0, y + 1.1, 0);
      }
      light.target.updateMatrixWorld();
    }
    keyLight.target.position.set(0, 1, 0);
    keyLight.target.updateMatrixWorld();
    centreBeam.visible = mode === 'wide';
  }
  positionSlots();

  // ---------- figures ----------
  function figureJoints(footballer) {
    return JOINTS.map((joint) => {
      const object = joint.path.reduce((node, name) => node?.[name], footballer);
      return object ? { key: joint.key, holder: object[joint.prop], axis: joint.axis, rate: joint.rate } : null;
    }).filter(Boolean);
  }
  function setFigureOpacity(figure, alpha) {
    if (figure.alpha === alpha) return;
    figure.alpha = alpha;
    const transparent = alpha < .999;
    for (const material of figure.footballer.materials) {
      if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true; }
      material.opacity = alpha;
    }
  }
  function createFigure(id, player, slot) {
    const footballer = createFootballer(slot.team, shirtNumberFor(id), player.name || '', false, scene, { ownMaterials: true });
    footballer.tag.visible = false;            // names live in the HTML cards
    footballer.root.position.copy(slot.position);
    footballer.root.rotation.y = slot.rotationY;
    const figure = {
      id, footballer, joints: figureJoints(footballer), slotKey: slot.key,
      from: slot.position.clone(), to: slot.position.clone(), moveStart: -Infinity,
      state: 'entering', stateStart: performance.now(), alpha: 1,
      seed: random() * Math.PI * 2, pose: 'relaxed', poseTime: random() * 4, poseLeft: 2 + random() * 3,
      ready: false, kitKey: null, goalkeeper: false, skinMaterial: footballer.hands[0]?.material || null,
    };
    setFigureOpacity(figure, 0);
    figures.set(id, figure);
    return figure;
  }
  function disposeFigure(figure) {
    figure.footballer.dispose();
    figures.delete(figure.id);
  }
  function applyKit(figure, slot) {
    const team = teamState[slot.team];
    const goalkeeper = figure.goalkeeper;
    const kit = (goalkeeper && team.gkKit) || team.kit;   // keepers fall back to the outfield kit
    if (!kit) return;
    const wearingGloves = goalkeeper && !!team.gkKit;
    const kitKey = `${slot.team}:${kit.id}:${wearingGloves}`;
    if (figure.kitKey === kitKey) return;
    figure.kitKey = kitKey;
    figure.footballer.applyKit(kit);
    for (const hand of figure.footballer.hands) hand.material = wearingGloves ? gloveMaterial : figure.skinMaterial;
  }

  // ---------- public updates ----------
  // teams: { blue: { kit, gkKit, accent }, red: {...} }
  function setTeams(teams) {
    for (const team of ['blue', 'red']) {
      const incoming = teams?.[team];
      if (!incoming) continue;
      teamState[team].kit = incoming.kit || teamState[team].kit;
      teamState[team].gkKit = incoming.gkKit || teamState[team].gkKit;
      if (incoming.accent) teamState[team].accent.set(incoming.accent);
      teamGlow[team].material.color.copy(teamState[team].accent);
      teamLight[team].color.copy(teamState[team].accent);
      for (const slot of slots) if (slot.team === team) slot.accent.copy(teamState[team].accent);
    }
    for (const [, figure] of figures) {
      const slot = slotByKey.get(figure.slotKey);
      if (slot) { figure.kitKey = null; applyKit(figure, slot); }
    }
  }
  // lineup: [{ key, team, index, position, player: { id, name, ready, inMatch, isMe } | null }]
  function setLineup(lineup) {
    const now = performance.now();
    const seen = new Set();
    for (const entry of lineup) {
      const slot = slotByKey.get(entry.key);
      if (!slot) continue;
      slot.occupied = !!entry.player;
      slot.ready = !!entry.player?.ready;
      slot.isMe = !!entry.player?.isMe;
      if (!entry.player) continue;
      seen.add(entry.player.id);
      let figure = figures.get(entry.player.id);
      if (!figure) figure = createFigure(entry.player.id, entry.player, slot);
      figure.goalkeeper = entry.position === 'KL';
      applyKit(figure, slot);
      if (figure.slotKey !== slot.key) {          // moved to another slot or team
        figure.from.copy(figure.footballer.root.position);
        figure.to.copy(slot.position);
        figure.moveStart = now;
        figure.slotKey = slot.key;
      }
      if (figure.state === 'leaving') { figure.state = 'entering'; figure.stateStart = now; }
      const ready = !!entry.player.ready && !entry.player.inMatch;
      if (ready !== figure.ready) {
        figure.ready = ready;
        figure.pose = ready ? 'fistPump' : 'relaxed';
        figure.poseTime = 0;
        figure.poseLeft = poseDuration(figure.pose, random);
      }
    }
    for (const [id, figure] of figures) {
      if (seen.has(id) || figure.state === 'leaving') continue;
      figure.state = 'leaving';
      figure.stateStart = now;
    }
    requestLayout();
  }
  function setHover(key) { hovered = key; }
  function setCountdown(active) { countdown = !!active; }

  // ---------- camera framing and HTML anchors ----------
  // reserve: { top, bottom, card } in CSS pixels kept free for the overlay.
  function layout(size, reserve, onAnchors) {
    layoutRequest = { size, reserve };
    if (onAnchors) anchorsCallback = onAnchors;
    applyLayout();
  }
  function requestLayout() { if (layoutRequest) applyLayout(); }
  function applyLayout() {
    const { size, reserve } = layoutRequest;
    const width = Math.max(1, size.width), height = Math.max(1, size.height);
    viewport = { width, height };
    const aspect = width / height;
    mode = aspect < 1.05 ? 'stacked' : 'wide';
    positionSlots();
    camera.aspect = aspect;

    const topFrac = clamp((reserve.top + 10) / height, .04, .4);
    const bottomFrac = clamp((height - reserve.bottom - reserve.card - 14) / height, .45, .96);
    const tallest = (mode === 'wide' ? 0 : TIER_HEIGHT) + FIGURE_HEIGHT;
    const halfSpan = Math.max(...slots.map((slot) => Math.abs(slot.position.x))) + .62;
    const visibleHeight = Math.max(
      tallest / Math.max(.12, bottomFrac - topFrac),
      2 * halfSpan / aspect,
    );
    const distance = visibleHeight / (2 * Math.tan(camera.fov * Math.PI / 360)) + (mode === 'wide' ? 2.2 : 1.4);
    const pitch = mode === 'wide' ? .085 : .06;
    let targetY = visibleHeight * (bottomFrac - .5);
    for (let i = 0; i < 5; i++) {                 // settle the feet on the reserved line
      camera.position.set(0, targetY + Math.sin(pitch) * distance, Math.cos(pitch) * distance);
      camera.lookAt(0, targetY, 0);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      // Tilting the camera up (a higher look target) pushes the feet further down the frame.
      const feet = projectPoint(0, 0, 0).y / height;
      targetY += (bottomFrac - feet) * visibleHeight * .9;
    }
    camera.position.set(0, targetY + Math.sin(pitch) * distance, Math.cos(pitch) * distance);
    camera.lookAt(0, targetY, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    publishAnchors();
  }
  function projectPoint(x, y, z) {
    projection.set(x, y, z).project(camera);
    return { x: (projection.x + 1) * viewport.width / 2, y: (1 - projection.y) * viewport.height / 2 };
  }
  function publishAnchors() {
    if (!anchorsCallback) return;
    const anchors = slots.map((slot) => {
      const feet = projectPoint(slot.position.x, slot.position.y, slot.position.z);
      const head = projectPoint(slot.position.x, slot.position.y + FIGURE_HEIGHT, slot.position.z);
      const side = projectPoint(slot.position.x + SPACING, slot.position.y, slot.position.z);
      return { key: slot.key, team: slot.team, index: slot.index, x: feet.x, feetY: feet.y, headY: head.y, spacing: Math.abs(side.x - feet.x) };
    });
    const rowFeet = {};
    for (const anchor of anchors) rowFeet[anchor.team] = Math.max(rowFeet[anchor.team] ?? 0, anchor.feetY);
    for (const anchor of anchors) anchor.rowY = rowFeet[anchor.team];  // one straight row of cards per team
    const centre = projectPoint(0, mode === 'wide' ? 0 : TIER_HEIGHT / 2, 0);
    anchorsCallback({ mode, anchors, centre: { x: centre.x, y: mode === 'wide' ? rowFeet.blue : centre.y } });
  }

  // ---------- frame ----------
  function render(now, dt) {
    const step = Math.min(dt, .05);
    for (const [, figure] of [...figures]) {
      updateFigure(figure, now, step);
    }
    for (const slot of slots) updatePedestal(slot, now, step);
    for (let i = 0; i < dustCount; i++) {
      dustPositions[i * 3 + 1] += dustSpeed[i] * step;
      if (dustPositions[i * 3 + 1] > 5.5) dustPositions[i * 3 + 1] = 0;
    }
    dustGeometry.attributes.position.needsUpdate = true;
    const glowPulse = .3 + (countdown ? .22 : .1) * (.5 + .5 * Math.sin(now * .0016));
    for (const team of ['blue', 'red']) {
      teamGlow[team].material.opacity = glowPulse;
      teamLight[team].intensity = damp(teamLight[team].intensity, countdown ? 40 : 26, 2, step);
    }
    keyLight.intensity = damp(keyLight.intensity, countdown ? 1.9 : 1.45, 2, step);
    renderer.render(scene, camera);
  }
  function updateFigure(figure, now, dt) {
    const slot = slotByKey.get(figure.slotKey);
    const root = figure.footballer.root;
    const elapsed = now - figure.stateStart;
    if (figure.state === 'entering') {
      const t = clamp(elapsed / ENTER_MS, 0, 1);
      setFigureOpacity(figure, t);
      root.position.y = (slot ? slot.position.y : 0) - .32 * (1 - easeOut(t));
      if (t >= 1) { figure.state = 'idle'; setFigureOpacity(figure, 1); }
    } else if (figure.state === 'leaving') {
      const t = clamp(elapsed / EXIT_MS, 0, 1);
      setFigureOpacity(figure, 1 - t);
      root.position.y = (slot ? slot.position.y : 0) - .25 * t;
      if (t >= 1) { disposeFigure(figure); return; }
    } else if (slot) {
      root.position.y = slot.position.y;
    }
    if (slot) {
      const move = clamp((now - figure.moveStart) / MOVE_MS, 0, 1);
      if (move < 1) {
        root.position.x = lerp(figure.from.x, figure.to.x, easeOut(move));
        root.position.z = lerp(figure.from.z, figure.to.z, easeOut(move));
      } else {
        root.position.x = slot.position.x;
        root.position.z = slot.position.z;
      }
      const diff = Math.atan2(Math.sin(slot.rotationY - root.rotation.y), Math.cos(slot.rotationY - root.rotation.y));
      root.rotation.y += diff * (1 - Math.exp(-dt * 6));
    }
    // Pose: hold the current one, then ease into another so nobody loops in sync.
    figure.poseTime += dt;
    figure.poseLeft -= dt;
    if (figure.poseLeft <= 0) {
      figure.pose = countdown && figure.ready ? 'readyStance' : nextPose(figure.ready, figure.pose, random);
      figure.poseTime = 0;
      figure.poseLeft = poseDuration(figure.pose, random);
    }
    const targets = samplePose(figure.pose, figure.poseTime, figure.seed);
    for (const joint of figure.joints) {
      joint.holder[joint.axis] = damp(joint.holder[joint.axis], targets[joint.key] || 0, joint.rate, dt);
    }
  }
  function updatePedestal(slot, now, dt) {
    const hoveredNow = hovered === slot.key;
    const target = slot.occupied ? (slot.isMe ? .95 : slot.ready ? .8 : .55) : hoveredNow ? .7 : .34 + .08 * Math.sin(now * .002 + slot.index);
    slot.ringMaterial.opacity = damp(slot.ringMaterial.opacity, target, 6, dt);
    const color = slot.isMe ? 0xffd479 : slot.ready ? 0x76e8a8 : null;
    if (color) slot.ringMaterial.color.lerp(new THREE.Color(color), 1 - Math.exp(-dt * 6));
    else slot.ringMaterial.color.lerp(slot.accent, 1 - Math.exp(-dt * 6));
    slot.glowMaterial.color.copy(slot.ringMaterial.color);
    slot.beamMaterial.color.copy(slot.ringMaterial.color);
    slot.glowMaterial.opacity = damp(slot.glowMaterial.opacity, slot.occupied ? .34 : hoveredNow ? .18 : .06, 5, dt);
    slot.beamMaterial.opacity = damp(slot.beamMaterial.opacity, slot.occupied ? .05 : hoveredNow ? .12 : 0, 5, dt);
  }

  function dispose() {
    for (const [, figure] of [...figures]) disposeFigure(figure);
    scene.clear();                                  // detach everything first, then free it
    for (const thing of disposables) thing.dispose?.();
    disposables.length = 0;
    anchorsCallback = null;
    layoutRequest = null;
  }

  return { scene, camera, setTeams, setLineup, setHover, setCountdown, layout, render, dispose,
    get mode() { return mode; } };
}
