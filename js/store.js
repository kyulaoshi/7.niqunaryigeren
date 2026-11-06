// 데이터 저장소 어댑터
//  - Firebase Realtime Database (실제 수업용: 여러 학생 실시간 공유)
//  - 로컬 테스트 모드 (Firebase 설정이 비어 있을 때: 이 브라우저 안에서만 저장)
// 두 모드 모두 같은 함수(get/set/update/remove/on)를 제공하므로 게임 코드는 동일합니다.

import { FIREBASE_CONFIG, ADMIN_EMAIL } from './firebase-config.js';

const FB_VER = '10.12.2';
export const TS = { '.sv': 'timestamp' }; // 서버 시각 표시자

export function isFirebaseConfigured() {
  return !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.databaseURL);
}

export async function createStore() {
  if (isFirebaseConfigured()) {
    try { return await createFirebaseStore(); }
    catch (e) {
      console.error('Firebase init failed', e);
      const err = new Error('Firebase 연결에 실패했습니다: ' + (e.message || e));
      err.firebase = true;
      throw err;
    }
  }
  return createLocalStore();
}

/* ------------------------------------------------------------------ */
/*  Firebase                                                           */
/* ------------------------------------------------------------------ */
async function createFirebaseStore() {
  const base = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
  const [appM, authM, dbM] = await Promise.all([
    import(base + 'firebase-app.js'),
    import(base + 'firebase-auth.js'),
    import(base + 'firebase-database.js')
  ]);
  const app = appM.initializeApp(FIREBASE_CONFIG);
  const auth = authM.getAuth(app);
  const db = dbM.getDatabase(app);
  let offset = 0;
  dbM.onValue(dbM.ref(db, '.info/serverTimeOffset'), s => { offset = s.val() || 0; });
  let connected = true;
  const connListeners = new Set();
  dbM.onValue(dbM.ref(db, '.info/connected'), s => { connected = !!s.val(); connListeners.forEach(f => f(connected)); });

  const conv = v => {
    if (v && typeof v === 'object' && v['.sv'] === 'timestamp') return dbM.serverTimestamp();
    if (v && typeof v === 'object' && !Array.isArray(v)) { const o = {}; for (const k in v) o[k] = conv(v[k]); return o; }
    return v;
  };

  const store = {
    mode: 'firebase',
    uid: null,
    email: null,
    serverNow: () => Date.now() + offset,
    get isConnected() { return connected; },
    onConnection(f) { connListeners.add(f); f(connected); return () => connListeners.delete(f); },
    async get(path) { const s = await dbM.get(dbM.ref(db, path)); return s.val(); },
    set(path, val) { return dbM.set(dbM.ref(db, path), conv(val)); },
    update(path, obj) { const o = {}; for (const k in obj) o[k] = conv(obj[k]); return dbM.update(dbM.ref(db, path || '/'), o); },
    remove(path) { return dbM.remove(dbM.ref(db, path)); },
    on(path, cb, onErr) { return dbM.onValue(dbM.ref(db, path), s => cb(s.val()), e => { console.warn('listen error', path, e); onErr && onErr(e); }); },
    onDisconnectSet(path, val) { return dbM.onDisconnect(dbM.ref(db, path)).set(conv(val)); },
    async signInStudent() {
      await authM.setPersistence(auth, authM.browserLocalPersistence);
      if (auth.currentUser) { store.uid = auth.currentUser.uid; return store.uid; }
      await new Promise(res => { const un = authM.onAuthStateChanged(auth, () => { un(); res(); }); });
      if (!auth.currentUser || !auth.currentUser.isAnonymous) {
        if (!auth.currentUser) await authM.signInAnonymously(auth);
      }
      store.uid = auth.currentUser.uid;
      return store.uid;
    },
    async signInTeacher(email, pw) {
      const c = await authM.signInWithEmailAndPassword(auth, email, pw);
      store.uid = c.user.uid; store.email = c.user.email;
      if (ADMIN_EMAIL && c.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        await authM.signOut(auth);
        throw new Error('관리자 이메일이 아닙니다. firebase-config.js 의 ADMIN_EMAIL 을 확인하세요.');
      }
      return c.user;
    },
    async currentTeacher() {
      await new Promise(res => { const un = authM.onAuthStateChanged(auth, () => { un(); res(); }); });
      const u = auth.currentUser;
      if (u && !u.isAnonymous && u.email && (!ADMIN_EMAIL || u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase())) { store.uid = u.uid; store.email = u.email; return u; }
      return null;
    },
    async signOut() { await authM.signOut(auth); },
    adminEmail: ADMIN_EMAIL
  };
  return store;
}

/* ------------------------------------------------------------------ */
/*  로컬 테스트 모드 (localStorage + 탭 간 실시간 동기화)                */
/* ------------------------------------------------------------------ */
function createLocalStore() {
  const KEY = 'tlms_localdb_v1';
  let data = {};
  const load = () => { try { data = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { data = {}; } };
  load();
  const listeners = new Set();
  let bc = null;
  try { bc = new BroadcastChannel('tlms_localdb'); } catch (e) { /* ignore */ }

  const split = p => String(p || '').split('/').filter(Boolean);
  const getAt = (path) => { let cur = data; for (const k of split(path)) { if (cur == null || typeof cur !== 'object') return null; cur = cur[k]; } return cur === undefined ? null : cur; };
  const resolve = v => {
    if (v && typeof v === 'object' && v['.sv'] === 'timestamp') return Date.now();
    if (v && typeof v === 'object' && !Array.isArray(v)) { const o = {}; for (const k in v) { const r = resolve(v[k]); if (r !== null && r !== undefined) o[k] = r; } return Object.keys(o).length ? o : null; }
    return v;
  };
  const setAt = (path, val) => {
    const keys = split(path);
    val = resolve(val);
    if (!keys.length) { data = val || {}; return; }
    let cur = data;
    for (let i = 0; i < keys.length - 1; i++) {
      if (cur[keys[i]] == null || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {};
      cur = cur[keys[i]];
    }
    const last = keys[keys.length - 1];
    if (val === null || val === undefined) delete cur[last]; else cur[last] = val;
    prune(data);
  };
  const prune = o => { for (const k in o) { if (o[k] && typeof o[k] === 'object') { prune(o[k]); if (!Object.keys(o[k]).length) delete o[k]; } } };
  const persist = () => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (e) { console.error('local save failed', e); alert('브라우저 저장 공간이 부족합니다. 큰 음성 파일을 줄여 주세요.'); }
    if (bc) bc.postMessage('changed');
    notify();
  };
  const notify = () => {
    for (const l of listeners) {
      const v = getAt(l.path);
      const s = JSON.stringify(v);
      if (s !== l.last) { l.last = s; try { l.cb(v === undefined ? null : JSON.parse(s)); } catch (e) { console.error(e); } }
    }
  };
  const external = () => { load(); notify(); };
  if (bc) bc.onmessage = external;
  window.addEventListener('storage', e => { if (e.key === KEY) external(); });

  let uid = localStorage.getItem('tlms_local_uid');
  if (!uid) { uid = 'local_' + Math.random().toString(36).slice(2, 10); localStorage.setItem('tlms_local_uid', uid); }

  return {
    mode: 'local',
    uid,
    email: null,
    serverNow: () => Date.now(),
    isConnected: true,
    onConnection(f) { f(true); return () => {}; },
    async get(path) { load(); const v = getAt(path); return v == null ? null : JSON.parse(JSON.stringify(v)); },
    async set(path, val) { load(); setAt(path, val); persist(); },
    async update(path, obj) { load(); for (const k in obj) setAt((path ? path + '/' : '') + k, obj[k]); persist(); },
    async remove(path) { load(); setAt(path, null); persist(); },
    on(path, cb) {
      const l = { path, cb, last: undefined };
      listeners.add(l);
      setTimeout(() => { const v = getAt(path); l.last = JSON.stringify(v); cb(v == null ? null : JSON.parse(JSON.stringify(v))); }, 0);
      return () => listeners.delete(l);
    },
    onDisconnectSet(path, val) {
      window.addEventListener('pagehide', () => { load(); setAt(path, val); try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} if (bc) bc.postMessage('changed'); });
      return Promise.resolve();
    },
    async signInStudent() { return uid; },
    async signInTeacher() { return { email: 'local' }; },
    async currentTeacher() { return { email: 'local' }; },
    async signOut() {},
    adminEmail: 'local'
  };
}
