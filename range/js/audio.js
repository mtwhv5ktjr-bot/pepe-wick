/* ARSENAL RANGE — procedural WebAudio. Parametric gunshots per archetype. */
(function (global) {
  'use strict';
  let ctx = null, master = null, musicGain = null, muted = false, musicTimer = null;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (global.AudioContext || global.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = 0.12; musicGain.connect(master);
      muted = localStorage.getItem('ar_mute') === '1';
      master.gain.value = muted ? 0 : 0.5;
      startAmbience();
      return true;
    } catch (e) { return false; }
  }
  function unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); }

  function noiseBuf(len) {
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function env(g, t0, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec);
  }
  function burst(dur, peak, freq, type) {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf(dur + 0.05);
    const f = ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq;
    const g = ctx.createGain(); env(g, t, 0.002, peak, dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.06);
  }
  function tone(freq, dur, peak, type, slideTo) {
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = ctx.createGain(); env(g, t, 0.004, peak, dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // parametric gunshot: bigger rounds = lower filter + longer tail
  const SHOT_PARAMS = {
    pistol:  { dur: 0.09, peak: 0.55, freq: 2200, thump: 200 },
    micro:   { dur: 0.05, peak: 0.34, freq: 3400, thump: 0 },
    smg:     { dur: 0.06, peak: 0.40, freq: 2900, thump: 0 },
    shotgun: { dur: 0.22, peak: 0.85, freq: 1200, thump: 80 },
    rifle:   { dur: 0.09, peak: 0.55, freq: 2500, thump: 160 },
    dmr:     { dur: 0.13, peak: 0.65, freq: 2000, thump: 140 },
    sniper:  { dur: 0.30, peak: 0.95, freq: 1500, thump: 60 },
    lmg:     { dur: 0.08, peak: 0.50, freq: 2300, thump: 120 },
  };
  function shot(arch, suppressed) {
    if (!ctx || muted) return;
    const p = SHOT_PARAMS[arch] || SHOT_PARAMS.pistol;
    if (suppressed) { burst(p.dur * 0.6, p.peak * 0.4, p.freq * 0.55); tone(300, 0.04, 0.1, 'square', 150); }
    else {
      burst(p.dur, p.peak, p.freq);
      if (p.thump) tone(p.thump, p.dur * 1.4, p.peak * 0.4, 'sine', p.thump * 0.4);
    }
  }

  const SFX = {
    ding() { tone(1320, 0.1, 0.2, 'triangle'); setTimeout(() => muted || tone(1980, 0.12, 0.12, 'triangle'), 50); },
    bullseye() { [1320, 1760, 2200].forEach((f, i) => setTimeout(() => muted || tone(f, 0.1, 0.16, 'triangle'), i * 55)); },
    thock() { burst(0.05, 0.4, 900); },
    discPop() { burst(0.12, 0.5, 1600); tone(500, 0.1, 0.2, 'square', 240); },
    civAlarm() { tone(220, 0.3, 0.4, 'square', 110); setTimeout(() => muted || tone(180, 0.35, 0.4, 'square', 90), 180); },
    dq() { [200, 160, 120, 80].forEach((f, i) => setTimeout(() => muted || tone(f, 0.4, 0.35, 'sawtooth'), i * 220)); },
    reload() { tone(420, 0.05, 0.18, 'square', 200); setTimeout(() => muted || tone(520, 0.05, 0.18, 'square', 700), 160); },
    dry() { tone(300, 0.05, 0.2, 'square', 220); },
    ui() { tone(520, 0.04, 0.1, 'triangle'); },
    launch() { tone(180, 0.2, 0.25, 'sine', 420); },
    countdown() { tone(660, 0.1, 0.2, 'square'); },
    go() { tone(880, 0.22, 0.25, 'square'); },
    medal_bronze() { [392, 523].forEach((f, i) => setTimeout(() => muted || tone(f, 0.2, 0.2, 'triangle'), i * 140)); },
    medal_silver() { [523, 659, 784].forEach((f, i) => setTimeout(() => muted || tone(f, 0.2, 0.2, 'triangle'), i * 130)); },
    medal_gold() { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => muted || tone(f, 0.22, 0.22, 'triangle'), i * 120)); },
    medal_none() { tone(240, 0.4, 0.2, 'sawtooth', 160); },
    phase() { tone(392, 0.15, 0.2, 'sawtooth'); setTimeout(() => muted || tone(523, 0.18, 0.2, 'sawtooth'), 140); },
  };

  function startAmbience() {
    if (musicTimer) return;
    // low hall hum + rain on the skylight
    const hum = ctx.createOscillator(); hum.type = 'sine'; hum.frequency.value = 55;
    const hg = ctx.createGain(); hg.gain.value = 0.05;
    hum.connect(hg); hg.connect(musicGain); hum.start();
    const rain = ctx.createBufferSource(); rain.buffer = noiseBuf(2); rain.loop = true;
    const rf = ctx.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 4800; rf.Q.value = 0.4;
    const rg = ctx.createGain(); rg.gain.value = 0.035;
    rain.connect(rf); rf.connect(rg); rg.connect(musicGain); rain.start();
    const chords = [[110, 130.8], [98, 123.5], [87.3, 110], [103.8, 130.8]];
    let ci = 0;
    function pad() {
      const t = ctx.currentTime, ch = chords[ci % chords.length]; ci++;
      for (const f of ch) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
        const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 340;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.04, t + 2.5);
        g.gain.linearRampToValueAtTime(0.0001, t + 8.8);
        o.connect(flt); flt.connect(g); g.connect(musicGain);
        o.start(t); o.stop(t + 9);
      }
    }
    pad();
    musicTimer = setInterval(pad, 8800);
  }

  global.AR_AUDIO = {
    unlock, shot,
    play(name) { if (!ctx || muted) return; const f = SFX[name]; if (f) try { f(); } catch (e) {} },
    toggleMute() {
      muted = !muted;
      localStorage.setItem('ar_mute', muted ? '1' : '0');
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() { return muted || localStorage.getItem('ar_mute') === '1'; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
