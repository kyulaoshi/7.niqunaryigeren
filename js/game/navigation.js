// 도로 그래프 기반 길찾기 + 실제 경로에 맞춘 중국어 길 안내
import * as THREE from 'three';
import { ROADS } from '../world/city.js';

const N = ROADS.length;
const nodePos = [];
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) nodePos.push(new THREE.Vector2(ROADS[i], ROADS[j]));
const idx = (i, j) => i * N + j;
const edges = [];
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
  if (i + 1 < N) edges.push([idx(i, j), idx(i + 1, j)]);
  if (j + 1 < N) edges.push([idx(i, j), idx(i, j + 1)]);
}
const adj = nodePos.map(() => []);
edges.forEach(([a, b]) => { const d = nodePos[a].distanceTo(nodePos[b]); adj[a].push([b, d]); adj[b].push([a, d]); });

const _ab = new THREE.Vector2(), _ap = new THREE.Vector2();
export function projectToRoad(x, z) {
  let best = null;
  const p = new THREE.Vector2(x, z);
  for (let e = 0; e < edges.length; e++) {
    const A = nodePos[edges[e][0]], B = nodePos[edges[e][1]];
    _ab.subVectors(B, A); _ap.subVectors(p, A);
    const t = Math.max(0, Math.min(1, _ap.dot(_ab) / _ab.lengthSq()));
    const pt = new THREE.Vector2(A.x + _ab.x * t, A.y + _ab.y * t);
    const d = pt.distanceTo(p);
    if (!best || d < best.d) best = { e, a: edges[e][0], b: edges[e][1], t, pt, d };
  }
  return best;
}

function dijkstra(startCosts) {
  const dist = new Array(nodePos.length).fill(Infinity), prev = new Array(nodePos.length).fill(-1), done = new Array(nodePos.length).fill(false);
  for (const [n, c] of startCosts) if (c < dist[n]) dist[n] = c;
  for (;;) {
    let u = -1, best = Infinity;
    for (let i = 0; i < dist.length; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u < 0) break;
    done[u] = true;
    for (const [v, w] of adj[u]) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
  }
  return { dist, prev };
}

// 도로 위 최단 경로: [{x,z,node}] 와 총 길이
export function roadPath(from, to) {
  const pf = projectToRoad(from.x, from.z), pt = projectToRoad(to.x, to.z);
  if (pf.e === pt.e) {
    return { pts: [{ v: pf.pt, node: -1 }, { v: pt.pt, node: -1 }], len: pf.pt.distanceTo(pt.pt) };
  }
  const { dist, prev } = dijkstra([[pf.a, pf.pt.distanceTo(nodePos[pf.a])], [pf.b, pf.pt.distanceTo(nodePos[pf.b])]]);
  const ca = dist[pt.a] + nodePos[pt.a].distanceTo(pt.pt), cb = dist[pt.b] + nodePos[pt.b].distanceTo(pt.pt);
  let end = ca <= cb ? pt.a : pt.b;
  const chain = [];
  for (let n = end; n >= 0; n = prev[n]) chain.unshift(n);
  const pts = [{ v: pf.pt, node: -1 }];
  for (const n of chain) if (nodePos[n].distanceTo(pts[pts.length - 1].v) > 0.5) pts.push({ v: nodePos[n], node: n }); else pts[pts.length - 1].node = n;
  if (pt.pt.distanceTo(pts[pts.length - 1].v) > 0.5) pts.push({ v: pt.pt, node: -1 });
  let len = 0; for (let i = 1; i < pts.length; i++) len += pts[i].v.distanceTo(pts[i - 1].v);
  return { pts, len };
}

/* ------------------------------------------------------------------ */
export class Guide {
  constructor(onSay) {
    this.onSay = onSay;          // (phraseKey) => void
    this.reset(null);
  }
  reset(dest) {
    this.dest = dest;
    this.minLen = Infinity;
    this.cand = null; this.candT = 0;
    this.lastKey = null; this.lastPhrase = null;
    this.lastSayAt = -99; this.phraseAt = {};
    this.first = true;
    this.path = null;
    this.pause = 0;
  }
  holdFor(sec, now) { this.pause = Math.max(this.pause, now + sec); }

  update(now, dt, playerPos, heading, moving) {
    const D = this.dest;
    if (!D) return;
    const toArrive = Math.hypot(D.arrive.x - playerPos.x, D.arrive.z - playerPos.z);
    if (toArrive < 6.5) return; // 도착 처리는 게임 쪽에서

    const path = roadPath(playerPos, D.road);
    this.path = path;
    const total = path.len + Math.min(toArrive, 14);

    // 진행 방향 벡터 계산
    const pts = path.pts;
    let dir = null, closeMode = false;
    if (path.len < 9) { // 목적지 바로 앞: 건물 쪽으로 직접 안내
      closeMode = true;
      dir = new THREE.Vector2(D.arrive.x - playerPos.x, D.arrive.z - playerPos.z).normalize();
    } else {
      // 첫 구간: 플레이어 위치 → 다음 지점 (가까우면 그 다음)
      let k = 1;
      const pp = new THREE.Vector2(playerPos.x, playerPos.z);
      while (k < pts.length - 1 && pts[k].v.distanceTo(pp) < 4) k++;
      dir = new THREE.Vector2().subVectors(pts[k].v, pts[k - 1].v);
      if (dir.lengthSq() < 0.01) dir.subVectors(pts[k].v, pp);
      dir.normalize();
    }
    const h = new THREE.Vector2(heading.x, heading.z).normalize();
    const dot = h.dot(dir);
    const crossY = h.y * dir.x - h.x * dir.y; // >0 → 목표 방향이 왼쪽

    let key = null, phrase = null, immediate = false;

    // 잘못된 길 감지: 경로 길이가 최소값보다 크게 늘어나면
    if (total < this.minLen) this.minLen = total;
    if (total > this.minLen + 12) {
      key = 'wrong:' + Math.round(now); phrase = 'wrong'; immediate = true;
      this.minLen = total;
    } else if (dot < -0.55) {
      key = 'back'; phrase = 'back';
    } else if (dot < 0.6) {
      phrase = crossY > 0 ? 'left' : 'right';
      key = phrase + ':' + (closeMode ? 'close' : nearestNodeKey(playerPos));
    } else if (closeMode) {
      key = 'near'; phrase = 'near'; immediate = true;
    } else {
      // 다음 회전 지점 찾기
      let along = 0, turn = null;
      const pp = new THREE.Vector2(playerPos.x, playerPos.z);
      let prevPt = pp;
      for (let i = 1; i < pts.length; i++) {
        along += pts[i].v.distanceTo(prevPt);
        prevPt = pts[i].v;
        if (i < pts.length - 1) {
          const a = new THREE.Vector2().subVectors(pts[i].v, pts[i - 1].v).normalize();
          const b = new THREE.Vector2().subVectors(pts[i + 1].v, pts[i].v).normalize();
          if (a.dot(b) < 0.7) { turn = { node: pts[i].node, dist: along, left: (a.y * b.x - a.x * b.y) > 0 }; break; }
        }
      }
      if (!turn) {
        if (path.len < 20) { key = 'near'; phrase = 'near'; immediate = true; }
        else if (path.len < 46) { key = 'ahead'; phrase = 'ahead'; immediate = true; }
        else { key = 'straight:last'; phrase = this.first ? 'start' : 'straight'; }
      } else if (turn.dist < 16) {
        key = 'turn:' + turn.node; phrase = turn.left ? 'turnLeftAt' : 'turnRightAt'; immediate = true;
      } else if (turn.dist < 32 && turn.dist >= 16) {
        key = 'cross:' + turn.node; phrase = 'crossroad'; immediate = true;
      } else {
        key = 'straight:' + turn.node; phrase = this.first ? 'start' : 'straight';
      }
    }

    // 안정화: 방향 안내는 0.6초 유지되어야 말함
    if (key !== (this.cand && this.cand.key)) { this.cand = { key, phrase }; this.candT = now; }
    const stable = immediate || now - this.candT > 0.6;
    if (!stable || now < this.pause) return;

    const sinceLast = now - this.lastSayAt;
    const urgent = phrase.startsWith('turn') || phrase === 'wrong';
    if (sinceLast < (urgent ? 1.0 : 2.4)) return;
    const samePhraseRecently = this.phraseAt[phrase] && now - this.phraseAt[phrase] < 6;
    let speak = false;
    if (key !== this.lastKey && !samePhraseRecently) speak = true;
    else if (key === this.lastKey && sinceLast > (phrase.startsWith('straight') || phrase === 'start' ? 22 : 16)) speak = true;
    // 교차로 안내 이후 '직진' 은 굳이 반복하지 않음
    if (phrase === 'crossroad' && this.lastPhrase && this.lastPhrase.startsWith('turn') && key === this.lastKey) speak = false;
    // "到了路口，往左拐" 직후 같은 방향의 "请往左拐" 는 생략
    if ((phrase === 'left' && this.lastPhrase === 'turnLeftAt') || (phrase === 'right' && this.lastPhrase === 'turnRightAt')) {
      if (sinceLast < 9) speak = false;
    }
    if (!speak) return;

    this.lastKey = key; this.lastPhrase = phrase; this.lastSayAt = now; this.phraseAt[phrase] = now;
    this.first = false;
    this.onSay(phrase);
  }
}

function nearestNodeKey(p) {
  let best = 0, bd = Infinity;
  nodePos.forEach((n, i) => { const d = (n.x - p.x) ** 2 + (n.y - p.z) ** 2; if (d < bd) { bd = d; best = i; } });
  return best;
}
