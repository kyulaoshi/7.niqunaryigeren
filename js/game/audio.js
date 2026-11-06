// 음성(중국어 MP3 / Web Speech zh-CN) + 배경음악 + 효과음
const PENTA = [0, 2, 4, 7, 9]; // 중국 5음계 (宫商角徵羽)

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.vol = { voice: 1, music: 0.35, sfx: 0.7 };
    try { Object.assign(this.vol, JSON.parse(localStorage.getItem('tlms_vol') || '{}')); } catch (e) {}
    this.rate = 0.85;
    this.voice = null;
    this.voices = [];
    this.hasZhVoice = false;
    this.audioMap = {};       // phraseKey → url (교사가 등록한 MP3)
    this.queue = [];
    this.speaking = false;
    this.current = null;
    this.onSpeakState = () => {};
    this.unlocked = false;
    this.musicOn = false;
    this._loadVoices();
    if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => this._loadVoices();
  }

  _loadVoices() {
    if (!('speechSynthesis' in window)) return;
    const vs = speechSynthesis.getVoices();
    this.voices = vs;
    const zh = vs.filter(v => /^(zh[-_]CN|cmn|zh$|zh[-_]Hans)/i.test(v.lang) || /普通话|Mandarin|Xiaoxiao|Huihui|Yunxi|Yaoyao|Kangkang|Tingting/i.test(v.name));
    const pref = ['Xiaoxiao', 'Xiaoyi', 'Yunxi', 'Google 普通话', 'Google 普通話', 'Huihui', 'Tingting', 'Yaoyao', 'Kangkang'];
    let pick = null;
    for (const p of pref) { pick = zh.find(v => v.name.includes(p)); if (pick) break; }
    this.voice = pick || zh[0] || null;
    this.hasZhVoice = !!this.voice;
  }

  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = this.vol.music; this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = this.vol.sfx; this.sfxGain.connect(this.master);
      this.duck = 1;
    } catch (e) { console.warn('no webaudio', e); }
    if ('speechSynthesis' in window) {
      try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; u.lang = 'zh-CN'; speechSynthesis.speak(u); } catch (e) {}
      // Chrome 장시간 정지 버그 방지
      setInterval(() => { if (speechSynthesis.speaking && !speechSynthesis.paused) { /* keep alive */ } else if (speechSynthesis.paused) speechSynthesis.resume(); }, 4000);
    }
  }

  setVolume(kind, v) {
    this.vol[kind] = v;
    localStorage.setItem('tlms_vol', JSON.stringify(this.vol));
    if (kind === 'music' && this.musicGain) this.musicGain.gain.value = v * this.duck;
    if (kind === 'sfx' && this.sfxGain) this.sfxGain.gain.value = v;
    if (kind === 'voice' && this.current && this.current.audio) this.current.audio.volume = v;
  }

  /* ---------------- 음성 ---------------- */
  // item: {text, key}  key 로 등록된 MP3가 있으면 MP3, 없으면 TTS
  say(text, key, { interrupt = true } = {}) {
    if (!text) return Promise.resolve();
    return new Promise(resolve => {
      const item = { text, key, resolve };
      if (interrupt) { this.queue.forEach(q => q.resolve()); this.queue = []; this._stopCurrent(); }
      this.queue.push(item);
      if (!this.speaking) this._next();
    });
  }
  sayQueue(items) { // [{text,key}]
    this.queue.forEach(q => q.resolve()); this.queue = []; this._stopCurrent();
    const ps = items.map(it => new Promise(res => this.queue.push({ ...it, resolve: res })));
    if (!this.speaking) this._next();
    return Promise.all(ps);
  }
  _stopCurrent() {
    if (this.current) {
      if (this.current.audio) { try { this.current.audio.pause(); } catch (e) {} }
      const r = this.current.resolve; this.current = null; r && r();
    }
    if ('speechSynthesis' in window) { try { speechSynthesis.cancel(); } catch (e) {} }
    this.speaking = false;
  }
  _next() {
    const item = this.queue.shift();
    if (!item) { this.speaking = false; this._duck(false); this.onSpeakState(false, null); return; }
    this.speaking = true;
    this.current = item;
    this._duck(true);
    this.onSpeakState(true, item);
    const done = () => {
      if (this.current !== item) return;
      clearTimeout(item.timer);
      this.current = null;
      item.resolve();
      setTimeout(() => this._next(), 180);
    };
    item.timer = setTimeout(done, 9000); // 안전장치
    const url = item.key && this.audioMap[item.key];
    if (url) {
      const a = new Audio(url);
      a.volume = this.vol.voice;
      item.audio = a;
      a.onended = done;
      a.onerror = () => { item.audio = null; this._tts(item, done); };
      a.play().catch(() => { item.audio = null; this._tts(item, done); });
    } else this._tts(item, done);
  }
  _tts(item, done) {
    if (!('speechSynthesis' in window) || this.vol.voice <= 0) { setTimeout(done, 1200); return; }
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(item.text);
      u.lang = 'zh-CN';
      if (this.voice) u.voice = this.voice;
      u.rate = this.rate;
      u.volume = this.vol.voice;
      u.onend = done;
      u.onerror = done;
      item.utter = u; // GC 방지
      speechSynthesis.speak(u);
    } catch (e) { setTimeout(done, 1200); }
  }
  _duck(on) {
    this.duck = on ? 0.35 : 1;
    if (this.musicGain && this.ctx) this.musicGain.gain.setTargetAtTime(this.vol.music * this.duck, this.ctx.currentTime, 0.15);
  }

  /* ---------------- 효과음 ---------------- */
  _tone(freq, t0, dur, type = 'sine', vol = 0.3, dest = null, slide = 0) {
    const c = this.ctx; if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || this.sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  sfx(name) {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t = this.ctx.currentTime;
    switch (name) {
      case 'click': this._tone(880, t, 0.07, 'triangle', 0.15); break;
      case 'jump': this._tone(420, t, 0.18, 'square', 0.06, null, 1.9); break;
      case 'land': this._tone(140, t, 0.1, 'sine', 0.18, null, 0.6); break;
      case 'step': this._tone(180 + Math.random() * 40, t, 0.04, 'triangle', 0.035); break;
      case 'near': [784, 988].forEach((f, i) => this._tone(f, t + i * 0.09, 0.25, 'triangle', 0.12)); break;
      case 'arrive': [523, 659, 784, 1047].forEach((f, i) => this._tone(f, t + i * 0.08, 0.35, 'triangle', 0.15)); break;
      case 'open':
        this._tone(196, t, 0.25, 'sawtooth', 0.05, null, 1.5);
        [659, 784, 988, 1175, 1319, 1568].forEach((f, i) => this._tone(f, t + 0.25 + i * 0.06, 0.6, 'sine', 0.13));
        break;
      case 'collect': [1047, 1319, 1568, 2093].forEach((f, i) => this._tone(f, t + i * 0.05, 0.4, 'sine', 0.1)); break;
      case 'error': this._tone(220, t, 0.18, 'square', 0.06); this._tone(180, t + 0.12, 0.22, 'square', 0.06); break;
      case 'count': this._tone(660, t, 0.18, 'triangle', 0.2); break;
      case 'go': this._tone(1320, t, 0.45, 'triangle', 0.22); break;
      case 'fanfare': {
        const seq = [523, 659, 784, 1047, 784, 1047, 1319];
        seq.forEach((f, i) => { this._tone(f, t + i * 0.13, 0.5, 'triangle', 0.16); this._tone(f / 2, t + i * 0.13, 0.5, 'sine', 0.08); });
        [1047, 1319, 1568].forEach(f => this._tone(f, t + 1.0, 1.4, 'sine', 0.08));
        break;
      }
    }
  }

  /* ---------------- 배경음악 (5음계 절차적 생성) ---------------- */
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    const c = this.ctx;
    const bpm = 96, beat = 60 / bpm;
    const root = 293.66; // D
    const freq = (deg, oct = 0) => root * Math.pow(2, (PENTA[((deg % 5) + 5) % 5] + 12 * (Math.floor(deg / 5) + oct)) / 12);
    let seed = 7;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const phrases = [];
    for (let p = 0; p < 4; p++) {
      const notes = []; let d = 4 + Math.floor(rnd() * 3);
      for (let i = 0; i < 8; i++) { d += Math.floor(rnd() * 5) - 2; d = Math.max(2, Math.min(9, d)); notes.push(rnd() < 0.15 ? null : d); }
      notes[7] = p % 2 ? 5 : 4;
      phrases.push(notes);
    }
    const bass = [0, -2, -3, -1];
    let nextT = c.currentTime + 0.1, step = 0;
    const pluck = (f, t, v, dur = 0.9) => {
      const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
      o.type = 'triangle'; o2.type = 'sine'; o.frequency.value = f; o2.frequency.value = f * 2.003;
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(4000, t); lp.frequency.exponentialRampToValueAtTime(600, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const g2 = c.createGain(); g2.gain.value = 0.3; o2.connect(g2); g2.connect(g);
      o.connect(g); g.connect(lp); lp.connect(this.musicGain);
      o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    };
    const wood = (t, v) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(1100, t); o.frequency.exponentialRampToValueAtTime(700, t + 0.05);
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + 0.1);
    };
    const tick = () => {
      if (!this.musicOn) return;
      while (nextT < c.currentTime + 0.4) {
        const bar = Math.floor(step / 8) % 16, pos = step % 8;
        const ph = phrases[[0, 1, 0, 2, 0, 1, 3, 2, 1, 1, 0, 2, 3, 3, 0, 1][bar]];
        const n = ph[pos];
        if (n !== null && (bar % 4 !== 3 || pos < 6)) pluck(freq(n), nextT, 0.16, pos % 2 ? 0.5 : 0.9);
        if (pos === 0) { pluck(freq(bass[bar % 4], -2), nextT, 0.2, 1.8); pluck(freq(bass[bar % 4] + 2, -1), nextT + beat, 0.08, 1.2); }
        if (pos % 2 === 0) wood(nextT, pos === 0 ? 0.08 : 0.04);
        nextT += beat / 2; step++;
      }
      this._musicTimer = setTimeout(tick, 120);
    };
    tick();
  }
  stopMusic() { this.musicOn = false; clearTimeout(this._musicTimer); }
}
