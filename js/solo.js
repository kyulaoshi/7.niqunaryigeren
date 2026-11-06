// 서버 없는 「수업 링크(QR)」 모드 / 연습 모드
// 기록은 학생 기기(브라우저) 안에만 저장되어 새로고침해도 이어집니다.
import { DEST_IDS, DEFAULT_SECRETS } from './defaults.js';

const safeGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* 저장 불가 (사생활 보호 모드 등) */ } };

export function createSolo({ classId, cls, practice }) {
  const KEY = 'tlms_solo_' + classId;
  let uid = safeGet('tlms_local_uid');
  if (!uid) { uid = 'dev_' + Math.random().toString(36).slice(2, 10); safeSet('tlms_local_uid', uid); }

  let state = {};
  try { state = JSON.parse(safeGet(KEY) || '{}') || {}; } catch (e) { state = {}; }
  const save = () => safeSet(KEY, JSON.stringify(state));
  const messages = practice ? DEST_IDS.map(id => DEFAULT_SECRETS[id]) : cls.m;
  const durationSec = Math.round((cls ? cls.d : 0) * 60);

  const gameListeners = new Set(), playerListeners = new Set();
  const game = () => state.startedAt
    ? { status: 'running', startedAt: state.startedAt, pausedTotal: 0, durationSec, round: classId }
    : { status: 'waiting', round: classId, durationSec };
  const player = () => (state.name ? JSON.parse(JSON.stringify({ name: state.name, color: state.color || 0, collected: state.collected || {}, finishedAt: state.finishedAt || null, session: null })) : null);
  const emit = () => { const g = game(), p = player(); gameListeners.forEach(f => f(g)); playerListeners.forEach(f => f(p)); };

  const store = {
    mode: practice ? 'practice' : 'class',
    uid,
    serverNow: () => Date.now(),
    isConnected: true,
    onConnection(f) { f(true); return () => {}; },
    async signInStudent() { return uid; },
    async get() { return null; }
  };

  const api = {
    classId,
    messages,
    onConfig(cb) {
      setTimeout(() => cb({ settings: { title: (cls && cls.t) || undefined, durationMin: cls ? cls.d : 0, showKorean: cls ? cls.k : true } }), 0);
      return () => {};
    },
    onAudio(cb) { setTimeout(() => cb({}), 0); return () => {}; },
    onGame(cb) { gameListeners.add(cb); setTimeout(() => cb(game()), 0); return () => gameListeners.delete(cb); },
    onMyPlayer(cb) { playerListeners.add(cb); setTimeout(() => cb(player()), 0); return () => playerListeners.delete(cb); },
    async getMyPlayer() { return player(); },
    async join(name, color) {
      name = String(name).trim().slice(0, 20);
      const n = state.collected ? Object.keys(state.collected).length : 0;
      if (state.name && state.name !== name && n > 0) return { ok: false, reason: 'renamed', existingName: state.name };
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
    // 처음부터 다시 하기 (도전 횟수는 기록 카드에 표시)
    restart() {
      const tries = (state.tries || 1) + 1;
      state = { name: state.name, color: state.color, tries };
      save();
    },
    get tries() { return state.tries || 1; },
    record() {
      if (!state.finishedAt || !state.startedAt) return null;
      return { ms: state.finishedAt - state.startedAt, finishedAt: state.finishedAt };
    }
  };
  return { store, api };
}
