// 게임 데이터 API (학생/교사 공용). 데이터 구조:
//  config/{settings,destinations,phrases}   — 교사만 수정
//  secrets/{d0..d9}                          — 비밀 메시지 (게임 진행 중, 한 장소씩만 읽기 가능)
//  audio/{phraseKey}                         — 교사가 등록한 음성 (data URL 또는 http URL)
//  game/{status,startedAt,pausedAt,pausedTotal,endedAt,durationSec,round}
//  names/{nameKey} = uid                     — 이름 중복 접속 방지
//  requests/{uid} = {name, at}              — 기기 변경 요청
//  players/{uid}/{name,color,joinedAt,online,lastSeen,session,current,collected/{dX:{t,m}},finishedAt,blocked,approved,record}

import { TS } from './store.js';
import { DEST_IDS, DEFAULT_SECRETS, DEFAULT_DESTINATIONS, DEFAULT_PHRASES, DEFAULT_SETTINGS, nameKey, gameElapsed } from './defaults.js';

export class GameAPI {
  constructor(store) { this.s = store; }

  /* ---------- 공용 ---------- */
  onConfig(cb) { return this.s.on('config', cb); }
  onGame(cb) { return this.s.on('game', cb); }
  onAudio(cb) { return this.s.on('audio', cb); }

  /* ---------- 학생 ---------- */
  async getMyPlayer() { return this.s.get('players/' + this.s.uid); }
  onMyPlayer(cb) { return this.s.on('players/' + this.s.uid, cb); }
  onNameOwner(name, cb) { return this.s.on('names/' + nameKey(name), cb); }

  // 결과: {ok:true} | {ok:false, reason:'taken'|'closed'|'blocked'|'renamed', existingName}
  async join(name, color) {
    const uid = this.s.uid;
    name = String(name).trim().slice(0, 20);
    const key = nameKey(name);
    const mine = await this.s.get('players/' + uid);
    if (mine && mine.blocked) return { ok: false, reason: 'blocked' };
    if (mine && mine.name && mine.name !== name) {
      const n = mine.collected ? Object.keys(mine.collected).length : 0;
      if (n > 0) return { ok: false, reason: 'renamed', existingName: mine.name };
      try { await this.s.remove('names/' + nameKey(mine.name)); } catch (e) { /* ignore */ }
    }
    const owner = await this.s.get('names/' + key);
    if (owner && owner !== uid) return { ok: false, reason: 'taken' };
    if (!mine || mine.name !== name) {
      const cfg = await this.s.get('config/settings');
      if (cfg && cfg.allowJoin === false && !(mine && mine.name)) return { ok: false, reason: 'closed' };
    }
    const upd = {};
    upd['names/' + key] = uid;
    upd['players/' + uid + '/name'] = name;
    upd['players/' + uid + '/color'] = color | 0;
    if (!mine || !mine.joinedAt) upd['players/' + uid + '/joinedAt'] = TS;
    await this.s.update('', upd);
    return { ok: true };
  }

  async requestDeviceChange(name) {
    await this.s.set('requests/' + this.s.uid, { name: String(name).trim().slice(0, 20), at: TS });
  }
  async cancelRequest() { await this.s.remove('requests/' + this.s.uid); }

  async startSession(sessionId) {
    const p = 'players/' + this.s.uid;
    await this.s.update('', { [p + '/session']: sessionId, [p + '/online']: true, [p + '/lastSeen']: TS });
    this.s.onDisconnectSet(p + '/online', false);
  }
  heartbeat() { return this.s.update('', { ['players/' + this.s.uid + '/online']: true, ['players/' + this.s.uid + '/lastSeen']: TS }).catch(() => {}); }
  setCurrent(destId) { return this.s.set('players/' + this.s.uid + '/current', destId || '').catch(() => {}); }

  async readSecret(destId) {
    const v = await this.s.get('secrets/' + destId);
    if (v === null || v === undefined) return DEFAULT_SECRETS[destId] !== undefined && this.s.mode === 'local' ? DEFAULT_SECRETS[destId] : null;
    return String(v);
  }

  async collect(destId, message, alreadyCollected) {
    const p = 'players/' + this.s.uid;
    const upd = {};
    upd[p + '/collected/' + destId] = { t: TS, m: message };
    const all = new Set([...(alreadyCollected || []), destId]);
    if (DEST_IDS.every(d => all.has(d))) upd[p + '/finishedAt'] = TS;
    await this.s.update('', upd);
    return all.size === DEST_IDS.length;
  }

  /* ---------- 교사 ---------- */
  onPlayers(cb) { return this.s.on('players', cb); }
  onRequests(cb) { return this.s.on('requests', cb); }
  onSecrets(cb) { return this.s.on('secrets', cb); }

  async ensureDefaults() {
    const [cfg, sec, game] = await Promise.all([this.s.get('config'), this.s.get('secrets'), this.s.get('game')]);
    const upd = {};
    if (!cfg || !cfg.settings) upd['config/settings'] = { ...DEFAULT_SETTINGS };
    if (!cfg || !cfg.destinations) {
      const d = {}; for (const id of DEST_IDS) { const { building, ...rest } = DEFAULT_DESTINATIONS[id]; d[id] = rest; }
      upd['config/destinations'] = d;
    }
    if (!cfg || !cfg.phrases) upd['config/phrases'] = JSON.parse(JSON.stringify(DEFAULT_PHRASES));
    if (!sec) upd['secrets'] = { ...DEFAULT_SECRETS };
    if (!game) upd['game'] = { status: 'waiting' };
    if (Object.keys(upd).length) await this.s.update('', upd);
  }

  saveSettings(settings) { return this.s.set('config/settings', settings); }
  saveDestinations(d) { return this.s.set('config/destinations', d); }
  savePhrases(p) { return this.s.set('config/phrases', p); }
  saveSecrets(sec) { const o = {}; for (const id of DEST_IDS) o[id] = String(sec[id] ?? '').trim(); return this.s.set('secrets', o); }
  setAudio(key, url) { return url ? this.s.set('audio/' + key, url) : this.s.remove('audio/' + key); }

  async startGame(durationMin) {
    await this.s.set('game', { status: 'running', startedAt: TS, pausedTotal: 0, durationSec: Math.round((durationMin || 0) * 60), round: Math.random().toString(36).slice(2, 8) });
  }
  async pauseGame() { await this.s.update('game', { status: 'paused', pausedAt: TS }); }
  async resumeGame(game) {
    const now = this.s.serverNow();
    const add = Math.max(0, now - (game.pausedAt || now));
    await this.s.update('game', { status: 'running', pausedTotal: (game.pausedTotal || 0) + add, pausedAt: null });
  }
  async endGame() { await this.s.update('game', { status: 'ended', endedAt: TS }); }
  async extendGame(game, addMin) {
    await this.s.update('game', { durationSec: (game.durationSec || 0) + Math.round(addMin * 60) });
  }
  async resetAll() {
    await this.s.update('', { players: null, names: null, requests: null, game: { status: 'waiting' } });
  }
  setBlocked(uid, v) { return this.s.set('players/' + uid + '/blocked', v ? true : null); }
  setApproved(uid, v) { return this.s.update('players/' + uid, { approved: v ? true : null, approvedAt: v ? TS : null }); }
  setRecord(uid, ms) { return this.s.set('players/' + uid + '/record', ms); }
  async removePlayer(uid, name) {
    const upd = { ['players/' + uid]: null, ['requests/' + uid]: null };
    if (name) upd['names/' + nameKey(name)] = null;
    await this.s.update('', upd);
  }
  async approveDeviceChange(newUid, req, players, names) {
    const key = nameKey(req.name);
    const oldUid = names ? names[key] : await this.s.get('names/' + key);
    const upd = {};
    if (oldUid && oldUid !== newUid && players && players[oldUid]) {
      const old = { ...players[oldUid] };
      delete old.online; delete old.session;
      upd['players/' + newUid] = old;
      upd['players/' + oldUid] = null;
    }
    upd['names/' + key] = newUid;
    upd['requests/' + newUid] = null;
    await this.s.update('', upd);
  }
  denyRequest(uid) { return this.s.remove('requests/' + uid); }

  computeRecord(player, game) {
    if (!player || !player.finishedAt || !game || !game.startedAt) return null;
    return Math.max(0, player.finishedAt - game.startedAt - (game.pausedTotal || 0));
  }
  elapsed(game) { return gameElapsed(game, this.s.serverNow()); }
}
