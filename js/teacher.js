// 교사용 관리자 화면
import { createStore } from './store.js';
import { GameAPI } from './api.js';
import { DEST_IDS, DEFAULT_DESTINATIONS, DEFAULT_PHRASES, DEFAULT_SECRETS, DEFAULT_SETTINGS, PHRASE_LABELS, mergeConfig, fillTemplate, gameRemaining, gameElapsed, fmtTime } from './defaults.js';
import { AudioSystem } from './game/audio.js';

const $ = id => document.getElementById(id);
const show = (el, on = true) => (typeof el === 'string' ? $(el) : el).classList.toggle('hidden', !on);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let toastT;
const toast = (t, ms = 2500) => { $('toast').textContent = t; show('toast', true); clearTimeout(toastT); toastT = setTimeout(() => show('toast', false), ms); };
const flashSaved = id => { $(id).textContent = '✓ 저장됨'; setTimeout(() => { $(id).textContent = ''; }, 2500); };

const T = { store: null, api: null, cfg: mergeConfig(null), rawCfg: null, game: { status: 'waiting' }, players: {}, names: {}, requests: {}, secrets: {}, audio: {} };
const audio = new AudioSystem();
window.__teacher = T;

async function boot() {
  try { T.store = await createStore(); }
  catch (e) { show('login', true); $('lg-msg').textContent = e.message; show('login-firebase', false); return; }
  T.api = new GameAPI(T.store);
  show('login', true);
  if (T.store.mode === 'local') { show('login-firebase', false); show('login-local', true); $('lg-local').onclick = enter; return; }
  $('lg-email').value = T.store.adminEmail && T.store.adminEmail !== 'teacher@example.com' ? T.store.adminEmail : '';
  const cur = await T.store.currentTeacher();
  if (cur) return enter();
  const go = async () => {
    $('lg-msg').textContent = '로그인 중…';
    try { await T.store.signInTeacher($('lg-email').value.trim(), $('lg-pw').value); enter(); }
    catch (e) { $('lg-msg').textContent = /invalid|wrong|user-not-found|credential/i.test(e.code || e.message) ? '이메일 또는 비밀번호가 올바르지 않아요.' : (e.message || e); }
  };
  $('lg-btn').onclick = go;
  $('lg-pw').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
}

async function enter() {
  try { await T.api.ensureDefaults(); }
  catch (e) { $('lg-msg').innerHTML = '데이터베이스 쓰기 권한이 없어요.<br>database.rules.json 의 이메일이 관리자 이메일과 같은지 확인하세요.<br><small>' + esc(e.message) + '</small>'; return; }
  show('login', false); show('app', true);
  $('h-mode').textContent = T.store.mode === 'local' ? '🧪 로컬 테스트 모드' : '☁️ Firebase 실시간 모드';
  $('h-mode').classList.toggle('bad', T.store.mode === 'local');
  T.store.onConnection(c => { $('h-conn').textContent = c ? '● 연결됨' : '● 연결 끊김'; $('h-conn').className = 'chip ' + (c ? 'ok' : 'bad'); });
  T.api.onConfig(c => { T.rawCfg = c || {}; T.cfg = mergeConfig(c); $('h-title').textContent = T.cfg.settings.title; $('g-allow').checked = T.cfg.settings.allowJoin !== false; renderDash(); if (!T.formsLoaded) { loadForms(); T.formsLoaded = true; } });
  T.api.onGame(g => { T.game = g || { status: 'waiting' }; renderControl(); renderDash(); });
  T.api.onPlayers(p => { T.players = p || {}; renderDash(); fixRecords(); });
  T.store.on('names', n => { T.names = n || {}; });
  T.api.onRequests(r => { T.requests = r || {}; renderRequests(); });
  T.api.onSecrets(s => { T.secrets = s || {}; if (!T.secretsLoaded) { loadSecrets(); T.secretsLoaded = true; } });
  T.api.onAudio(a => { T.audio = a || {}; audio.audioMap = T.audio; if (T.formsLoaded) renderPhrases(); });
  setInterval(tick, 500);
  bindTabs(); bindControls(); bindForms();
}

/* ---------------- 탭 ---------------- */
function bindTabs() {
  document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => {
    document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
    document.querySelectorAll('main.tab').forEach(m => show(m, m.id === 'tab-' + b.dataset.tab));
  });
}

/* ---------------- 게임 제어 ---------------- */
function bindControls() {
  $('g-start').onclick = async () => {
    const st = T.game.status;
    if (st === 'ended' && !confirm('이전 게임이 끝난 상태예요. 기록을 유지한 채 새로 시작할까요?\n(새 반 수업이라면 먼저 「초기화」 탭에서 결과를 지우세요)')) return;
    await T.api.startGame(T.cfg.settings.durationMin);
    toast('▶ 게임을 시작했어요!');
  };
  $('g-pause').onclick = () => T.api.pauseGame();
  $('g-resume').onclick = () => T.api.resumeGame(T.game);
  $('g-end').onclick = () => { if (confirm('게임을 종료할까요? 학생들은 더 이상 보물상자를 열 수 없어요.')) T.api.endGame(); };
  $('g-plus').onclick = () => { T.api.extendGame(T.game, 5); toast('⏱ 5분 연장했어요'); };
  $('g-allow').onchange = () => T.api.saveSettings({ ...T.cfg.settings, allowJoin: $('g-allow').checked });
  $('filter').oninput = renderDash;
  $('btn-copy-link').onclick = async () => {
    const url = new URL('index.html', location.href).href.replace(/index\.html$/, '');
    try { await navigator.clipboard.writeText(url); toast('복사됨: ' + url, 4000); } catch (e) { prompt('학생 접속 주소', url); }
  };
  $('btn-logout').onclick = async () => { await T.store.signOut(); location.reload(); };
}
function renderControl() {
  const st = effectiveStatus();
  const label = { waiting: '대기 중', running: '진행 중', paused: '일시정지', ended: '종료' }[st] || st;
  $('st-chip').textContent = label; $('st-chip').className = 'st-chip ' + st;
  $('g-start').disabled = st === 'running' || st === 'paused';
  $('g-start').textContent = st === 'ended' ? '▶ 다시 시작' : '▶ 게임 시작';
  $('g-pause').disabled = st !== 'running';
  $('g-resume').disabled = st !== 'paused';
  $('g-end').disabled = st === 'waiting' || st === 'ended';
  $('g-plus').disabled = !(st === 'running' || st === 'paused') || !T.game.durationSec;
}
function effectiveStatus() {
  const g = T.game;
  if (g.status === 'running' && gameRemaining(g, T.store.serverNow()) === 0) return 'ended';
  return g.status || 'waiting';
}
let autoEnding = false;
function tick() {
  const g = T.game, now = T.store.serverNow();
  const rem = gameRemaining(g, now);
  $('st-remain').textContent = rem === null ? '∞' : fmtTime(rem);
  $('st-elapsed').textContent = '경과 ' + fmtTime(gameElapsed(g, now));
  if (g.status === 'running' && rem === 0 && !autoEnding) { autoEnding = true; T.api.endGame().finally(() => { autoEnding = false; }); }
  renderControl();
}

/* ---------------- 대시보드 ---------------- */
function rows() {
  return Object.entries(T.players).filter(([, p]) => p && p.name).map(([uid, p]) => {
    const n = p.collected ? Object.keys(p.collected).filter(k => DEST_IDS.includes(k)).length : 0;
    const rec = p.record ?? T.api.computeRecord(p, T.game);
    return { uid, p, n, rec };
  });
}
function ranked() {
  return rows().filter(r => r.p.finishedAt).sort((a, b) => a.p.finishedAt - b.p.finishedAt);
}
function renderDash() {
  const rs = rows();
  const fin = ranked();
  const rankOf = new Map(fin.map((r, i) => [r.uid, i + 1]));
  const now = T.store.serverNow();
  const online = rs.filter(r => r.p.online && (!r.p.lastSeen || now - r.p.lastSeen < 150000)).length;
  $('s-total').textContent = rs.length; $('s-online').textContent = online; $('s-done').textContent = fin.length;
  $('s-appr').textContent = rs.filter(r => r.p.approved).length;
  $('s-avg').textContent = rs.length ? (rs.reduce((a, r) => a + r.n, 0) / rs.length).toFixed(1) : '0';
  // 순위
  const medals = ['🥇', '🥈', '🥉'];
  $('podium').innerHTML = fin.length ? fin.slice(0, 10).map((r, i) => `<div class="pod r${i + 1}"><span class="medal">${medals[i] || (i + 1)}</span><span>${esc(r.p.name)} ${r.p.approved ? '✅' : ''}</span><b>${fmtTime(r.rec)}</b></div>`).join('')
    : '<div class="empty">아직 완주한 학생이 없어요.</div>';
  // 장소별
  $('place-stats').innerHTML = DEST_IDS.map(id => {
    const d = T.cfg.destinations[id];
    const c = rs.filter(r => r.p.collected && r.p.collected[id]).length;
    return `<div class="ps"><div>${d.icon} <span class="zh">${esc(d.zh)}</span></div><div class="bar"><i style="width:${rs.length ? c / rs.length * 100 : 0}%"></i></div><small>${c}명</small></div>`;
  }).join('');
  // 표
  const q = $('filter').value.trim().toLowerCase();
  const sorted = rs.sort((a, b) => (rankOf.get(a.uid) || 999) - (rankOf.get(b.uid) || 999) || b.n - a.n || String(a.p.name).localeCompare(String(b.p.name), 'ko'));
  const list = sorted.filter(r => !q || String(r.p.name).toLowerCase().includes(q));
  show('p-empty', rs.length === 0);
  $('p-body').innerHTML = list.map(r => {
    const p = r.p, rk = rankOf.get(r.uid);
    const isOn = p.online && (!p.lastSeen || now - p.lastSeen < 150000);
    const msgs = DEST_IDS.map(id => { const c = p.collected && p.collected[id]; return `<span class="${c ? 'got' : ''}" title="${esc(T.cfg.destinations[id].zh)}">${c ? esc(c.m) : '·'}</span>`; }).join('');
    const cur = p.current && T.cfg.destinations[p.current] ? `→ <span class="zh">${esc(T.cfg.destinations[p.current].zh)}</span>` : '-';
    const status = p.blocked ? '<span class="badge blk">차단됨</span>' : p.finishedAt ? '<span class="badge fin">완주 🎉</span>' : '<span class="badge run">진행 중</span>';
    return `<tr class="${p.finishedAt ? 'done' : ''} ${p.blocked ? 'blocked' : ''}">
      <td class="rank">${rk ? (rk <= 3 ? ['🥇', '🥈', '🥉'][rk - 1] : rk) : ''}</td>
      <td><div class="pname"><i class="dot ${isOn ? 'on' : ''}" title="${isOn ? '접속 중' : '오프라인'}"></i>${esc(p.name)}</div></td>
      <td><span class="cnt">${r.n}</span>/10<span class="mbar"><i style="width:${r.n * 10}%"></i></span></td>
      <td><div class="msgs">${msgs}</div></td>
      <td>${p.finishedAt ? '-' : cur}</td>
      <td>${status}</td>
      <td><b>${p.finishedAt ? fmtTime(r.rec) : '-'}</b></td>
      <td>${p.approved ? `<button class="btn tiny" data-act="unapprove" data-uid="${r.uid}">✅ 승인됨</button>` : `<button class="btn tiny" data-act="approve" data-uid="${r.uid}" ${p.finishedAt ? '' : 'title="아직 완주 전이지만 승인할 수 있어요"'}>제출 승인</button>`}</td>
      <td class="acts">
        <button class="btn tiny" data-act="${p.blocked ? 'unblock' : 'block'}" data-uid="${r.uid}" title="${p.blocked ? '차단 해제' : '접속 차단'}">${p.blocked ? '🔓' : '⛔'}</button>
        <button class="btn tiny" data-act="delete" data-uid="${r.uid}" title="삭제">🗑</button>
      </td></tr>`;
  }).join('');
}
$('p-body').addEventListener('click', async e => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const uid = b.dataset.uid, p = T.players[uid]; if (!p) return;
  const act = b.dataset.act;
  if (act === 'approve') await T.api.setApproved(uid, true);
  if (act === 'unapprove') { if (confirm(`${p.name} 학생의 학습지 승인을 취소할까요?`)) await T.api.setApproved(uid, false); }
  if (act === 'block') { if (confirm(`${p.name} 학생의 접속을 차단할까요?`)) await T.api.setBlocked(uid, true); }
  if (act === 'unblock') await T.api.setBlocked(uid, false);
  if (act === 'delete') { if (confirm(`${p.name} 학생의 기록을 삭제할까요? (같은 이름으로 다시 참가할 수 있게 됩니다)`)) await T.api.removePlayer(uid, p.name); }
});
async function fixRecords() {
  for (const [uid, p] of Object.entries(T.players)) {
    if (p && p.finishedAt && p.record == null && T.game.startedAt) {
      const rec = T.api.computeRecord(p, T.game);
      if (rec != null) { p.record = rec; T.api.setRecord(uid, rec).catch(() => {}); }
    }
  }
}
function renderRequests() {
  const list = Object.entries(T.requests);
  show('requests', list.length > 0);
  $('requests').innerHTML = '<b>🔁 컴퓨터 변경 요청</b>' + list.map(([uid, r]) => `<div class="req">‘${esc(r.name)}’ 학생이 다른 컴퓨터에서 이어서 하려고 해요. <button class="btn tiny" data-req="ok" data-uid="${uid}">승인 (기록 이동)</button><button class="btn tiny" data-req="no" data-uid="${uid}">거절</button></div>`).join('');
}
$('requests').addEventListener('click', async e => {
  const b = e.target.closest('button[data-req]'); if (!b) return;
  const uid = b.dataset.uid, r = T.requests[uid];
  if (b.dataset.req === 'ok') { await T.api.approveDeviceChange(uid, r, T.players, T.names); toast('승인했어요. 학생 화면에서 자동으로 이어집니다.'); }
  else await T.api.denyRequest(uid);
});

/* ---------------- 비밀 메시지 ---------------- */
function loadSecrets() {
  $('sec-list').innerHTML = DEST_IDS.map((id, i) => {
    const d = T.cfg.destinations[id];
    return `<div class="sec-row"><span class="ic">${d.icon}</span><span class="nm"><span class="zh">${i + 1}. ${esc(d.zh)}</span><small>${esc(d.ko)}</small></span><input id="sec-${id}" maxlength="30" value="${esc(T.secrets[id] ?? '')}"></div>`;
  }).join('');
  DEST_IDS.forEach(id => $('sec-' + id).oninput = previewSecrets);
  previewSecrets();
}
function previewSecrets() { $('sec-preview').textContent = DEST_IDS.map(id => $('sec-' + id).value || '□').join(' '); }

/* ---------------- 폼 ---------------- */
function loadForms() {
  const s = T.cfg.settings;
  $('set-title').value = s.title; $('set-subtitle').value = s.subtitle || ''; $('set-duration').value = s.durationMin;
  $('set-allow').checked = s.allowJoin !== false; $('set-korean').checked = s.showKorean !== false; $('set-rate').value = s.voiceRate;
  renderDests(); renderPhrases();
}
function renderDests() {
  const names = { school: '🏫 학교 건물', hospital: '🏥 병원 건물', bank: '🏦 은행 건물', market: '🛒 슈퍼 건물', park: '🌳 공원', restaurant: '🍜 식당 건물', station: '🚄 기차역', library: '📚 도서관', shop: '🛍️ 상점가', post: '📮 우체국' };
  $('dest-body').innerHTML = DEST_IDS.map(id => {
    const d = T.cfg.destinations[id];
    return `<tr><td>${names[d.building]}</td>
      <td><input class="zh" data-f="zh" data-id="${id}" value="${esc(d.zh)}" maxlength="8"></td>
      <td><input data-f="py" data-id="${id}" value="${esc(d.py)}"></td>
      <td><input data-f="ko" data-id="${id}" value="${esc(d.ko)}"></td>
      <td><input class="zh" data-f="mw" data-id="${id}" value="${esc(d.mw)}" maxlength="2" style="width:50px"></td>
      <td><input data-f="mwPy" data-id="${id}" value="${esc(d.mwPy)}" style="width:90px"></td>
      <td><input data-f="icon" data-id="${id}" value="${esc(d.icon)}" style="width:60px"></td></tr>`;
  }).join('');
}
function renderPhrases() {
  const keys = Object.keys(DEFAULT_PHRASES);
  const prev = {};
  document.querySelectorAll('#ph-list input[data-k]').forEach(i => { prev[i.dataset.k + '.' + i.dataset.f] = i.value; });
  $('ph-list').innerHTML = keys.map(k => {
    const p = T.cfg.phrases[k], templ = /\{/.test(p.zh);
    const v = f => esc(prev[k + '.' + f] ?? p[f]);
    const has = T.audio[k];
    return `<div class="ph"><div class="lb">${PHRASE_LABELS[k] || k}<small>${k}</small></div>
      <input class="zh" data-k="${k}" data-f="zh" value="${v('zh')}" placeholder="중국어">
      <input data-k="${k}" data-f="py" value="${v('py')}" placeholder="병음">
      <input data-k="${k}" data-f="ko" value="${v('ko')}" placeholder="한국어 뜻">
      <div class="aud">
        <button class="btn tiny" data-play="${k}">🔊</button>
        ${templ ? '<small class="muted">음성합성</small>' : `<label class="btn tiny">📁 MP3<input type="file" accept="audio/*" data-up="${k}" hidden></label>
        <button class="btn tiny" data-url="${k}" title="MP3 주소(URL) 입력">🔗</button>
        ${has ? `<span class="has">✓등록</span><button class="btn tiny" data-del="${k}">✕</button>` : ''}`}
      </div></div>`;
  }).join('');
  const vc = $('voice-check');
  vc.innerHTML = audio.hasZhVoice ? `✅ 이 컴퓨터의 중국어 음성: <b>${esc(audio.voice.name)}</b> (학생 컴퓨터마다 다를 수 있어요)` : '⚠️ 이 브라우저에서 중국어(zh-CN) 음성을 찾지 못했어요. Chrome 또는 Edge를 쓰거나, 중요한 문장은 MP3를 등록하세요.';
}
function bindForms() {
  $('sec-save').onclick = async () => {
    const o = {}; for (const id of DEST_IDS) o[id] = $('sec-' + id).value.trim();
    const empty = DEST_IDS.filter(id => !o[id]);
    if (empty.length && !confirm(`비어 있는 메시지가 ${empty.length}개 있어요. 그대로 저장할까요? (빈 장소는 학생이 열 수 없어요)`)) return;
    await T.api.saveSecrets(o); flashSaved('sec-msg');
  };
  $('sec-sample').onclick = () => { DEST_IDS.forEach(id => { $('sec-' + id).value = DEFAULT_SECRETS[id]; }); previewSecrets(); };
  $('dest-save').onclick = async () => {
    const d = {};
    for (const id of DEST_IDS) { const { building, ...rest } = T.cfg.destinations[id]; d[id] = rest; }
    document.querySelectorAll('#dest-body input').forEach(i => { d[i.dataset.id][i.dataset.f] = i.value.trim(); });
    await T.api.saveDestinations(d); flashSaved('dest-msg'); setTimeout(() => { loadSecrets(); }, 200);
  };
  $('dest-default').onclick = () => { if (!confirm('목적지 이름을 기본값으로 되돌릴까요?')) return; const d = {}; for (const id of DEST_IDS) { const { building, ...rest } = DEFAULT_DESTINATIONS[id]; d[id] = rest; } T.api.saveDestinations(d).then(() => setTimeout(renderDests, 200)); };
  $('ph-save').onclick = async () => {
    const p = JSON.parse(JSON.stringify(T.cfg.phrases));
    document.querySelectorAll('#ph-list input[data-k]').forEach(i => { p[i.dataset.k][i.dataset.f] = i.value.trim(); });
    await T.api.savePhrases(p); flashSaved('ph-msg');
  };
  $('ph-default').onclick = async () => { if (!confirm('안내 문장을 기본값으로 되돌릴까요?')) return; await T.api.savePhrases(JSON.parse(JSON.stringify(DEFAULT_PHRASES))); setTimeout(() => { document.querySelectorAll('#ph-list input').forEach(i => { if (i.dataset.k) i.value = DEFAULT_PHRASES[i.dataset.k][i.dataset.f]; }); renderPhrases(); }, 200); };
  $('ph-list').addEventListener('click', async e => {
    const play = e.target.closest('[data-play]'), url = e.target.closest('[data-url]'), del = e.target.closest('[data-del]');
    if (play) {
      audio.unlock();
      const k = play.dataset.play;
      const zh = document.querySelector(`#ph-list input[data-k="${k}"][data-f="zh"]`).value;
      const text = fillTemplate(zh, T.cfg.destinations.d2);
      audio.rate = T.cfg.settings.voiceRate || 0.85;
      audio.say(text, /\{/.test(zh) ? null : k);
    }
    if (url) {
      const k = url.dataset.url;
      const u = prompt('MP3 파일 주소(https://…)를 입력하세요. (예: GitHub 저장소 audio 폴더에 올린 파일 주소)', T.audio[k] && !T.audio[k].startsWith('data:') ? T.audio[k] : '');
      if (u) { await T.api.setAudio(k, u.trim()); toast('음성 주소를 등록했어요'); }
    }
    if (del) { if (confirm('등록한 음성을 삭제할까요?')) await T.api.setAudio(del.dataset.del, null); }
  });
  $('ph-list').addEventListener('change', async e => {
    const inp = e.target.closest('input[data-up]'); if (!inp || !inp.files[0]) return;
    const f = inp.files[0];
    if (f.size > 700 * 1024) { alert('파일이 너무 커요 (700KB 이하). 짧게 녹음하거나 MP3 음질을 낮춰 주세요.'); return; }
    if (f.size > 300 * 1024 && !confirm('300KB 보다 큰 파일이에요. 학생 컴퓨터에서 불러오는 데 시간이 걸릴 수 있어요. 계속할까요?')) return;
    const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
    await T.api.setAudio(inp.dataset.up, data);
    toast('🎵 음성 파일을 등록했어요');
  });
  $('set-save').onclick = async () => {
    const s = { ...T.cfg.settings, title: $('set-title').value.trim() || DEFAULT_SETTINGS.title, subtitle: $('set-subtitle').value.trim(), durationMin: Math.max(0, Math.min(180, +$('set-duration').value || 0)), allowJoin: $('set-allow').checked, showKorean: $('set-korean').checked, voiceRate: Math.max(0.5, Math.min(1.2, +$('set-rate').value || 0.85)) };
    await T.api.saveSettings(s); flashSaved('set-msg');
  };
  $('r-results').onclick = async () => {
    if (!confirm('모든 학생의 참가 기록과 수집 결과를 지우고 게임을 「대기 중」으로 되돌릴까요?\n(되돌릴 수 없어요)')) return;
    await T.api.resetAll(); $('r-msg').textContent = '✓ 초기화했어요'; toast('🧹 게임 결과를 초기화했어요');
  };
  $('r-all').onclick = async () => {
    if (!confirm('설정, 문장, 목적지 이름, 비밀 메시지, 음성 파일을 모두 기본값으로 되돌릴까요?')) return;
    await T.store.update('', { config: null, secrets: null, audio: null });
    await T.api.ensureDefaults();
    T.formsLoaded = false; T.secretsLoaded = false;
    setTimeout(() => { loadForms(); T.formsLoaded = true; loadSecrets(); T.secretsLoaded = true; }, 300);
    toast('↺ 기본값으로 되돌렸어요');
  };
}

boot();
