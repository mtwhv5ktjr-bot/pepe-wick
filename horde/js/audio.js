/* PEPE WICK vs HORDE — audio. WebAudio synth: a scheduled war-march (kick /
   hats / bass / stabs / pad) with per-road tempo + key, three intensity stems
   driven by squad size, and procedural SFX. Zero assets. */
const AC = window.AudioContext || window.webkitAudioContext;

export class Audio {
  constructor() {
    this.ctx = null; this.on = true; this.musicOn = true;
    this.intensity = 0; this.bpm = 128; this.key = 0; this.mood = 'noir';
    this.next = 0; this.step = 0; this.timer = null; this.playing = false;
    this.lastShot = 0;
  }
  boot() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.7; this.master.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    this.mus = c.createGain(); this.mus.gain.value = 0.55; this.mus.connect(this.master);
    this.stem = [0, 1, 2].map(() => { const g = c.createGain(); g.gain.value = 0; g.connect(this.mus); return g; });
    this.stem[0].gain.value = 1;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(c.destination);
    this.master.disconnect(); this.master.connect(comp);
    // noise buffer
    const n = c.sampleRate * 2, buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
  }
  setMusic(m) { this.bpm = m.bpm; this.key = m.key; this.mood = m.mood; }
  setIntensity(v) { this.intensity = Math.max(0, Math.min(1, v)); }
  start() { this.boot(); if (this.playing) return; this.playing = true; this.step = 0; this.next = this.ctx.currentTime + 0.05; this.timer = setInterval(() => this.schedule(), 60); }
  stop() { this.playing = false; if (this.timer) clearInterval(this.timer); this.timer = null; }
  freq(semi) { return 55 * Math.pow(2, (semi + this.key) / 12); }
  env(g, t, a, d, s, r, peak) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.linearRampToValueAtTime(peak * s, t + a + d); g.gain.linearRampToValueAtTime(0, t + a + d + r); }
  tone(type, f, t, dur, vol, dest, opts) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (opts && opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), t + dur);
    let node = o;
    if (opts && opts.lp) { const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = opts.lp; lp.Q.value = opts.q || 1; o.connect(lp); node = lp; }
    node.connect(g); g.connect(dest || this.sfx);
    this.env(g, t, opts && opts.a != null ? opts.a : 0.005, dur * 0.4, opts && opts.s != null ? opts.s : 0.4, dur * 0.6, vol);
    o.start(t); o.stop(t + dur + 0.05);
  }
  hiss(t, dur, vol, dest, lp, hp) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise;
    let node = s;
    if (lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node.connect(f); node = f; }
    if (hp) { const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; }
    const g = c.createGain(); node.connect(g); g.connect(dest || this.sfx);
    this.env(g, t, 0.002, dur * 0.3, 0.3, dur * 0.7, vol);
    s.start(t); s.stop(t + dur + 0.05);
  }
  schedule() {
    if (!this.playing || !this.musicOn) return;
    const c = this.ctx, spb = 60 / this.bpm / 4; // 16th
    while (this.next < c.currentTime + 0.25) {
      const t = this.next, st = this.step % 32, bar = Math.floor(this.step / 16);
      const I = this.intensity;
      this.stem[1].gain.setTargetAtTime(Math.max(0, Math.min(1, (I - 0.1) / 0.45)), t, 0.4);
      this.stem[2].gain.setTargetAtTime(Math.max(0, Math.min(1, (I - 0.5) / 0.45)), t, 0.4);
      // kick: four on the floor + ghost
      if (st % 4 === 0) this.tone('sine', 150, t, 0.22, 0.9, this.stem[0], { slide: 42, a: 0.002, s: 0.1 });
      // bass: 8th-note minor riff
      const riff = this.mood === 'techno' ? [0, 0, 3, 0, 5, 0, 3, 0] : this.mood === 'club' ? [0, 0, 7, 0, 5, 3, 0, 0] : [0, 0, 0, 3, 0, 0, 5, 3];
      if (st % 2 === 0) { const n = riff[(st / 2) % 8] + (bar % 4 === 3 ? -2 : 0); this.tone('sawtooth', this.freq(n) / 2, t, spb * 1.8, 0.35, this.stem[0], { lp: 380 + I * 900, q: 4, s: 0.5 }); }
      // hats + clap on stem 1
      if (st % 2 === 1) this.hiss(t, 0.05, 0.12 + 0.1 * (st % 4 === 3), this.stem[1], null, 7000);
      if (st % 16 === 8) this.hiss(t, 0.14, 0.5, this.stem[1], 2500, 900);
      // stabs + pad on stem 2
      if (st % 8 === 6 || (bar % 2 === 1 && st % 8 === 3)) { for (const n of [12, 15, 19]) this.tone('square', this.freq(n + (bar % 4 === 3 ? -2 : 0)), t, spb * 1.2, 0.08, this.stem[2], { lp: 1800, s: 0.2 }); }
      if (st === 0) { for (const n of [7, 12, 15]) this.tone('triangle', this.freq(n) * 2, t, spb * 15, 0.045, this.stem[2], { a: 0.4, s: 0.9 }); }
      this.next += spb; this.step++;
    }
  }
  // ---- sfx ----
  shot(style, holo) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    if (t - this.lastShot < 0.03) return; this.lastShot = t;
    const base = style === 'pellet' ? 90 : style === 'lance' ? 260 : style === 'auto' ? 180 : 140;
    this.hiss(t, style === 'pellet' ? 0.12 : 0.06, style === 'pellet' ? 0.5 : 0.25, null, style === 'auto' ? 3000 : 5000, 600);
    this.tone('square', base * (holo ? 1.5 : 1), t, 0.05, 0.12, null, { slide: base * 0.5 });
  }
  hit(crit) { if (!this.ctx || !this.on) return; const t = this.ctx.currentTime; this.hiss(t, 0.04, crit ? 0.35 : 0.15, null, 2500, 300); if (crit) this.tone('triangle', 1200, t, 0.08, 0.2, null, { slide: 600 }); }
  kill(big) { if (!this.ctx || !this.on) return; const t = this.ctx.currentTime; this.tone('sine', big ? 70 : 110, t, big ? 0.3 : 0.14, big ? 0.8 : 0.5, null, { slide: 30 }); this.hiss(t, 0.12, 0.25, null, 900); }
  gate(good) { if (!this.ctx || !this.on) return; const t = this.ctx.currentTime; if (good) { [0, 4, 7, 12].forEach((n, i) => this.tone('triangle', this.freq(24 + n), t + i * 0.05, 0.18, 0.3)); } else { this.tone('sawtooth', 180, t, 0.3, 0.3, null, { slide: 60, lp: 900 }); } }
  merge() { if (!this.ctx || !this.on) return; const t = this.ctx.currentTime; [0, 7, 12, 19, 24].forEach((n, i) => this.tone('square', this.freq(24 + n), t + i * 0.07, 0.35, 0.25, null, { lp: 3000 })); this.hiss(t, 0.5, 0.3, null, 4000, 1500); }
  boom() { if (!this.ctx || !this.on) return; const t = this.ctx.currentTime; this.tone('sine', 90, t, 0.5, 1.0, null, { slide: 25 }); this.hiss(t, 0.45, 0.6, null, 1200); }
  roar() { if (!this.ctx || !this.on) return; const t = this.ctx.currentTime; this.tone('sawtooth', 55, t, 1.2, 0.7, null, { slide: 38, lp: 500, q: 6, a: 0.05 }); this.hiss(t, 1.0, 0.4, null, 700); }
  hurt() { if (!this.ctx || !this.on) return; const t = this.ctx.currentTime; this.tone('square', 220, t, 0.12, 0.25, null, { slide: 90 }); this.hiss(t, 0.1, 0.2, null, 1500); }
  coin() { if (!this.ctx || !this.on) return; const t = this.ctx.currentTime; this.tone('sine', 1760, t, 0.08, 0.12); this.tone('sine', 2349, t + 0.06, 0.1, 0.1); }
  ui() { if (!this.ctx || !this.on) return; const t = this.ctx.currentTime; this.tone('triangle', 880, t, 0.06, 0.2); }
  draft() { if (!this.ctx || !this.on) return; const t = this.ctx.currentTime; [0, 5, 9].forEach((n, i) => this.tone('triangle', this.freq(36 + n), t + i * 0.09, 0.4, 0.2)); }
  clear() { if (!this.ctx || !this.on) return; const t = this.ctx.currentTime; [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.tone('square', this.freq(24 + n), t + i * 0.09, 0.5, 0.2, null, { lp: 2500 })); }
  dead() { if (!this.ctx || !this.on) return; const t = this.ctx.currentTime; [12, 8, 5, 0].forEach((n, i) => this.tone('sawtooth', this.freq(12 + n), t + i * 0.22, 0.6, 0.25, null, { lp: 800 })); }
}
