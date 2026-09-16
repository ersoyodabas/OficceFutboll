import { THREE } from '../engine/three.js';
  export function createStadium({ scene, field }) {
    const stadium = new THREE.Group();
    stadium.name = 'Stadium';
    scene.add(stadium);
    const { HALF_W: hw, HALF_L: hl } = field;
    const dark = new THREE.MeshStandardMaterial({ color: 0x0e1614, roughness: 0.9 });
    const concrete = new THREE.MeshStandardMaterial({ color: 0x2b3232, roughness: 0.94 });
    const rail = new THREE.MeshStandardMaterial({ color: 0xd2dbdf, metalness: 0.45, roughness: 0.45 });

    function box(group, w, h, d, x, y, z, material) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    }

    // Stadium floor under the grass run-off (the turf itself comes from world/field.js).
    const runoff = new THREE.Group();
    runoff.name = 'Runoff';
    stadium.add(runoff);
    box(runoff, hw * 2 + 40, 0.28, hl * 2 + 40, 0, -0.2, 0, concrete);

    // Bright green LED boards, as in Rush broadcasts.
    function adTexture(label) {
      const canvas = document.createElement('canvas');
      canvas.width = 1024; canvas.height = 128;
      const ctx = canvas.getContext('2d');
      const gradient = ctx.createLinearGradient(0, 0, 0, 128);
      gradient.addColorStop(0, '#2ff29c'); gradient.addColorStop(1, '#16c77c');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1024, 128);
      ctx.fillStyle = '#ffffff'; ctx.font = '900 64px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, 512, 68);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      return texture;
    }
    const slogans = [adTexture('⚽ @OFFICEFUTBOLL'), adTexture('OFFICE FUTBOLL · RUSH')];
    const advertising = new THREE.Group();
    advertising.name = 'AdvertisingBoards';
    stadium.add(advertising);
    const panelW = 10;
    function panel(x, z, rotation, index) {
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(panelW, 1),
        new THREE.MeshBasicMaterial({ map: slogans[index % slogans.length], toneMapped: false })
      );
      panel.position.set(x, 0.6, z);
      panel.rotation.y = rotation;
      advertising.add(panel);
      const backing = box(advertising, panelW, 1.1, 0.12, x - Math.sin(rotation) * .07, 0.55, z - Math.cos(rotation) * .07, dark);
      backing.rotation.y = rotation;
    }
    // Only the far touchline and the goal ends: the camera sits behind the near side.
    let index = 0;
    for (let z = -hl - 2; z <= hl + 2; z += panelW) panel(-hw - 3.5, z + panelW / 2, Math.PI / 2, index++);
    for (let x = -hw; x <= hw; x += panelW) {
      panel(x + panelW / 2, -hl - 4.5, 0, index++);
      panel(x + panelW / 2, hl + 4.5, Math.PI, index++);
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
      const base = isSide ? hw + 8 : hl + 5.8;
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
    // No near-side stand: it would sit between the broadcast camera and the pitch.
    stand('FarStand', true, -1, hl);
    stand('NorthStand', false, -1, hw);
    stand('SouthStand', false, 1, hw);

    const technical = new THREE.Group();
    technical.name = 'TechnicalArea';
    stadium.add(technical);
    const benchX = -hw - 5.5;
    for (const z of [-9, 9]) {
      box(technical, 2.5, 0.13, 7.4, benchX, 0.45, z, rail);
      for (let i = -2; i <= 2; i++) {
        box(technical, 0.8, 0.12, 0.7, benchX, 0.55, z + i * 1.25, seatMaterials[0]);
      }
    }

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
