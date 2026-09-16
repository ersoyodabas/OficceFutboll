import { THREE } from '../engine/three.js';
  export function createStadium({ scene, field }) {
    const stadium = new THREE.Group();
    stadium.name = 'Stadium';
    scene.add(stadium);
    const { HALF_W: hw, HALF_L: hl } = field;
    const dark = new THREE.MeshStandardMaterial({ color: 0x172631, roughness: 0.9 });
    const concrete = new THREE.MeshStandardMaterial({ color: 0x6d7980, roughness: 0.94 });
    const rail = new THREE.MeshStandardMaterial({ color: 0xd2dbdf, metalness: 0.45, roughness: 0.45 });
    const turf = new THREE.MeshStandardMaterial({ color: 0x285b36, roughness: 1 });

    function box(group, w, h, d, x, y, z, material) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    }

    const runoff = new THREE.Group();
    runoff.name = 'Runoff';
    stadium.add(runoff);
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 + 15, hl * 2 + 15), turf);
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.012;
    apron.receiveShadow = true;
    runoff.add(apron);
    box(runoff, hw * 2 + 18, 0.28, hl * 2 + 18, 0, -0.2, 0, concrete);
    const track = new THREE.Mesh(new THREE.RingGeometry(1, 1.04, 4), dark);
    track.rotation.x = -Math.PI / 2;
    track.scale.set(hw + 8, hl + 8, 1);
    track.position.y = -0.005;
    runoff.add(track);

    function adTexture(label, background) {
      const canvas = document.createElement('canvas');
      canvas.width = 512; canvas.height = 96;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = background; ctx.fillRect(0, 0, 512, 96);
      ctx.fillStyle = '#60ed83'; ctx.fillRect(0, 0, 9, 96);
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 38px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, 256, 48);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    }
    const slogans = [
      adTexture('OFFICE FUTBOLL', '#102a24'),
      adTexture('PLAY TOGETHER', '#132c42'),
      adTexture('MATCH DAY', '#3b2031'),
      adTexture('MORE THAN A GAME', '#263d22'),
    ];
    const advertising = new THREE.Group();
    advertising.name = 'AdvertisingBoards';
    stadium.add(advertising);
    const panelW = 7.6;
    function panel(x, z, rotation, index) {
      const texture = slogans[((index % slogans.length) + slogans.length) % slogans.length];
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(panelW, 1.15),
        new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
      );
      panel.position.set(x, 0.68, z);
      panel.rotation.y = rotation;
      advertising.add(panel);
      box(advertising, panelW, 0.09, 0.13, x, 0.08, z, dark);
    }
    for (let z = -hl + 4; z <= hl - 4; z += panelW) {
      panel(-hw - 2.8, z, Math.PI / 2, Math.round(z));
      panel(hw + 2.8, z, Math.PI / 2, Math.round(z + 1));
    }
    for (let x = -hw + 4; x <= hw - 4; x += panelW) {
      panel(x, -hl - 2.8, 0, Math.round(x));
      panel(x, hl + 2.8, 0, Math.round(x + 1));
    }

    const seating = new THREE.Group();
    seating.name = 'Stands';
    stadium.add(seating);
    const seatMaterials = [
      new THREE.MeshStandardMaterial({ color: 0x18475b, roughness: 0.95 }),
      new THREE.MeshStandardMaterial({ color: 0x215771, roughness: 0.95 }),
      new THREE.MeshStandardMaterial({ color: 0x1d344b, roughness: 0.95 }),
    ];
    const crowdGeometry = new THREE.CylinderGeometry(0.16, 0.22, 0.58, 5);
    const crowdMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
    const person = new THREE.Object3D();
    const crowdColors = [0xd9dfeb, 0x348bd2, 0xd94f43, 0x3b5158, 0xc6aa69, 0x6ab079];
    function hash(n) { return ((Math.imul(n + 73, 1103515245) >>> 12) & 65535) / 65535; }

    function stand(name, isSide, sign, halfLength) {
      const group = new THREE.Group();
      group.name = name;
      seating.add(group);
      const base = isSide ? hw + 5.8 : hl + 5.8;
      const span = halfLength * 2 + 9;
      const rows = 11;
      const peoplePerRow = Math.floor(span / 1.05);
      box(group, isSide ? 13 : span, 1.4, isSide ? span : 13,
        isSide ? sign * (base + 5.6) : 0, 0.4,
        isSide ? 0 : sign * (base + 5.6), concrete);
      for (let row = 0; row < rows; row++) {
        const out = base + row * 0.95;
        const y = 1.3 + row * 0.65;
        box(group, isSide ? 0.98 : span, 0.38, isSide ? span : 0.98,
          isSide ? sign * out : 0, y - 0.36,
          isSide ? 0 : sign * out, seatMaterials[row % seatMaterials.length]);
      }
      const crowd = new THREE.InstancedMesh(crowdGeometry, crowdMaterial, rows * peoplePerRow);
      crowd.name = `${name}Crowd`;
      crowd.frustumCulled = false;
      let index = 0;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < peoplePerRow; col++) {
          const seed = row * 1000 + col * 41 + (sign > 0 ? 18 : 3);
          const along = -span / 2 + col * span / peoplePerRow + hash(seed) * 0.28;
          const out = sign * (base + row * 0.95);
          const y = 1.25 + row * 0.65 + hash(seed + 1) * 0.12;
          person.position.set(isSide ? out : along, y, isSide ? along : out);
          const scale = 0.75 + hash(seed + 2) * 0.5;
          person.scale.set(scale, scale, scale);
          person.rotation.y = hash(seed + 3) * Math.PI * 2;
          person.updateMatrix();
          crowd.setMatrixAt(index, person.matrix);
          crowd.setColorAt(index, new THREE.Color(crowdColors[Math.floor(hash(seed + 4) * crowdColors.length)]));
          index++;
        }
      }
      crowd.instanceMatrix.needsUpdate = true;
      group.add(crowd);
      const back = base + rows * 0.95 + 0.4;
      box(group, isSide ? 0.45 : span, 8.8, isSide ? span : 0.45,
        isSide ? sign * back : 0, 5.2,
        isSide ? 0 : sign * back, dark);
      box(group, isSide ? 2.8 : span, 0.38, isSide ? span : 2.8,
        isSide ? sign * (back - 1.6) : 0, 9.9,
        isSide ? 0 : sign * (back - 1.6), concrete);
      return group;
    }
    stand('FarStand', true, -1, hl);
    stand('NearStand', true, 1, hl);
    stand('NorthStand', false, -1, hw);
    stand('SouthStand', false, 1, hw);

    const technical = new THREE.Group();
    technical.name = 'TechnicalArea';
    stadium.add(technical);
    const benchX = hw + 4.1;
    for (const z of [-9, 9]) {
      box(technical, 2.5, 0.13, 7.4, benchX, 0.45, z, rail);
      box(technical, 2.5, 1.8, 0.12, benchX + 1.1, 1.35, z, concrete);
      for (let i = -2; i <= 2; i++) {
        box(technical, 0.8, 0.12, 0.7, benchX, 0.55, z + i * 1.25, seatMaterials[0]);
      }
    }
    box(technical, 2.3, 4.2, 7.5, -hw - 11, 2.15, 0, dark); // tunnel mouth
    box(technical, 0.1, 3.4, 5.5, -hw - 9.8, 1.75, 0, concrete);

    const towers = new THREE.Group();
    towers.name = 'Floodlights';
    stadium.add(towers);
    const lit = new THREE.MeshBasicMaterial({ color: 0xeaf7ff });
    for (const x of [-hw - 14, hw + 14]) for (const z of [-hl - 14, hl + 14]) {
      box(towers, 0.55, 19, 0.55, x, 9.5, z, rail);
      box(towers, 7.5, 1.2, 0.8, x, 19.1, z, dark);
      for (let i = -2; i <= 2; i++) box(towers, 0.95, 0.75, 0.16, x + i * 1.25, 19.15, z + 0.44, lit);
    }
    return stadium;
  }
