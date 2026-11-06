// 수업 코드: 선생님이 정한 비밀 메시지와 설정을 링크(QR) 안에 담습니다.
// 서버가 필요 없어서 비용 0원 · 접속 제한이 없습니다.
// (메시지는 눈에 바로 보이지 않게 섞어 두지만, 완벽한 암호는 아닙니다)

const KEY = 'xun-zhao-lao-shi-de-mi-mi-2026';
const SALT = 'tlms-record-v1';

function utf8(s) { return new TextEncoder().encode(s); }
function unutf8(b) { return new TextDecoder().decode(b); }
function xor(bytes) {
  const k = utf8(KEY);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ k[i % k.length] ^ ((i * 31) & 255);
  return out;
}
function b64url(bytes) {
  let s = '';
  bytes.forEach(b => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function hashStr(str) {
  let h1 = 0x811c9dc5, h2 = 0x1b873593;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822507) ^ (h2 >>> 13);
  }
  return ((h1 >>> 0).toString(36) + (h2 >>> 0).toString(36));
}

// payload: { t: 제목, m: [메시지 10개], d: 제한시간(분, 0=없음), k: 한국어 뜻 허용(1/0) }
export function encodeClass(payload) {
  const json = JSON.stringify({ v: 1, t: payload.t || '', m: payload.m.map(x => String(x || '').trim()), d: +payload.d || 0, k: payload.k ? 1 : 0 });
  return '1' + b64url(xor(utf8(json)));
}

export function decodeClass(code) {
  try {
    if (!code || code[0] !== '1') return null;
    const p = JSON.parse(unutf8(xor(unb64url(code.slice(1)))));
    if (!p || !Array.isArray(p.m) || p.m.length !== 10) return null;
    return { t: String(p.t || ''), m: p.m.map(x => String(x ?? '')), d: Math.max(0, Math.min(180, +p.d || 0)), k: p.k !== 0 };
  } catch (e) { return null; }
}

export function classIdOf(code) { return hashStr(code).slice(0, 10); }

// 주소에서 수업 코드 읽기 (#c=… 또는 ?c=…)
export function readCodeFromLocation(loc = location) {
  const h = (loc.hash || '').replace(/^#/, '');
  const fromHash = new URLSearchParams(h).get('c');
  if (fromHash) return fromHash;
  return new URLSearchParams(loc.search || '').get('c');
}

export function classLink(code, base) {
  const u = new URL(base || location.href);
  u.search = ''; u.hash = 'c=' + code;
  u.pathname = u.pathname.replace(/[^/]*$/, '');
  return u.href;
}

// 기록 확인 코드 (학생이 기록 카드를 꾸며 냈는지 선생님이 확인하는 용도)
export function recordCheck(name, recordSec, classId) {
  const n = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const h = hashStr(n + '|' + Math.floor(recordSec) + '|' + classId + '|' + SALT).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return h.replace(/[01OI]/g, 'X').slice(0, 5);
}
