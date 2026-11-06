// 보물상자 + 목적지 마커 + 반짝이 효과
import * as THREE from 'three';
import { glowTexture, iconTexture } from './kit.js';

const glowTex = glowTexture();
const L = (c, e = 0) => new THREE.MeshLambertMaterial({ color: c, emissive: e ? c : 0x000000, emissiveIntensity: e, flatShading: true });

export class Chest {
  constructor(pos, rotY) {
    this.group = new THREE.Group();
    this.group.position.copy(pos);
    this.group.rotation.y = rotY;
    const wood = L(0x9c5a2c), gold = L(0xf2c14e, 0.15), dark = L(0x5a3418);
    this.goldMat = gold;
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 1.05), wood); base.position.y = 0.45; this.group.add(base);
    for (const sx of [-0.62, 0.62]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.92, 1.08), gold); b.position.set(sx, 0.45, 0); this.group.add(b); }
    const rim = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.1, 1.09), dark); rim.position.y = 0.9; this.group.add(rim);
    // 뚜껑 (뒤쪽 경첩)
    this.lid = new THREE.Group(); this.lid.position.set(0, 0.92, -0.52); this.group.add(this.lid);
    const lidM = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 1.6, 10, 1, false, 0, Math.PI), wood);
    lidM.rotation.z = Math.PI / 2; lidM.position.set(0, 0, 0.52); this.lid.add(lidM);
    for (const sx of [-0.62, 0.62]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.54, 0.16, 10, 1, false, 0, Math.PI), gold); b.rotation.z = Math.PI / 2; b.position.set(sx, 0, 0.52); this.lid.add(b); }
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 0.1), gold); lock.position.set(0, 0.78, 0.56); this.group.add(lock);
    // 안쪽 빛
    this.inner = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.9), new THREE.MeshBasicMaterial({ color: 0xfff1a8 }));
    this.inner.position.y = 0.88; this.inner.visible = false; this.group.add(this.inner);
    // 후광
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe08a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    this.halo.scale.set(5, 5, 1); this.halo.position.y = 0.8; this.group.add(this.halo);
    // 빛 기둥
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 14, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.beam.position.y = 7; this.group.add(this.beam);
    // 바닥 링
    this.ring = new THREE.Mesh(new THREE.RingGeometry(5.6, 6.2, 40), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.0, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.06; this.group.add(this.ring);
    this.group.traverse(m => { if (m.isMesh && m !== this.beam && m !== this.ring) m.castShadow = true; });
    this.state = 'closed';   // closed | active | opening | opened
    this.t = 0; this.open = 0;
    this.sparkles = makeSparkles(); this.group.add(this.sparkles.points);
  }
  setActive(on) { if (this.state === 'closed' || this.state === 'active') this.state = on ? 'active' : 'closed'; }
  playOpen() { this.state = 'opening'; this.t = 0; this.sparkles.burst(); }
  setOpened() { this.state = 'opened'; this.open = 1; this.lid.rotation.x = -1.9; this.inner.visible = true; }
  update(dt, time) {
    this.t += dt;
    let haloTarget = 0, beamTarget = 0, ringTarget = 0;
    if (this.state === 'active') {
      haloTarget = 0.75 + Math.sin(time * 5) * 0.25; beamTarget = 0.28; ringTarget = 0.55 + Math.sin(time * 4) * 0.2;
      this.group.children[0].position.y = 0.45;
      this.goldMat.emissiveIntensity = 0.4 + Math.sin(time * 6) * 0.25;
      this.lid.rotation.x = Math.sin(time * 9) * 0.04 - 0.03;
    } else if (this.state === 'opening') {
      this.open = Math.min(1, this.t / 0.7);
      const e = 1 - Math.pow(1 - this.open, 3);
      this.lid.rotation.x = -1.9 * e + Math.sin(this.open * Math.PI) * 0.15;
      this.inner.visible = true;
      haloTarget = 1.4; beamTarget = 0.6; ringTarget = 0.8;
      if (this.t > 1.6) this.state = 'opened';
    } else if (this.state === 'opened') {
      haloTarget = 0.25; beamTarget = 0.06; ringTarget = 0;
      this.goldMat.emissiveIntensity = 0.15;
    } else {
      this.goldMat.emissiveIntensity = 0.15;
      this.lid.rotation.x = 0;
    }
    const k = Math.min(1, dt * 5);
    this.halo.material.opacity += (haloTarget - this.halo.material.opacity) * k;
    this.beam.material.opacity += (beamTarget - this.beam.material.opacity) * k;
    this.ring.material.opacity += (ringTarget - this.ring.material.opacity) * k;
    this.beam.rotation.y += dt * 0.8;
    this.halo.scale.setScalar(4.5 + this.halo.material.opacity * 2);
    this.sparkles.update(dt);
  }
}

function makeSparkles() {
  const N = 60;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffe066, size: 0.35, map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  for (let i = 0; i < N; i++) pos[i * 3 + 1] = -999;
  return {
    points,
    burst() {
      for (let i = 0; i < N; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 0.8; pos[i * 3 + 1] = 1; pos[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
        const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 3;
        vel[i * 3] = Math.cos(a) * sp; vel[i * 3 + 1] = 5 + Math.random() * 6; vel[i * 3 + 2] = Math.sin(a) * sp;
        life[i] = 1.2 + Math.random() * 0.8;
      }
    },
    update(dt) {
      let any = false;
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) continue;
        any = true;
        life[i] -= dt;
        vel[i * 3 + 1] -= 9 * dt;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (life[i] <= 0) pos[i * 3 + 1] = -999;
      }
      if (any) geo.attributes.position.needsUpdate = true;
    }
  };
}

// 목적지 상공 아이콘
export class Marker {
  constructor(pos, emoji) {
    this.emoji = emoji;
    this.tex = iconTexture(emoji);
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false }));
    this.sprite.scale.set(4.2, 4.2, 1);
    this.sprite.position.copy(pos);
    this.base = pos.y;
    this.sprite.renderOrder = 5;
    this.done = false;
  }
  setDone(d) {
    if (d === this.done) return;
    this.done = d;
    this.sprite.material.map = d ? iconTexture('', { check: true }) : this.tex;
    this.sprite.material.needsUpdate = true;
  }
  setTarget(on) { this.target = on; }
  update(time, playerPos) {
    const d = this.sprite.position.distanceTo(playerPos);
    this.sprite.position.y = this.base + Math.sin(time * 2 + this.base) * 0.5;
    const op = d > 140 ? 0 : d > 100 ? (140 - d) / 40 : 1;
    this.sprite.material.opacity = op;
    this.sprite.visible = op > 0.01;
    const s = 4.2 + Math.min(4, d / 30);
    this.sprite.scale.set(s, s, 1);
  }
}
