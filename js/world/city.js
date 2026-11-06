// 3D 중국풍 도시 생성기
import * as THREE from 'three';
import { Kit, signTexture } from './kit.js';

export const ROADS = [-120, -60, 0, 60, 120];   // 도로 중심선 (x, z 모두 동일)
export const RH = 5;                             // 도로 반폭
export const EDGE = 8;                           // 도로 중심 → 블록 경계
export const BOUND = 132;                        // 이동 가능 범위
const BC = [-90, -30, 30, 90];                   // 블록 중심

// 목적지 배치: 블록(bx,bz) 와 정면 방향
export const DEST_LAYOUT = {
  d0: { b: [0, 0], face: 'E' },  // 学校
  d1: { b: [3, 1], face: 'W' },  // 医院
  d2: { b: [2, 2], face: 'W' },  // 银行
  d3: { b: [0, 2], face: 'N' },  // 超市
  d4: { b: [1, 1], face: 'E' },  // 公园
  d5: { b: [3, 3], face: 'N' },  // 饭店
  d6: { b: [2, 0], face: 'S' },  // 火车站
  d7: { b: [1, 3], face: 'E' },  // 图书馆
  d8: { b: [3, 2], face: 'E' },  // 商店
  d9: { b: [0, 3], face: 'S' }   // 邮局
};
const FILLERS = [
  { b: [2, 1], type: 'pagoda', face: 'S' },
  { b: [1, 2], type: 'teahouse', face: 'S' },
  { b: [0, 1], type: 'apartments', face: 'E' },
  { b: [2, 3], type: 'apartments2', face: 'N' },
  { b: [3, 0], type: 'office', face: 'W' },
  { b: [1, 0], type: 'hutong', face: 'S' }
];

const WHEEL = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 10);
const FACE = { S: [0, 1, 0], N: [0, -1, Math.PI], E: [1, 0, Math.PI / 2], W: [-1, 0, -Math.PI / 2] };

export const C = {
  asphalt: 0x50555f, line: 0xf4c430, white: 0xf7f5ee, sidewalk: 0xd9cfbf, curb: 0xbfb4a3, plaza: 0xeee0c5,
  grass: 0x8fd067, grass2: 0x7cc256, trunk: 0x8b5a3c, leaf: 0x5cb85c, leaf2: 0x7ccf6a, leaf3: 0x48a35a, blossom: 0xf7a8c4,
  red: 0xd62828, dred: 0xa4161a, gold: 0xf2c14e, tile: 0x56606e, tileDark: 0x434b57, jade: 0x2e8b57, yellowTile: 0xe0a526,
  wallW: 0xf7f1e6, cream: 0xf4e2bf, brick: 0xb8573e, glass: 0x9fd8f2, glass2: 0x63afd9, wood: 0x9c5a32, stone: 0xbab6ab,
  dark: 0x2b2f38, postGreen: 0x0f8a45, pink: 0xf28fb0, orange: 0xf4a259, teal: 0x2a9d8f, blue: 0x3a7bd5
};

export function heightAt(x, z) {
  const ax = Math.abs(x), az = Math.abs(z);
  if (ax > 125 || az > 125) return 0.2;
  for (const r of ROADS) { if (Math.abs(x - r) < RH || Math.abs(z - r) < RH) return 0; }
  return 0.2;
}

export function buildCity(scene, destConfig) {
  const colliders = [];
  const matStatic = new THREE.MeshLambertMaterial({ vertexColors: true });
  const matGround = new THREE.MeshLambertMaterial({ vertexColors: true });
  const signs = [];       // {pos, rotY, w, h, text, sub, style}
  const lanterns = [];    // 등롱 위치 (인스턴싱)
  const meshes = [];
  const anim = { train: null, clouds: [], water: [], flags: [] };

  /* ---------------- 지면과 도로 ---------------- */
  const g = new Kit(colliders);
  g.box(256, 0.4, 256, 0, -0.4, 0, C.asphalt);
  // 외곽 잔디
  g.box(900, 0.6, 380, 0, -0.4, -125 - 190, C.grass2);
  g.box(900, 0.6, 380, 0, -0.4, 125 + 190, C.grass2);
  g.box(380, 0.6, 250, -125 - 190, -0.4, 0, C.grass2);
  g.box(380, 0.6, 250, 125 + 190, -0.4, 0, C.grass2);
  // 외곽 인도
  for (const s of [-1, 1]) {
    g.box(256, 0.22, 3, 0, 0, s * 126.5, C.sidewalk);
    g.box(3, 0.22, 250, s * 126.5, 0, 0, C.sidewalk);
  }
  // 차선 & 횡단보도
  for (const r of ROADS) {
    for (let i = 0; i < ROADS.length - 1; i++) {
      const a = ROADS[i] + 10, b = ROADS[i + 1] - 10;
      for (let t = a; t < b - 1; t += 5) {
        g.box(0.35, 0.03, 2.6, r, 0, t + 1.3, C.line);
        g.box(2.6, 0.03, 0.35, t + 1.3, 0, r, C.line);
      }
    }
    for (const r2 of ROADS) {
      for (const s of [-1, 1]) {
        for (let k = -4; k <= 4; k += 1.6) {
          g.box(0.8, 0.03, 3.4, r + k, 0, r2 + s * 7.5, C.white);   // 세로 도로 위 (z 방향 진입부)
          g.box(3.4, 0.03, 0.8, r2 + s * 7.5, 0, r + k, C.white);
        }
      }
    }
  }
  const groundMesh = g.build(matGround, { cast: false });
  scene.add(groundMesh); meshes.push(groundMesh);

  /* ---------------- 블록 기본 바닥 ---------------- */
  const blockKits = [];
  for (let bx = 0; bx < 4; bx++) for (let bz = 0; bz < 4; bz++) {
    const k = new Kit(colliders);
    const cx = BC[bx], cz = BC[bz];
    k.box(50, 0.2, 50, cx, 0, cz, C.sidewalk);
    k.box(50.2, 0.06, 0.4, cx, 0.0, cz - 25, C.curb); k.box(50.2, 0.06, 0.4, cx, 0.0, cz + 25, C.curb);
    k.box(0.4, 0.06, 50.2, cx - 25, 0.0, cz, C.curb); k.box(0.4, 0.06, 50.2, cx + 25, 0.0, cz, C.curb);
    blockKits.push({ bx, bz, k, cx, cz });
  }
  const kitOf = (bx, bz) => blockKits.find(o => o.bx === bx && o.bz === bz).k;

  /* ---------------- 목적지 ---------------- */
  const destinations = {};
  for (const id of Object.keys(DEST_LAYOUT)) {
    const L = DEST_LAYOUT[id];
    const [fx, fz, ry] = FACE[L.face];
    const cx = BC[L.b[0]], cz = BC[L.b[1]];
    const ox = cx + fx * 22, oz = cz + fz * 22;
    const k = kitOf(L.b[0], L.b[1]);
    k.push(ox, oz, ry, 0.2);
    const dc = destConfig[id];
    const info = BUILDERS[dc.building](k, ctx(k, signs, lanterns, anim), dc);
    const arrive = k.toWorld(0, 0, -5);
    const signTop = k.toWorld(0, info.markerY || 18, -16);
    destinations[id] = {
      id, building: dc.building,
      arrive: new THREE.Vector3(arrive.x, 0.2, arrive.z),
      road: new THREE.Vector3(ox + fx * EDGE, 0, oz + fz * EDGE),
      facing: new THREE.Vector3(fx, 0, fz),
      rotY: ry,
      marker: signTop,
      signRef: info.sign
    };
    perimeterDecor(k, ctx(k, signs, lanterns, anim), true);
    k.pop();
    // 나머지 세 변 장식
    for (const f of Object.keys(FACE)) if (f !== L.face) { sideDecor(k, cx, cz, f, lanterns); }
  }

  /* ---------------- 일반 블록 ---------------- */
  for (const F of FILLERS) {
    const [fx, fz, ry] = FACE[F.face];
    const cx = BC[F.b[0]], cz = BC[F.b[1]];
    const k = kitOf(F.b[0], F.b[1]);
    k.push(cx + fx * 22, cz + fz * 22, ry, 0.2);
    FILLER_BUILDERS[F.type](k, ctx(k, signs, lanterns, anim));
    perimeterDecor(k, ctx(k, signs, lanterns, anim), false);
    k.pop();
    for (const f of Object.keys(FACE)) if (f !== F.face) sideDecor(k, cx, cz, f, lanterns);
  }

  for (const o of blockKits) { const m = o.k.build(matStatic); if (m) { scene.add(m); meshes.push(m); } }

  /* ---------------- 성벽 & 외곽 ---------------- */
  const w = new Kit(colliders);
  buildCityWall(w);
  buildOutskirts(w, anim);
  const wallMesh = w.build(matStatic);
  scene.add(wallMesh); meshes.push(wallMesh);
  // 경계 충돌
  colliders.push({ minX: -400, maxX: 400, minZ: -400, maxZ: -BOUND, h: 99 });
  colliders.push({ minX: -400, maxX: 400, minZ: BOUND, maxZ: 400, h: 99 });
  colliders.push({ minX: -400, maxX: -BOUND, minZ: -400, maxZ: 400, h: 99 });
  colliders.push({ minX: BOUND, maxX: 400, minZ: -400, maxZ: 400, h: 99 });

  /* ---------------- 등롱 (인스턴싱) ---------------- */
  const lanternMesh = buildLanterns(lanterns);
  scene.add(lanternMesh); meshes.push(lanternMesh);

  /* ---------------- 기차 ---------------- */
  anim.train = buildTrain();
  scene.add(anim.train);

  /* ---------------- 구름 ---------------- */
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.25, flatShading: true });
  for (let i = 0; i < 14; i++) {
    const ck = new Kit();
    const n = 3 + (i % 3);
    for (let j = 0; j < n; j++) ck.sphere(5 + Math.random() * 4, j * 6 - n * 3, Math.random() * 2, Math.random() * 4, 0xffffff, 1);
    const m = ck.build(cloudMat, { cast: false, receive: false });
    m.matrixAutoUpdate = true;
    const a = (i / 14) * Math.PI * 2;
    m.position.set(Math.cos(a) * (120 + (i % 4) * 50), 70 + (i % 5) * 8, Math.sin(a) * (120 + (i % 3) * 60));
    m.scale.set(1.2, 0.7, 1);
    scene.add(m);
    anim.clouds.push(m);
  }

  return { colliders, destinations, signs, meshes, anim, matStatic };
}

/* ======================================================================= */
/*  공용 도우미                                                            */
/* ======================================================================= */
function ctx(k, signs, lanterns, anim) {
  return {
    sign(x, y, z, w, h, text, opts = {}) {
      const p = k.toWorld(x, y, z);
      const s = { pos: p, rotY: k.frameRot + (opts.ry || 0), w, h, text, opts };
      signs.push(s); return s;
    },
    lantern(x, y, z, s = 1) { lanterns.push({ p: k.toWorld(x, y, z), s }); },
    anim
  };
}

function windowsRow(k, x0, x1, y, zFront, cols, ww, wh, color, frame = C.white) {
  const step = (x1 - x0) / cols;
  for (let i = 0; i < cols; i++) {
    const x = x0 + step * (i + 0.5);
    k.box(ww + 0.4, wh + 0.4, 0.2, x, y - 0.2, zFront + 0.05, frame);
    k.box(ww, wh, 0.25, x, y, zFront + 0.08, color);
  }
}
function sideWindows(k, zA, zB, y, xFace, cols, ww, wh, color, frame = C.white) {
  const step = (zB - zA) / cols;
  for (let i = 0; i < cols; i++) {
    const z = zA + step * (i + 0.5);
    k.box(0.2, wh + 0.4, ww + 0.4, xFace, y - 0.2, z, frame);
    k.box(0.25, wh, ww, xFace, y, z, color);
  }
}

function tree(k, x, z, type = 0, s = 1) {
  if (type === 0) {
    k.cyl(0.35 * s, 2.2 * s, x, 0, z, C.trunk, 6);
    k.sphere(1.9 * s, x, 3.4 * s, z, C.leaf, 0);
    k.sphere(1.3 * s, x + 0.9 * s, 4.3 * s, z + 0.3 * s, C.leaf2, 0);
  } else if (type === 1) {
    k.cyl(0.3 * s, 1.4 * s, x, 0, z, C.trunk, 6);
    k.cone(1.8 * s, 2.6 * s, x, 1.2 * s, z, C.leaf3, 7);
    k.cone(1.35 * s, 2.2 * s, x, 2.7 * s, z, C.leaf3, 7);
    k.cone(0.9 * s, 1.8 * s, x, 4.0 * s, z, C.leaf, 7);
  } else {
    k.cyl(0.3 * s, 2 * s, x, 0, z, C.trunk, 6);
    k.sphere(1.7 * s, x, 3.1 * s, z, C.blossom, 0);
    k.sphere(1.1 * s, x - 0.8 * s, 3.9 * s, z + 0.4 * s, 0xfbc5d8, 0);
  }
  k.collide(x, z, 1.0 * s, 1.0 * s, 5);
}
function bush(k, x, z, color = C.leaf2) { k.blob(1.1, 0.8, 1.1, x, 0.6, z, color); }
function lampPost(k, c, x, z) {
  k.cyl(0.14, 4.6, x, 0, z, C.dark, 6);
  k.box(0.9, 0.12, 0.12, x, 4.5, z, C.dark);
  k.cyl(0.3, 0.2, x, 0, z, C.dark, 6);
  c.lantern(x + 0.45, 3.9, z, 0.8);
  k.collide(x, z, 0.5, 0.5, 4.6);
}
function bench(k, x, z, ry = 0) {
  k.push(x, z, ry);
  k.box(2.4, 0.15, 0.7, 0, 0.55, 0, C.wood);
  k.box(2.4, 0.6, 0.12, 0, 0.7, -0.32, C.wood);
  k.box(0.12, 0.55, 0.6, -1, 0, 0, C.dark); k.box(0.12, 0.55, 0.6, 1, 0, 0, C.dark);
  k.collide(0, 0, 2.4, 0.8, 1);
  k.pop();
}
function flowerBed(k, x, z, w, d) {
  k.box(w, 0.5, d, x, 0, z, C.stone);
  k.box(w - 0.4, 0.15, d - 0.4, x, 0.5, z, 0x6b4f3a);
  const cols = [0xff6b6b, 0xffd166, 0xf28fb0, 0xffffff, 0xb388eb];
  for (let i = 0; i < Math.floor(w * d / 2); i++) {
    k.sphere(0.32, x + (Math.random() - 0.5) * (w - 1), 0.85, z + (Math.random() - 0.5) * (d - 1), cols[i % cols.length], 0);
  }
  k.collide(x, z, w, d, 0.6);
}
// 중국 전통 지붕 (처마 + 용마루 + 치켜올린 모서리)
function chineseRoof(k, w, d, y, x = 0, z = 0, color = C.tile, h = 3) {
  k.box(w + 1.6, 0.35, d + 1.6, x, y, z, color);
  k.hip(w + 1.2, h, d + 1.2, x, y + 0.35, z, color, 0.28);
  k.box(w * 0.42, 0.6, 0.6, x, y + 0.35 + h - 0.2, z, C.tileDark);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.cone(0.35, 1.1, x + sx * (w / 2 + 0.75), y + 0.1, z + sz * (d / 2 + 0.75), color, 4);
  }
  for (const sx of [-1, 1]) k.cone(0.3, 0.9, x + sx * w * 0.21, y + 0.35 + h + 0.2, z, C.gold, 4);
}
function redColumns(k, x0, x1, n, z, h, y = 0) {
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? x0 : x0 + (x1 - x0) * i / (n - 1);
    k.cyl(0.38, h, x, y, z, C.red, 8);
    k.cyl(0.5, 0.35, x, y, z, C.stone, 8);
  }
}

// 블록 정면(목적지/일반)의 가로수 + 가로등. 정면 중앙 통로는 비워 둠
function perimeterDecor(k, c, keepEntrance) {
  for (let x = -18; x <= 18; x += 12) {
    if (keepEntrance && Math.abs(x) < 10) continue;
    tree(k, x, -1.8, (x / 12 + 3) % 3 === 0 ? 2 : 0, 0.9);
  }
  lampPost(k, c, -13, 3.2);
  lampPost(k, c, 13, 3.2);
}
function sideDecor(k, cx, cz, f, lanterns) {
  const [fx, fz, ry] = FACE[f];
  k.push(cx + fx * 22, cz + fz * 22, ry, 0.2);
  for (const x of [-20, 20]) tree(k, x, -1.6, 1, 0.8);
  lampPost(k, { lantern: (x, y, z, s) => lanterns.push({ p: k.toWorld(x, y, z), s }) }, 0, 3.2);
  k.pop();
}

/* ======================================================================= */
/*  목적지 건물 10종 (로컬 좌표: +z = 도로 쪽, 건물은 z<0 쪽)               */
/* ======================================================================= */
function forecourt(k, w = 14, d = 10, color = C.plaza) { k.box(w, 0.04, d, 0, 0, -d / 2, color); }

const BUILDERS = {
  school(k, c, dc) {
    forecourt(k, 18, 9);
    // 운동장
    k.box(40, 0.05, 16, 0, 0, -35, 0xc96f4a);
    k.box(34, 0.06, 10, 0, 0, -35, C.grass);
    for (const sx of [-1, 1]) { k.box(0.2, 2.4, 3, sx * 16, 0, -35, C.white); k.box(0.2, 0.2, 3, sx * 16, 2.4, -35, C.white); }
    // 본관
    k.box(32, 12, 13, 0, 0, -16.5, C.cream);
    k.box(32.6, 0.8, 13.6, 0, 12, -16.5, C.dred);
    k.box(32.4, 1.2, 13.4, 0, 0, -16.5, C.brick);
    for (let f = 0; f < 3; f++) {
      windowsRow(k, -16, -5, 2.6 + f * 3.4, -10, 3, 2, 1.8, C.glass);
      windowsRow(k, 5, 16, 2.6 + f * 3.4, -10, 3, 2, 1.8, C.glass);
    }
    // 중앙 시계탑
    k.box(9, 17, 6, 0, 0, -12, 0xf8ecd2);
    k.box(9.6, 0.6, 6.6, 0, 17, -12, C.dred);
    k.pyramid(9, 4, 6.6, 0, 17.6, -12, C.red);
    k.disc(1.8, 0.4, 0, 14, -8.8, C.white); k.disc(1.4, 0.45, 0, 14, -8.75, 0xfff7e0);
    k.box(0.18, 1.2, 0.2, 0, 14, -8.5, C.dark); k.box(0.9, 0.18, 0.2, 0.4, 14, -8.5, C.dark);
    // 현관
    k.box(4.5, 4, 0.3, 0, 0, -8.9, 0x6d3b1f);
    k.box(6.5, 0.4, 3, 0, 4.4, -7.6, C.dred);
    redColumns(k, -2.8, 2.8, 2, -6.4, 4.4);
    k.collide(0, -16.5, 32, 13, 12);
    k.collide(0, -12, 9, 6, 17);
    k.collide(-2.8, -6.4, 0.8, 0.8, 4); k.collide(2.8, -6.4, 0.8, 0.8, 4);
    // 국기 게양대
    k.cyl(0.12, 9, 9, 0, -5, 0xdddddd, 6); k.box(2.6, 1.7, 0.08, 10.3, 7.1, -5, C.red);
    k.collide(9, -5, 0.4, 0.4, 9);
    c.anim.flags.push(k.toWorld(10.3, 7.9, -5));
    // 낮은 담장
    for (const sx of [-1, 1]) { k.box(10, 1.2, 0.5, sx * 15, 0, -0.5, C.brick); k.box(10.2, 0.25, 0.7, sx * 15, 1.2, -0.5, C.cream); k.collide(sx * 15, -0.5, 10, 0.6, 1.4); }
    const sign = c.sign(0, 10.3, -8.7, 6.4, 2.2, dc.zh, { sub: dc.py });
    return { sign, markerY: 25 };
  },

  hospital(k, c, dc) {
    forecourt(k, 18, 9, 0xdfe8ee);
    k.box(26, 15, 15, 0, 0, -18, C.wallW);
    k.box(26.6, 0.8, 15.6, 0, 15, -18, 0x9ec9e8);
    for (let f = 0; f < 4; f++) windowsRow(k, -12.5, 12.5, 2.5 + f * 3.2, -10.5, 6, 2.6, 1.8, C.glass2, 0xd9e6f0);
    sideWindows(k, -24, -12, 5, 13.05, 3, 2, 1.6, C.glass2);
    sideWindows(k, -24, -12, 5, -13.05, 3, 2, 1.6, C.glass2);
    // 붉은 십자가 (지붕)
    k.box(1.6, 5, 1, 0, 15.8, -18, C.red); k.box(5, 1.6, 1, 0, 17.5, -18, C.red);
    // 정문 캐노피
    k.box(10, 0.6, 5, 0, 4.2, -8, C.white);
    k.box(10.2, 0.25, 5.2, 0, 4.8, -8, C.red);
    k.cyl(0.25, 4.2, -4.6, 0, -6, C.white, 8); k.cyl(0.25, 4.2, 4.6, 0, -6, C.white, 8);
    k.box(5, 3.6, 0.3, 0, 0, -10.4, 0x7fc4e8);
    k.collide(0, -18, 26, 15, 15);
    k.collide(-4.6, -6, 0.6, 0.6, 4); k.collide(4.6, -6, 0.6, 0.6, 4);
    // 구급차
    k.push(14, -5, Math.PI / 2);
    k.box(2.2, 2, 4.8, 0, 0.5, 0, C.white); k.box(2.2, 1.2, 1.4, 0, 0.5, 3, C.white);
    k.box(2.25, 0.35, 6.2, 0, 1.4, 0.7, C.red); k.box(2.0, 0.6, 0.1, 0, 1.2, 3.72, C.glass2);
    for (const sx of [-1, 1]) for (const sz of [-1.5, 2.6]) k.add(WHEEL, C.dark, sx * 1.1, 0.5, sz, 1, 1, 1, 0, 0, Math.PI / 2);
    k.box(0.6, 0.3, 0.8, 0, 2.5, 0, 0x4da3ff);
    k.collide(0, 0.8, 2.4, 7, 2.6);
    k.pop();
    const sign = c.sign(0, 6.8, -10.3, 7, 2.2, dc.zh, { sub: dc.py, bg: '#ffffff', fg: '#d62828', border: '#d62828' });
    return { sign, markerY: 23 };
  },

  bank(k, c, dc) {
    forecourt(k, 20, 9, 0xe7e2d8);
    // 계단
    k.box(22, 0.5, 4, 0, 0, -8, C.stone); k.box(20, 0.5, 3, 0, 0.5, -8.6, 0xc9c5ba);
    k.box(22, 12, 14, 0, 0, -19, 0xd8d3c6);
    k.box(23, 1, 15, 0, 12, -19, 0xb3ad9f);
    k.box(22, 1.2, 4, 0, 9.4, -9.2, 0xcfc9bb);
    k.gable(22, 3.4, 4.2, 0, 10.6, -9.2, 0xcfc9bb);
    for (let i = 0; i < 6; i++) k.cyl(0.55, 8.4, -9 + i * 3.6, 1, -8.6, 0xf2efe6, 10);
    k.box(4, 5, 0.3, 0, 1, -11.9, 0x5a4632);
    windowsRow(k, -10, -3, 6.5, -12, 2, 1.6, 2.6, 0x4f6a85); windowsRow(k, 3, 10, 6.5, -12, 2, 1.6, 2.6, 0x4f6a85);
    // 금화 장식
    k.disc(1.6, 0.5, 0, 14.6, -12, C.gold); k.disc(1.2, 0.55, 0, 14.6, -11.95, 0xffd86b);
    k.collide(0, -19, 22, 14, 12);
    k.collide(0, -8.6, 22, 1.4, 9);
    const sign = c.sign(0, 9.95, -6.95, 7, 1.15, dc.zh + ' · ' + dc.py, { bg: '#1d3557', fg: '#f2c14e', border: '#f2c14e', h: 96 });
    return { sign, markerY: 22 };
  },

  market(k, c, dc) {
    forecourt(k, 26, 10, 0xe3e9ef);
    k.box(34, 7.5, 18, 0, 0, -20, 0xfff3e0);
    k.box(34.6, 1.2, 18.6, 0, 7.5, -20, C.orange);
    // 큰 유리 정면
    k.box(28, 4.6, 0.3, 0, 0.3, -10.9, C.glass);
    for (let i = 0; i <= 7; i++) k.box(0.3, 4.8, 0.4, -14 + i * 4, 0.2, -10.8, C.white);
    // 줄무늬 차양
    for (let i = 0; i < 14; i++) k.add(new THREE.BoxGeometry(1, 1, 1), i % 2 ? C.white : C.red, -13 + i * 2, 5.4, -9.6, 2, 0.15, 3, -0.35, 0, 0);
    // 간판대
    k.box(16, 3.2, 0.6, 0, 8.7, -11.2, C.teal);
    // 쇼핑 카트
    for (let i = 0; i < 3; i++) {
      k.box(1.2, 0.8, 1.6, 11 + i * 0.4, 0.5, -5 - i * 0.2, 0xd0d5db);
      k.cyl(0.12, 0.4, 11 + i * 0.4, 0.1, -5.6 - i * 0.2, C.dark, 6);
    }
    k.collide(12, -5.2, 2.4, 2.2, 1.4);
    // 과일 진열대
    k.box(4, 1, 1.6, -11, 0, -6.5, C.wood);
    const fr = [0xff6b6b, 0xffd166, 0x8bc34a, 0xff9f43];
    for (let i = 0; i < 12; i++) k.sphere(0.32, -12.6 + (i % 6) * 0.65, 1.2, -7 + Math.floor(i / 6) * 0.8, fr[i % 4], 0);
    k.collide(-11, -6.5, 4, 1.6, 1.4);
    k.collide(0, -20, 34, 18, 8);
    const sign = c.sign(0, 8.8, -10.85, 15, 2.8, dc.zh, { sub: dc.py, bg: '#2a9d8f', fg: '#ffffff', border: '#ffffff' });
    return { sign, markerY: 18 };
  },

  park(k, c, dc) {
    // 녹지 전체
    k.box(44, 0.06, 44, 0, 0, -22, C.grass);
    // 산책로
    k.box(4, 0.08, 30, 0, 0, -15, 0xe6d3a8);
    k.box(30, 0.08, 4, 0, 0, -26, 0xe6d3a8);
    // 패방 (牌坊)
    for (const sx of [-1, 1]) { k.cyl(0.5, 7, sx * 4.5, 0, -3, C.red, 8); k.collide(sx * 4.5, -3, 1, 1, 7); k.cyl(0.4, 5, sx * 7.5, 0, -3, C.red, 8); k.collide(sx * 7.5, -3, 0.8, 0.8, 5); }
    k.box(11, 0.8, 0.8, 0, 6.4, -3, C.red);
    k.box(17, 0.6, 0.8, 0, 4.6, -3, C.red);
    k.box(12.5, 0.4, 2.6, 0, 7.2, -3, C.jade); k.gable(12, 1.6, 2.4, 0, 7.6, -3, C.jade);
    k.box(17.5, 0.3, 2, 0, 5.2, -3, C.jade);
    for (const sx of [-1, 1]) k.cone(0.3, 1, sx * 6.6, 7.2, -3, C.jade, 4);
    // 연못
    k.cyl(7, 0.12, -10, 0, -30, 0x6fc3df, 16);
    k.cyl(7.6, 0.3, -10, 0, -30, C.stone, 16);
    k.cyl(7, 0.35, -10, 0, -30, 0x6fc3df, 16);
    k.collide(-10, -30, 11, 11, 0.4);
    // 연꽃
    for (let i = 0; i < 6; i++) { const a = i; k.cyl(0.6, 0.06, -10 + Math.cos(a) * 4, 0.36, -30 + Math.sin(a) * 3.5, C.leaf, 8); k.sphere(0.25, -10 + Math.cos(a) * 4, 0.55, -30 + Math.sin(a) * 3.5, C.pink, 0); }
    // 정자 (亭子)
    k.push(10, -30, 0);
    k.cyl(4, 0.6, 0, 0, 0, C.stone, 6);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; k.cyl(0.25, 3.6, Math.cos(a) * 3.2, 0.6, Math.sin(a) * 3.2, C.red, 6); }
    k.cyl(4.6, 0.3, 0, 4.2, 0, C.jade, 6);
    k.cone(4.4, 3, 0, 4.5, 0, C.jade, 6);
    k.sphere(0.5, 0, 7.6, 0, C.gold, 0);
    k.collide(0, 0, 7.4, 7.4, 1.2);
    k.pop();
    // 나무와 꽃
    const spots = [[-15, -10], [-18, -18], [16, -12], [18, -20], [-17, -40], [5, -40], [17, -40], [-4, -36], [12, -18], [-12, -16]];
    spots.forEach(([x, z], i) => tree(k, x, z, i % 3, 1.1));
    flowerBed(k, -8, -9, 4, 2); flowerBed(k, 8, -9, 4, 2);
    bench(k, -4, -20, Math.PI / 2); bench(k, 4, -20, -Math.PI / 2);
    for (let i = 0; i < 8; i++) bush(k, -20 + i * 5.5, -43, i % 2 ? C.leaf : C.leaf2);
    const sign = c.sign(0, 5.6, -2.55, 4.6, 1.5, dc.zh, { bg: '#1b5e3b', fg: '#ffe08a', border: '#f2c14e', h: 160, w: 480 });
    return { sign, markerY: 15 };
  },

  restaurant(k, c, dc) {
    forecourt(k, 18, 9, 0xe9d7b9);
    k.box(26, 1, 16, 0, 0, -19, C.stone);
    k.box(24, 5.5, 14, 0, 1, -19, 0xf3e3c4);
    redColumns(k, -11, 11, 6, -11.8, 5.5, 1);
    k.box(24.4, 1, 0.6, 0, 5.6, -11.8, C.red);
    for (let i = 0; i < 6; i++) k.box(2.4, 2.8, 0.3, -9.5 + i * 3.8, 2, -12.1, i === 2 || i === 3 ? 0x8b3a1e : 0xffd9a0);
    chineseRoof(k, 24, 14, 6.6, 0, -19, C.tile, 1.6);
    k.box(19, 4.5, 11, 0, 8.4, -19.5, 0xf3e3c4);
    for (let i = 0; i < 5; i++) k.box(2, 2, 0.3, -7.6 + i * 3.8, 9.6, -14.1, 0xffd9a0);
    redColumns(k, -9, 9, 4, -13.8, 4.5, 8.4);
    chineseRoof(k, 19, 11, 12.9, 0, -19.5, C.tile, 3.2);
    k.collide(0, -19, 26, 16, 13);
    for (let i = 0; i < 6; i++) c.lantern(-10 + i * 4, 4.6, -10.6, 1.1);
    // 노천 테이블
    for (const sx of [-1, 1]) {
      k.cyl(1.1, 0.12, sx * 6, 1, -5, C.wood, 10); k.cyl(0.15, 1, sx * 6, 0, -5, C.dark, 6);
      k.cyl(1.5, 0.08, sx * 6, 3.2, -5, C.red, 8); k.cyl(0.07, 3.2, sx * 6, 0, -5, C.dark, 6);
      k.collide(sx * 6, -5, 2.2, 2.2, 1.2);
    }
    const sign = c.sign(0, 7.25, -11.35, 6, 1.7, dc.zh, { bg: '#1a1a1a', fg: '#f2c14e', border: '#b3121f', h: 170 });
    return { sign, markerY: 23 };
  },

  station(k, c, dc) {
    forecourt(k, 30, 10, 0xe2e4e8);
    k.box(36, 11, 18, 0, 0, -21, 0xe8e6e1);
    k.box(36.6, 0.6, 18.6, 0, 11, -21, 0xb0b8c4);
    k.halfCyl(30, 6.5, 0, 11.4, -21, 0x8fb8de, 12);
    // 유리 아치 입구
    k.box(16, 8, 0.3, 0, 0.5, -11.9, C.glass);
    for (let i = 0; i <= 4; i++) k.box(0.4, 8.2, 0.5, -8 + i * 4, 0.4, -11.8, 0x9aa6b4);
    k.box(17, 0.6, 0.6, 0, 8.4, -11.8, 0x9aa6b4);
    // 시계탑
    k.box(6, 22, 6, -15, 0, -12.5, 0xd9d4ca);
    k.box(6.6, 0.8, 6.6, -15, 22, -12.5, C.dred);
    k.pyramid(6.6, 3.5, 6.6, -15, 22.8, -12.5, C.red);
    k.disc(2, 0.4, -15, 18.6, -9.4, C.white); k.disc(1.6, 0.45, -15, 18.6, -9.35, 0xfff7e0);
    k.box(0.2, 1.4, 0.2, -15, 18.6, -9.1, C.dark); k.box(1, 0.2, 0.2, -14.6, 18.6, -9.1, C.dark);
    k.collide(0, -21, 36, 18, 18);
    k.collide(-15, -12.5, 6, 6, 22);
    // 승강장 (뒤쪽)
    k.box(40, 1, 8, 0, 0, -38, 0xcfc8bb);
    k.box(40, 0.2, 0.5, 0, 1, -34.3, C.line);
    for (let i = 0; i < 5; i++) { k.cyl(0.2, 4, -16 + i * 8, 1, -39, C.dark, 6); }
    k.box(40, 0.4, 5, 0, 5, -39, 0x8fb8de);
    const sign = c.sign(3, 9.3, -11.4, 12, 2.4, dc.zh, { sub: dc.py, bg: '#1d3557', fg: '#ffffff', border: '#e63946' });
    return { sign, markerY: 28 };
  },

  library(k, c, dc) {
    forecourt(k, 18, 9, 0xe9dfcd);
    k.box(20, 0.6, 3.5, 0, 0, -8.3, C.stone); k.box(18, 0.6, 2.5, 0, 0.6, -9, 0xc9c5ba);
    k.box(26, 11, 15, 0, 0, -18, C.brick);
    k.box(26.6, 0.8, 15.6, 0, 11, -18, 0xe8dcc8);
    for (let i = 0; i < 4; i++) k.cyl(0.55, 9.8, -6 + i * 4, 1.2, -9.4, 0xf4efe4, 10);
    k.box(15, 1.2, 3, 0, 11, -9.2, 0xf4efe4);
    k.gable(15, 2.8, 3.4, 0, 12.2, -9.2, 0xf4efe4);
    k.box(4, 5, 0.3, 0, 1.2, -10.6, 0x5c3a21);
    for (let f = 0; f < 2; f++) { windowsRow(k, -12.5, -8, 3.2 + f * 4, -10.5, 1, 2, 2.8, C.glass, 0xf4efe4); windowsRow(k, 8, 12.5, 3.2 + f * 4, -10.5, 1, 2, 2.8, C.glass, 0xf4efe4); }
    // 책 조형물
    const bc = [0xe63946, 0x457b9d, 0xf4a261, 0x2a9d8f, 0x8d5bd6];
    for (let i = 0; i < 5; i++) k.box(5 - i * 0.4, 0.9, 3.2, 0, 11.8 + i * 0.9, -20, bc[i], i * 0.25);
    k.add(new THREE.BoxGeometry(1, 1, 1), 0xf4e8c1, 0, 16.6, -20, 0.6, 3, 4, 0, 0, 0.25);
    k.collide(0, -18, 26, 15, 11);
    k.collide(0, -8.7, 20, 2.6, 2);
    for (const sx of [-1, 1]) bench(k, sx * 9, -5, 0);
    const sign = c.sign(0, 9.4, -7.4, 9, 1.4, dc.zh + '  ' + dc.py, { bg: '#5c3a21', fg: '#ffe9a8', border: '#e8dcc8', h: 110 });
    return { sign, markerY: 25 };
  },

  shop(k, c, dc) {
    forecourt(k, 16, 9, 0xf1e1d0);
    // 상점가 3칸
    const cols = [0xffd6e0, 0xfff0b3, 0xd4f1f4];
    for (let i = -1; i <= 1; i++) {
      const x = i * 13;
      const main = i === 0;
      k.box(12, main ? 7.5 : 6.5, 12, x, 0, -16, cols[i + 1]);
      k.box(12.4, 0.6, 12.4, x, main ? 7.5 : 6.5, -16, main ? C.red : 0xc98c5a);
      if (main) chineseRoof(k, 12, 12, 8.1, x, -16, C.tile, 2.2);
      k.box(8, 3.4, 0.3, x, 0.4, -9.9, C.glass);
      k.box(2.2, 3.4, 0.32, x + 3.6, 0.2, -9.88, 0x8b5a3c);
      for (let s = 0; s < 6; s++) k.add(new THREE.BoxGeometry(1, 1, 1), s % 2 ? C.white : (main ? C.red : 0x3a86ff), x - 5 + s * 2, 4.5, -8.8, 2, 0.12, 2.4, -0.4, 0, 0);
      // 진열 상품
      for (let p = 0; p < 4; p++) k.box(0.8, 0.8 + (p % 2) * 0.5, 0.6, x - 2.6 + p * 1.6, 0.5, -10.4, [0xe63946, 0x2a9d8f, 0xf4a261, 0x8d5bd6][p]);
    }
    k.collide(0, -16, 38, 12, 8);
    // 풍선 장식
    k.cyl(0.04, 4, 6.2, 0, -6, C.dark, 4); k.sphere(0.7, 6.2, 4.6, -6, C.pink, 1); k.sphere(0.6, 6.9, 4.2, -6.2, 0xffd166, 1);
    k.collide(6.4, -6, 0.6, 0.6, 4);
    const sign = c.sign(0, 5.6, -9.6, 7, 1.9, dc.zh, { sub: dc.py, bg: '#e63946', fg: '#fff3c4', border: '#ffd166' });
    return { sign, markerY: 19 };
  },

  post(k, c, dc) {
    forecourt(k, 18, 9, 0xdfe9df);
    k.box(22, 9, 14, 0, 0, -18, 0xf2f6ef);
    k.box(22.6, 1.4, 14.6, 0, 9, -18, C.postGreen);
    k.box(22.4, 1, 14.4, 0, 0, -18, C.postGreen);
    k.box(22.8, 0.3, 14.8, 0, 10.4, -18, C.yellowTile);
    windowsRow(k, -10, -3, 4.6, -11, 2, 2, 2.4, C.glass2, C.postGreen); windowsRow(k, 3, 10, 4.6, -11, 2, 2, 2.4, C.glass2, C.postGreen);
    k.box(4, 4.6, 0.3, 0, 1, -11.05, C.postGreen);
    k.box(7, 0.4, 3.4, 0, 5, -9.5, C.postGreen);
    k.collide(0, -18, 22, 14, 10);
    // 우체통
    k.push(7.5, -3, 0);
    k.box(1.4, 2, 1.1, 0, 0.3, 0, C.postGreen); k.halfCyl(1.4, 0.55, 0, 2.3, 0, C.postGreen, 8);
    k.box(0.8, 0.12, 0.05, 0, 1.9, 0.56, C.dark); k.box(1.1, 0.35, 0.05, 0, 1.2, 0.56, C.yellowTile);
    k.box(0.5, 0.3, 0.5, 0, 0, 0, C.dark);
    k.collide(0, 0, 1.4, 1.2, 2.8);
    k.pop();
    // 편지 조형물
    k.box(4.5, 3, 0.3, 0, 11.2, -14, C.white); k.add(new THREE.BoxGeometry(1, 1, 1), C.red, -1.1, 12.7, -13.8, 2.8, 0.2, 0.1, 0, 0, -0.55); k.add(new THREE.BoxGeometry(1, 1, 1), C.red, 1.1, 12.7, -13.8, 2.8, 0.2, 0.1, 0, 0, 0.55);
    const sign = c.sign(0, 7.25, -10.75, 8, 2.1, dc.zh, { sub: dc.py, bg: '#0f8a45', fg: '#fff5c2', border: '#e0a526' });
    return { sign, markerY: 20 };
  }
};

/* ======================================================================= */
/*  일반 블록                                                              */
/* ======================================================================= */
function house(k, x, z, w, d, h, wall = C.wallW, roof = C.tile, door = C.red) {
  k.box(w, h, d, x, 0, z, wall);
  k.box(w + 0.2, 0.6, d + 0.2, x, 0, z, 0x8f8f8f);
  k.gable(w + 1.4, 2.6, d + 1.6, x, h, z, roof);
  k.box(w * 0.32, 0.5, 0.5, x, h + 2.45, z, C.tileDark);
  k.box(1.6, 2.6, 0.2, x, 0, z + d / 2 + 0.02, door);
  windowsRow(k, x - w / 2 + 0.6, x - 1.2, h * 0.5, z + d / 2, 1, 1.4, 1.2, 0xffe4a8, C.wood);
  windowsRow(k, x + 1.2, x + w / 2 - 0.6, h * 0.5, z + d / 2, 1, 1.4, 1.2, 0xffe4a8, C.wood);
  k.collide(x, z, w + 0.4, d + 0.4, h + 2);
}
function tower(k, x, z, w, d, h, color, glass = C.glass2, band = C.white) {
  k.box(w, h, d, x, 0, z, color);
  const floors = Math.floor(h / 3.2);
  for (let f = 0; f < floors; f++) {
    k.box(w + 0.1, 1.2, d + 0.1, x, 1.2 + f * 3.2, z, glass);
    if (f % 3 === 2) k.box(w + 0.4, 0.25, d + 0.4, x, 3 + f * 3.2, z, band);
  }
  k.box(w + 0.6, 0.6, d + 0.6, x, h, z, band);
  k.collide(x, z, w, d, h);
}

const FILLER_BUILDERS = {
  pagoda(k, c) {
    k.box(44, 0.05, 44, 0, 0, -22, C.plaza);
    k.cyl(9, 0.5, 0, 0, -24, C.stone, 8);
    let y = 0.5, s = 7;
    for (let i = 0; i < 6; i++) {
      const h = i === 0 ? 4 : 3;
      k.cyl(s * 0.62, h, 0, y, -24, i % 2 ? 0xf4e2bf : 0xe9d3a9, 8);
      k.cyl(s, 0.4, 0, y + h, -24, C.dred, 8);
      k.frustum(s, s * 0.45, 1.4, 0, y + h + 0.4, -24, C.tile, 8);
      for (let j = 0; j < 8; j++) { const a = j / 8 * Math.PI * 2 + Math.PI / 8; c.lantern(Math.cos(a) * s * 0.92, y + h - 0.4, -24 + Math.sin(a) * s * 0.92, 0.55); }
      y += h + 1.8; s *= 0.82;
    }
    k.cyl(0.25, 4, 0, y, -24, C.gold, 6); k.sphere(0.6, 0, y + 1.2, -24, C.gold, 0); k.sphere(0.45, 0, y + 2.4, -24, C.gold, 0);
    k.collide(0, -24, 13, 13, 30);
    // 분수 & 꽃
    for (const sx of [-1, 1]) {
      k.cyl(3, 0.8, sx * 13, 0, -8, C.stone, 12); k.cyl(2.6, 0.82, sx * 13, 0, -8, 0x7fd0ea, 12);
      k.cyl(0.4, 2.2, sx * 13, 0, -8, C.stone, 8); k.sphere(0.8, sx * 13, 2.6, -8, 0xbfe9f5, 1);
      k.collide(sx * 13, -8, 6, 6, 1);
    }
    flowerBed(k, -14, -38, 8, 3); flowerBed(k, 14, -38, 8, 3);
    for (const [x, z] of [[-18, -18], [18, -18], [-18, -30], [18, -30]]) tree(k, x, z, 2, 1.1);
    c.sign(0, 3.2, -15.5, 3.5, 1.4, '宝塔', { bg: '#7a1e14', fg: '#ffd166', border: '#f2c14e', h: 160, w: 400 });
  },
  teahouse(k, c) {
    k.box(44, 0.05, 44, 0, 0, -22, 0xe5dccb);
    // 담장
    for (const sx of [-1, 1]) { k.box(14, 3, 0.8, sx * 13, 0, -4, C.wallW); k.box(14.6, 0.5, 1.4, sx * 13, 3, -4, C.tile); k.collide(sx * 13, -4, 14, 1, 3.4); }
    k.box(0.8, 3, 30, -20, 0, -19, C.wallW); k.box(1.4, 0.5, 30.4, -20, 3, -19, C.tile); k.collide(-20, -19, 1, 30, 3.4);
    k.box(0.8, 3, 30, 20, 0, -19, C.wallW); k.box(1.4, 0.5, 30.4, 20, 3, -19, C.tile); k.collide(20, -19, 1, 30, 3.4);
    // 문
    for (const sx of [-1, 1]) { k.cyl(0.35, 4, sx * 3, 0, -4, C.red, 8); k.collide(sx * 3, -4, 0.7, 0.7, 4); }
    k.box(7.5, 0.6, 1.2, 0, 4, -4, C.red); k.gable(8, 1.4, 2.2, 0, 4.6, -4, C.tile);
    house(k, 0, -26, 14, 8, 4.5, C.wallW, C.tile, C.red);
    house(k, -12, -16, 6, 8, 3.8, 0xf3e9d6, C.tile, C.wood);
    house(k, 12, -16, 6, 8, 3.8, 0xf3e9d6, C.tile, C.wood);
    tree(k, -6, -12, 2, 1); tree(k, 6, -12, 0, 1);
    k.cyl(1.6, 0.8, 0, 0, -14, C.stone, 8); k.collide(0, -14, 2.6, 2.6, 0.8);
    for (let i = 0; i < 4; i++) c.lantern(-5 + i * 3.3, 3.2, -22, 0.8);
    c.sign(0, 5.3, -3.3, 3.2, 1.1, '茶馆', { bg: '#2b2f38', fg: '#f2c14e', border: '#a4161a', h: 150, w: 420 });
    // 뒤쪽
    for (let x = -16; x <= 16; x += 8) tree(k, x, -40, 1, 1);
  },
  apartments(k, c) {
    k.box(44, 0.05, 44, 0, 0, -22, 0xe6e2da);
    tower(k, -10, -16, 13, 12, 26, 0xf6d8b8, C.glass2, C.white);
    tower(k, 10, -28, 12, 12, 32, 0xcfe3f2, 0x6ba8d8, C.white);
    for (let f = 0; f < 6; f++) k.box(13.6, 0.3, 1.2, -10, 3 + f * 3.2 * 1.25, -9.4, C.white);
    k.box(6, 0.05, 6, 12, 0, -8, 0x9fd48a);
    k.cyl(0.1, 2.4, 10, 0, -8, C.red, 6); k.box(2.4, 0.15, 0.4, 11.2, 2.4, -8, C.red);
    k.add(new THREE.BoxGeometry(1, 1, 1), C.gold, 12, 0.8, -6.5, 0.6, 0.12, 3, 0.5, 0, 0);
    k.collide(12, -8, 3, 3, 2.4);
    bench(k, 4, -4, 0);
    for (const [x, z] of [[-18, -32], [-6, -38], [18, -12]]) tree(k, x, z, 0, 1);
  },
  apartments2(k, c) {
    k.box(44, 0.05, 44, 0, 0, -22, 0xe6e2da);
    tower(k, 8, -18, 14, 12, 22, 0xf1c6c6, C.glass2, C.white);
    tower(k, -11, -30, 12, 12, 28, 0xd9ecd0, 0x5aa9d6, C.white);
    house(k, -12, -10, 8, 6, 4, 0xfff3d6, C.tile, C.red);
    // 놀이터
    k.box(7, 0.06, 7, 10, 0, -36, 0xf4a261);
    k.box(0.3, 3, 0.3, 8, 0, -36, C.red); k.box(0.3, 3, 0.3, 12, 0, -36, C.red); k.box(4.3, 0.3, 0.3, 10, 3, -36, C.red);
    k.box(1, 0.1, 0.6, 9, 1, -36, C.blue); k.box(1, 0.1, 0.6, 11, 1, -36, C.yellowTile);
    k.collide(10, -36, 4.6, 0.8, 3);
    for (const [x, z] of [[-18, -14], [18, -30], [0, -40]]) tree(k, x, z, 2, 1);
  },
  office(k, c) {
    k.box(44, 0.05, 44, 0, 0, -22, 0xe4e7ea);
    tower(k, 0, -24, 16, 16, 40, 0x9ec5e6, 0x4c8ec9, 0xe8f1f8);
    k.box(10, 4, 4, 0, 0, -14.5, 0xe8f1f8); k.collide(0, -14.5, 10, 4, 4);
    k.cyl(0.15, 6, 0, 40.6, -24, C.dark, 6); k.sphere(0.5, 0, 46.6, -24, C.red, 0);
    house(k, -16, -8, 7, 6, 3.6, 0xf6eee0, C.tile, C.wood);
    flowerBed(k, 14, -8, 6, 3);
    for (const [x, z] of [[-17, -36], [17, -36], [17, -22]]) tree(k, x, z, 1, 1.1);
  },
  hutong(k, c) {
    k.box(44, 0.05, 44, 0, 0, -22, 0xe3d9c6);
    house(k, -13, -10, 12, 7, 4, 0xebe3d5, C.tile, C.red);
    house(k, 12, -10, 12, 7, 4, 0xebe3d5, C.tile, C.red);
    house(k, -12, -26, 14, 8, 4.2, 0xe8dfcf, C.tile, C.wood);
    house(k, 12, -26, 14, 8, 4.2, 0xe8dfcf, C.tile, C.wood);
    house(k, 0, -40, 30, 6, 4, 0xebe3d5, C.tile, C.red);
    // 꽃가게 진열
    for (let i = 0; i < 6; i++) k.cyl(0.5, 0.6, 7 + i * 1.3, 0, -5.8, 0x8b5a3c, 8).sphere(0.55, 7 + i * 1.3, 0.95, -5.8, [0xff6b6b, 0xffd166, 0xf28fb0, 0xb388eb][i % 4], 0);
    k.collide(10.3, -5.8, 8, 1.2, 1);
    c.sign(12, 3.4, -6.4, 3.4, 1.2, '花店', { bg: '#f28fb0', fg: '#ffffff', border: '#ffffff', h: 150, w: 420 });
    for (let i = 0; i < 4; i++) c.lantern(-17 + i * 3, 3.2, -6.2, 0.7);
    tree(k, 0, -18, 2, 1.1);
  }
};

/* ======================================================================= */
/*  성벽, 산, 철도                                                          */
/* ======================================================================= */
function buildCityWall(k) {
  const R = 137, H = 3.6, T = 3;
  for (const s of [-1, 1]) {
    k.box(2 * R + T, H, T, 0, 0, s * R, 0x9c8f7d);
    k.box(T, H, 2 * R, s * R, 0, 0, 0x9c8f7d);
    for (let t = -R; t <= R; t += 3) {
      k.box(1.4, 1, T, t, H, s * (R - 0.0), 0xa89a86);
      k.box(T, 1, 1.4, s * R, H, t, 0xa89a86);
    }
  }
  // 모서리 망루
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.box(9, 7, 9, sx * R, 0, sz * R, 0x9c8f7d);
    k.box(7, 4, 7, sx * R, 7, sz * R, C.red);
    chineseRoof(k, 7, 7, 11, sx * R, sz * R, C.tile, 2.6);
  }
  // 성문 누각 (남쪽, 북쪽)
  for (const s of [-1, 1]) {
    k.box(22, 6, 6, 0, 0, s * R, 0x9c8f7d);
    k.box(16, 4, 4, 0, 6, s * R, C.red);
    chineseRoof(k, 16, 5, 10, 0, s * R, C.yellowTile, 3);
  }
}
function buildOutskirts(k, anim) {
  // 계림 스타일 산
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + (i % 3) * 0.05;
    const r = 260 + (i % 5) * 28;
    const h = 50 + ((i * 37) % 60);
    k.cone(18 + (i % 4) * 6, h, Math.cos(a) * r, -1, Math.sin(a) * r, i % 2 ? 0x6fae86 : 0x82bf95, 6);
  }
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = 175 + (i % 4) * 14;
    k.blob(12, 6 + (i % 3) * 3, 12, Math.cos(a) * r, 0, Math.sin(a) * r, i % 2 ? 0x8fcc6e : 0x7dbb5d);
  }
  // 외곽 나무
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2;
    const r = 150 + (i % 3) * 7;
    tree(k, Math.cos(a) * r, Math.sin(a) * r, i % 3, 1.4);
  }
  // 철도 (북쪽 성벽 밖)
  k.box(400, 0.4, 6, 0, 0, -152, 0x9b8e7e);
  for (let x = -198; x < 200; x += 2.2) k.box(0.6, 0.2, 5, x, 0.4, -152, 0x6b4f3a);
  k.box(400, 0.25, 0.25, 0, 0.6, -153.4, 0x888888); k.box(400, 0.25, 0.25, 0, 0.6, -150.6, 0x888888);
  // 강
  k.box(600, 0.1, 30, 0, 0.05, 200, 0x6fc3df);
}

function buildTrain() {
  const k = new Kit();
  const cars = 5;
  for (let i = 0; i < cars; i++) {
    const x = -i * 13;
    k.box(12, 3.6, 3.6, x, 0.9, 0, i === 0 ? C.white : 0xf2f2f2);
    k.box(12.05, 0.8, 3.65, x, 2.2, 0, C.blue);
    for (let w = 0; w < 5; w++) k.box(1.4, 1, 3.7, x - 4.5 + w * 2.2, 2.9, 0, 0x2b3f55);
    if (i === 0) { k.box(3, 2.4, 3.6, 7, 0.9, 0, C.white); k.box(1.4, 1.2, 3.62, 7.6, 2.4, 0, 0x2b3f55); }
    for (const sx of [-4, 4]) k.box(1.4, 0.8, 3.2, x + sx, 0.3, 0, C.dark);
  }
  const m = k.build(new THREE.MeshLambertMaterial({ vertexColors: true }), { receive: false });
  m.matrixAutoUpdate = true;
  m.position.set(-200, 0.4, -152);
  return m;
}

function buildLanterns(list) {
  const g = new THREE.SphereGeometry(0.5, 8, 6); g.scale(1, 1.15, 1);
  const mat = new THREE.MeshLambertMaterial({ color: 0xe0201a, emissive: 0xc01010, emissiveIntensity: 0.45 });
  const inst = new THREE.InstancedMesh(g, mat, list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  list.forEach((l, i) => { m.compose(l.p, q, s.setScalar(l.s)); inst.setMatrixAt(i, m); });
  inst.castShadow = false;
  // 금색 캡/술
  const cap = new THREE.CylinderGeometry(0.25, 0.25, 0.14, 6);
  const capMesh = new THREE.InstancedMesh(cap, new THREE.MeshLambertMaterial({ color: 0xf2c14e }), list.length * 2);
  list.forEach((l, i) => {
    m.compose(new THREE.Vector3(l.p.x, l.p.y + 0.6 * l.s, l.p.z), q, s.setScalar(l.s)); capMesh.setMatrixAt(i * 2, m);
    m.compose(new THREE.Vector3(l.p.x, l.p.y - 0.6 * l.s, l.p.z), q, s.setScalar(l.s)); capMesh.setMatrixAt(i * 2 + 1, m);
  });
  const grp = new THREE.Group(); grp.add(inst); grp.add(capMesh);
  return grp;
}

/* 간판 메시 생성 (폰트 로딩 후 호출) */
export function buildSigns(scene, signs) {
  const out = [];
  for (const s of signs) {
    const o = s.opts || {};
    const tex = signTexture(s.text, { sub: o.sub, bg: o.bg, fg: o.fg, border: o.border, w: o.w || 512, h: o.h || 192 });
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), mat);
    plane.position.copy(s.pos);
    plane.rotation.y = s.rotY;
    plane.renderOrder = 1;
    scene.add(plane);
    out.push(plane);
  }
  return out;
}
