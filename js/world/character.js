// 귀여운 로우폴리 3D 캐릭터 + 애니메이션 (걷기/달리기/점프/대기)
import * as THREE from 'three';

export const OUTFITS = [
  { name: '빨강', shirt: 0xe63946, pants: 0x1d3557, hair: 0x2b1d14, hat: 0xffd166, pack: 0xf4a261 },
  { name: '파랑', shirt: 0x3a86ff, pants: 0x2b2d42, hair: 0x3d2817, hat: 0xff006e, pack: 0xffbe0b },
  { name: '초록', shirt: 0x2bb673, pants: 0x264653, hair: 0x1b1b1b, hat: 0xffffff, pack: 0xe76f51 },
  { name: '보라', shirt: 0x8d5bd6, pants: 0x3c3c58, hair: 0x5a3825, hat: 0xffd6e0, pack: 0x2ec4b6 },
  { name: '노랑', shirt: 0xffc43d, pants: 0x355070, hair: 0x2b1d14, hat: 0xe63946, pack: 0x3a86ff },
  { name: '분홍', shirt: 0xff8fab, pants: 0x4a4e69, hair: 0x6b3e26, hat: 0x90e0ef, pack: 0x06d6a0 }
];

const L = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });

export class Character {
  constructor(outfitIndex = 0) {
    const o = OUTFITS[outfitIndex % OUTFITS.length];
    this.root = new THREE.Group();
    this.body = new THREE.Group();      // 상하 흔들림용
    this.root.add(this.body);
    const skin = L(0xffd8b5), shirt = L(o.shirt), pants = L(o.pants), hair = L(o.hair), shoe = L(0x3b2f2f), white = L(0xffffff), black = L(0x1a1a1a);

    // 몸통
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.45, 3, 8), shirt);
    torso.position.y = 1.15; this.body.add(torso);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.12, 10), pants); belt.position.y = 0.86; this.body.add(belt);
    // 배낭 (여행자!)
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.66, 0.32), L(o.pack)); pack.position.set(0, 1.2, -0.42); this.body.add(pack);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.22, 0.34), L(0xffffff)); flap.position.set(0, 1.46, -0.43); flap.material = L(new THREE.Color(o.pack).multiplyScalar(0.8)); this.body.add(flap);

    // 머리
    this.head = new THREE.Group(); this.head.position.y = 1.95; this.body.add(this.head);
    const headM = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 1), skin); headM.scale.set(1, 0.95, 0.95); this.head.add(headM);
    const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.66, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), hair); hairM.position.y = 0.06; hairM.rotation.x = -0.25; this.head.add(hairM);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), black); eye.position.set(sx * 0.21, 0.02, 0.56); eye.scale.y = 1.35; this.head.add(eye);
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), white); hl.position.set(sx * 0.21 + 0.03, 0.07, 0.63); this.head.add(hl);
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), L(0xff9aa2)); cheek.position.set(sx * 0.36, -0.14, 0.48); cheek.scale.set(1, 0.6, 0.4); this.head.add(cheek);
    }
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 4, 8, Math.PI), black); mouth.position.set(0, -0.16, 0.58); mouth.rotation.z = Math.PI; this.head.add(mouth);
    // 모자
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.67, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.42), L(o.hat)); cap.position.y = 0.12; this.head.add(cap);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 10, 1, false, -Math.PI / 2, Math.PI), L(o.hat)); brim.position.set(0, 0.3, 0.35); brim.rotation.x = 0.1; this.head.add(brim);
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), L(0xffffff)); pom.position.y = 0.78; this.head.add(pom);

    // 팔
    this.arms = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(sx * 0.52, 1.42, 0); this.body.add(pivot);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.42, 3, 6), shirt); arm.position.y = -0.3; pivot.add(arm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), skin); hand.position.y = -0.62; pivot.add(hand);
      pivot.rotation.z = sx * 0.12;
      this.arms.push(pivot);
    }
    // 다리
    this.legs = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(sx * 0.2, 0.82, 0); this.body.add(pivot);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.36, 3, 6), pants); leg.position.y = -0.3; pivot.add(leg);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.4), shoe); foot.position.set(0, -0.66, 0.06); pivot.add(foot);
      this.legs.push(pivot);
    }
    this.root.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = false; } });

    this.phase = 0;
    this.squash = 0;
    this.blink = 0;
  }

  // speed: 0..1 (걷기) / >1 (달리기), air: 공중 여부, vy: 수직 속도
  animate(dt, speedNorm, running, air, vy, t) {
    const legs = this.legs, arms = this.arms;
    const moving = speedNorm > 0.05;
    const freq = running ? 13 : 9;
    if (moving && !air) this.phase += dt * freq * Math.min(1.2, 0.4 + speedNorm);
    const amp = air ? 0 : (running ? 1.0 : 0.65) * Math.min(1, speedNorm * 1.4);
    const s = Math.sin(this.phase);
    const target = (v, to, k) => v + (to - v) * Math.min(1, dt * k);

    if (air) {
      legs[0].rotation.x = target(legs[0].rotation.x, vy > 0 ? -0.9 : -0.3, 12);
      legs[1].rotation.x = target(legs[1].rotation.x, vy > 0 ? 0.5 : 0.25, 12);
      arms[0].rotation.x = target(arms[0].rotation.x, -2.4, 10);
      arms[1].rotation.x = target(arms[1].rotation.x, -2.4, 10);
      arms[0].rotation.z = target(arms[0].rotation.z, -0.5, 10);
      arms[1].rotation.z = target(arms[1].rotation.z, 0.5, 10);
    } else {
      legs[0].rotation.x = target(legs[0].rotation.x, s * amp, 20);
      legs[1].rotation.x = target(legs[1].rotation.x, -s * amp, 20);
      arms[0].rotation.x = target(arms[0].rotation.x, -s * amp * 0.9, 20);
      arms[1].rotation.x = target(arms[1].rotation.x, s * amp * 0.9, 20);
      arms[0].rotation.z = target(arms[0].rotation.z, -0.12 - (moving ? 0 : Math.sin(t * 2) * 0.03), 10);
      arms[1].rotation.z = target(arms[1].rotation.z, 0.12 + (moving ? 0 : Math.sin(t * 2) * 0.03), 10);
    }
    // 몸 흔들림
    const bob = moving && !air ? Math.abs(Math.cos(this.phase)) * (running ? 0.16 : 0.08) : Math.sin(t * 2.2) * 0.025;
    this.body.position.y = bob;
    this.body.rotation.x = target(this.body.rotation.x, running && moving && !air ? 0.22 : (moving ? 0.06 : 0), 8);
    this.head.rotation.z = moving ? Math.sin(this.phase) * 0.05 : Math.sin(t * 1.3) * 0.04;
    // 착지 찌그러짐
    this.squash = Math.max(0, this.squash - dt * 4);
    const sq = Math.sin(this.squash * Math.PI) * 0.18;
    this.body.scale.set(1 + sq, 1 - sq, 1 + sq);
  }
  land(strength = 1) { this.squash = Math.min(1, 0.6 * strength + 0.3); }
}
