// 서버 없는 게임 진행 · 저장
// 기록은 학생 기기(브라우저) 안에만 저장되어 새로고침해도 이어지고,
// 제한 시간이 끝나면 자동으로 초기화됩니다.
import { DEST_IDS } from './defaults.js';

const safeGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* 저장 불가 (사생활 보호 모드 등) */ } };
const safeDel = k => { try { localStorage.removeItem(k); } catch (e) {} };

export function createSolo({ classId, messages, durationMin }) {
  const KEY = 'tlms_solo_' + classId;
  const POS = () => 'tlms_pos_' + uid + '_' + classId;
  let uid = safeGet('tlms_local_uid');
  if (!uid) { uid = 'dev_' + Math.random().toString(36).slice(2, 10); safeSet('tlms_local_uid', uid); }

  const durationSec = Math.round((durationMin || 0) * 60);
  let state = {};
  try { state = JSON.parse(safeGet(KEY) || '{}') || {}; } catch (e) { state = {}; }
  const expired = () => state.startedAt && durationSec && Date.now() - state.startedAt >= durationSec * 1000;
  // 지난 수업에서 시간이 이미 끝난 기록은 열자마자 지웁니다
  if (expired()) { state = {}; safeDel(KEY); safeDel(POS()); }
  const save = () => safeSet(KEY, JSON.stringify(state));

  const gameListeners = new Set(), playerListeners = new Set();
  const game = () => state.startedAt
    ? { status: 'running', startedAt: state.startedAt, pausedTotal: 0, durationSec, round: classId }
    : { status: 'waiting', round: classId, durationSec };
  const player = () => (state.name ? JSON.parse(JSON.stringify({ name: state.name, color: state.color || 0, collected: state.collected || {}, finishedAt: state.finishedAt || null, session: null })) : null);
  const emit = () => { const g = game(), p = player(); gameListeners.forEach(f => f(g)); playerListeners.forEach(f => f(p)); };

  const store = {
    mode: 'class',
    uid,
    serverNow: () => Date.now(),
    isConnected: true,
    onConnection(f) { f(true); return () => {}; },
    async signInStudent() { return uid; },
    async get() { return null; }
  };

  const api = {
    classId,
    onConfig(cb) { return () => {}; },
    onAudio(cb) { setTimeout(() => cb({}), 0); return () => {}; },
    onGame(cb) { gameListeners.add(cb); setTimeout(() => cb(game()), 0); return () => gameListeners.delete(cb); },
    onMyPlayer(cb) { playerListeners.add(cb); setTimeout(() => cb(player()), 0); return () => playerListeners.delete(cb); },
    async getMyPlayer() { return player(); },
    async join(name, color) {
      name = String(name).trim().slice(0, 20);
      state.name = name; state.color = color | 0;
      api.fresh = !state.startedAt;
      if (!state.startedAt) state.startedAt = Date.now();
      if (!state.collected) state.collected = {};
      save();
      emit();
      return { ok: true };
    },
    async startSession() {},
    heartbeat() {},
    setCurrent() {},
    async readSecret(id) { const i = DEST_IDS.indexOf(id); return i < 0 ? null : String(messages[i] ?? ''); },
    async collect(id, message) {
      state.collected = state.collected || {};
      state.collected[id] = { m: message, t: Date.now() };
      const done = DEST_IDS.every(d => state.collected[d]);
      if (done && !state.finishedAt) state.finishedAt = Date.now();
      save();
      emit();
      return done;
    },
    // 제한 시간 종료 → 기록 초기화
    reset() { state = {}; safeDel(KEY); safeDel(POS()); },
    record() {
      if (!state.finishedAt || !state.startedAt) return null;
      return { ms: state.finishedAt - state.startedAt, finishedAt: state.finishedAt };
    }
  };
  return { store, api };
}
