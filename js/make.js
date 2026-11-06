// 수업 QR 만들기 (서버 없음)
import qrcode from '../vendor/qrcode.mjs';
import { DEST_IDS, DEFAULT_DESTINATIONS, DEFAULT_SECRETS, DEFAULT_SETTINGS, fmtTime } from './defaults.js';
import { encodeClass, decodeClass, classIdOf, classLink, recordCheck } from './classcode.js';

const $ = id => document.getElementById(id);
const show = (id, on = true) => $(id).classList.toggle('hidden', !on);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let toastT;
const toast = (t, ms = 2500) => { $('toast').textContent = t; show('toast', true); clearTimeout(toastT); toastT = setTimeout(() => show('toast', false), ms); };
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

let current = null; // {code, cls, link, id}

/* ---------- 입력 ---------- */
$('sec-list').innerHTML = DEST_IDS.map((id, i) => {
  const d = DEFAULT_DESTINATIONS[id];
  return `<div class="sec-row"><span class="ic">${d.icon}</span><label class="nm" for="m-${id}"><span class="zh">${i + 1}. ${d.zh}</span><small>${d.ko}</small></label><input id="m-${id}" maxlength="30" autocomplete="off"></div>`;
}).join('');
const inputs = DEST_IDS.map(id => $('m-' + id));
const preview = () => { $('sec-preview').textContent = inputs.map(i => i.value.trim() || '□').join(' '); };
inputs.forEach(i => i.addEventListener('input', preview));
$('btn-sample').onclick = () => { DEST_IDS.forEach((id, i) => { inputs[i].value = DEFAULT_SECRETS[id]; }); preview(); };
$('btn-clear').onclick = () => { inputs.forEach(i => { i.value = ''; }); preview(); inputs[0].focus(); };

// 마지막으로 쓴 값 불러오기
const draft = load('tlms_make_draft', null);
if (draft) {
  $('f-title').value = draft.t || DEFAULT_SETTINGS.title;
  $('f-dur').value = String(draft.d || 0);
  $('f-ko').checked = draft.k !== false;
  (draft.m || []).forEach((m, i) => { if (inputs[i]) inputs[i].value = m; });
} else $('f-dur').value = '20';
preview();

/* ---------- QR ---------- */
function drawQR(canvas, text) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount(), quiet = 3;
  const g = canvas.getContext('2d');
  const W = canvas.width, cell = Math.floor(W / (n + quiet * 2)), off = Math.floor((W - cell * n) / 2);
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, W);
  g.fillStyle = '#7a1414';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) g.fillRect(off + c * cell, off + r * cell, cell, cell);
}

function makeClass() {
  const m = inputs.map(i => i.value.trim());
  const empty = m.map((v, i) => v ? null : i + 1).filter(Boolean);
  if (empty.length) {
    $('make-msg').textContent = `${empty.join(', ')}번 메시지가 비어 있어요.`;
    inputs[empty[0] - 1].focus();
    return;
  }
  $('make-msg').textContent = '';
  const cls = { t: $('f-title').value.trim() || DEFAULT_SETTINGS.title, m, d: +$('f-dur').value, k: $('f-ko').checked };
  store('tlms_make_draft', cls);
  openClass(encodeClass(cls), true);
}

function openClass(code, remember) {
  const cls = decodeClass(code);
  if (!cls) return;
  const link = classLink(code, location.href);
  current = { code, cls, link, id: classIdOf(code) };
  $('qr-title').textContent = cls.t;
  $('link').value = link;
  $('btn-open').href = link;
  drawQR($('qr'), link);
  show('result', true);
  if (remember) {
    const list = load('tlms_make_recent', []).filter(r => r.code !== code);
    list.unshift({ code, t: cls.t, at: Date.now(), m: cls.m.join('') });
    store('tlms_make_recent', list.slice(0, 12));
    renderRecent();
    $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('v-result').textContent = '';
}

$('btn-make').onclick = makeClass;
$('btn-copy').onclick = async () => {
  try { await navigator.clipboard.writeText(current.link); $('copy-msg').textContent = '✓ 복사했어요'; }
  catch (e) { $('link').select(); $('copy-msg').textContent = '링크가 선택됐어요. Ctrl+C 로 복사하세요.'; }
  setTimeout(() => { $('copy-msg').textContent = ''; }, 3000);
};
$('btn-png').onclick = () => {
  // 제목이 들어간 인쇄용 QR 이미지
  const W = 1000, H = 1240, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#d62828'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#fffaf0'; roundRect(g, 40, 40, W - 80, H - 80, 48); g.fill();
  g.fillStyle = '#9e1b1b'; g.textAlign = 'center';
  g.font = '900 72px "Noto Sans SC", "Microsoft YaHei", sans-serif'; g.fillText(current.cls.t, W / 2, 150);
  g.fillStyle = '#6a3410'; g.font = '700 38px "Noto Sans KR", "Malgun Gothic", sans-serif'; g.fillText('카메라로 찍어서 참가하세요', W / 2, 215);
  const q = document.createElement('canvas'); q.width = q.height = 780; drawQR(q, current.link);
  g.drawImage(q, (W - 780) / 2, 260);
  g.fillStyle = '#5a4a36'; g.font = '400 24px "Noto Sans KR", sans-serif';
  g.fillText('노트북 · 태블릿 · 휴대폰 모두 가능', W / 2, 1110);
  const a = document.createElement('a');
  a.href = cv.toDataURL('image/png');
  a.download = 'QR_' + current.cls.t.replace(/[\\/:*?"<>|！!]/g, '') + '.png';
  a.click();
};
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
$('btn-big').onclick = async () => {
  $('big-title').textContent = current.cls.t;
  $('big-link').textContent = current.link;
  drawQR($('qr-big'), current.link);
  show('big', true);
  try { await $('big').requestFullscreen(); } catch (e) {}
};
$('big-close').onclick = async () => { show('big', false); try { if (document.fullscreenElement) await document.exitFullscreen(); } catch (e) {} };
document.addEventListener('keydown', e => { if (e.key === 'Escape') show('big', false); });

/* ---------- 최근 수업 ---------- */
function renderRecent() {
  const list = load('tlms_make_recent', []);
  if (!list.length) { $('recent').innerHTML = '<div class="empty">아직 만든 수업이 없어요.</div>'; return; }
  $('recent').innerHTML = list.map((r, i) => {
    const d = new Date(r.at);
    return `<div class="rc-item"><div><b class="zh">${esc(r.t)}</b><small>${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} · <span class="zh">${esc(r.m)}</span></small></div>
      <div class="acts"><button class="btn tiny" data-open="${i}">QR 보기</button><button class="btn tiny" data-edit="${i}">수정해서 새로 만들기</button><button class="btn tiny ghost" data-del="${i}">✕</button></div></div>`;
  }).join('');
}
$('recent').addEventListener('click', e => {
  const list = load('tlms_make_recent', []);
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.open) { openClass(list[+b.dataset.open].code, false); $('result').scrollIntoView({ behavior: 'smooth' }); }
  if (b.dataset.edit) {
    const cls = decodeClass(list[+b.dataset.edit].code);
    $('f-title').value = cls.t; $('f-dur').value = String(cls.d); $('f-ko').checked = cls.k;
    cls.m.forEach((m, i) => { inputs[i].value = m; }); preview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  if (b.dataset.del) { list.splice(+b.dataset.del, 1); store('tlms_make_recent', list); renderRecent(); }
});
renderRecent();

/* ---------- 기록 확인 ---------- */
$('btn-verify').onclick = () => {
  const out = $('v-result');
  if (!current) { out.className = 'v-result bad'; out.textContent = '먼저 위에서 수업 QR을 만들거나, 아래 목록에서 「QR 보기」로 수업을 골라 주세요.'; return; }
  const name = $('v-name').value.trim();
  const m = $('v-time').value.trim().match(/^(\d{1,3})\s*[:분]\s*(\d{1,2})/);
  const code = $('v-code').value.trim().toUpperCase();
  if (!name || !m || !code) { out.className = 'v-result bad'; out.textContent = '이름, 걸린 시간(분:초), 확인 코드를 모두 입력하세요.'; return; }
  const sec = +m[1] * 60 + +m[2];
  const ok = recordCheck(name, sec, current.id) === code;
  out.className = 'v-result ' + (ok ? 'ok' : 'bad');
  out.innerHTML = ok ? `✅ 일치해요! <b>${esc(name)}</b> · ${fmtTime(sec * 1000)} · 「${esc(current.cls.t)}」 수업 기록이 맞아요.` : '❌ 일치하지 않아요. 이름 · 시간 · 코드를 기록 카드와 똑같이 적었는지, 같은 수업 QR인지 확인하세요.';
};

// 주소에 #c= 가 있으면 그 수업을 바로 열기 (선생님끼리 공유할 때)
const fromHash = new URLSearchParams(location.hash.slice(1)).get('c');
if (fromHash && decodeClass(fromHash)) openClass(fromHash, true);
