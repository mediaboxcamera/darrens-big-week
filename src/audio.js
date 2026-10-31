// All audio is synthesised with the Web Audio API: no audio files are shipped.
// Music is a tiny step sequencer (square lead, triangle bass, noise drums) with
// look-ahead scheduling so it stays in time on phones. All melodies are original.
const NOTE = {};
(() => { // build note -> frequency table (C2..C7)
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  for (let o = 1; o <= 7; o++) names.forEach((n, i) => { NOTE[n + o] = 440 * Math.pow(2, (o * 12 + i - 57) / 12); });
})();

// Sequences: arrays of [note, lengthInSteps] (null = rest). 1 step = a 16th note.
const LEVEL_SONG = {
  bpm: 152, loop: true,
  lead: [
    ['E5', 2], ['G5', 2], ['A5', 2], ['G5', 2], ['E5', 2], [null, 2], ['D5', 2], ['E5', 2],
    ['C5', 4], ['D5', 2], ['E5', 2], ['G5', 4], [null, 4],
    ['A5', 2], ['A5', 2], ['B5', 2], ['A5', 2], ['G5', 2], ['E5', 2], ['D5', 2], ['E5', 2],
    ['G5', 6], ['E5', 2], ['D5', 4], ['C5', 4],
    ['F5', 2], ['F5', 2], ['A5', 2], ['F5', 2], ['G5', 2], ['G5', 2], ['B5', 2], ['G5', 2],
    ['C6', 4], ['B5', 2], ['A5', 2], ['G5', 4], ['E5', 4],
    ['D5', 2], ['E5', 2], ['F5', 2], ['G5', 2], ['A5', 2], ['B5', 2], ['C6', 2], ['D6', 2],
    ['E6', 4], ['C6', 4], ['G5', 4], [null, 4],
  ],
  bass: [
    ['C3', 2], ['C3', 2], ['G3', 2], ['C3', 2], ['C3', 2], ['C3', 2], ['G3', 2], ['C3', 2],
    ['A2', 2], ['A2', 2], ['E3', 2], ['A2', 2], ['A2', 2], ['A2', 2], ['E3', 2], ['A2', 2],
    ['F2', 2], ['F2', 2], ['C3', 2], ['F2', 2], ['G2', 2], ['G2', 2], ['D3', 2], ['G2', 2],
    ['C3', 2], ['C3', 2], ['G3', 2], ['C3', 2], ['G2', 2], ['G2', 2], ['B2', 2], ['D3', 2],
    ['F2', 2], ['F2', 2], ['C3', 2], ['F2', 2], ['G2', 2], ['G2', 2], ['D3', 2], ['G2', 2],
    ['C3', 2], ['C3', 2], ['E3', 2], ['G3', 2], ['A2', 2], ['A2', 2], ['E3', 2], ['A2', 2],
    ['F2', 2], ['F2', 2], ['A2', 2], ['C3', 2], ['G2', 2], ['G2', 2], ['B2', 2], ['D3', 2],
    ['C3', 2], ['G3', 2], ['C4', 2], ['G3', 2], ['C3', 4], [null, 4],
  ],
  // drums: k = kick, s = snare, h = hat, '.' = rest ; one char per 16th
  drums: 'k.h.s.h.k.h.s.hh'.repeat(8),
};
const TITLE_JINGLE = { bpm: 140, loop: false,
  lead: [['C5', 2], ['E5', 2], ['G5', 2], ['C6', 4], ['B5', 2], ['G5', 2], ['A5', 4], ['C6', 8]],
  bass: [['C3', 4], ['G3', 4], ['F3', 4], ['C3', 8]], drums: '' };
const CLEAR_FANFARE = { bpm: 160, loop: false,
  lead: [['G5', 2], ['G5', 2], ['G5', 2], ['A5', 2], ['B5', 4], ['A5', 2], ['B5', 2], ['C6', 8], ['E6', 2], ['D6', 2], ['C6', 2], ['D6', 2], ['E6', 10]],
  bass: [['G3', 8], ['F3', 8], ['C3', 8], ['G3', 4], ['C3', 8]], drums: 'k...k...k...s.ss' + 'k...k...k.......' };
const DEATH_JINGLE = { bpm: 120, loop: false,
  lead: [['B4', 2], ['G4', 2], ['E4', 4], [null, 2], ['D4', 2], ['C4', 2], ['B3', 6]],
  bass: [['E2', 8], ['C2', 8]], drums: '' };
const GAMEOVER_STING = { bpm: 100, loop: false,
  lead: [['E4', 4], ['D#4', 4], ['D4', 4], ['C#4', 8], [null, 2], ['C4', 10]],
  bass: [['A2', 8], ['G#2', 8], ['F2', 12]], drums: '' };

export class AudioSys {
  constructor() {
    this.ctx = null; this.muted = false; this.master = null;
    this.song = null; this.timer = null;
    try { this.muted = localStorage.getItem('dbw_muted') === '1'; } catch (e) { /* ignore */ }
  }
  /** Create / resume the context. Must be called from a user gesture on iOS. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.5; this.master.connect(this.ctx.destination);
      // noise buffer for drums / sfx
      const len = this.ctx.sampleRate; const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (this.song && !this.timer) this._startScheduler();
  }
  get ready() { return !!this.ctx && this.ctx.state === 'running'; }
  setMuted(m) {
    this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
    try { localStorage.setItem('dbw_muted', m ? '1' : '0'); } catch (e) { /* ignore */ }
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  // ---- synth primitives --------------------------------------------------
  tone({ f = 440, f2 = null, type = 'square', t = 0, dur = 0.1, vol = 0.3, attack = 0.005, release = 0.05, vib = 0 }) {
    if (!this.ctx) return; const c = this.ctx; const now = c.currentTime + t;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, now);
    if (f2 !== null) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), now + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(vol, now + attack);
    g.gain.setValueAtTime(vol, now + Math.max(attack, dur - release)); g.gain.linearRampToValueAtTime(0, now + dur + 0.01);
    if (vib) { const lfo = c.createOscillator(); lfo.frequency.value = 12; const lg = c.createGain(); lg.gain.value = vib; lfo.connect(lg); lg.connect(o.frequency); lfo.start(now); lfo.stop(now + dur + 0.05); }
    o.connect(g); g.connect(this.master); o.start(now); o.stop(now + dur + 0.05);
  }
  noise({ t = 0, dur = 0.1, vol = 0.2, hp = 0, lp = 8000 }) {
    if (!this.ctx) return; const c = this.ctx; const now = c.currentTime + t;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const g = c.createGain(); g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    let node = s;
    if (lp < 8000) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node.connect(f); node = f; }
    if (hp > 0) { const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; }
    node.connect(g); g.connect(this.master); s.start(now); s.stop(now + dur + 0.02);
  }

  // ---- sound effects -----------------------------------------------------
  sfx(name) {
    if (!this.ctx || this.muted) return;
    const T = (o) => this.tone(o), N = (o) => this.noise(o);
    switch (name) {
      case 'jump': T({ f: 300, f2: 700, type: 'square', dur: 0.14, vol: 0.18 }); break;
      case 'stomp': N({ dur: 0.08, vol: 0.3, lp: 1200 }); T({ f: 180, f2: 60, type: 'square', dur: 0.12, vol: 0.2 }); break;
      case 'coin': T({ f: NOTE.B5, type: 'square', dur: 0.07, vol: 0.18 }); T({ f: NOTE.E6, type: 'square', t: 0.07, dur: 0.25, vol: 0.18, release: 0.2 }); break;
      case 'bump': T({ f: 150, f2: 90, type: 'square', dur: 0.08, vol: 0.2 }); break;
      case 'brick': N({ dur: 0.2, vol: 0.35, lp: 2500 }); T({ f: 120, f2: 50, type: 'triangle', dur: 0.15, vol: 0.25 }); break;
      case 'powerupAppear': [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6].forEach((f, i) => T({ f, type: 'square', t: i * 0.05, dur: 0.08, vol: 0.15 })); break;
      case 'beer': // chug chug chug ... then RIP
        [0, 0.15, 0.3].forEach(t => T({ f: 160, f2: 240, type: 'sine', t, dur: 0.12, vol: 0.3 }));
        [0, 0.15, 0.3].forEach(t => N({ t: t + 0.02, dur: 0.06, vol: 0.08, lp: 600 }));
        break;
      case 'rip': N({ dur: 0.35, vol: 0.4, hp: 400, lp: 4000 }); T({ f: 90, f2: 40, type: 'sawtooth', dur: 0.3, vol: 0.15 }); break;
      case 'flex': [NOTE.G4, NOTE.C5, NOTE.E5, NOTE.G5].forEach((f, i) => T({ f, type: 'square', t: i * 0.06, dur: 0.3, vol: 0.15 })); break;
      case 'shieldBreak': T({ f: 600, f2: 150, type: 'square', dur: 0.3, vol: 0.2 }); N({ t: 0.05, dur: 0.25, vol: 0.2, hp: 800 }); break;
      case 'throw': N({ dur: 0.12, vol: 0.2, hp: 1500 }); T({ f: 500, f2: 900, type: 'triangle', dur: 0.08, vol: 0.12 }); break;
      case 'oneUp': [NOTE.E5, NOTE.G5, NOTE.E6, NOTE.C6, NOTE.D6, NOTE.G6].forEach((f, i) => T({ f, type: 'square', t: i * 0.07, dur: 0.1, vol: 0.16 })); break;
      case 'flash': T({ f: 2000, type: 'square', dur: 0.03, vol: 0.15 }); N({ t: 0.03, dur: 0.15, vol: 0.15, hp: 3000 }); T({ f: 1200, f2: 2400, type: 'sine', t: 0.05, dur: 0.2, vol: 0.1 }); break;
      case 'whistle': T({ f: 2200, type: 'square', dur: 0.35, vol: 0.12, vib: 60 }); break;
      case 'checkpoint': T({ f: NOTE.G5, type: 'square', dur: 0.1, vol: 0.18 }); T({ f: NOTE.C6, type: 'square', t: 0.1, dur: 0.1, vol: 0.18 }); T({ f: NOTE.E6, type: 'square', t: 0.2, dur: 0.3, vol: 0.18 }); break;
      case 'flagpole': T({ f: 1200, f2: 300, type: 'square', dur: 1.2, vol: 0.12 }); break;
      case 'trophy': [NOTE.C6, NOTE.E6, NOTE.G6, NOTE.C7].forEach((f, i) => T({ f, type: 'square', t: i * 0.08, dur: 0.25, vol: 0.14 })); break;
      case 'hurt': T({ f: 400, f2: 120, type: 'square', dur: 0.2, vol: 0.2 }); break;
      case 'kick': T({ f: 120, f2: 40, type: 'sine', dur: 0.15, vol: 0.4 }); break;
      case 'firework': N({ dur: 0.5, vol: 0.3, lp: 3000 }); T({ f: 800, f2: 200, type: 'sine', dur: 0.4, vol: 0.1 }); break;
      case 'click': T({ f: 800, type: 'square', dur: 0.03, vol: 0.12 }); break;
      case 'bounce': T({ f: 250, f2: 400, type: 'square', dur: 0.08, vol: 0.12 }); break;
      case 'bark': T({ f: 500, f2: 300, type: 'sawtooth', dur: 0.1, vol: 0.12 }); break;
      case 'charge': N({ dur: 0.3, vol: 0.15, lp: 900 }); break;
      case 'splash': N({ dur: 0.45, vol: 0.35, lp: 1800 }); T({ f: 300, f2: 90, type: 'sine', dur: 0.3, vol: 0.2 }); break;
      case 'tick': T({ f: 1000, type: 'square', dur: 0.02, vol: 0.08 }); break;
      default: break;
    }
  }

  // ---- music ---------------------------------------------------------------
  playMusic(name) {
    const songs = { level: LEVEL_SONG, title: TITLE_JINGLE, clear: CLEAR_FANFARE, death: DEATH_JINGLE, gameover: GAMEOVER_STING };
    this.stopMusic();
    this.song = { def: songs[name], step: 0, nextTime: 0, leadI: 0, leadLeft: 0, bassI: 0, bassLeft: 0, finished: false };
    if (this.ctx) this._startScheduler();
  }
  stopMusic() { this.song = null; if (this.timer) { clearInterval(this.timer); this.timer = null; } }
  pauseMusic() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
  resumeMusic() { if (this.song && this.ctx && !this.timer) { this.song.nextTime = 0; this._startScheduler(); } }
  _startScheduler() {
    const s = this.song; s.nextTime = this.ctx.currentTime + 0.05;
    const tick = () => {
      if (!this.song) return;
      while (s.nextTime < this.ctx.currentTime + 0.25) {
        if (s.finished) { if (!s.def.loop) { this.stopMusic(); return; } s.step = 0; s.leadI = 0; s.leadLeft = 0; s.bassI = 0; s.bassLeft = 0; s.finished = false; }
        this._scheduleStep(s, s.nextTime);
        s.nextTime += 60 / s.def.bpm / 4;
        s.step++;
      }
    };
    tick(); this.timer = setInterval(tick, 80);
  }
  _scheduleStep(s, time) {
    const d = s.def; const stepDur = 60 / d.bpm / 4; const t = time - this.ctx.currentTime;
    const play = (seq, iKey, leftKey, type, vol, octaveShift) => {
      if (s[leftKey] > 0) { s[leftKey]--; return; }
      if (s[iKey] >= seq.length) { s.finished = true; return; }
      const [n, len] = seq[s[iKey]++]; s[leftKey] = len - 1;
      if (n && !this.muted) this.tone({ f: NOTE[n] * octaveShift, type, t, dur: stepDur * len * 0.9, vol, attack: 0.005, release: stepDur * 0.4 });
    };
    play(d.lead, 'leadI', 'leadLeft', 'square', 0.09, 1);
    play(d.bass, 'bassI', 'bassLeft', 'triangle', 0.16, 1);
    if (d.drums && !this.muted) {
      const ch = d.drums[s.step % d.drums.length];
      if (ch === 'k') this.tone({ f: 110, f2: 35, type: 'sine', t, dur: 0.12, vol: 0.3 });
      else if (ch === 's') this.noise({ t, dur: 0.1, vol: 0.14, hp: 900 });
      else if (ch === 'h') this.noise({ t, dur: 0.03, vol: 0.05, hp: 5000 });
    }
    if (s.leadI >= d.lead.length && s.leadLeft <= 0 && s.bassI >= d.bass.length && s.bassLeft <= 0) s.finished = true;
  }
}

export const audio = new AudioSys();
