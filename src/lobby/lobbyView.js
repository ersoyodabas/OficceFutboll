import { THREE } from '../engine/three.js';
  export class LobbyView {
    constructor({ container, slotsElement, field, grassMaterial, drawMarkings, createFootballer, onSelect }) {
      this.container = container;
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x101f2a);
      this.renderer = new THREE.WebGLRenderer({ antialias: true });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.3;
      this.renderer.domElement.setAttribute('aria-hidden', 'true');
      container.prepend(this.renderer.domElement);
      this.camera = new THREE.OrthographicCamera(-46, 46, 23, -23, .1, 240);
      this.camera.position.set(72, 110, 0);
      this.camera.lookAt(0, 0, 0);
      this.scene.add(new THREE.HemisphereLight(0xd5f2ff, 0x294335, 1.8));
      const light = new THREE.DirectionalLight(0xfff3da, 2.6);
      light.position.set(-25, 65, 35);
      light.castShadow = true;
      light.shadow.mapSize.set(2048, 2048);
      Object.assign(light.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, far: 150 });
      light.shadow.bias = -.0008;
      this.scene.add(light);

      const base = new THREE.Mesh(new THREE.BoxGeometry(52, 1.6, 82), new THREE.MeshStandardMaterial({ color: 0x203a42, roughness: .8 }));
      base.position.y = -.85;
      base.receiveShadow = true;
      this.scene.add(base);
      const grass = new THREE.Mesh(new THREE.PlaneGeometry(field.HALF_W * 2, field.HALF_L * 2), grassMaterial);
      grass.rotation.x = -Math.PI / 2;
      grass.receiveShadow = true;
      this.scene.add(grass);
      const markings = document.createElement('canvas');
      markings.width = markings.height = 1024;
      drawMarkings(markings.getContext('2d'), 1024);
      const lines = new THREE.Mesh(grass.geometry, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(markings), transparent: true, depthWrite: false }));
      lines.rotation.x = -Math.PI / 2;
      lines.position.y = .035;
      this.scene.add(lines);

      // Colored edge lighting makes the two team halves immediately distinct.
      for (const team of ['blue', 'red']) {
        const sign = team === 'blue' ? 1 : -1;
        const color = team === 'blue' ? 0x58baff : 0xff718d;
        for (const x of [-25.3, 25.3]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(.12, .12, 39), new THREE.MeshBasicMaterial({ color }));
          rail.position.set(x, .06, sign * 20);
          this.scene.add(rail);
        }
        this.addGoal(sign * field.HALF_L, field);
      }

      this.slots = [];
      this.projected = new THREE.Vector3();
      for (const team of ['blue', 'red']) {
        field.LOBBY_SLOTS.forEach((place, index) => {
          const position = new THREE.Vector3(place.x, .08, place.z * (team === 'blue' ? 1 : -1));
          const color = team === 'blue' ? 0x78caff : 0xff96aa;
          const ring = new THREE.Mesh(new THREE.RingGeometry(1.7, 1.9, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .75, side: THREE.DoubleSide }));
          ring.rotation.x = -Math.PI / 2;
          ring.position.copy(position);
          this.scene.add(ring);
          const model = createFootballer(team, index + 1, this.scene);
          model.root.scale.setScalar(2.65);
          model.root.position.copy(position);
          model.root.rotation.y = Math.PI / 2;
          model.root.visible = false;
          model.tag.visible = false;
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'pitch-slot ' + team;
          button.dataset.team = team;
          button.dataset.slot = index;
          const plus = document.createElement('span');
          plus.className = 'slot-plus';
          plus.textContent = '+';
          plus.setAttribute('aria-hidden', 'true');
          const label = document.createElement('span');
          label.className = 'slot-player';
          const name = document.createElement('span');
          name.className = 'slot-name';
          const state = document.createElement('span');
          state.className = 'slot-state';
          label.append(name, state);
          button.append(plus, label);
          button.addEventListener('click', () => onSelect(team, index));
          slotsElement.appendChild(button);
          this.slots.push({ team, index, position, ring, model, button, name, state, color });
        });
      }
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(container);
      this.resize();
    }

    addGoal(z, field) {
      const net = new THREE.Group();
      const material = new THREE.LineBasicMaterial({ color: 0xc4dbe2, transparent: true, opacity: .45 });
      const points = [];
      const w = field.GOAL_HALF_W, h = field.GOAL_HEIGHT, back = z + Math.sign(z) * 2.5;
      for (let x = -w; x <= w; x += .6) {
        points.push(new THREE.Vector3(x, 0, back), new THREE.Vector3(x, h, back));
        points.push(new THREE.Vector3(x, h, back), new THREE.Vector3(x, h, z));
      }
      for (let y = 0; y <= h; y += .5) {
        points.push(new THREE.Vector3(-w, y, back), new THREE.Vector3(w, y, back));
        for (const x of [-w, w]) points.push(new THREE.Vector3(x, y, z), new THREE.Vector3(x, y, back));
      }
      net.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), material));
      const postMat = new THREE.MeshStandardMaterial({ color: 0xe9f4f5 });
      for (const x of [-w, w]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, h, 8), postMat);
        post.position.set(x, h / 2, z);
        post.castShadow = true;
        net.add(post);
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, w * 2, 8), postMat);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(0, h, z);
      net.add(bar);
      this.scene.add(net);
    }

    resize() {
      const width = this.container.clientWidth, height = this.container.clientHeight;
      if (!width || !height) return;
      this.renderer.setSize(width, height, false);
      const halfHeight = Math.max(25, 46 * height / width);
      const halfWidth = halfHeight * width / height;
      Object.assign(this.camera, { left: -halfWidth, right: halfWidth, top: halfHeight, bottom: -halfHeight });
      this.camera.updateProjectionMatrix();
      this.camera.updateMatrixWorld();
      for (const slot of this.slots) {
        this.projected.copy(slot.position).project(this.camera);
        slot.button.style.left = `${(this.projected.x + 1) * width / 2}px`;
        slot.button.style.top = `${(1 - this.projected.y) * height / 2}px`;
      }
    }

    update(players, myId, locked) {
      for (const slot of this.slots) {
        const player = players.find((p) => !p.isAI && p.team === slot.team && p.slot === slot.index);
        const isMe = player?.id === myId;
        slot.model.root.visible = !!player;
        slot.ring.material.color.setHex(isMe ? 0xffdf7b : player?.ready ? 0x80efb3 : slot.color);
        slot.button.disabled = locked || (!!player && !isMe);
        slot.button.classList.toggle('occupied', !!player);
        slot.button.classList.toggle('me', isMe);
        slot.button.classList.toggle('ready', !!player?.ready);
        slot.button.setAttribute('aria-pressed', String(isMe));
        slot.button.setAttribute('aria-label', player ? `${player.name}${isMe ? ', sen' : ''}, ${player.ready ? 'hazır' : 'hazır değil'}` : `${slot.team === 'blue' ? 'Mavi' : 'Kırmızı'} takım, boş yer ${slot.index + 1}`);
        slot.name.textContent = player?.name || '';
        slot.state.textContent = player ? (player.inMatch ? 'SAHADA' : player.ready ? '✓ HAZIR' : isMe ? 'SEN' : 'BEKLENİYOR') : '';
      }
      this.resize();
    }

    render(now) {
      for (const slot of this.slots) {
        if (slot.model.root.visible) slot.model.root.rotation.z = Math.sin(now * .0015 + slot.index) * .018;
      }
      this.renderer.render(this.scene, this.camera);
    }
  }
