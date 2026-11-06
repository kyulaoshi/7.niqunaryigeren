// 학생용 게임 메인
import * as THREE from 'three';
import { createStore, isFirebaseConfigured } from '../store.js';
import { GameAPI } from '../api.js';
import { readCodeFromLocation, decodeClass, classIdOf, recordCheck } from '../classcode.js';
import { createSolo } from '../solo.js';
import { DEST_IDS, mergeConfig, fillTemplate, gameRemaining, gameElapsed, fmtTime } from '../defaults.js';
import { buildCity, buildSigns, heightAt } from '../world/city.js';
import { Character, OUTFITS } from '../world/character.js';
import { Chest, Marker } from '../world/chest.js';
import { Guide } from './navigation.js';
import { AudioSystem } from './audio.js';

const $ = id => document.getElementById(id);
const show = (el, on = true) => (typeof el === 'string' ? $(el) : el).classList.toggle('hidden', !on);
const SPAWN = new THREE.Vector3(6, 0.2, 8);

const S = {
  store: null, api: null, audio: new AudioSystem(),
  cfg: mergeConfig(null), game: { status: 'waiting' }, me: null,
  joined: false, name: '', outfit: 0, session: Math.random().toString(36).slice(2, 12),
  collected: {}, missionOrder: [], missionIdx: 0, mission: null,
  zone: null, busy: false, controlsOn: false, showKo: false,
  lastStatus: null, finishedShown: false, solo: false, practice: false,
  touch: (window.matchMedia && matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window) || navigator.maxTouchPoints > 0,
  gfx: null
};
try { S.gfx = localStorage.getItem('tlms_gfx'); } catch (e) {}
// 휴대폰·태블릿은 기본으로 가벼운 그래픽
if (!S.gfx) S.gfx = (S.touch && Math.min(screen.width, screen.height) < 900) ? 'low' : 'high';
document.body.classList.toggle('touch', S.touch);
window.__game = S;
S.debug = { get pState() { return pState; }, get city() { return city; }, get chests() { return chests; }, setCam(y, p, d) { cam.yaw = y; cam.pitch = p; cam.dist = d; } };

/* ====================================================================== */
/*  3D 엔진                                                               */
/* ====================================================================== */
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: S.gfx === 'high', powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, S.gfx === 'high' ? 1.5 : 1.25));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe9ff, 170, 430);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.3, 1200);
camera.position.set(40, 60, 90);

const hemi = new THREE.HemisphereLight(0xdff1ff, 0xc7b48f, 1.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 2.3);
sun.position.set(60, 90, 40);
sun.castShadow = S.gfx === 'high';
sun.shadow.mapSize.set(S.gfx === 'high' ? 2048 : 1024, S.gfx === 'high' ? 2048 : 1024);
sun.shadow.camera.left = -55; sun.shadow.camera.right = 55; sun.shadow.camera.top = 55; sun.shadow.camera.bottom = -55;
sun.shadow.camera.near = 10; sun.shadow.camera.far = 260;
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
scene.add(sun); scene.add(sun.target);

// 하늘
{
  const g = new THREE.SphereGeometry(700, 24, 12);
  const col = [], c1 = new THREE.Color(0x5fb4ff), c2 = new THREE.Color(0xd8f0ff), c3 = new THREE.Color(0xfff4e0);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 700; const c = y > 0.05 ? c2.clone().lerp(c1, Math.min(1, (y - 0.05) * 2.2)) : c3.clone().lerp(c2, Math.max(0, (y + 0.2) * 4)); col.push(c.r, c.g, c.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  scene.add(sky);
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(28, 24), new THREE.MeshBasicMaterial({ color: 0xfff6d5, fog: false }));
  sunDisc.position.set(300, 420, 200); sunDisc.lookAt(0, 0, 0); scene.add(sunDisc);
}

let city, chests = {}, markers = {}, player, collCells;
const pState = { pos: SPAWN.clone(), vel: new THREE.Vector3(), yaw: Math.PI, onGround: true, airT: 0, stepT: 0 };
const cam = { yaw: Math.PI * 0.0, pitch: 0.42, dist: 10, target: new THREE.Vector3(), pos: new THREE.Vector3(), drag: false };

function buildWorld() {
  city = buildCity(scene, S.cfg.destinations);
  // 충돌 공간 해시
  collCells = new Map();
  const CS = 16;
  city.colliders.forEach(c => {
    for (let x = Math.floor(Math.max(-200, c.minX) / CS); x <= Math.floor(Math.min(200, c.maxX) / CS); x++)
      for (let z = Math.floor(Math.max(-200, c.minZ) / CS); z <= Math.floor(Math.min(200, c.maxZ) / CS); z++) {
        const k = x + ',' + z; if (!collCells.has(k)) collCells.set(k, []); collCells.get(k).push(c);
      }
  });
  for (const id of DEST_IDS) {
    const d = city.destinations[id];
    const ch = new Chest(d.arrive, d.rotY);
    scene.add(ch.group); chests[id] = ch;
    const mk = new Marker(d.marker, S.cfg.destinations[id].icon);
    scene.add(mk.sprite); markers[id] = mk;
  }
}
function nearColliders(x, z) {
  const k = Math.floor(x / 16) + ',' + Math.floor(z / 16);
  return collCells.get(k) || [];
}

/* ====================================================================== */
/*  입력                                                                  */
/* ====================================================================== */
const keys = new Set();
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  keys.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyE') onInteract();
  if ((e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') && !$('msg-modal').classList.contains('hidden') && S.msgReady) { closeMsg(); }
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
// 카메라: 마우스 드래그 / 손가락 드래그, 두 손가락으로 확대·축소
const camPtrs = new Map();
let pinchD = 0;
canvas.addEventListener('pointerdown', e => {
  camPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { canvas.setPointerCapture(e.pointerId); } catch (er) {}
  if (camPtrs.size === 2) { const [a, b] = [...camPtrs.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); }
});
canvas.addEventListener('pointermove', e => {
  const prev = camPtrs.get(e.pointerId);
  if (!prev) return;
  if (camPtrs.size >= 2) {
    camPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const [a, b] = [...camPtrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchD) cam.dist = Math.max(5, Math.min(22, cam.dist * pinchD / Math.max(20, d)));
    pinchD = d;
    return;
  }
  const k = e.pointerType === 'touch' ? 0.009 : 0.006;
  cam.yaw -= (e.clientX - prev.x) * k;
  cam.pitch = Math.max(0.12, Math.min(1.25, cam.pitch + (e.clientY - prev.y) * (k * 0.7)));
  camPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
});
const endCam = e => { camPtrs.delete(e.pointerId); if (camPtrs.size < 2) pinchD = 0; };
canvas.addEventListener('pointerup', endCam);
canvas.addEventListener('pointercancel', endCam);

// 터치 조이스틱 + 버튼
const joy = { x: 0, y: 0, id: null };
{
  const base = $('joy'), knob = $('joy-knob');
  const R = () => base.clientWidth * 0.42;
  const setFrom = e => {
    const r = base.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const l = Math.hypot(dx, dy), m = R();
    if (l > m) { dx *= m / l; dy *= m / l; }
    joy.x = dx / m; joy.y = dy / m;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  base.addEventListener('pointerdown', e => { joy.id = e.pointerId; try { base.setPointerCapture(e.pointerId); } catch (er) {} base.classList.add('on'); setFrom(e); e.preventDefault(); });
  base.addEventListener('pointermove', e => { if (e.pointerId === joy.id) setFrom(e); });
  const end = e => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; base.classList.remove('on'); };
  base.addEventListener('pointerup', end); base.addEventListener('pointercancel', end);
  const hold = (id, code) => {
    const b = $(id);
    b.addEventListener('pointerdown', e => { keys.add(code); b.classList.add('on'); e.preventDefault(); });
    const up = () => { keys.delete(code); b.classList.remove('on'); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
  };
  hold('t-jump', 'Space');
  $('t-open').addEventListener('click', () => onInteract());
  $('prompt').addEventListener('click', () => onInteract());
  // 터치를 처음 쓰는 순간 터치 조작 표시 (터치스크린 노트북 포함)
  addEventListener('touchstart', () => { if (!S.touch) { S.touch = true; document.body.classList.add('touch'); refreshTouchTexts(); } }, { passive: true });
}
function refreshTouchTexts() {
  $('prompt').innerHTML = S.touch ? '👆 <span class="zh">打开宝箱</span> 눌러서 보물상자 열기' : '<kbd>E</kbd> <span class="zh">打开宝箱</span> 보물상자 열기';
}
refreshTouchTexts();
canvas.addEventListener('wheel', e => { cam.dist = Math.max(5, Math.min(22, cam.dist + Math.sign(e.deltaY) * 1.2)); e.preventDefault(); }, { passive: false });
canvas.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

/* ====================================================================== */
/*  물리 & 이동                                                            */
/* ====================================================================== */
const RAD = 0.7;
function resolveCollisions(p) {
  for (let iter = 0; iter < 2; iter++) {
    for (const c of nearColliders(p.x, p.z)) {
      if (p.y > c.h + 0.1) continue;
      const cx = Math.max(c.minX, Math.min(p.x, c.maxX)), cz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
      let dx = p.x - cx, dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= RAD * RAD) continue;
      if (d2 > 1e-6) { const d = Math.sqrt(d2); p.x += dx / d * (RAD - d); p.z += dz / d * (RAD - d); }
      else {
        const pen = [p.x - c.minX, c.maxX - p.x, p.z - c.minZ, c.maxZ - p.z];
        const m = Math.min(...pen), i = pen.indexOf(m);
        if (i === 0) p.x = c.minX - RAD; else if (i === 1) p.x = c.maxX + RAD; else if (i === 2) p.z = c.minZ - RAD; else p.z = c.maxZ + RAD;
      }
    }
  }
}

function updatePlayer(dt) {
  const P = pState;
  let fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  let rt = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const jm = Math.hypot(joy.x, joy.y);
  let analog = 1;
  if (jm > 0.15) { fwd = -joy.y; rt = joy.x; analog = Math.min(1, jm); }
  const canMove = S.controlsOn && !S.busy;
  const running = keys.has('ShiftLeft') || keys.has('ShiftRight') || jm > 0.92;
  let mx = 0, mz = 0;
  if (canMove && (fwd || rt)) {
    const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
    mx = -sy * fwd + cy * rt; mz = -cy * fwd - sy * rt;
    const l = Math.hypot(mx, mz); mx /= l; mz /= l;
    mx *= analog; mz *= analog;
  }
  const speed = running ? 15 : 8.5;
  const acc = P.onGround ? 12 : 4;
  P.vel.x += (mx * speed - P.vel.x) * Math.min(1, dt * acc);
  P.vel.z += (mz * speed - P.vel.z) * Math.min(1, dt * acc);
  if (canMove && keys.has('Space') && P.onGround) { P.vel.y = 9.5; P.onGround = false; S.audio.sfx('jump'); }
  P.vel.y -= 26 * dt;
  P.pos.x += P.vel.x * dt; P.pos.z += P.vel.z * dt; P.pos.y += P.vel.y * dt;
  resolveCollisions(P.pos);
  const gy = heightAt(P.pos.x, P.pos.z);
  if (P.pos.y <= gy) {
    if (!P.onGround && P.vel.y < -6) { player.land(Math.min(1.4, -P.vel.y / 12)); S.audio.sfx('land'); }
    P.pos.y = gy; P.vel.y = 0; P.onGround = true;
  } else if (P.pos.y - gy > 0.25) P.onGround = false;
  else if (P.vel.y <= 0) { P.pos.y = gy; P.vel.y = 0; P.onGround = true; }

  const hs = Math.hypot(P.vel.x, P.vel.z);
  if (hs > 0.5 && (mx || mz)) {
    const target = Math.atan2(mx, mz);
    let d = target - P.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    P.yaw += d * Math.min(1, dt * 12);
  }
  player.root.position.copy(P.pos);
  player.root.rotation.y = P.yaw;
  player.animate(dt, hs / 8.5, running && hs > 9, !P.onGround, P.vel.y, clock.elapsedTime);
  if (P.onGround && hs > 2) { P.stepT -= dt * hs; if (P.stepT < 0) { P.stepT = 5.5; S.audio.sfx('step'); } }
}

const _tmp = new THREE.Vector3();
function updateCamera(dt, lobby) {
  if (lobby) {
    const t = clock.elapsedTime * 0.05;
    camera.position.set(Math.cos(t) * 150, 85, Math.sin(t) * 150);
    camera.lookAt(0, 8, 0);
    return;
  }
  const P = pState.pos;
  cam.target.lerp(_tmp.set(P.x, P.y + 2.2, P.z), Math.min(1, dt * 10));
  const cp = Math.cos(cam.pitch);
  const dir = _tmp.set(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp);
  // 카메라 충돌: 건물에 가리면 당겨옴
  let dist = cam.dist;
  for (let s = 1.5; s < cam.dist; s += 0.5) {
    const x = cam.target.x + dir.x * s, y = cam.target.y + dir.y * s, z = cam.target.z + dir.z * s;
    let hit = false;
    for (const c of nearColliders(x, z)) if (y < c.h && x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ && c.h < 90) { hit = true; break; }
    if (hit) { dist = Math.max(2.5, s - 0.6); break; }
  }
  cam.curDist = cam.curDist === undefined ? dist : cam.curDist + (dist - cam.curDist) * Math.min(1, dt * (dist < cam.curDist ? 14 : 3));
  camera.position.set(cam.target.x + dir.x * cam.curDist, cam.target.y + dir.y * cam.curDist, cam.target.z + dir.z * cam.curDist);
  camera.lookAt(cam.target);
  // 그림자 카메라를 플레이어 주변으로
  const snap = 110 / 2048;
  const sx = Math.round(P.x / snap) * snap, sz = Math.round(P.z / snap) * snap;
  sun.position.set(sx + 60, 90, sz + 40); sun.target.position.set(sx, 0, sz); sun.target.updateMatrixWorld();
}

/* ====================================================================== */
/*  미션 & 안내                                                           */
/* ====================================================================== */
const guide = new Guide(key => sayPhrase(key));
S.audio.onSpeakState = on => $('gc-speaking').classList.toggle('on', on);
let lastGuide = { key: 'welcome' };

function phraseFor(key) {
  const p = S.cfg.phrases[key];
  if (!p) return null;
  const d = S.mission ? { ...S.cfg.destinations[S.mission] } : null;
  return { zh: fillTemplate(p.zh, d), py: fillTemplate(p.py, d), ko: fillTemplate(p.ko, d), templ: /\{/.test(p.zh) };
}
function showGuide(key, ph) {
  $('gc-zh').textContent = ph.zh; $('gc-py').textContent = ph.py; $('gc-ko').textContent = ph.ko;
  const card = document.querySelector('.guide-card');
  card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash');
  const log = $('gc-log');
  const item = document.createElement('div'); item.className = 'zh'; item.textContent = ph.zh;
  log.prepend(item); while (log.children.length > 3) log.lastChild.remove();
  if (['wrong'].includes(key)) card.classList.add('warn'); else card.classList.remove('warn');
}
function sayPhrase(key, opts = {}) {
  const ph = phraseFor(key);
  if (!ph) return Promise.resolve();
  lastGuide = { key };
  showGuide(key, ph);
  if (key === 'near') S.audio.sfx('near');
  if (key === 'wrong') S.audio.sfx('error');
  return S.audio.say(ph.zh, ph.templ ? null : key, opts);
}
function replay() {
  const ph = phraseFor(lastGuide.key);
  if (ph) S.audio.say(ph.zh, ph.templ ? null : lastGuide.key);
}

function seededOrder(seedStr) {
  let h = 2166136261; for (const ch of seedStr) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const arr = [...DEST_IDS];
  for (let i = arr.length - 1; i > 0; i--) { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; const j = h % (i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
function nextMission(skip = false) {
  const left = S.missionOrder.filter(id => !S.collected[id]);
  if (!left.length) { S.mission = null; guide.reset(null); updateMissionUI(); return; }
  let id;
  if (skip && S.mission) { const i = left.indexOf(S.mission); id = left[(i + 1) % left.length]; }
  else id = left.includes(S.mission) ? S.mission : left[0];
  setMission(id, true);
}
function setMission(id, announce) {
  S.mission = id;
  for (const k in markers) markers[k].setTarget(k === id);
  guide.reset(city.destinations[id]);
  updateMissionUI();
  S.api && S.api.setCurrent(id);
  if (announce) {
    const now = clock.elapsedTime;
    guide.holdFor(5, now);
    const q = phraseFor('ask'), m = phraseFor('mission');
    showGuide('mission', m); lastGuide = { key: 'mission' };
    S.audio.sayQueue([{ text: q.zh, key: 'ask' }, { text: m.zh, key: null }]).then(() => { guide.holdFor(0.8, clock.elapsedTime); });
  }
}
function updateMissionUI() {
  const d = S.mission ? S.cfg.destinations[S.mission] : null;
  const allDone = DEST_IDS.every(x => S.collected[x]);
  const card = document.querySelector('.mission-card');
  card.classList.toggle('done', !d && allDone);
  card.classList.toggle('ready', !d && !allDone);
  $('mc-dest').textContent = d ? d.zh : (allDone ? '任务完成！' : '？');
  $('mc-py').textContent = d ? 'Wǒ qù ' + d.py + '.' : (allDone ? '' : '准备出发…');
  $('mc-ko').textContent = d ? `나는 ${d.ko}에 가요.` : (allDone ? '모든 비밀을 찾았어요!' : '게임이 시작되면 목적지가 나와요.');
  $('hud-mission').textContent = d ? '我去' + d.zh : (allDone ? '任务完成！' : '准备中');
  $('btn-skip').disabled = !d || DEST_IDS.filter(x => !S.collected[x]).length < 2;
}

function renderCollection() {
  const list = $('cc-list'); list.innerHTML = '';
  let n = 0;
  DEST_IDS.forEach((id, i) => {
    const d = S.cfg.destinations[id], c = S.collected[id];
    if (c) n++;
    const li = document.createElement('li');
    li.className = c ? 'got' : '';
    if (id === S.mission) li.classList.add('cur');
    li.innerHTML = `<span class="ci-n">${i + 1}</span><span class="ci-place zh">${d.zh}</span><span class="ci-msg zh">${c ? escapeHtml(c.m) : '?'}</span><span class="ci-ok">${c ? '✓' : ''}</span>`;
    list.appendChild(li);
    markers[id] && markers[id].setDone(!!c);
    if (chests[id] && c && chests[id].state !== 'opened' && chests[id].state !== 'opening') chests[id].setOpened();
  });
  $('hud-count').textContent = n;
  const pct = Math.round(n * 10);
  $('cc-fill').style.width = pct + '%'; $('cc-pct').textContent = pct + '%';
}
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ====================================================================== */
/*  도착 판정 & 보물상자                                                   */
/* ====================================================================== */
const ARRIVE_R = 6.5;
function updateZones() {
  const P = pState.pos;
  let zone = null;
  for (const id of DEST_IDS) {
    const a = city.destinations[id].arrive;
    if (Math.hypot(P.x - a.x, P.z - a.z) < ARRIVE_R) { zone = id; break; }
  }
  if (zone !== S.zone) {
    if (S.zone && chests[S.zone]) chests[S.zone].setActive(false);
    S.zone = zone;
    if (zone && !S.collected[zone] && S.controlsOn) {
      chests[zone].setActive(true);
      S.audio.sfx('arrive');
      const prevMission = S.mission;
      if (zone !== S.mission) { S.mission = zone; }
      const f = phraseFor('found'), o = phraseFor('openChest');
      showGuide('found', f); lastGuide = { key: 'found' };
      S.audio.sayQueue([{ text: f.zh, key: 'found' }, { text: o.zh, key: 'openChest' }]);
      S.mission = prevMission;
    }
  }
  const showPrompt = zone && !S.collected[zone] && S.controlsOn && !S.busy;
  show('prompt', !!showPrompt);
  $('t-open').classList.toggle('ready', !!showPrompt);
  setStatus(zone ? (S.collected[zone] ? '✅ 이미 찾은 장소예요' : (S.touch ? '✨ 보물상자 발견! 「열기」를 누르세요' : '✨ 보물상자 발견! E 키를 누르세요')) : (Math.hypot(pState.vel.x, pState.vel.z) > 9 ? '🏃 달리는 중' : '🚶 탐험 중'));
}
let statusText = '';
function setStatus(t) { if (t !== statusText) { statusText = t; $('status').textContent = t; } }

async function onInteract() {
  const id = S.zone;
  if (!id || S.collected[id] || S.busy || !S.controlsOn) return;
  if (S.game.status !== 'running') return;
  S.busy = true;
  S.msgId = id;
  show('prompt', false);
  chests[id].playOpen();
  S.audio.sfx('open');
  let msg = null, err = null;
  try {
    const [m] = await Promise.all([S.api.readSecret(id), wait(900)]);
    msg = m;
    if (msg === null || msg === '') throw new Error('선생님이 이 장소의 메시지를 아직 설정하지 않았어요.');
    const already = Object.keys(S.collected);
    S.collected[id] = { m: msg, t: Date.now() };
    const finished = await S.api.collect(id, msg, already);
    S.justFinished = finished;
  } catch (e) {
    err = e; delete S.collected[id];
    console.error(e);
  }
  if (err) {
    chests[id].state = 'active'; chests[id].lid.rotation.x = 0; chests[id].inner.visible = false;
     toast('⚠️ 저장하지 못했어요. 다시 열어 보세요. (' + (err.message || err.code || '') + ')', 5000);
    S.audio.sfx('error');
    S.busy = false;
    return;
  }
  renderCollection();
  showMsg(id, msg);
}
function showMsg(id, msg) {
  const d = S.cfg.destinations[id];
  $('msg-icon').textContent = d.icon; $('msg-dest').textContent = d.zh;
  $('msg-num').textContent = '#' + (DEST_IDS.indexOf(id) + 1);
  $('msg-text').textContent = msg;
  $('msg-text').style.fontSize = msg.length > 6 ? (msg.length > 14 ? '40px' : '64px') : '120px';
  show('msg-modal', true);
  S.audio.sfx('collect');
  S.msgReady = false;
  setTimeout(() => { S.msgReady = true; }, 600);
  S.msgId = id;
}
function closeMsg() {
  if ($('msg-modal').classList.contains('hidden')) return;
  show('msg-modal', false);
  S.busy = false;
  if (S.justFinished || DEST_IDS.every(x => S.collected[x])) { S.justFinished = false; showFinish(true); }
  else if (!S.mission || S.collected[S.mission]) nextMission();
  else updateMissionUI();
  renderCollection();
}
$('msg-ok').onclick = closeMsg;

function showFinish(announce) {
  S.finishedShown = true;
  S.mission = null; guide.reset(null); updateMissionUI();
  const rec = S.me && S.me.finishedAt ? S.me.finishedAt - (S.game.startedAt || 0) - (S.game.pausedTotal || 0) : gameElapsed(S.game, S.store.serverNow());
  $('fin-time').textContent = fmtTime(rec);
  if (S.solo) {
    const r = S.api.record() || { ms: rec, finishedAt: Date.now() };
    const sec = Math.floor(r.ms / 1000);
    const d = new Date(r.finishedAt);
    const pad = n => String(n).padStart(2, '0');
    $('fin-time').textContent = fmtTime(sec * 1000);
    $('rc-name').textContent = S.name;
    $('rc-class').textContent = S.practice ? '연습 모드' : (S.cfg.settings.title || '');
    $('rc-when').textContent = `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    $('rc-tries').textContent = S.api.tries > 1 ? `${S.api.tries}번째 도전` : '첫 도전';
    $('rc-code').textContent = S.practice ? '—' : recordCheck(S.name, sec, S.api.classId);
    show('rc-box', true);
  }
  $('fin-msgs').innerHTML = DEST_IDS.map((id, i) => `<div class="fm"><span>${i + 1}. <span class="zh">${S.cfg.destinations[id].zh}</span></span><b class="zh">${escapeHtml(S.collected[id] ? S.collected[id].m : '?')}</b></div>`).join('');
  show('finish', true);
  if (announce) {
    S.audio.sfx('fanfare');
    confetti();
    const a = phraseFor('complete'), b = phraseFor('complete2');
    S.audio.sayQueue([{ text: a.zh, key: 'complete' }, { text: b.zh, key: 'complete2' }]);
  }
}
$('fin-close').onclick = () => show('finish', false);

/* ====================================================================== */
/*  UI 보조                                                               */
/* ====================================================================== */
const wait = ms => new Promise(r => setTimeout(r, ms));
let toastT;
function toast(t, ms = 3000) { const el = $('toast'); el.textContent = t; show(el, true); clearTimeout(toastT); toastT = setTimeout(() => show(el, false), ms); }
function overlay(on, emoji = '', title = '', text = '', extraHTML = '') {
  show('overlay', on);
  if (!on) return;
  $('ov-emoji').textContent = emoji; $('ov-title').innerHTML = title; $('ov-text').innerHTML = text; $('ov-extra').innerHTML = extraHTML;
}
function confetti() {
  const box = document.createElement('div'); box.className = 'confetti'; document.body.appendChild(box);
  const cols = ['#e63946', '#f2c14e', '#2bb673', '#3a86ff', '#ff8fab', '#ffffff'];
  for (let i = 0; i < 140; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + 'vw'; p.style.background = cols[i % cols.length];
    p.style.animationDelay = Math.random() * 1.2 + 's'; p.style.animationDuration = 2.4 + Math.random() * 2 + 's';
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    box.appendChild(p);
  }
  setTimeout(() => box.remove(), 6000);
}
function applyKoreanToggle() {
  const allowed = S.cfg.settings.showKorean !== false;
  show('btn-korean', allowed);
  document.body.classList.toggle('show-ko', allowed && S.showKo);
  $('btn-korean').classList.toggle('on', S.showKo);
}
$('btn-korean').onclick = () => { S.showKo = !S.showKo; localStorage.setItem('tlms_ko', S.showKo ? '1' : ''); applyKoreanToggle(); S.audio.sfx('click'); };
$('btn-replay').onclick = () => { replay(); S.audio.sfx('click'); };
$('btn-skip').onclick = () => { nextMission(true); renderCollection(); S.audio.sfx('click'); };
$('btn-settings').onclick = () => { show('settings', true); S.audio.sfx('click'); };
$('settings-close').onclick = () => show('settings', false);
for (const k of ['voice', 'music', 'sfx']) {
  const el = $('vol-' + k); el.value = S.audio.vol[k];
  el.oninput = () => S.audio.setVolume(k, +el.value);
}
$('voice-rate').oninput = () => { S.audio.rate = +$('voice-rate').value; localStorage.setItem('tlms_rate', S.audio.rate); };
$('btn-test-voice').onclick = () => { S.audio.unlock(); sayPhrase('welcome'); };
$('gfx').value = S.gfx;
$('gfx').onchange = () => { localStorage.setItem('tlms_gfx', $('gfx').value); toast('그래픽 설정을 적용하려면 페이지를 새로고침하세요 (진행 상황은 저장되어 있어요).', 5000); sun.castShadow = $('gfx').value === 'high'; };
$('opt-pinyin').checked = localStorage.getItem('tlms_py') !== '0';
$('opt-pinyin').onchange = () => { localStorage.setItem('tlms_py', $('opt-pinyin').checked ? '1' : '0'); document.body.classList.toggle('hide-py', !$('opt-pinyin').checked); };
document.body.classList.toggle('hide-py', localStorage.getItem('tlms_py') === '0');
$('btn-collect').onclick = () => { document.body.classList.toggle('show-collect'); S.audio.sfx('click'); };
$('right').addEventListener('click', () => document.body.classList.remove('show-collect'));
$('btn-fullscreen').onclick = async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch (e) { toast('이 기기에서는 전체 화면을 지원하지 않아요. (아이폰은 공유 → 홈 화면에 추가를 이용하세요)', 4000); }
  show('settings', false);
};
$('btn-restart').onclick = () => show('restart-confirm', true);
$('restart-no').onclick = () => show('restart-confirm', false);
$('restart-yes').onclick = () => { if (!S.solo) return; S.api.restart(); try { localStorage.removeItem('tlms_pos_' + S.store.uid + '_' + S.api.classId); } catch (e) {} location.reload(); };
$('btn-respawn').onclick = () => { pState.pos.copy(SPAWN); pState.vel.set(0, 0, 0); show('settings', false); guide.minLen = Infinity; };
function updateVoiceInfo() {
  const a = S.audio;
  $('voice-info').innerHTML = a.hasZhVoice ? `✅ 중국어 음성: ${a.voice.name}` : '⚠️ 이 컴퓨터에서 중국어(zh-CN) 음성을 찾지 못했어요. Chrome 또는 Edge 브라우저를 사용하세요. (선생님이 MP3를 등록하면 MP3로 재생됩니다)';
}

/* ====================================================================== */
/*  로비 & 접속                                                            */
/* ====================================================================== */
function buildLobby() {
  const box = $('outfits');
  S.outfit = +(localStorage.getItem('tlms_outfit') || 0);
  OUTFITS.forEach((o, i) => {
    const b = document.createElement('button');
    b.className = 'outfit' + (i === S.outfit ? ' sel' : '');
    b.style.setProperty('--c', '#' + o.shirt.toString(16).padStart(6, '0'));
    b.style.setProperty('--h', '#' + o.hat.toString(16).padStart(6, '0'));
    b.innerHTML = `<i class="o-hat"></i><i class="o-face"></i><i class="o-body"></i>`;
    b.title = o.name;
    b.onclick = () => { S.outfit = i; [...box.children].forEach((c, j) => c.classList.toggle('sel', j === i)); S.audio.sfx('click'); };
    box.appendChild(b);
  });
  $('name-input').value = localStorage.getItem('tlms_name') || '';
  $('join-btn').onclick = doJoin;
  $('name-input').addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });
}

async function doJoin() {
  S.audio.unlock();
  const name = $('name-input').value.trim();
  if (!name) { $('join-msg').textContent = '이름 또는 번호를 입력하세요.'; $('name-input').focus(); return; }
  $('join-btn').disabled = true; $('join-msg').textContent = '접속 중…';
  try {
    const r = await S.api.join(name, S.outfit);
    if (!r.ok) {
      $('join-btn').disabled = false;
      if (r.reason === 'taken') {
        $('join-msg').innerHTML = `‘${escapeHtml(name)}’ 은(는) 다른 컴퓨터에서 이미 사용 중이에요.<br><button id="req-btn" class="btn small">🔁 컴퓨터를 바꿨어요 (선생님께 승인 요청)</button>`;
        $('req-btn').onclick = () => requestChange(name);
      } else if (r.reason === 'closed') $('join-msg').textContent = '지금은 새로 참가할 수 없어요. 선생님께 말씀하세요.';
      else if (r.reason === 'blocked') $('join-msg').textContent = '접속이 제한되었어요. 선생님께 말씀하세요.';
      else if (r.reason === 'renamed') $('join-msg').innerHTML = `이 컴퓨터는 이미 <b>${escapeHtml(r.existingName)}</b> 이름으로 게임 중이에요. 같은 이름으로 참가하세요.`;
      S.audio.sfx('error');
      return;
    }
    localStorage.setItem('tlms_name', name); localStorage.setItem('tlms_outfit', S.outfit);
    S.name = name;
    await enterGame();
  } catch (e) {
    console.error(e);
    $('join-btn').disabled = false;
    $('join-msg').textContent = '접속 실패: ' + (e.code === 'PERMISSION_DENIED' || /permission/i.test(e.message) ? '권한 오류 (선생님이 데이터베이스 규칙을 확인해야 해요)' : (e.message || e));
  }
}

async function requestChange(name) {
  await S.api.requestDeviceChange(name);
  $('join-msg').innerHTML = '⏳ 선생님의 승인을 기다리는 중… (선생님 화면에 요청이 표시돼요)';
  const un = S.api.onNameOwner(name, async owner => {
    if (owner === S.store.uid) {
      un();
      $('join-msg').textContent = '승인되었어요!';
      const r = await S.api.join(name, S.outfit);
      if (r.ok) { localStorage.setItem('tlms_name', name); S.name = name; enterGame(); }
    }
  });
}

async function enterGame() {
  S.joined = true;
  show('lobby', false);
  show('hud', true);
  $('hud-title').textContent = S.cfg.settings.title;
  // 캐릭터
  if (player) scene.remove(player.root);
  player = new Character(S.outfit);
  scene.add(player.root);
  // 저장된 위치 복원
  try {
    const sp = JSON.parse(localStorage.getItem('tlms_pos_' + S.store.uid + (S.solo ? '_' + S.api.classId : '')) || 'null');
    if (sp && sp.round === S.game.round) { pState.pos.set(sp.x, sp.y, sp.z); pState.yaw = sp.yaw; cam.yaw = sp.cy ?? cam.yaw; }
  } catch (e) {}
  cam.yaw = pState.yaw + Math.PI;
  S.missionOrder = seededOrder(S.store.uid + (S.game.round || ''));
  await S.api.startSession(S.session);
  S.api.onMyPlayer(onMyPlayer);
  setInterval(() => S.api.heartbeat(), 45000);
  setInterval(savePos, 2000);
  S.audio.startMusic();
  updateVoiceInfo();
  if (S.solo && S.api.fresh) { S.lastStatus = 'running'; overlay(false); countdown(); }
  else applyGameStatus(true);
  if (S.touch && innerHeight > innerWidth) toast('📱 휴대폰을 가로로 돌리면 도시가 더 넓게 보여요', 4000);
}
function savePos() {
  if (!S.joined) return;
  if (S.solo) { try { localStorage.setItem('tlms_pos_' + S.store.uid + '_' + S.api.classId, JSON.stringify({ x: pState.pos.x, y: pState.pos.y, z: pState.pos.z, yaw: pState.yaw, cy: cam.yaw, round: S.game.round })); } catch (e) {} return; }
  localStorage.setItem('tlms_pos_' + S.store.uid, JSON.stringify({ x: pState.pos.x, y: pState.pos.y, z: pState.pos.z, yaw: pState.yaw, cy: cam.yaw, round: S.game.round }));
}

let hadPlayer = false;
function onMyPlayer(p) {
  if (!p || !p.name) {
    if (hadPlayer) {
      S.controlsOn = false;
      overlay(true, '🔄', '게임이 초기화되었어요', '선생님이 새 게임을 준비했어요. 다시 참가해 주세요.', '<button class="btn primary" onclick="location.reload()">다시 참가하기</button>');
      localStorage.removeItem('tlms_pos_' + S.store.uid);
    }
    return;
  }
  hadPlayer = true;
  S.me = p;
  // 서버 기준 수집 목록과 동기화
  const server = p.collected || {};
  const before = Object.keys(S.collected).length;
  const next = {};
  for (const id of DEST_IDS) if (server[id]) next[id] = { m: server[id].m, t: server[id].t };
  // 방금 연 상자(아직 서버 반영 전)는 유지
  if (S.busy && S.msgId && S.collected[S.msgId] && !next[S.msgId]) next[S.msgId] = S.collected[S.msgId];
  S.collected = next;
  renderCollection();
  if (!S.mission || S.collected[S.mission]) { if (S.controlsOn && !S.busy) nextMission(); else updateMissionUI(); }
  show('cc-approved', !!p.approved); show('fin-approved', !!p.approved);
  if (p.approved && !S.approvedToast) { S.approvedToast = true; toast('✅ 선생님이 학습지 제출을 승인했어요!', 5000); }
  if (p.blocked) { S.controlsOn = false; overlay(true, '⛔', '접속이 제한되었어요', '선생님께 말씀하세요.'); S.blockedShown = true; return; }
  else if (S.blockedShown) { S.blockedShown = false; overlay(false); applyGameStatus(); }
  if (p.session && p.session !== S.session) {
    S.controlsOn = false;
    overlay(true, '🪟', '다른 창에서 접속했어요', '같은 이름으로 다른 창(또는 탭)에서 게임이 열렸어요.<br>이 창에서 계속하려면 아래 버튼을 누르세요.', '<button class="btn primary" id="take-over">이 창에서 계속하기</button>');
    $('take-over').onclick = async () => { await S.api.startSession(S.session); overlay(false); applyGameStatus(); };
    S.sessionLost = true;
    return;
  } else if (S.sessionLost) { S.sessionLost = false; }
  if (before < 10 && Object.keys(S.collected).length === 10 && !S.finishedShown && !S.busy) showFinish(false);
}

/* ====================================================================== */
/*  게임 상태 (교사 제어)                                                  */
/* ====================================================================== */
function applyGameStatus(first = false) {
  if (!S.joined) return;
  if (S.me && (S.me.blocked || (S.me.session && S.me.session !== S.session))) return;
  const g = S.game || { status: 'waiting' };
  const remaining = gameRemaining(g, S.store.serverNow());
  const st = g.status === 'running' && remaining === 0 ? 'ended' : (g.status || 'waiting');
  const prev = S.lastStatus;
  S.lastStatus = st;
  if (st === 'waiting') {
    S.controlsOn = false;
    overlay(true, '⏳', '선생님이 게임을 시작하기를 기다리는 중…', `<span class="zh big-zh">请稍等！</span><br>${escapeHtml(S.name)} 님, 준비 완료! 선생님이 시작 버튼을 누르면 바로 출발해요.`);
  } else if (st === 'running') {
    overlay(false);
    if (prev === 'waiting' && !first) countdown();
    else if (!S.controlsOn) startPlay(first || prev !== 'paused');
  } else if (st === 'paused') {
    S.controlsOn = false;
    overlay(true, '⏸️', '잠시 멈춤 <span class="zh">暂停</span>', '선생님이 게임을 잠시 멈췄어요. 조금만 기다려 주세요.');
  } else if (st === 'ended') {
    S.controlsOn = false;
    const n = Object.keys(S.collected).length;
    if (prev !== 'ended' && prev !== null && n < 10) { const t = phraseFor('timeUp'); S.audio.say(t.zh, 'timeUp'); }
    overlay(true, '🏁', '게임 종료 <span class="zh">时间到了！</span>', `찾은 비밀 메시지: <b>${n}/10</b><br>오른쪽 목록을 보고 학습지를 완성하세요.`, '<button class="btn ghost" id="ov-close">목록 보기</button>');
    $('ov-close').onclick = () => overlay(false);
  }
}
async function countdown() {
  const el = $('countdown');
  show(el, true);
  for (const n of ['3', '2', '1']) { el.textContent = n; el.className = 'countdown pop'; void el.offsetWidth; S.audio.sfx('count'); await wait(800); }
  el.innerHTML = '<span class="zh">开始！</span>'; S.audio.sfx('go');
  await wait(700); show(el, false);
  startPlay(true);
}
function startPlay(announce) {
  S.controlsOn = true;
  if (S.lastStatus !== 'running') return;
  if (Object.keys(S.collected).length === 10) { if (!S.finishedShown) showFinish(false); return; }
  if (announce) {
    const w = phraseFor('welcome');
    showGuide('welcome', w); lastGuide = { key: 'welcome' };
    S.audio.say(w.zh, 'welcome').then(() => { if (!S.mission) nextMission(); else setMission(S.mission, true); });
    if (!S.mission) { const left = S.missionOrder.filter(id => !S.collected[id]); if (left.length) { S.mission = left[0]; updateMissionUI(); guide.reset(city.destinations[S.mission]); guide.holdFor(99, clock.elapsedTime); } }
  } else nextMission();
}

/* ====================================================================== */
/*  메인 루프                                                             */
/* ====================================================================== */
const clock = new THREE.Clock();
let fpsAcc = 0, fpsN = 0, fpsChecked = false;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  if (city) {
    // 애니메이션
    const tr = city.anim.train; tr.position.x += dt * 22; if (tr.position.x > 230) tr.position.x = -260;
    city.anim.clouds.forEach((c, i) => { c.position.x += dt * (1 + i % 3 * 0.5); if (c.position.x > 320) c.position.x = -320; });
  }
  if (S.joined && player) {
    updatePlayer(dt);
    updateZones();
    if (S.controlsOn && !S.busy && S.mission) {
      const h = new THREE.Vector3(Math.sin(pState.yaw), 0, Math.cos(pState.yaw));
      guide.update(t, dt, pState.pos, h, Math.hypot(pState.vel.x, pState.vel.z) > 1);
    }
    updateCamera(dt, false);
    // 남은 시간
    const rem = gameRemaining(S.game, S.store.serverNow());
    if (rem === null && S.solo) {
      const done = S.api.record();
      $('hud-time').textContent = fmtTime(done ? done.ms : gameElapsed(S.game, S.store.serverNow()));
      $('hud-time-label').textContent = '걸린 시간';
    } else $('hud-time').textContent = rem === null ? '∞' : fmtTime(rem);
    $('hud-time').classList.toggle('low', rem !== null && rem < 60000);
    if (rem === 0 && S.lastStatus === 'running') applyGameStatus();
  } else updateCamera(dt, true);
  for (const id in chests) chests[id].update(dt, t);
  const pp = S.joined ? pState.pos : camera.position;
  for (const id in markers) markers[id].update(t, pp);
  renderer.render(scene, camera);
  // 성능 자동 조절
  if (S.joined && !fpsChecked) {
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 8) { fpsChecked = true; const fps = fpsN / fpsAcc; if (fps < 24 && sun.castShadow) { sun.castShadow = false; toast('컴퓨터 속도에 맞춰 그림자를 껐어요.', 3000); } }
  }
}

/* ====================================================================== */
/*  시작                                                                  */
/* ====================================================================== */
function setLoad(p, msg) { $('load-fill').style.width = p + '%'; if (msg) $('load-msg').textContent = msg; }
function fatal(msg) { show('loading', false); show('fatal', true); $('fatal-msg').innerHTML = msg; }

addEventListener('error', e => { console.error('runtime error', e.error || e.message); });
addEventListener('unhandledrejection', e => { console.error('unhandled', e.reason); });

async function boot() {
  try {
    setLoad(10, '게임을 준비하는 중…');
    const code = readCodeFromLocation();
    const cls = code ? decodeClass(code) : null;
    if (code && !cls) throw new Error('수업 링크(QR)가 올바르지 않아요. 선생님께 QR을 다시 받아 주세요.');
    if (cls || !isFirebaseConfigured()) {
      // 서버 없는 수업 링크 모드 / 연습 모드
      S.solo = true; S.practice = !cls;
      const solo = createSolo({ classId: cls ? classIdOf(code) : 'practice', cls, practice: !cls });
      S.store = solo.store; S.api = solo.api;
      S.cfg = mergeConfig({ settings: { title: (cls && cls.t) || undefined, durationMin: cls ? cls.d : 0, showKorean: cls ? cls.k : true } });
    } else {
      setLoad(15, '서버에 연결하는 중…');
      S.store = await createStore();
      S.api = new GameAPI(S.store);
      await S.store.signInStudent();
      setLoad(30, '설정을 불러오는 중…');
      const cfg = await Promise.race([S.store.get('config'), wait(6000).then(() => null)]);
      S.cfg = mergeConfig(cfg);
    }
    document.body.classList.toggle('solo', S.solo);
    S.audio.rate = +(localStorage.getItem('tlms_rate') || S.cfg.settings.voiceRate || 0.85);
    $('voice-rate').value = S.audio.rate;
    setLoad(45, '중국어 글꼴을 불러오는 중…');
    try {
      const chars = Object.values(S.cfg.destinations).map(d => d.zh).join('') + '宝塔茶馆花店学校';
      await Promise.race([Promise.all([document.fonts.load(`900 64px "Noto Sans SC"`, chars), document.fonts.load('20px Jua', '가')]), wait(3500)]);
    } catch (e) {}
    setLoad(60, '도시를 짓는 중…');
    await wait(30);
    buildWorld();
    buildSigns(scene, city.signs);
    setLoad(85, '거의 다 됐어요…');
    renderer.compile(scene, camera);
    setLoad(100, '완료!');
    loop();
    // 실시간 구독
    S.api.onConfig(c => {
      S.cfg = mergeConfig(c);
      $('lobby-title').textContent = S.cfg.settings.title; $('hud-title').textContent = S.cfg.settings.title;
      $('lobby-subtitle').textContent = S.cfg.settings.subtitle || '';
      document.title = S.cfg.settings.title;
      applyKoreanToggle(); if (city) { renderCollection(); updateMissionUI(); }
    });
    S.api.onAudio(a => { S.audio.audioMap = a || {}; });
    S.api.onGame(g => {
      const oldRound = S.game && S.game.round;
      S.game = g || { status: 'waiting' };
      if (S.joined && g && g.round && oldRound && g.round !== oldRound) { S.missionOrder = seededOrder(S.store.uid + g.round); }
      applyGameStatus();
    });
    S.store.onConnection(c => show('conn-badge', !c && S.joined));
    if (S.store.mode === 'local') {
      $('mode-badge').innerHTML = '🧪 로컬 테스트 모드 · 이 컴퓨터에서만 저장되며 여러 학생 실시간 공유는 지원되지 않아요';
      show('mode-badge', true);
    }
    if (S.practice) {
      $('lobby-mode').innerHTML = '📘 <b>연습 모드</b> · 기본 비밀 메시지로 연습해요. 선생님이 만든 <b>수업 QR</b>로 들어오면 선생님의 비밀 메시지가 나와요.';
      show('lobby-mode', true);
    } else if (S.solo) {
      $('lobby-mode').innerHTML = `🏫 <b>${escapeHtml(S.cfg.settings.title)}</b> 수업에 오신 것을 환영해요!` + (S.cfg.settings.durationMin ? ` · 제한 시간 <b>${S.cfg.settings.durationMin}분</b>` : '');
      show('lobby-mode', true);
    }
    S.showKo = localStorage.getItem('tlms_ko') === '1';
    applyKoreanToggle();
    buildLobby();
    // 재접속: 이미 참가한 학생이면 바로 이어하기 안내
    const mine = await S.api.getMyPlayer();
    if (mine && mine.name) {
      $('welcome-back').innerHTML = `다시 오셨네요, <b>${escapeHtml(mine.name)}</b>! 찾은 메시지 ${Object.keys(mine.collected || {}).length}개가 저장되어 있어요.`;
      show('welcome-back', true);
      $('name-input').value = mine.name;
      S.outfit = mine.color || 0;
      [...$('outfits').children].forEach((c, j) => c.classList.toggle('sel', j === S.outfit));
      $('join-btn').innerHTML = '이어서 하기 <span class="zh">继续</span>';
    }
    show('loading', false);
    show('lobby', true);
    setTimeout(() => $('name-input').focus(), 100);
  } catch (e) {
    console.error(e);
    fatal((e.firebase ? 'Firebase 연결 오류: ' : '') + escapeHtml(e.message || String(e)) + '<br><small>인터넷 연결을 확인하거나 선생님께 알려 주세요.</small>');
  }
}
boot();
