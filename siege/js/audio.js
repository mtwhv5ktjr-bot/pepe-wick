/* CONTINENTAL SIEGE — procedural WebAudio v2: an ADAPTIVE SCORE + layered SFX.
   No asset files (house rule). One AudioContext, one master chain
   (compressor → destination), a generated impulse-response reverb bus and a
   ping-pong delay bus shared by music and SFX so everything sits in one room.

   THE SCORE
   - Lookahead scheduler (25 ms tick, 120 ms horizon) at a fixed BPM per palette.
   - Harmony: chord progressions per floor palette, chord change every 2 bars.
   - Layers gated by INTENSITY 0..1 (set by the game each frame):
       pad (always) · kick+sub bass+hats (wave active) · motif melody (>.35)
       · arp + clap + open hat (>.6) · tension strings (danger) · half-time + bass stab (boss)
   - Palettes: lounge (lobby/title), quartet (mezzanine), rhodes (sommelier bar),
     industrial (vault), minimal (administration), synthwave (rooftop), pit.
   - Sidechain: every kick ducks pad + bass; wave-clear / win / lose are cadences.

   API (unchanged names + new state hooks):
     CS_AUDIO.unlock() · play(name) · toggleMute() · isMuted()
     CS_AUDIO.setState({ scene:'title'|'floors'|'battle'|'results', floor, intensity, danger, boss, active })
     CS_AUDIO.cue('clear'|'win'|'lose'|'boss')
*/
(function (global) {
  'use strict';
  let ctx = null, master = null, comp = null, musicBus = null, sfxBus = null, revBus = null, revSend = null, dlySend = null;
  // three independent switches: muted = everything (legacy), musicOff = the score only, sfxOff = the guns only
  let muted = false, musicOff = false, sfxOff = false;
  const MUSIC_LVL = 0.42, SFX_LVL = 0.9;
  const LS = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

  // ------------------------------------------------------------------ graph
  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (global.AudioContext || global.webkitAudioContext)();
      comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
      master = ctx.createGain(); master.gain.value = 0.55;
      master.connect(comp); comp.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.gain.value = 0.42; musicBus.connect(master);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
      // reverb: generated IR (2.4 s, lowpassed, early-reflection bump)
      const conv = ctx.createConvolver(); conv.buffer = impulse(2.4, 2.6);
      revBus = ctx.createGain(); revBus.gain.value = 0.9; revSend = ctx.createGain(); revSend.gain.value = 1;
      revSend.connect(conv); conv.connect(revBus); revBus.connect(master);
      // ping-pong delay (dotted 8th at 92 BPM)
      const dl = ctx.createDelay(1.5), dr = ctx.createDelay(1.5); dl.delayTime.value = 0.489; dr.delayTime.value = 0.489 * 1.5;
      const fb = ctx.createGain(); fb.gain.value = 0.34; const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2400;
      const pl = ctx.createStereoPanner ? ctx.createStereoPanner() : null, pr = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (pl) { pl.pan.value = -0.6; pr.pan.value = 0.6; }
      dlySend = ctx.createGain(); dlySend.gain.value = 1;
      dlySend.connect(dl); dl.connect(dlp); dlp.connect(fb); fb.connect(dr); dr.connect(dl);
      const dOut = ctx.createGain(); dOut.gain.value = 0.5;
      if (pl) { dl.connect(pl); pl.connect(dOut); dr.connect(pr); pr.connect(dOut); } else { dl.connect(dOut); dr.connect(dOut); }
      dOut.connect(master);
      muted = LS.get('cs_mute') === '1'; musicOff = LS.get('cs_music') === '0'; sfxOff = LS.get('cs_sfx') === '0';
      master.gain.value = muted ? 0 : 0.55; musicBus.gain.value = musicOff ? 0 : MUSIC_LVL; sfxBus.gain.value = sfxOff ? 0 : SFX_LVL;
      startScheduler();
      return true;
    } catch (e) { return false; }
  }
  function unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); }
  function impulse(sec, decay) {
    const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let lp = 0; for (let i = 0; i < n; i++) { const t = i / n; const w = (Math.random() * 2 - 1) * Math.pow(1 - t, decay); lp += (w - lp) * 0.35; d[i] = lp * (i < 2400 ? 1 + 0.6 * Math.exp(-i / 700) : 1); } }
    return b;
  }
  const noiseCache = {};
  function noiseBuf(len) { const k = len.toFixed(2); if (noiseCache[k]) return noiseCache[k]; const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return (noiseCache[k] = b); }
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  // ------------------------------------------------------------------ voices (all take an absolute start time)
  function vEnv(g, t, a, peak, d, s, r, dur) { // ADSR-ish; dur = gate length
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * s), t + a + d);
    g.gain.setValueAtTime(Math.max(0.0001, peak * s), t + Math.max(a + d, dur)); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a + d, dur) + r);
    return t + Math.max(a + d, dur) + r + 0.05;
  }
  function osc(type, f, t, end, detune) { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (detune) o.detune.value = detune; o.start(t); o.stop(end); return o; }
  // KICK: sine drop + click; returns nothing. Also duck the sidechain bus.
  function kick(t, vel, sub) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(sub ? 150 : 180, t); o.frequency.exponentialRampToValueAtTime(sub ? 42 : 50, t + 0.09);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + (sub ? 0.42 : 0.28));
    o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.5);
    const c = ctx.createBufferSource(); c.buffer = noiseBuf(0.05); const cf = ctx.createBiquadFilter(); cf.type = 'highpass'; cf.frequency.value = 2400; const cg = ctx.createGain(); cg.gain.setValueAtTime(vel * 0.25, t); cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.02); c.connect(cf); cf.connect(cg); cg.connect(musicBus); c.start(t); c.stop(t + 0.06);
    duck(t);
  }
  function duck(t) { for (const b of [S.padGain, S.bassGain, S.arpGain]) if (b) { b.gain.cancelScheduledValues(t); b.gain.setValueAtTime(b.gain.value, t); b.gain.linearRampToValueAtTime(b.target * 0.35, t + 0.012); b.gain.setTargetAtTime(b.target, t + 0.03, 0.09); } }
  function hat(t, vel, open) { const s = ctx.createBufferSource(); s.buffer = noiseBuf(0.4); const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000 + Math.random() * 1500; const g = ctx.createGain(); g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (open ? 0.22 : 0.045)); s.connect(f); f.connect(g); g.connect(musicBus); s.start(t); s.stop(t + 0.3); }
  function clap(t, vel) { for (let i = 0; i < 3; i++) { const s = ctx.createBufferSource(); s.buffer = noiseBuf(0.3); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.9; const g = ctx.createGain(); const tt = t + i * 0.011; g.gain.setValueAtTime(vel * (i === 2 ? 1 : 0.6), tt); g.gain.exponentialRampToValueAtTime(0.0001, tt + (i === 2 ? 0.16 : 0.03)); s.connect(f); f.connect(g); g.connect(musicBus); g.connect(revSend); s.start(tt); s.stop(tt + 0.25); } }
  function clank(t, vel) { const f0 = 800 + Math.random() * 1400; for (const r of [1, 2.76, 5.4]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f0 * r; const g = ctx.createGain(); g.gain.setValueAtTime(vel * 0.12 / r, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12 / Math.sqrt(r)); o.connect(g); g.connect(musicBus); g.connect(revSend); o.start(t); o.stop(t + 0.2); } }
  function bass(t, m, dur, pal) {
    const f = mtof(m); const end = t + dur + 0.3;
    const o = osc(pal.bassWave, f, t, end), o2 = pal.bassSub ? osc('sine', f / 2, t, end) : null;
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.setValueAtTime(pal.bassCut, t); flt.frequency.exponentialRampToValueAtTime(pal.bassCut * 0.45, t + dur); flt.Q.value = 3;
    const g = ctx.createGain(); vEnv(g, t, 0.006, pal.bassLvl, 0.08, 0.7, 0.08, dur);
    o.connect(flt); if (o2) o2.connect(g); flt.connect(g); g.connect(S.bassGain);
    if (pal.dist) { const ws = ctx.createWaveShaper(); ws.curve = S.curve; flt.disconnect(); flt.connect(ws); ws.connect(g); }
  }
  function padChord(t, notes, dur, pal) {
    const end = t + dur + 1.6;
    for (const m of notes) {
      const f = mtof(m);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(pal.padLvl, t + 0.9); g.gain.setValueAtTime(pal.padLvl, t + dur - 0.6); g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.2);
      const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = pal.padCut; flt.Q.value = 0.8; S.padFilters.push(flt);
      if (pal.padWave === 'fm') { // rhodes-ish: sine carrier + 2 sine mods (fast decay of index)
        const c = osc('sine', f, t, end), md = osc('sine', f * 3.5, t, end); const mg = ctx.createGain(); mg.gain.setValueAtTime(f * 1.4, t); mg.gain.exponentialRampToValueAtTime(f * 0.15, t + 1.2); md.connect(mg); mg.connect(c.frequency); c.connect(flt);
        const tr = ctx.createOscillator(); tr.type = 'sine'; tr.frequency.value = 4.2; const tg = ctx.createGain(); tg.gain.value = 0.35; const trg = ctx.createGain(); trg.gain.value = 1; tr.connect(tg); tg.connect(trg.gain); flt.connect(trg); trg.connect(g); tr.start(t); tr.stop(end);
      } else {
        const o1 = osc(pal.padWave, f, t, end, -pal.padDetune), o2 = osc(pal.padWave, f, t, end, pal.padDetune); o1.connect(flt); o2.connect(flt); flt.connect(g);
        if (pal.padLfo) { const l = ctx.createOscillator(); l.frequency.value = pal.padLfo; const lg = ctx.createGain(); lg.gain.value = pal.padCut * 0.35; l.connect(lg); lg.connect(flt.frequency); l.start(t); l.stop(end); }
      }
      g.connect(S.padGain); const rs = ctx.createGain(); rs.gain.value = pal.padRev; g.connect(rs); rs.connect(revSend);
      if (pal.dist) { const ws = ctx.createWaveShaper(); ws.curve = S.curveSoft; g.disconnect(S.padGain); g.connect(ws); ws.connect(S.padGain); }
    }
  }
  function lead(t, m, dur, pal, vel) { // motif voice: vibes / rhodes / saw lead per palette
    const f = mtof(m), end = t + dur + 1.2, v = vel || 1;
    const g = ctx.createGain();
    if (pal.leadWave === 'vibes') {
      const o = osc('sine', f, t, end), o2 = osc('sine', f * 4, t, end); const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.25, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.25); o2.connect(g2); g2.connect(g);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(pal.leadLvl * v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.5, dur * 1.4));
      const tr = ctx.createOscillator(); tr.frequency.value = 5.5; const tg = ctx.createGain(); tg.gain.value = 0.3; const trg = ctx.createGain(); trg.gain.value = 1; tr.connect(tg); tg.connect(trg.gain); o.connect(trg); trg.connect(g); tr.start(t); tr.stop(end);
    } else if (pal.leadWave === 'pluck') {
      const o = osc('triangle', f, t, end); const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.setValueAtTime(f * 6, t); flt.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.25); o.connect(flt); flt.connect(g);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(pal.leadLvl * v, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.35, dur));
    } else { // saw lead (synthwave/pit)
      const o = osc('sawtooth', f, t, end, -6), o2 = osc('sawtooth', f, t, end, 6); const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.setValueAtTime(f * 5, t); flt.frequency.exponentialRampToValueAtTime(f * 2, t + dur); flt.Q.value = 4; o.connect(flt); o2.connect(flt); flt.connect(g);
      vEnv(g, t, 0.02, pal.leadLvl * 0.7 * v, 0.1, 0.8, 0.25, dur);
      if (pal.dist) { const ws = ctx.createWaveShaper(); ws.curve = S.curveSoft; flt.disconnect(); flt.connect(ws); ws.connect(g); }
    }
    g.connect(musicBus); const rs = ctx.createGain(); rs.gain.value = pal.leadRev; g.connect(rs); rs.connect(revSend); const ds = ctx.createGain(); ds.gain.value = pal.leadDly; g.connect(ds); ds.connect(dlySend);
  }
  function arpNote(t, m, pal) { const f = mtof(m), end = t + 0.5; const o = osc(pal.arpWave, f, t, end); const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.setValueAtTime(f * 5, t); flt.frequency.exponentialRampToValueAtTime(f * 1.2, t + 0.18); const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(pal.arpLvl, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); o.connect(flt); flt.connect(g); g.connect(S.arpGain); const ds = ctx.createGain(); ds.gain.value = 0.35; g.connect(ds); ds.connect(dlySend); }
  function tension(t, m, dur) { // tremolo high strings
    const f = mtof(m), end = t + dur + 0.6; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.028, t + 0.4); g.gain.setValueAtTime(0.028, t + dur - 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.4);
    const o1 = osc('sawtooth', f, t, end, -9), o2 = osc('sawtooth', f, t, end, 9); const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 2200; const tr = ctx.createOscillator(); tr.frequency.value = 9; const tg = ctx.createGain(); tg.gain.value = 0.5; const trg = ctx.createGain(); trg.gain.value = 0.5; tr.connect(tg); tg.connect(trg.gain); o1.connect(flt); o2.connect(flt); flt.connect(trg); trg.connect(g); tr.start(t); tr.stop(end); g.connect(musicBus); const rs = ctx.createGain(); rs.gain.value = 0.5; g.connect(rs); rs.connect(revSend);
  }
  function stab(t, notes, pal) { for (const m of notes) { const f = mtof(m), end = t + 1.2; const o = osc('sawtooth', f, t, end, -8), o2 = osc('sawtooth', f, t, end, 8); const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.setValueAtTime(3000, t); flt.frequency.exponentialRampToValueAtTime(300, t + 0.5); const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7); const ws = ctx.createWaveShaper(); ws.curve = S.curve; o.connect(flt); o2.connect(flt); flt.connect(ws); ws.connect(g); g.connect(musicBus); const rs = ctx.createGain(); rs.gain.value = 0.7; g.connect(rs); rs.connect(revSend); } }
  function makeCurve(k) { const n = 2048, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); } return c; }

  // ------------------------------------------------------------------ palettes (per floor) — chords as midi
  // scale degrees in A minor: A=57(A3). Chords voiced mid-register for pads; bass takes root - 24.
  const Am = [57, 60, 64, 67], F = [53, 57, 60, 64], Dm = [50, 53, 57, 60], E7 = [52, 56, 59, 62], G = [55, 59, 62, 65], C = [48, 52, 55, 59], Bdim = [59, 62, 65, 68], Fm = [53, 56, 60, 63], Ab = [56, 60, 63, 67], Cm = [48, 51, 55, 58], Em = [52, 55, 59, 62], Dm9 = [50, 53, 57, 60, 64];
  const PAL = {
    lounge:     { bpm: 88, prog: [Am, F, Dm9, E7], padWave: 'triangle', padDetune: 6, padCut: 900, padLvl: 0.05, padRev: 0.55, padLfo: 0.08, bassWave: 'triangle', bassSub: true, bassCut: 420, bassLvl: 0.28, leadWave: 'vibes', leadLvl: 0.16, leadRev: 0.7, leadDly: 0.35, arpWave: 'triangle', arpLvl: 0.06, hatLvl: 0.05, kickVel: 0.5, clap: false, clank: false, swing: 0.58, scale: [0, 3, 5, 7, 10, 12, 15, 17], root: 69 },
    quartet:    { bpm: 84, prog: [Dm, Bdim, G, Am], padWave: 'sawtooth', padDetune: 9, padCut: 700, padLvl: 0.045, padRev: 0.7, padLfo: 0.05, bassWave: 'triangle', bassSub: true, bassCut: 380, bassLvl: 0.24, leadWave: 'vibes', leadLvl: 0.13, leadRev: 0.8, leadDly: 0.25, arpWave: 'triangle', arpLvl: 0.05, hatLvl: 0.035, kickVel: 0.42, clap: false, clank: false, swing: 0.55, scale: [0, 2, 3, 5, 7, 8, 10, 12], root: 62 },
    rhodes:     { bpm: 92, prog: [Cm, Ab, Fm, G], padWave: 'fm', padDetune: 0, padCut: 2200, padLvl: 0.06, padRev: 0.5, padLfo: 0, bassWave: 'sine', bassSub: false, bassCut: 500, bassLvl: 0.34, leadWave: 'pluck', leadLvl: 0.14, leadRev: 0.5, leadDly: 0.4, arpWave: 'sine', arpLvl: 0.07, hatLvl: 0.05, kickVel: 0.55, clap: true, clank: false, swing: 0.6, scale: [0, 2, 3, 5, 7, 8, 10, 12], root: 60 },
    industrial: { bpm: 96, prog: [Em, C, Am, [59, 62, 66, 69]], padWave: 'sawtooth', padDetune: 12, padCut: 520, padLvl: 0.045, padRev: 0.4, padLfo: 0.12, bassWave: 'sawtooth', bassSub: true, bassCut: 300, bassLvl: 0.32, leadWave: 'saw', leadLvl: 0.1, leadRev: 0.35, leadDly: 0.3, arpWave: 'square', arpLvl: 0.045, hatLvl: 0.05, kickVel: 0.7, clap: true, clank: true, swing: 0.5, scale: [0, 2, 3, 5, 7, 8, 10, 12], root: 64 },
    minimal:    { bpm: 100, prog: [Am, Am, F, G], padWave: 'triangle', padDetune: 4, padCut: 600, padLvl: 0.035, padRev: 0.6, padLfo: 0.2, bassWave: 'triangle', bassSub: false, bassCut: 350, bassLvl: 0.26, leadWave: 'pluck', leadLvl: 0.12, leadRev: 0.6, leadDly: 0.55, arpWave: 'triangle', arpLvl: 0.06, hatLvl: 0.04, kickVel: 0.5, clap: false, clank: false, swing: 0.5, scale: [0, 3, 5, 7, 10, 12, 15], root: 69 },
    synthwave:  { bpm: 104, prog: [Am, F, C, G], padWave: 'sawtooth', padDetune: 10, padCut: 1400, padLvl: 0.05, padRev: 0.45, padLfo: 0.1, bassWave: 'sawtooth', bassSub: true, bassCut: 600, bassLvl: 0.3, leadWave: 'saw', leadLvl: 0.14, leadRev: 0.5, leadDly: 0.5, arpWave: 'sawtooth', arpLvl: 0.055, hatLvl: 0.06, kickVel: 0.65, clap: true, clank: false, swing: 0.5, scale: [0, 2, 3, 5, 7, 8, 10, 12], root: 69 },
    pit:        { bpm: 90, prog: [Am, [56, 59, 63, 66], Dm, E7], padWave: 'sawtooth', padDetune: 18, padCut: 700, padLvl: 0.05, padRev: 0.5, padLfo: 0.3, bassWave: 'sawtooth', bassSub: true, bassCut: 420, bassLvl: 0.34, leadWave: 'saw', leadLvl: 0.12, leadRev: 0.4, leadDly: 0.3, arpWave: 'square', arpLvl: 0.05, hatLvl: 0.06, kickVel: 0.75, clap: true, clank: true, swing: 0.5, dist: true, scale: [0, 1, 3, 5, 6, 8, 10, 12], root: 69 },
  };
  const FLOOR_PAL = { 1: 'lounge', 2: 'quartet', 3: 'rhodes', 4: 'industrial', 5: 'minimal', 6: 'synthwave', 7: 'pit' };

  // ------------------------------------------------------------------ state + scheduler
  const S = { scene: 'title', floor: 1, intensity: 0, danger: false, boss: false, active: false, pal: PAL.lounge, palKey: 'lounge',
    padGain: null, bassGain: null, arpGain: null, padFilters: [], curve: null, curveSoft: null,
    next: 0, step: 0, bar: 0, chord: 0, motif: null, motifStep: 0, timer: null, lastRain: null, rain: null, cue: null, target: 0 };
  function startScheduler() {
    S.padGain = ctx.createGain(); S.padGain.target = 1; S.padGain.gain.value = 1; S.padGain.connect(musicBus);
    S.bassGain = ctx.createGain(); S.bassGain.target = 1; S.bassGain.gain.value = 1; S.bassGain.connect(musicBus);
    S.arpGain = ctx.createGain(); S.arpGain.target = 1; S.arpGain.gain.value = 1; S.arpGain.connect(musicBus);
    S.curve = makeCurve(40); S.curveSoft = makeCurve(6);
    S.next = ctx.currentTime + 0.1; S.step = 0; S.bar = 0; S.chord = 0;
    S.timer = setInterval(tick, 25);
    ambience();
  }
  function ambience() { // rain / room hiss bed, level follows the scene
    const rain = ctx.createBufferSource(); rain.buffer = noiseBuf(2.5); rain.loop = true;
    const rf = ctx.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 4800; rf.Q.value = 0.6;
    const rg = ctx.createGain(); rg.gain.value = 0.02; rain.connect(rf); rf.connect(rg); rg.connect(master); rain.start(); S.rain = rg;
  }
  // intensity → smoothed music level; the pad filter opens with intensity
  function tick() {
    if (!ctx || ctx.state !== 'running') return;
    const pal = S.pal, spb = 60 / pal.bpm, s16 = spb / 4;
    while (S.next < ctx.currentTime + 0.14) {
      if (!musicOff && !muted) { try { scheduleStep(S.next, S.step, pal, spb, s16); } catch (e) { if (!S.warned) { S.warned = true; console.warn('music step', e); } } }
      const swing = (S.step % 2 === 1) ? (pal.swing - 0.5) * 2 * s16 : 0; // delay off-16ths for swing
      S.next += s16 + (S.step % 2 === 0 ? swing : -swing);
      S.step = (S.step + 1) % 16; if (S.step === 0) S.bar++;
    }
  }
  function scheduleStep(t, st, pal, spb, s16) {
    const I = S.intensity, half = S.boss;
    // chord change every 2 bars, on the downbeat
    if (st === 0 && S.bar % 2 === 0) { S.chord = (S.chord + 1) % pal.prog.length; padChord(t, pal.prog[S.chord], spb * 8, pal); newMotif(pal); }
    const chord = pal.prog[S.chord]; const root = chord[0] - 24;
    const beat = st % 4 === 0, offbeat = st % 4 === 2, sixteenth = st % 2 === 1;
    if (S.scene === 'title' || S.scene === 'floors' || S.scene === 'results') { // lounge idle: pad + motif only, sparse
      if (st === 4 && S.bar % 2 === 1 && Math.random() < 0.7) playMotif(t, pal, s16, 0.7);
      return;
    }
    // ---- drums (wave active); half-time under a boss
    if (S.active && I > 0.12) {
      const kickOn = half ? (st === 0) : (st === 0 || st === 8 || (I > 0.5 && st === 11) || (I > 0.8 && st === 14));
      if (kickOn) kick(t, pal.kickVel * (0.7 + 0.3 * I), pal.bassSub);
      const snareOn = half ? (st === 8) : (pal.clap && I > 0.55 && (st === 4 || st === 12));
      if (snareOn) clap(t, 0.32 * (0.6 + 0.4 * I));
      if (pal.clank && st % 4 === 3 && Math.random() < 0.35 * I) clank(t, 0.5);
      // hats: 8ths → 16ths as it heats up; open hat on the "and" of 4
      if (st % 2 === 0 && I > 0.2) hat(t, pal.hatLvl * (0.6 + 0.4 * I) * (beat ? 1 : 0.7), false);
      if (sixteenth && I > 0.62) hat(t, pal.hatLvl * 0.5, false);
      if (st === 14 && I > 0.6) hat(t, pal.hatLvl * 0.9, true);
      // bass: roots on the beat, fifth/octave pickups as intensity rises
      const bassOn = half ? (st === 0 || st === 6 || st === 10) : (beat || (I > 0.45 && (st === 3 || st === 11)) || (I > 0.75 && offbeat));
      if (bassOn && I > 0.12) { const n = (st === 11 && I > 0.45) ? root + 7 : (st === 3 || (offbeat && st === 6)) && I > 0.6 ? root + 12 : root; bass(t, n, half ? s16 * 3 : s16 * 1.7, pal); }
    }
    // ---- motif: every 2 bars, second bar; more often when hot
    if (I > 0.35 && st === 0 && S.bar % 2 === 1) playMotif(t, pal, s16, 1);
    if (I > 0.7 && st === 8 && S.bar % 4 === 2 && Math.random() < 0.6) playMotif(t, pal, s16, 0.8);
    // ---- arp 16ths through the chord (hot)
    if (I > 0.6 && S.active) { const tones = chord.map(m => m + 12); const idx = [0, 1, 2, 3, 2, 1, 0, 3, 1, 2, 3, 0, 2, 3, 1, 0][st] % tones.length; if (!half || st % 4 === 0) arpNote(t, tones[idx], pal); }
    // ---- tension strings when markers are low: sustained top note each bar
    if (S.danger && st === 0) tension(t, chord[chord.length - 1] + 12 + (S.bar % 2 ? 2 : 0), spb * 4);
    // ---- boss stab on chord change
    if (S.boss && st === 0 && S.bar % 2 === 0) stab(t, [chord[0] - 12, chord[0], chord[2]], pal);
    // pad filter follows intensity
    const cut = pal.padCut * (0.6 + 0.9 * I) * (S.danger ? 1.3 : 1); for (const f of S.padFilters) try { f.frequency.setTargetAtTime(cut, t, 0.4); } catch (e) {} if (S.padFilters.length > 24) S.padFilters.splice(0, S.padFilters.length - 24);
  }
  // generative motif: 5–8 notes from the palette scale, contour-driven, rhythm from a small pattern set
  const RHY = [[2, 2, 4, 2, 2, 4], [1, 1, 2, 4, 2, 2, 4], [3, 1, 2, 2, 4, 4], [2, 1, 1, 2, 2, 4, 4], [4, 2, 2, 4, 4]];
  function newMotif(pal) {
    const rhythm = RHY[Math.floor(Math.random() * RHY.length)]; const notes = []; let deg = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < rhythm.length; i++) { const stepd = Math.random() < 0.15 ? 0 : (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.7 ? 1 : 2); deg = Math.max(0, Math.min(pal.scale.length - 1, deg + stepd)); if (i === rhythm.length - 1 && Math.random() < 0.6) deg = [0, 2, 4][Math.floor(Math.random() * 3)]; notes.push(pal.scale[deg]); }
    S.motif = { rhythm, notes };
  }
  function playMotif(t, pal, s16, vel) {
    if (!S.motif) newMotif(pal); const chord = pal.prog[S.chord]; const base = pal.root + (chord[0] - pal.prog[0][0]); let tt = t;
    for (let i = 0; i < S.motif.notes.length; i++) { const dur = S.motif.rhythm[i] * s16; lead(tt, base + S.motif.notes[i], dur * 0.9, pal, vel * (0.8 + Math.random() * 0.3)); tt += dur; }
  }
  // cadences
  function cadence(kind) {
    if (!ctx) return; const t = ctx.currentTime + 0.02, pal = S.pal;
    if (kind === 'clear') { const ch = pal.prog[S.chord]; stabSoft(t, ch.map(m => m + 12), 1.4); }
    else if (kind === 'win') { [[57, 60, 64], [53, 57, 60], [55, 59, 62], [57, 61, 64, 69]].forEach((ch, i) => stabSoft(t + i * 0.42, ch.map(m => m + 12), i === 3 ? 3 : 0.9)); }
    else if (kind === 'lose') { [[57, 60, 64], [56, 59, 63], [55, 58, 62], [50, 53, 56]].forEach((ch, i) => stabSoft(t + i * 0.55, ch, i === 3 ? 3.5 : 1, true)); }
    else if (kind === 'boss') { stab(t, [45, 57, 60], pal); stab(t + 0.5, [44, 56, 59], pal); }
  }
  function stabSoft(t, notes, dur, dark) { for (const m of notes) { const f = mtof(m), end = t + dur + 1.5; const o = osc(dark ? 'sawtooth' : 'triangle', f, t, end, -5), o2 = osc(dark ? 'sawtooth' : 'triangle', f, t, end, 5); const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = dark ? 700 : 1800; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.07, t + 0.03); g.gain.setValueAtTime(0.07, t + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.2); o.connect(flt); o2.connect(flt); flt.connect(g); g.connect(musicBus); const rs = ctx.createGain(); rs.gain.value = 0.8; g.connect(rs); rs.connect(revSend); } }

  function setState(o) {
    if (!o) return; if (o.scene) S.scene = o.scene; if (o.floor) { S.floor = o.floor; const k = FLOOR_PAL[o.floor] || 'lounge'; if (k !== S.palKey) { S.palKey = k; S.pal = PAL[k]; S.motif = null; } }
    if (S.scene !== 'battle') { S.palKey = 'lounge'; S.pal = PAL.lounge; }
    if (o.intensity != null) S.intensity = Math.max(0, Math.min(1, o.intensity)); if (o.danger != null) S.danger = !!o.danger; if (o.boss != null) { if (o.boss && !S.boss) cadence('boss'); S.boss = !!o.boss; } if (o.active != null) S.active = !!o.active;
    if (S.rain && ctx) S.rain.gain.setTargetAtTime(S.scene === 'title' ? 0.028 : (S.scene === 'battle' && S.floor === 6 ? 0.03 : 0.008), ctx.currentTime, 0.8);
    if (musicBus && ctx) musicBus.gain.setTargetAtTime(musicOff ? 0 : (S.scene === 'results' ? 0.22 : MUSIC_LVL), ctx.currentTime, 0.6);
  }

  // ------------------------------------------------------------------ SFX (layered: crack + body + tail into the room)
  function env(g, t0, a, peak, dec) { g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec); }
  function burst(dur, peak, filterFreq, type, rev) {
    const t = ctx.currentTime; const src = ctx.createBufferSource(); src.buffer = noiseBuf(Math.min(0.6, dur + 0.05));
    const f = ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = filterFreq; const g = ctx.createGain(); env(g, t, 0.002, peak, dur);
    src.connect(f); f.connect(g); g.connect(sfxBus); if (rev) { const rs = ctx.createGain(); rs.gain.value = rev; g.connect(rs); rs.connect(revSend); } src.start(t); src.stop(t + dur + 0.06);
  }
  function tone(freq, dur, peak, type, slideTo, rev) {
    const t = ctx.currentTime; const o = ctx.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = ctx.createGain(); env(g, t, 0.004, peak, dur); o.connect(g); g.connect(sfxBus); if (rev) { const rs = ctx.createGain(); rs.gain.value = rev; g.connect(rs); rs.connect(revSend); } o.start(t); o.stop(t + dur + 0.05);
  }
  function gunshot(size) { // size 0..1: crack (hp noise) + body (lp thump) + tail (into the room)
    burst(0.02 + size * 0.02, 0.5 + size * 0.3, 3200 + size * 2000, 'highpass', 0.15 + size * 0.25);
    burst(0.06 + size * 0.14, 0.35 + size * 0.45, 700 + size * 500, 'lowpass', 0.1);
    tone(160 + size * 60, 0.05 + size * 0.1, 0.12 + size * 0.2, 'sine', 40, 0.2);
  }
  const later = (ms, fn) => setTimeout(() => { if (!muted && ctx) fn(); }, ms);
  const SFX = {
    shot_pistol() { gunshot(0.35); },
    shot_smg() { gunshot(0.18); },
    shot_shotgun() { gunshot(0.9); burst(0.25, 0.4, 900, 'lowpass', 0.4); },
    shot_sniper() { gunshot(0.7); tone(1400, 0.22, 0.1, 'sawtooth', 180, 0.5); burst(0.4, 0.25, 500, 'lowpass', 0.6); },
    shot_gatling() { gunshot(0.25); },
    lob() { tone(150, 0.18, 0.3, 'sine', 60); burst(0.08, 0.15, 800); },
    splash() { burst(0.45, 0.85, 800, 'lowpass', 0.6); tone(70, 0.35, 0.45, 'sine', 28, 0.3); burst(0.06, 0.4, 4000, 'highpass', 0.3); },
    tesla() { for (let i = 0; i < 3; i++) tone(900 + Math.random() * 900, 0.05, 0.14, 'sawtooth', 200, 0.3); burst(0.06, 0.2, 6000, 'highpass', 0.3); },
    coin() { tone(1180, 0.07, 0.12, 'triangle', 0, 0.3); later(40, () => tone(1560, 0.09, 0.1, 'triangle', 0, 0.3)); },
    mint() { tone(880, 0.06, 0.1, 'triangle', 0, 0.3); later(50, () => tone(1320, 0.08, 0.09, 'triangle', 0, 0.3)); },
    die() { burst(0.09, 0.3, 700, 'lowpass', 0.25); },
    boss_die() { burst(0.5, 0.9, 700, 'lowpass', 0.7); tone(60, 0.5, 0.5, 'sine', 28, 0.4); },
    leak() { tone(660, 0.12, 0.3, 'square', 440); later(110, () => tone(440, 0.18, 0.3, 'square', 330)); },
    place() { tone(240, 0.08, 0.2, 'triangle', 320, 0.2); burst(0.05, 0.15, 1200); },
    upgrade() { tone(392, 0.08, 0.18, 'triangle', 0, 0.3); later(70, () => tone(523, 0.08, 0.18, 'triangle', 0, 0.3)); later(140, () => tone(659, 0.1, 0.18, 'triangle', 0, 0.3)); },
    sell() { tone(523, 0.07, 0.15, 'triangle', 392, 0.2); },
    ui() { tone(520, 0.04, 0.1, 'triangle'); },
    deny() { tone(180, 0.12, 0.2, 'square', 120); },
    wave() { tone(196, 0.3, 0.22, 'sawtooth', 0, 0.4); later(180, () => tone(261, 0.35, 0.22, 'sawtooth', 0, 0.4)); },
    boss() { tone(98, 0.7, 0.4, 'sawtooth', 65, 0.5); burst(0.4, 0.3, 500, 'lowpass', 0.5); },
    reveal() { tone(1200, 0.08, 0.1, 'sine', 2400, 0.4); },
    win() { cadence('win'); },
    lose() { cadence('lose'); },
  };

  const AUDIO = {
    unlock,
    play(name) { if (!ctx || muted || sfxOff) return; const f = SFX[name]; if (f) try { f(); } catch (e) {} },
    cue(kind) { if (!ctx || muted || musicOff) return; try { cadence(kind); } catch (e) {} },
    setState(o) { try { setState(o); } catch (e) {} },
    toggleMute() { muted = !muted; LS.set('cs_mute', muted ? '1' : '0'); if (master) master.gain.value = muted ? 0 : 0.55; return muted; },
    toggleMusic() { musicOff = !musicOff; LS.set('cs_music', musicOff ? '0' : '1'); if (musicBus && ctx) musicBus.gain.setTargetAtTime(musicOff ? 0 : MUSIC_LVL, ctx.currentTime, 0.08); return musicOff; },
    toggleSfx() { sfxOff = !sfxOff; LS.set('cs_sfx', sfxOff ? '0' : '1'); if (sfxBus && ctx) sfxBus.gain.setTargetAtTime(sfxOff ? 0 : SFX_LVL, ctx.currentTime, 0.05); return sfxOff; },
    isMusicOff() { return musicOff || LS.get('cs_music') === '0'; },
    isSfxOff() { return sfxOff || LS.get('cs_sfx') === '0'; },
    isMuted() { return muted || LS.get('cs_mute') === '1'; },
    _state: S,
  };
  global.CS_AUDIO = AUDIO;
})(typeof window !== 'undefined' ? window : globalThis);
