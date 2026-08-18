/* CONTINENTAL SIEGE — procedural WebAudio. No asset files, house rules. */
(function (global) {
  'use strict';
  let ctx = null, master = null, musicGain = null, muted = false, musicOn = true;
  let musicTimer = null;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (global.AudioContext || global.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = 0.16; musicGain.connect(master);
      try { muted = localStorage.getItem('cs_mute') === '1'; } catch (e) {}
      master.gain.value = muted ? 0 : 0.5;
      startMusic();
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
  function burst(dur, peak, filterFreq, type) {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf(dur + 0.05);
    const f = ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = filterFreq;
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

  const SFX = {
    shot_pistol() { burst(0.07, 0.5, 2400); tone(320, 0.05, 0.18, 'square', 120); },
    shot_smg() { burst(0.045, 0.32, 3200); },
    shot_shotgun() { burst(0.18, 0.75, 1400); tone(90, 0.12, 0.3, 'sine', 45); },
    shot_sniper() { burst(0.05, 0.7, 5200, 'highpass'); tone(1400, 0.22, 0.12, 'sawtooth', 180); },
    shot_gatling() { burst(0.04, 0.36, 2800); },
    lob() { tone(150, 0.18, 0.3, 'sine', 60); },
    splash() { burst(0.4, 0.8, 900); tone(70, 0.3, 0.4, 'sine', 30); },
    tesla() { const t = ctx.currentTime; for (let i = 0; i < 3; i++) tone(900 + Math.random() * 900, 0.05, 0.14, 'sawtooth', 200); burst(0.06, 0.2, 6000, 'highpass'); },
    coin() { tone(1180, 0.07, 0.12, 'triangle'); setTimeout(() => muted || tone(1560, 0.09, 0.1, 'triangle'), 40); },
    mint() { tone(880, 0.06, 0.1, 'triangle'); setTimeout(() => muted || tone(1320, 0.08, 0.09, 'triangle'), 50); },
    die() { burst(0.09, 0.3, 700); },
    boss_die() { burst(0.5, 0.9, 700); tone(60, 0.5, 0.5, 'sine', 28); },
    leak() { tone(660, 0.12, 0.3, 'square', 440); setTimeout(() => muted || tone(440, 0.18, 0.3, 'square', 330), 110); },
    place() { tone(240, 0.08, 0.2, 'triangle', 320); burst(0.05, 0.15, 1200); },
    upgrade() { tone(392, 0.08, 0.18, 'triangle'); setTimeout(() => muted || tone(523, 0.08, 0.18, 'triangle'), 70); setTimeout(() => muted || tone(659, 0.1, 0.18, 'triangle'), 140); },
    sell() { tone(523, 0.07, 0.15, 'triangle', 392); },
    ui() { tone(520, 0.04, 0.1, 'triangle'); },
    deny() { tone(180, 0.12, 0.2, 'square', 120); },
    wave() { tone(196, 0.3, 0.25, 'sawtooth'); setTimeout(() => muted || tone(261, 0.35, 0.25, 'sawtooth'), 180); },
    boss() { tone(98, 0.7, 0.4, 'sawtooth', 65); burst(0.4, 0.3, 500); },
    reveal() { tone(1200, 0.08, 0.1, 'sine', 2400); },
    win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => muted || tone(f, 0.22, 0.2, 'triangle'), i * 130)); },
    lose() { [392, 311, 261, 196].forEach((f, i) => setTimeout(() => muted || tone(f, 0.3, 0.22, 'sawtooth'), i * 200)); },
  };

  // ambient: slow minor pad + rain hiss, Continental after midnight
  function startMusic() {
    if (musicTimer || !musicOn) return;
    const chords = [[110, 130.8, 164.8], [98, 116.5, 146.8], [87.3, 110, 130.8], [98, 123.5, 146.8]];
    let ci = 0;
    // rain bed
    const rain = ctx.createBufferSource(); rain.buffer = noiseBuf(2); rain.loop = true;
    const rf = ctx.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 5200; rf.Q.value = 0.5;
    const rg = ctx.createGain(); rg.gain.value = 0.05;
    rain.connect(rf); rf.connect(rg); rg.connect(musicGain); rain.start();
    function pad() {
      const t = ctx.currentTime, ch = chords[ci % chords.length]; ci++;
      for (const f of ch) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
        const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f * 1.006;
        const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 420;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.05, t + 2.2);
        g.gain.linearRampToValueAtTime(0.0001, t + 7.6);
        o.connect(flt); o2.connect(flt); flt.connect(g); g.connect(musicGain);
        o.start(t); o2.start(t); o.stop(t + 8); o2.stop(t + 8);
      }
    }
    pad();
    musicTimer = setInterval(pad, 7600);
  }

  const AUDIO = {
    unlock,
    play(name) { if (!ctx || muted) return; const f = SFX[name]; if (f) try { f(); } catch (e) {} },
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem('cs_mute', muted ? '1' : '0'); } catch (e) {}
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() { try { return muted || localStorage.getItem('cs_mute') === '1'; } catch (e) { return muted; } },
  };
  global.CS_AUDIO = AUDIO;
})(typeof window !== 'undefined' ? window : globalThis);
