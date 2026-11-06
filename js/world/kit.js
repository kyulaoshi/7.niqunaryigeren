// 로우폴리 지오메트리 키트: 여러 도형을 하나의 메시로 합쳐 그리기 호출을 최소화합니다.
import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/BufferGeometryUtils.js';

const BASE = {
  box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  cyl: (seg) => new THREE.CylinderGeometry(1, 1, 1, seg).translate(0, 0.5, 0),
  frustum: (top, seg) => new THREE.CylinderGeometry(top, 1, 1, seg).translate(0, 0.5, 0),
  pyramid: (() => { const g = new THREE.ConeGeometry(1, 1, 4); g.rotateY(Math.PI / 4); g.translate(0, 0.5, 0); return g; })(),
  hip: (top) => { const g = new THREE.CylinderGeometry(top, 1, 1, 4); g.rotateY(Math.PI / 4); g.translate(0, 0.5, 0); return g; },
  cone: (seg) => new THREE.ConeGeometry(1, 1, seg).translate(0, 0.5, 0),
  ico: (detail) => new THREE.IcosahedronGeometry(1, detail),
  dodeca: new THREE.DodecahedronGeometry(1, 0),
  gable: (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 3); g.rotateZ(Math.PI / 2); g.rotateX(-Math.PI / 2); g.translate(0, 0.5, 0); return g; })(),
  halfCyl: (seg) => { const g = new THREE.CylinderGeometry(1, 1, 1, seg, 1, false, 0, Math.PI); g.rotateZ(Math.PI / 2); return g; },
  disc: (seg) => new THREE.CylinderGeometry(1, 1, 1, seg).rotateX(Math.PI / 2)
};
const cache = new Map();
function base(name, ...args) {
  const k = name + ':' + args.join(',');
  if (!cache.has(k)) { const b = BASE[name]; cache.set(k, typeof b === 'function' ? b(...args) : b); }
  return cache.get(k);
}

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();

export class Kit {
  constructor(colliders) {
    this.parts = [];
    this.frame = new THREE.Matrix4();
    this.frameRot = 0;
    this.stack = [];
    this.colliders = colliders || [];
  }
  push(x, z, ry = 0, y = 0) {
    this.stack.push([this.frame.clone(), this.frameRot]);
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(1, 1, 1));
    this.frame = this.frame.clone().multiply(_m);
    this.frameRot += ry;
  }
  pop() { [this.frame, this.frameRot] = this.stack.pop(); }

  // 로컬 좌표 → 월드 좌표
  toWorld(x, y, z) { return new THREE.Vector3(x, y, z).applyMatrix4(this.frame); }

  add(geo, color, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(this.frame, _m));
    g.computeVertexNormals();
    const n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    _c.set(color);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(g);
    return this;
  }

  // y = 바닥 높이
  box(w, h, d, x, y, z, color, ry = 0) { return this.add(base('box'), color, x, y, z, w, h, d, 0, ry, 0); }
  cyl(r, h, x, y, z, color, seg = 8) { return this.add(base('cyl', seg), color, x, y, z, r, h, r); }
  frustum(rBot, rTop, h, x, y, z, color, seg = 8) { return this.add(base('frustum', rTop / rBot, seg), color, x, y, z, rBot, h, rBot); }
  cone(r, h, x, y, z, color, seg = 6) { return this.add(base('cone', seg), color, x, y, z, r, h, r); }
  pyramid(w, h, d, x, y, z, color) { return this.add(base('pyramid'), color, x, y, z, w / Math.SQRT2, h, d / Math.SQRT2); }
  hip(w, h, d, x, y, z, color, top = 0.45) { return this.add(base('hip', top), color, x, y, z, w / Math.SQRT2, h, d / Math.SQRT2); }
  gable(len, h, d, x, y, z, color, ry = 0) { return this.add(base('gable'), color, x, y, z, len, h / 1.5, d / 1.732, 0, ry, 0); }
  sphere(r, x, y, z, color, detail = 0) { return this.add(base('ico', detail), color, x, y, z, r, r, r); }
  blob(rx, ry, rz, x, y, z, color) { return this.add(base('dodeca'), color, x, y, z, rx, ry, rz); }
  halfCyl(len, r, x, y, z, color, seg = 10) { return this.add(base('halfCyl', seg), color, x, y, z, len, r, r); }
  disc(r, t, x, y, z, color, seg = 16) { return this.add(base('disc', seg), color, x, y, z, r, r, t); }

  // 충돌 박스 (로컬 좌표, 90도 단위 회전만 지원)
  collide(x, z, w, d, h = 10) {
    const c = this.toWorld(x, 0, z);
    const rot = Math.round(this.frameRot / (Math.PI / 2)) & 1;
    const W = rot ? d : w, D = rot ? w : d;
    this.colliders.push({ minX: c.x - W / 2, maxX: c.x + W / 2, minZ: c.z - D / 2, maxZ: c.z + D / 2, h });
  }

  build(material, opts = {}) {
    if (!this.parts.length) return null;
    const g = mergeGeometries(this.parts, false);
    this.parts.forEach(p => p.dispose());
    this.parts = [];
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, material);
    mesh.castShadow = opts.cast !== false;
    mesh.receiveShadow = opts.receive !== false;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
}

/* ---------- 텍스트/아이콘 텍스처 ---------- */
export const ZH_FONT = '"Noto Sans SC","Microsoft YaHei","PingFang SC","Noto Sans CJK SC","Noto Sans CJK TC","SimHei",sans-serif';

export function signTexture(text, { sub = '', bg = '#b3121f', fg = '#ffe9a8', border = '#f2c14e', w = 512, h = 192, font = ZH_FONT, vertical = false } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = border; roundRect(g, 0, 0, w, h, 26); g.fill();
  g.fillStyle = bg; roundRect(g, 10, 10, w - 20, h - 20, 18); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 3; roundRect(g, 20, 20, w - 40, h - 40, 12); g.stroke();
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (vertical) {
    const chars = [...text]; const fs = Math.min(w * 0.62, (h - 60) / chars.length);
    g.font = `900 ${fs}px ${font}`;
    chars.forEach((ch, i) => g.fillText(ch, w / 2, 30 + fs * (i + 0.5)));
  } else {
    const main = sub ? h * 0.5 : h * 0.6;
    g.font = `900 ${main}px ${font}`;
    let fsz = main;
    while (g.measureText(text).width > w - 60 && fsz > 20) { fsz -= 4; g.font = `900 ${fsz}px ${font}`; }
    g.fillText(text, w / 2, sub ? h * 0.42 : h * 0.53);
    if (sub) { g.font = `600 ${h * 0.17}px "Nunito","Segoe UI",sans-serif`; g.globalAlpha = 0.9; g.fillText(sub, w / 2, h * 0.8); }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function iconTexture(emoji, { ring = '#ffffff', fill = '#e63946', check = false, size = 256 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const c = size / 2;
  g.beginPath(); g.arc(c, c * 0.92, c * 0.78, 0, Math.PI * 2);
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fill();
  g.beginPath(); g.arc(c, c * 0.86, c * 0.78, 0, Math.PI * 2);
  g.fillStyle = ring; g.fill();
  g.beginPath(); g.arc(c, c * 0.86, c * 0.66, 0, Math.PI * 2);
  g.fillStyle = check ? '#2bb673' : fill; g.fill();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (check) { g.fillStyle = '#fff'; g.font = `900 ${size * 0.5}px sans-serif`; g.fillText('✓', c, c * 0.9); }
  else { g.font = `${size * 0.52}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`; g.fillText(emoji, c, c * 0.9); }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function glowTexture(inner = 'rgba(255,240,170,1)', outer = 'rgba(255,200,60,0)') {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(0.35, 'rgba(255,220,120,0.55)'); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
