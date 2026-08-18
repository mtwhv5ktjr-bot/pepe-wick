/* =========================================================================
   CONTINENTAL SIEGE — FX + UI art bakers (pure canvas 2D, deterministic).

   window.CS_FX.bakeAll(mk)      → Promise<{ key: { canvas, ax, ay, w, h } }>
   window.CS_UI_ART.bakeAll(mk)  → Promise<{ key: { canvas, w, h } }>
   window.CS_UI_ART.NINE          = { left, top, right, bottom } nine-slice insets
                                    for frameGold + panel.

   mk(w, h) is the caller's canvas factory (DOM canvas in the browser, node-canvas
   in tests). ax/ay are the anchor origin as a 0..1 fraction of the texture.
   Additive-blend textures (muzzle, tracer, spark, ring, glow, slowRing, arc, hit,
   coinPop, crit) are baked with 'lighter' compositing so overlapping petals sum
   into a hot core; normal-blend textures (smoke, shell, coin, marker, keg,
   healCross, shimmer, bulletHole, rangeRing, placeOk/Bad) are pre-shaded.
   Nothing here touches the DOM at load, no clock, no Math.random — every
   jitter comes from a seeded mulberry32 so the bake is byte-stable.
   ========================================================================= */
(function (global) {
  'use strict';

  /* ---------- colour + path kit ---------- */
  const unhex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const hex = (r, g, b) => '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const A = unhex(a), B = unhex(b); return hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
  const shade = (h, f) => f >= 0 ? mix(h, '#ffffff', f) : mix(h, '#000000', -f);
  const rgba = (h, a) => { const p = unhex(h); return 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + a + ')'; };
  const rng = seed => { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  const stops = (g, s) => { for (let i = 0; i < s.length; i++) g.addColorStop(s[i][0], s[i][1]); return g; };
  const RG = (c, x, y, r0, r1, s) => stops(c.createRadialGradient(x, y, r0, x, y, r1), s);
  const LG = (c, x0, y0, x1, y1, s) => stops(c.createLinearGradient(x0, y0, x1, y1), s);
  const TAU = Math.PI * 2;
  function rr(c, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function poly(c, pts) { c.beginPath(); for (let i = 0; i < pts.length; i++) { if (i) c.lineTo(pts[i][0], pts[i][1]); else c.moveTo(pts[i][0], pts[i][1]); } c.closePath(); }
  function starPath(c, cx, cy, n, ro, ri, rot) { c.beginPath(); for (let i = 0; i < n * 2; i++) { const a = (rot || 0) + Math.PI * i / n, r = i % 2 ? ri : ro; const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; if (i) c.lineTo(x, y); else c.moveTo(x, y); } c.closePath(); }
  function circ(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); }
  const disc = (c, x, y, r, fill) => { circ(c, x, y, r); c.fillStyle = fill; c.fill(); };
  /** soft radial dot: solid-ish core → 0 at r */
  const soft = (c, x, y, r, col, a0) => disc(c, x, y, r, RG(c, x, y, 0, r, [[0, rgba(col, a0)], [0.45, rgba(col, a0 * 0.55)], [1, rgba(col, 0)]]));
  /** a leaf/petal from (x,y) along ang, len long, ~wid/2 half-width, filled base→tip with s */
  function petal(c, x, y, ang, len, wid, s) { c.save(); c.translate(x, y); c.rotate(ang); c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len * 0.42, -wid, len, 0); c.quadraticCurveTo(len * 0.42, wid, 0, 0); c.closePath(); c.fillStyle = LG(c, 0, 0, len, 0, s); c.fill(); c.restore(); }
  /** diamond glyph */
  function diamond(c, x, y, s) { c.beginPath(); c.moveTo(x, y - s); c.lineTo(x + s, y); c.lineTo(x, y + s); c.lineTo(x - s, y); c.closePath(); c.fill(); }
  /** corner bracket "L" — sx/sy = direction the arms extend */
  function bracket(c, x, y, sx, sy, len) { c.beginPath(); c.moveTo(x + sx * len, y); c.lineTo(x, y); c.lineTo(x, y + sy * len); c.stroke(); }

  const GOLD = '#e8c576', GOLD_D = '#c9a227', GOLD_DD = '#7a5c14', GOLD_L = '#fff0c0';
  const INK = '#0b0e15', PANEL = '#0e1420', RULE = '#222b38', STEEL = '#697485', STEEL_L = '#9aa6b6', STEEL_D = '#3d4653';
  const FOIL = [[0, '#f6e3a8'], [0.2, GOLD], [0.45, '#b8912a'], [0.6, '#f0d38a'], [0.8, GOLD_D], [1, GOLD_DD]];
  const FOIL_HOT = [[0, '#fff6d6'], [0.25, '#f6e3a8'], [0.45, GOLD], [0.6, GOLD_L], [0.8, '#e2bd5a'], [1, '#b8912a']];
  const FOIL_STEEL = [[0, '#aeb8c6'], [0.4, '#5b6573'], [0.6, '#8b96a3'], [1, STEEL_D]];

  /* ---------- shared glyphs (used by FX + UI) ---------- */
  function drawCoin(c, cx, cy, r, slash) {
    disc(c, cx, cy, r, RG(c, cx - r * 0.3, cy - r * 0.32, 0, r * 1.25, [[0, '#fff3cc'], [0.3, '#f3d27e'], [0.7, '#d4a72e'], [1, GOLD_DD]]));
    const lw = Math.max(1, r * 0.13);
    c.lineWidth = lw; c.strokeStyle = LG(c, cx - r, cy - r, cx + r, cy + r, [[0, '#fff6d6'], [0.5, GOLD_D], [1, '#5c4410']]);
    circ(c, cx, cy, r - lw / 2); c.stroke();
    c.lineWidth = Math.max(0.8, r * 0.08); c.strokeStyle = rgba(GOLD_DD, 0.55); circ(c, cx, cy, r * 0.72); c.stroke();
    c.strokeStyle = rgba('#ffffff', 0.5); c.beginPath(); c.arc(cx, cy, r * 0.72, Math.PI * 1.05, Math.PI * 1.55); c.stroke();
    if (slash) {
      // ⛁-ish engraving: a struck inner disc + a diagonal mint glint (light over shadow), clipped to the face
      c.save(); circ(c, cx, cy, r * 0.62); c.clip();
      c.fillStyle = rgba(GOLD_DD, 0.22); circ(c, cx, cy, r * 0.42); c.fill();
      c.lineWidth = Math.max(0.8, r * 0.08); c.strokeStyle = rgba(GOLD_DD, 0.5); circ(c, cx, cy, r * 0.42); c.stroke();
      c.lineCap = 'round';
      c.lineWidth = Math.max(1, r * 0.11); c.strokeStyle = rgba('#5c4410', 0.5);
      c.beginPath(); c.moveTo(cx - r * 0.42, cy + r * 0.56); c.lineTo(cx + r * 0.58, cy - r * 0.42); c.stroke();
      c.strokeStyle = rgba('#fff8e0', 0.7);
      c.beginPath(); c.moveTo(cx - r * 0.5, cy + r * 0.48); c.lineTo(cx + r * 0.5, cy - r * 0.5); c.stroke();
      c.lineCap = 'butt';
      c.restore();
    }
    c.fillStyle = rgba('#ffffff', 0.55); c.beginPath(); c.ellipse(cx - r * 0.42, cy - r * 0.45, r * 0.22, r * 0.11, -0.7, 0, TAU); c.fill();
    c.lineWidth = Math.max(1, r * 0.1); c.strokeStyle = rgba('#000000', 0.32); c.beginPath(); c.arc(cx, cy, r - c.lineWidth / 2, Math.PI * 0.05, Math.PI * 0.75); c.stroke();
  }
  function drawMarker(c, cx, cy, r) {
    disc(c, cx, cy, r, RG(c, cx - r * 0.3, cy - r * 0.32, 0, r * 1.25, [[0, '#fff3cc'], [0.3, '#f3d27e'], [0.7, '#d4a72e'], [1, GOLD_DD]]));
    const lw = Math.max(1, r * 0.12);
    c.lineWidth = lw; c.strokeStyle = LG(c, cx - r, cy - r, cx + r, cy + r, [[0, '#fff6d6'], [0.5, GOLD_D], [1, '#5c4410']]);
    circ(c, cx, cy, r - lw / 2); c.stroke();
    // reeded edge
    c.lineWidth = Math.max(0.7, r * 0.06); c.strokeStyle = rgba('#5c4410', 0.5);
    for (let i = 0; i < 20; i++) { const a = i / 20 * TAU; c.beginPath(); c.moveTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78); c.lineTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9); c.stroke(); }
    c.lineWidth = Math.max(0.8, r * 0.07); c.strokeStyle = rgba(GOLD_DD, 0.5); circ(c, cx, cy, r * 0.76); c.stroke();
    // wax seal
    const R = rng(11), rs = r * 0.55, ox = cx + r * 0.02, oy = cy + r * 0.05;
    c.beginPath();
    for (let i = 0; i < 26; i++) { const a = i / 26 * TAU, rad = rs * (0.92 + 0.11 * Math.sin(i * 2.3 + 1) + 0.05 * (R() - 0.5)); const x = ox + Math.cos(a) * rad, y = oy + Math.sin(a) * rad; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
    c.closePath();
    c.fillStyle = RG(c, ox - rs * 0.35, oy - rs * 0.35, 0, rs * 1.3, [[0, '#c93d4a'], [0.55, '#8b1f2b'], [1, '#4a0f16']]); c.fill();
    c.lineWidth = Math.max(0.7, r * 0.05); c.strokeStyle = rgba('#3a0a10', 0.85); c.stroke();
    // embossed Continental "C" crest
    const cw = Math.max(1, rs * 0.24);
    c.lineWidth = cw; c.lineCap = 'round';
    c.strokeStyle = rgba('#3a0a10', 0.55); c.beginPath(); c.arc(ox + cw * 0.35, oy + cw * 0.45, rs * 0.5, 0.65, TAU - 0.65); c.stroke();
    c.strokeStyle = rgba(GOLD, 0.8); c.beginPath(); c.arc(ox, oy, rs * 0.5, 0.65, TAU - 0.65); c.stroke();
    c.fillStyle = rgba(GOLD, 0.8); circ(c, ox + rs * 0.5 * Math.cos(0.65) - cw * 0.2, oy, cw * 0.55); c.fill();
    c.lineCap = 'butt';
    c.fillStyle = rgba('#ffffff', 0.28); c.beginPath(); c.ellipse(ox - rs * 0.4, oy - rs * 0.45, rs * 0.28, rs * 0.14, -0.7, 0, TAU); c.fill();
    c.lineWidth = Math.max(1, r * 0.1); c.strokeStyle = rgba('#000000', 0.3); c.beginPath(); c.arc(cx, cy, r - c.lineWidth / 2, Math.PI * 0.05, Math.PI * 0.75); c.stroke();
  }
  function drawLock(c, cx, cy, s, gold) {
    c.save(); c.translate(cx, cy); c.scale(s, s);
    // shackle
    c.lineCap = 'butt';
    c.lineWidth = 3.2; c.strokeStyle = LG(c, -5, -11, 5, 0, [[0, '#f2f5f9'], [0.5, '#a9b3c0'], [1, '#5b6573']]);
    c.beginPath(); c.moveTo(-5, 1); c.lineTo(-5, -5); c.arc(0, -5, 5, Math.PI, 0); c.lineTo(5, 1); c.stroke();
    c.lineWidth = 1; c.strokeStyle = rgba('#000000', 0.5);
    c.beginPath(); c.moveTo(-6.6, 1); c.lineTo(-6.6, -5); c.arc(0, -5, 6.6, Math.PI, 0); c.lineTo(6.6, 1); c.stroke();
    c.beginPath(); c.moveTo(-3.4, 1); c.lineTo(-3.4, -5); c.arc(0, -5, 3.4, Math.PI, 0); c.lineTo(3.4, 1); c.stroke();
    // body
    rr(c, -7.5, 0.5, 15, 12.5, 2.6); c.fillStyle = rgba('#000000', 0.55); c.fill();
    rr(c, -7, 0, 14, 12, 2.4);
    c.fillStyle = gold ? LG(c, 0, 0, 0, 12, [[0, '#f6e3a8'], [0.35, GOLD], [0.7, GOLD_D], [1, '#6b5210']]) : LG(c, 0, 0, 0, 12, [[0, '#aeb8c6'], [0.35, '#7d8896'], [0.7, '#4a5361'], [1, '#2a313b']]);
    c.fill();
    c.strokeStyle = rgba('#000000', 0.55); c.lineWidth = 1; rr(c, -6.5, 0.5, 13, 11, 2); c.stroke();
    c.fillStyle = rgba('#ffffff', 0.25); c.fillRect(-5, 1.2, 10, 1);
    // keyhole
    c.fillStyle = INK; circ(c, 0, 5, 1.7); c.fill(); c.fillRect(-0.9, 5.4, 1.8, 3.6);
    c.restore();
  }
  function drawStar5(c, cx, cy, ro, on) {
    const ri = ro * 0.46;
    if (on) {
      c.save(); c.shadowColor = rgba(GOLD, 0.55); c.shadowBlur = 5; starPath(c, cx, cy, 5, ro, ri, -Math.PI / 2); c.fillStyle = GOLD_D; c.fill(); c.restore();
      starPath(c, cx, cy, 5, ro, ri, -Math.PI / 2);
      c.fillStyle = RG(c, cx - ro * 0.25, cy - ro * 0.3, 0, ro * 1.2, [[0, '#fff8de'], [0.35, '#f3d27e'], [0.75, GOLD_D], [1, '#8a6a1c']]); c.fill();
      c.save(); c.clip();
      c.fillStyle = LG(c, cx - ro, cy - ro, cx + ro, cy + ro, [[0, rgba('#ffffff', 0.28)], [0.5, rgba('#ffffff', 0)], [1, rgba('#000000', 0.38)]]); c.fillRect(cx - ro, cy - ro, ro * 2, ro * 2);
      // facet: dark lower-right wedge lines
      c.strokeStyle = rgba('#5c4410', 0.35); c.lineWidth = 1;
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * TAU / 5; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * ro, cy + Math.sin(a) * ro); c.stroke(); }
      c.restore();
      c.lineWidth = 1; c.strokeStyle = rgba('#5c4410', 0.9); starPath(c, cx, cy, 5, ro, ri, -Math.PI / 2); c.stroke();
      c.fillStyle = rgba('#ffffff', 0.7); c.beginPath(); c.ellipse(cx - ro * 0.22, cy - ro * 0.28, ro * 0.16, ro * 0.09, -0.6, 0, TAU); c.fill();
    } else {
      starPath(c, cx, cy, 5, ro, ri, -Math.PI / 2);
      c.fillStyle = LG(c, 0, cy - ro, 0, cy + ro, [[0, '#1c2432'], [1, '#0d1119']]); c.fill();
      c.lineWidth = 1; c.strokeStyle = '#2f3a4a'; c.stroke();
      c.fillStyle = rgba('#ffffff', 0.05); starPath(c, cx, cy - 1, 5, ro * 0.55, ri * 0.55, -Math.PI / 2); c.fill();
    }
  }
  function drawSkull(c, cx, cy, s) {
    c.save(); c.translate(cx, cy); c.scale(s, s);
    // 20-unit design: cranium circle r7 at (0,-2), jaw below
    const bone = LG(c, 0, -9, 0, 9, [[0, '#ffffff'], [0.5, '#e6eaf0'], [1, '#aab3c0']]);
    c.lineWidth = 1.2; c.strokeStyle = rgba('#000000', 0.7); c.lineJoin = 'round';
    // jaw
    rr(c, -4.6, 2.5, 9.2, 5.6, 2); c.fillStyle = bone; c.fill(); c.stroke();
    // cranium (slightly wide)
    c.beginPath(); c.ellipse(0, -2, 7.4, 7, 0, 0, TAU); c.fillStyle = bone; c.fill(); c.stroke();
    // cheeks join
    c.fillStyle = bone; c.fillRect(-4.6, 2, 9.2, 2.2);
    // eyes
    c.fillStyle = INK; c.beginPath(); c.ellipse(-2.9, -1.6, 2.2, 2.5, 0.25, 0, TAU); c.fill(); c.beginPath(); c.ellipse(2.9, -1.6, 2.2, 2.5, -0.25, 0, TAU); c.fill();
    c.fillStyle = rgba('#7c8798', 0.6); c.beginPath(); c.ellipse(-3.3, -2.3, 0.7, 0.5, 0, 0, TAU); c.fill(); c.beginPath(); c.ellipse(2.5, -2.3, 0.7, 0.5, 0, 0, TAU); c.fill();
    // nose
    c.fillStyle = INK; c.beginPath(); c.moveTo(0, 1.2); c.lineTo(-1.2, 3.4); c.lineTo(1.2, 3.4); c.closePath(); c.fill();
    // teeth
    c.strokeStyle = rgba('#000000', 0.75); c.lineWidth = 0.9;
    for (const x of [-2.4, -0.8, 0.8, 2.4]) { c.beginPath(); c.moveTo(x, 4.6); c.lineTo(x, 7.6); c.stroke(); }
    c.beginPath(); c.moveTo(-4, 4.6); c.lineTo(4, 4.6); c.stroke();
    c.restore();
  }

  /* =======================================================================
     FX
     ======================================================================= */
  function bakeFX(mk) {
    const out = {};
    const T = (key, w, h, ax, ay, fn) => { const cv = mk(w, h), c = cv.getContext('2d'); c.save(); fn(c, w, h); c.restore(); out[key] = { canvas: cv, ax, ay, w, h }; };
    const FL = a => [[0, rgba('#ffffff', a)], [0.22, rgba('#fff1cc', 0.95 * a)], [0.62, rgba('#ffb45a', 0.55 * a)], [1, rgba('#ff5a1a', 0)]];

    /* muzzle flash — 3 frames pointing +x. Origin sits 5px in from the left edge
       (the barrel tip is behind the flash) → ax = 5/W. */
    const flash = (c, W, H, f) => {
      const ox = 5, oy = H / 2;
      c.globalCompositeOperation = 'lighter';
      const P = (ang, len, wid, a) => petal(c, ox, oy, ang, len, wid, FL(a));
      if (f === 0) {            // punch: tight and hot
        soft(c, ox, oy, 12, '#ffb45a', 0.7);
        P(0, 28, 6, 1); P(0.55, 15, 3.6, 0.9); P(-0.55, 15, 3.6, 0.9); P(2.5, 7, 3, 0.6); P(-2.5, 7, 3, 0.6);
        starPath(c, ox, oy, 6, 7, 3, 0.3); c.fillStyle = RG(c, ox, oy, 0, 7, [[0, '#ffffff'], [0.6, rgba('#ffffff', 0.85)], [1, rgba('#ffe7b0', 0)]]); c.fill();
        disc(c, ox, oy, 4, '#ffffff');
      } else if (f === 1) {     // bloom: full petal star
        soft(c, ox, oy, 15, '#ffb45a', 0.6);
        P(0, 50, 7, 1); P(0.42, 26, 4.5, 0.9); P(-0.42, 26, 4.5, 0.9); P(1.05, 15, 3.5, 0.8); P(-1.05, 15, 3.5, 0.8);
        P(1.9, 9, 3, 0.6); P(-1.9, 9, 3, 0.6); P(2.7, 8, 3, 0.5); P(-2.7, 8, 3, 0.5);
        starPath(c, ox, oy, 8, 9, 3.5, 0.2); c.fillStyle = RG(c, ox, oy, 0, 9, [[0, '#ffffff'], [0.5, rgba('#ffffff', 0.85)], [1, rgba('#ffd27a', 0)]]); c.fill();
        disc(c, ox, oy, 4.5, '#ffffff');
      } else {                  // fade: thin, orange, dimmer
        c.globalAlpha = 0.72;
        soft(c, ox, oy, 12, '#ff8a3a', 0.45);
        P(0, 42, 4, 0.9); P(0.5, 20, 3, 0.7); P(-0.5, 20, 3, 0.7); P(1.25, 10, 2.5, 0.6); P(-1.25, 10, 2.5, 0.6);
        disc(c, ox, oy, 3.5, RG(c, ox, oy, 0, 3.5, [[0, '#ffffff'], [1, rgba('#ffc978', 0)]]));
      }
    };
    T('muzzle0', 40, 28, 5 / 40, 0.5, (c, W, H) => flash(c, W, H, 0));
    T('muzzle1', 60, 36, 5 / 60, 0.5, (c, W, H) => flash(c, W, H, 1));
    T('muzzle2', 52, 30, 5 / 52, 0.5, (c, W, H) => flash(c, W, H, 2));

    /* tracer — comet, head at x=45 (ax = 45/48), tail fades left */
    T('tracer', 48, 6, 45 / 48, 0.5, (c) => {
      c.globalCompositeOperation = 'lighter';
      const hx = 45, cy = 3;
      c.beginPath(); c.moveTo(0, cy); c.quadraticCurveTo(hx * 0.6, cy - 2.3, hx, cy - 1.7); c.arc(hx, cy, 1.7, -Math.PI / 2, Math.PI / 2); c.quadraticCurveTo(hx * 0.6, cy + 2.3, 0, cy); c.closePath();
      c.fillStyle = LG(c, 0, 0, hx, 0, [[0, rgba('#ffd9a0', 0)], [0.4, rgba('#ffe7b8', 0.4)], [0.82, rgba('#fff7e6', 0.9)], [1, '#ffffff']]); c.fill();
      soft(c, hx, cy, 3, '#ffffff', 1);
    });

    T('spark', 8, 8, 0.5, 0.5, (c) => { c.globalCompositeOperation = 'lighter'; soft(c, 4, 4, 4, '#ffffff', 1); disc(c, 4, 4, 1.3, '#ffffff'); });

    T('ring', 40, 40, 0.5, 0.5, (c) => {
      c.globalCompositeOperation = 'lighter';
      const r = 17;
      circ(c, 20, 20, r); c.lineWidth = 6; c.strokeStyle = rgba('#ffffff', 0.14); c.stroke();
      circ(c, 20, 20, r); c.lineWidth = 3; c.strokeStyle = rgba('#ffffff', 0.38); c.stroke();
      circ(c, 20, 20, r); c.lineWidth = 1.4; c.strokeStyle = '#ffffff'; c.stroke();
    });

    /* smoke — NORMAL blend, whole puff capped at 0.6 alpha via a temp bake */
    T('smoke', 48, 48, 0.5, 0.5, (c, W, H) => {
      const t = mk(W, H), tc = t.getContext('2d');
      const blobs = [[24, 24, 15], [15, 20, 11.5], [33, 21, 12], [19, 32, 11], [31, 32, 10.5], [24, 13, 9]];
      for (const [x, y, r] of blobs) {
        const col = mix('#5f6873', '#d0d6de', clamp(((26 - x) + (26 - y)) / 52 + 0.5, 0, 1));
        disc(tc, x, y, r, RG(tc, x, y, 0, r, [[0, rgba(col, 0.95)], [0.55, rgba(col, 0.55)], [1, rgba(col, 0)]]));
      }
      tc.globalCompositeOperation = 'source-atop';
      tc.fillStyle = LG(tc, 0, 0, W, H, [[0, rgba('#ffffff', 0.2)], [0.5, rgba('#ffffff', 0)], [1, rgba('#000000', 0.32)]]); tc.fillRect(0, 0, W, H);
      c.globalAlpha = 0.6; c.drawImage(t, 0, 0);
    });

    T('shell', 8, 4, 0.5, 0.5, (c) => {
      rr(c, 0.5, 0.5, 7, 3, 1.2); c.fillStyle = LG(c, 0, 0, 0, 4, [[0, '#f6e3a8'], [0.4, '#d9ac3a'], [1, GOLD_DD]]); c.fill();
      c.fillStyle = rgba('#5a3e0a', 0.85); c.fillRect(6, 0.6, 1.4, 2.8);
      c.fillStyle = rgba('#ffffff', 0.5); c.fillRect(1, 1, 4, 0.8);
    });

    T('coin', 22, 22, 0.5, 0.5, (c) => drawCoin(c, 11, 11, 10.5, true));
    T('marker', 26, 26, 0.5, 0.5, (c) => drawMarker(c, 13, 13, 12.5));

    T('glow', 96, 96, 0.5, 0.5, (c) => { c.globalCompositeOperation = 'lighter'; disc(c, 48, 48, 48, RG(c, 48, 48, 0, 48, [[0, rgba('#ffffff', 1)], [0.2, rgba('#ffffff', 0.7)], [0.5, rgba('#ffffff', 0.22)], [1, rgba('#ffffff', 0)]])); });

    T('slowRing', 56, 56, 0.5, 0.5, (c) => {
      c.globalCompositeOperation = 'lighter';
      const cx = 28, cy = 28, r = 24;
      circ(c, cx, cy, r); c.lineWidth = 7; c.strokeStyle = rgba('#3fc8ff', 0.16); c.stroke();
      c.setLineDash([7, 4]); circ(c, cx, cy, r); c.lineWidth = 2.2; c.strokeStyle = rgba('#dffaff', 0.95); c.stroke();
      c.setLineDash([2, 6]); c.lineDashOffset = 3; circ(c, cx, cy, r - 4.5); c.lineWidth = 1; c.strokeStyle = rgba('#7fe6ff', 0.65); c.stroke();
      c.setLineDash([]);
      const R = rng(5);
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU + 0.3, ca = Math.cos(a), sa = Math.sin(a), na = Math.cos(a + Math.PI / 2), nb = Math.sin(a + Math.PI / 2);
        const pts = []; for (let k = 0; k <= 3; k++) { const d = r - 2 + k * 2.3, j = k === 0 || k === 3 ? 0 : (R() - 0.5) * 3.5; pts.push([cx + ca * d + na * j, cy + sa * d + nb * j]); }
        c.beginPath(); pts.forEach((p, k) => k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
        c.lineWidth = 3; c.strokeStyle = rgba('#3fc8ff', 0.3); c.stroke(); c.lineWidth = 1.1; c.strokeStyle = rgba('#ffffff', 0.9); c.stroke();
      }
    });

    /* powder keg — upright, brass hoops, lit fuse (normal blend) */
    T('keg', 22, 26, 0.5, 0.5, (c) => {
      const body = () => { c.beginPath(); c.moveTo(4, 6); c.lineTo(18, 6); c.quadraticCurveTo(22.2, 15.5, 18, 25); c.lineTo(4, 25); c.quadraticCurveTo(-0.2, 15.5, 4, 6); c.closePath(); };
      body(); c.fillStyle = LG(c, 0, 0, 22, 0, [[0, '#1e1208'], [0.22, '#5c3a1c'], [0.5, '#93602f'], [0.78, '#5c3a1c'], [1, '#1e1208']]); c.fill();
      c.save(); body(); c.clip();
      c.strokeStyle = rgba('#000000', 0.32); c.lineWidth = 0.9;
      for (const x of [7.6, 11, 14.4]) { c.beginPath(); c.moveTo(x, 6); c.lineTo(x, 25); c.stroke(); }
      c.strokeStyle = rgba('#ffffff', 0.12); c.beginPath(); c.moveTo(6.2, 7); c.lineTo(6.2, 24); c.stroke();
      c.fillStyle = LG(c, 0, 20, 0, 25, [[0, rgba('#000000', 0)], [1, rgba('#000000', 0.5)]]); c.fillRect(0, 20, 22, 5);
      c.restore();
      // hoops
      for (const hy of [9, 19]) {
        rr(c, 2.4, hy, 17.2, 3.2, 0.8); c.fillStyle = LG(c, 0, hy, 0, hy + 3.2, [[0, '#f6e3a8'], [0.5, GOLD_D], [1, '#6b5210']]); c.fill();
        c.lineWidth = 0.7; c.strokeStyle = rgba('#000000', 0.55); c.stroke();
      }
      // top cap
      c.beginPath(); c.ellipse(11, 6, 7, 2.2, 0, 0, TAU); c.fillStyle = LG(c, 4, 0, 18, 0, [[0, '#3a2412'], [0.5, '#6d4622'], [1, '#3a2412']]); c.fill(); c.lineWidth = 0.8; c.strokeStyle = rgba('#000000', 0.7); c.stroke();
      c.strokeStyle = rgba('#f6e3a8', 0.35); c.beginPath(); c.ellipse(11, 6, 5.6, 1.4, 0, Math.PI * 1.08, Math.PI * 1.92); c.stroke();
      // fuse
      c.lineCap = 'round'; c.lineWidth = 1.6; c.strokeStyle = '#151515'; c.beginPath(); c.moveTo(11, 5.6); c.quadraticCurveTo(12.5, 1.5, 15.6, 2.4); c.stroke();
      c.lineWidth = 0.6; c.strokeStyle = rgba('#9aa3ad', 0.7); c.beginPath(); c.moveTo(11.2, 5); c.quadraticCurveTo(12.6, 1.6, 15.2, 2.2); c.stroke();
      c.globalCompositeOperation = 'lighter';
      soft(c, 16, 2.4, 4.5, '#ffb45a', 0.85); soft(c, 16, 2.4, 2.2, '#fff1cc', 1); disc(c, 16, 2.4, 1.1, '#ffffff');
    });

    /* tesla arc — jagged, endpoints pinned at (0,8) and (64,8) so segments chain */
    T('arc', 64, 16, 0, 0.5, (c, W, H) => {
      c.globalCompositeOperation = 'lighter'; c.lineJoin = 'round'; c.lineCap = 'round';
      const R = rng(23), pts = [], n = 10;
      for (let i = 0; i <= n; i++) { const t = i / n; pts.push([t * W, H / 2 + (i === 0 || i === n ? 0 : (R() - 0.5) * 9)]); }
      const path = () => { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); };
      path(); c.lineWidth = 6.5; c.strokeStyle = rgba('#3b7cff', 0.22); c.stroke();
      path(); c.lineWidth = 2.8; c.strokeStyle = rgba('#8fc4ff', 0.75); c.stroke();
      path(); c.lineWidth = 1.2; c.strokeStyle = '#ffffff'; c.stroke();
      // a short branch
      const b = pts[4]; c.beginPath(); c.moveTo(b[0], b[1]); c.lineTo(b[0] + 6, b[1] - 4.5); c.lineTo(b[0] + 11, b[1] - 6);
      c.lineWidth = 2.2; c.strokeStyle = rgba('#8fc4ff', 0.5); c.stroke(); c.lineWidth = 0.9; c.strokeStyle = rgba('#ffffff', 0.85); c.stroke();
    });

    T('healCross', 14, 14, 0.5, 0.5, (c) => {
      soft(c, 7, 7, 7, '#7cf9a5', 0.35);
      poly(c, [[5, 1], [9, 1], [9, 5], [13, 5], [13, 9], [9, 9], [9, 13], [5, 13], [5, 9], [1, 9], [1, 5], [5, 5]]);
      c.fillStyle = LG(c, 0, 1, 0, 13, [[0, '#c4ffd9'], [0.5, '#7cf9a5'], [1, '#2fbf6a']]); c.fill();
      c.lineWidth = 1; c.strokeStyle = rgba('#0b3d22', 0.9); c.stroke();
      c.fillStyle = rgba('#ffffff', 0.5); c.fillRect(6, 2, 2, 1); c.fillRect(2, 6, 3, 1);
    });

    /* ghost cloak shimmer — vertical streaks inside a soft ellipse, low alpha */
    T('shimmer', 40, 64, 0.5, 0.5, (c, W, H) => {
      const t = mk(W, H), tc = t.getContext('2d');
      const R = rng(9);
      tc.fillStyle = RG(tc, 20, 32, 0, 30, [[0, rgba('#c5d5ee', 0.55)], [0.6, rgba('#9fb4d0', 0.3)], [1, rgba('#9fb4d0', 0)]]);
      tc.beginPath(); tc.ellipse(20, 32, 18, 31, 0, 0, TAU); tc.fill();
      tc.lineCap = 'round';
      for (const x of [6, 11.5, 16, 21, 26, 30.5, 35]) {
        const w = 0.8 + R() * 1.4, ph = R(), amp = 0.6 + R() * 1.4, a0 = 0.28 + R() * 0.3;
        tc.lineWidth = w; tc.strokeStyle = LG(tc, 0, 0, 0, H, [[0, rgba('#e6eefb', 0)], [0.2 + ph * 0.25, rgba('#e6eefb', a0)], [0.5 + ph * 0.25, rgba('#dfe9f7', a0 * 0.45)], [1, rgba('#e6eefb', 0)]]);
        tc.beginPath(); tc.moveTo(x, 0);
        for (let y = 4; y <= H; y += 4) tc.lineTo(x + Math.sin(y * 0.18 + ph * 6) * amp, y);
        tc.stroke();
      }
      tc.globalCompositeOperation = 'destination-in';
      tc.fillStyle = RG(tc, 20, 32, 0, 31, [[0, rgba('#ffffff', 1)], [0.6, rgba('#ffffff', 0.75)], [1, rgba('#ffffff', 0)]]);
      tc.beginPath(); tc.ellipse(20, 32, 19, 32, 0, 0, TAU); tc.fill();
      c.globalAlpha = 0.5; c.drawImage(t, 0, 0);
    });

    /* hit splat — white core, red spikes */
    T('hit', 20, 20, 0.5, 0.5, (c) => {
      c.globalCompositeOperation = 'lighter';
      const R = rng(3), cx = 10, cy = 10;
      soft(c, cx, cy, 8, '#ff5a5a', 0.45);
      for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + 0.4, len = 5.5 + R() * 4; petal(c, cx, cy, a, len, 2.2, [[0, '#ffffff'], [0.45, rgba('#ff6a6a', 0.9)], [1, rgba('#ff2a2a', 0)]]); }
      disc(c, cx, cy, 3.5, RG(c, cx, cy, 0, 3.5, [[0, '#ffffff'], [0.6, rgba('#ffffff', 0.9)], [1, rgba('#ffd0d0', 0)]]));
    });

    T('bulletHole', 6, 6, 0.5, 0.5, (c) => { disc(c, 3, 3, 3, RG(c, 3, 3, 0, 3, [[0, rgba('#000000', 0.9)], [0.5, rgba('#000000', 0.75)], [0.75, rgba('#3a3f47', 0.35)], [1, rgba('#000000', 0)]])); });

    T('coinPop', 12, 12, 0.5, 0.5, (c) => {
      c.globalCompositeOperation = 'lighter';
      soft(c, 6, 6, 6, GOLD, 0.5);
      starPath(c, 6, 6, 4, 5.8, 1.7, -Math.PI / 2); c.fillStyle = RG(c, 6, 6, 0, 5.8, [[0, '#ffffff'], [0.4, '#ffe9a8'], [1, rgba(GOLD, 0.6)]]); c.fill();
      disc(c, 6, 6, 1.6, '#ffffff');
    });

    T('crit', 28, 28, 0.5, 0.5, (c) => {
      c.globalCompositeOperation = 'lighter';
      const cx = 14, cy = 14;
      soft(c, cx, cy, 12, GOLD, 0.5);
      // sparkle: long cross, shorter diagonals, a few stray needles — no wheel rim
      const R = rng(17);
      const needle = (a, len, wid, al) => petal(c, cx, cy, a, len, wid, [[0, rgba('#ffffff', al)], [0.35, rgba('#ffe9a8', al * 0.9)], [1, rgba(GOLD, 0)]]);
      for (let i = 0; i < 4; i++) needle(i * Math.PI / 2, 13.5, 2.4, 1);
      for (let i = 0; i < 4; i++) needle(Math.PI / 4 + i * Math.PI / 2, 8.5, 2, 0.85);
      for (let i = 0; i < 6; i++) needle(0.35 + i * TAU / 6 + (R() - 0.5) * 0.4, 5 + R() * 3, 1.2, 0.7);
      disc(c, cx, cy, 4, RG(c, cx, cy, 0, 4, [[0, '#ffffff'], [0.55, rgba('#ffffff', 0.9)], [1, rgba('#fff0c0', 0)]]));
    });

    T('rangeRing', 128, 128, 0.5, 0.5, (c) => {
      circ(c, 64, 64, 63); c.lineWidth = 3; c.strokeStyle = rgba('#000000', 0.25); c.stroke();
      c.setLineDash([2, 3]); circ(c, 64, 64, 63); c.lineWidth = 1; c.strokeStyle = rgba('#ffffff', 0.9); c.stroke(); c.setLineDash([]);
    });

    const cell = (c, col, colD, bad) => {
      rr(c, 2, 2, 60, 60, 8); c.fillStyle = RG(c, 32, 32, 0, 42, [[0, rgba(col, 0.36)], [1, rgba(colD, 0.28)]]); c.fill();
      rr(c, 2.75, 2.75, 58.5, 58.5, 7.5); c.lineWidth = 1.5; c.strokeStyle = rgba(col, 0.75); c.stroke();
      rr(c, 5, 5, 54, 54, 6); c.lineWidth = 1; c.strokeStyle = rgba(col, 0.2); c.stroke();
      if (bad) { c.lineCap = 'round'; c.lineWidth = 2.5; c.strokeStyle = rgba(col, 0.55); c.beginPath(); c.moveTo(22, 22); c.lineTo(42, 42); c.moveTo(42, 22); c.lineTo(22, 42); c.stroke(); }
    };
    T('placeOk', 64, 64, 0.5, 0.5, (c) => cell(c, '#7cf9a5', '#2fbf6a', false));
    T('placeBad', 64, 64, 0.5, 0.5, (c) => cell(c, '#ff5a5a', '#c0392b', true));

    return Promise.resolve(out);
  }

  /* =======================================================================
     UI — trading-card language (mint.wick.pics)
     ======================================================================= */
  const NINE = { left: 14, top: 14, right: 14, bottom: 14 };

  /** four mitered side bands, each with its own across-thickness gradient (nine-slice safe) */
  function bevelFrame(c, W, H, B, stopsFor) {
    const sides = [
      { p: [[0, 0], [W, 0], [W - B, B], [B, B]], g: [0, 0, 0, B], f: 0.10 },
      { p: [[W, 0], [W, H], [W - B, H - B], [W - B, B]], g: [W, 0, W - B, 0], f: -0.22 },
      { p: [[W, H], [0, H], [B, H - B], [W - B, H - B]], g: [0, H, 0, H - B], f: -0.36 },
      { p: [[0, H], [0, 0], [B, B], [B, H - B]], g: [0, 0, B, 0], f: -0.05 },
    ];
    for (const s of sides) { poly(c, s.p); c.fillStyle = LG(c, s.g[0], s.g[1], s.g[2], s.g[3], stopsFor(s.f)); c.fill(); }
    // seam-killers: re-fill the same polygons at 0.5px overlap by stroking each side band edge with itself is overkill;
    // instead paint the miter diagonals with a 1px averaged line so AA seams don't read
    c.lineWidth = 1;
    const mid = stopsFor(-0.13);
    for (const [x0, y0, x1, y1] of [[0, 0, B, B], [W, 0, W - B, B], [W, H, W - B, H - B], [0, H, B, H - B]]) {
      c.strokeStyle = LG(c, x0, y0, x1, y1, mid); c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    }
  }

  function bakeUI(mk) {
    const out = {};
    const T = (key, w, h, fn) => { const cv = mk(w, h), c = cv.getContext('2d'); c.save(); fn(c, w, h); c.restore(); out[key] = { canvas: cv, w, h }; };

    /* frameGold — 14px steel-foil bevel + 1px gold accent, dark interior */
    T('frameGold', 96, 96, (c, W, H) => {
      const B = NINE.left, p = i => i / B;
      const st = f => { const S = col => shade(col, f); return [
        [0, 'rgba(3,5,9,0.9)'], [p(1), 'rgba(3,5,9,0.9)'],
        [p(1), S('#ffffff')], [p(1.6), S('#eef2f8')], [p(3), S('#c9d2dd')], [p(4.6), S('#9aa6b6')], [p(6.2), S('#5c6674')], [p(7.4), S('#3d4653')], [p(8.2), S('#2f3742')],
        [p(8.4), S('#8792a3')], [p(8.8), S('#b8c2ce')], [p(9.3), S('#8792a3')], [p(10), S('#697485')],
        [p(10), S('#05070c')], [p(10.6), S('#05070c')],
        [p(10.6), S('#f6e3a8')], [p(11.4), S(GOLD)], [p(11.6), S(GOLD_D)], [p(12.4), S('#8a6a1c')],
        [p(12.4), INK], [1, INK]]; };
      bevelFrame(c, W, H, B, st);
      c.fillStyle = INK; c.fillRect(B, B, W - 2 * B, H - 2 * B);
    });

    /* card faces */
    const card = (c, W, H, v) => {
      const x = 4, y = 4, w = W - 8, h = H - 8, R = 9;
      const foil = v === 'sel' ? FOIL_HOT : v === 'lock' ? FOIL_STEEL : FOIL;
      const acc = v === 'lock' ? '#8e99a8' : GOLD;
      if (v === 'sel') { c.save(); c.shadowColor = rgba('#ffe9a8', 0.95); c.shadowBlur = 9; rr(c, x, y, w, h, R); c.fillStyle = GOLD; c.fill(); c.fill(); c.restore(); }
      rr(c, x - 0.5, y - 0.5, w + 1, h + 1, R + 0.5); c.strokeStyle = rgba('#000000', 0.7); c.lineWidth = 1; c.stroke();
      rr(c, x, y, w, h, R); c.fillStyle = LG(c, x, y, x + w, y + h, foil); c.fill();
      // sheen sweep on the rim
      c.save(); rr(c, x, y, w, h, R); c.clip();
      c.fillStyle = LG(c, x, y, x + w, y + h, [[0, rgba('#ffffff', 0)], [0.28, rgba('#ffffff', 0)], [0.36, rgba('#ffffff', 0.35)], [0.44, rgba('#ffffff', 0)], [1, rgba('#ffffff', 0)]]); c.fillRect(x, y, w, h);
      c.restore();
      const rim = v === 'sel' ? 3 : 2.5;
      const fx = x + rim, fy = y + rim, fw = w - rim * 2, fh = h - rim * 2;
      rr(c, fx, fy, fw, fh, R - rim); c.fillStyle = LG(c, 0, fy, 0, fy + fh, [[0, v === 'lock' ? '#11151d' : '#182030'], [1, '#0a0d14']]); c.fill();
      rr(c, fx + 1.5, fy + 1.5, fw - 3, fh - 3, R - rim - 1.5); c.strokeStyle = rgba(acc, v === 'lock' ? 0.18 : 0.3); c.lineWidth = 1; c.stroke();
      // art window
      const ax = 10, ay = 10, aw = W - 20, ah = 108;
      rr(c, ax, ay, aw, ah, 4); c.fillStyle = '#070a10'; c.fill();
      c.save(); rr(c, ax, ay, aw, ah, 4); c.clip();
      c.fillStyle = v === 'lock'
        ? RG(c, ax + aw / 2, ay + ah * 0.42, 0, aw * 0.62, [[0, rgba('#8e99a8', 0.12)], [1, rgba('#000000', 0)]])
        : RG(c, ax + aw / 2, ay + ah * 0.4, 0, aw * 0.64, [[0, rgba(GOLD, v === 'sel' ? 0.26 : 0.2)], [0.45, rgba('#5a4a2a', 0.13)], [1, rgba('#000000', 0)]]);
      c.fillRect(ax, ay, aw, ah);
      c.fillStyle = LG(c, 0, ay + ah * 0.55, 0, ay + ah, [[0, rgba('#000000', 0)], [1, rgba('#000000', 0.5)]]); c.fillRect(ax, ay, aw, ah);
      c.fillStyle = LG(c, ax, ay, ax + aw, ay + ah, [[0, rgba('#ffffff', 0.05)], [0.5, rgba('#ffffff', 0)], [1, rgba('#ffffff', 0.02)]]); c.fillRect(ax, ay, aw, ah);
      if (v === 'lock') {
        c.strokeStyle = rgba('#ffffff', 0.035); c.lineWidth = 2;
        for (let d = -ah; d < aw + ah; d += 9) { c.beginPath(); c.moveTo(ax + d, ay + ah); c.lineTo(ax + d + ah, ay); c.stroke(); }
        drawLock(c, ax + aw / 2, ay + ah / 2 - 2, 1.7, false);
      }
      c.restore();
      rr(c, ax + 0.5, ay + 0.5, aw - 1, ah - 1, 4); c.strokeStyle = RULE; c.lineWidth = 1; c.stroke();
      c.strokeStyle = rgba(acc, v === 'lock' ? 0.45 : 0.75); c.lineWidth = 1;
      bracket(c, ax + 2.5, ay + 2.5, 1, 1, 5); bracket(c, ax + aw - 2.5, ay + 2.5, -1, 1, 5); bracket(c, ax + 2.5, ay + ah - 2.5, 1, -1, 5); bracket(c, ax + aw - 2.5, ay + ah - 2.5, -1, -1, 5);
      // name plate
      const ny = ay + ah + 6;
      rr(c, ax, ny, aw, 26, 3); c.fillStyle = LG(c, 0, ny, 0, ny + 26, [[0, v === 'lock' ? '#161b25' : '#1c2536'], [1, '#0f1521']]); c.fill();
      rr(c, ax + 0.5, ny + 0.5, aw - 1, 25, 3); c.strokeStyle = RULE; c.stroke();
      c.fillStyle = rgba('#ffffff', 0.05); c.fillRect(ax + 3, ny + 1, aw - 6, 1);
      c.fillStyle = rgba(acc, v === 'lock' ? 0.45 : 0.85); diamond(c, ax + 8, ny + 13, 3); diamond(c, ax + aw - 8, ny + 13, 3);
      // cost plate
      const cw = 84, chh = 26, cx = W / 2 - cw / 2, cy = ny + 26 + 9;
      rr(c, cx, cy + 1, cw, chh, 13); c.fillStyle = rgba('#000000', 0.5); c.fill();
      rr(c, cx, cy, cw, chh, 13); c.fillStyle = '#05070c'; c.fill();
      rr(c, cx + 0.75, cy + 0.75, cw - 1.5, chh - 1.5, 12); c.strokeStyle = LG(c, cx, cy, cx + cw, cy + chh, foil); c.lineWidth = 1.5; c.stroke();
      c.save(); rr(c, cx + 2, cy + 2, cw - 4, chh / 2 - 2, 10); c.fillStyle = LG(c, 0, cy, 0, cy + chh / 2, [[0, rgba('#ffffff', 0.08)], [1, rgba('#ffffff', 0)]]); c.fill(); c.restore();
    };
    T('card', 150, 200, (c, W, H) => card(c, W, H, 'base'));
    T('cardSel', 150, 200, (c, W, H) => card(c, W, H, 'sel'));
    T('cardLocked', 150, 200, (c, W, H) => card(c, W, H, 'lock'));

    /* panel — foil rim + inner rule + corner brackets, nine-slice at 14 */
    T('panel', 320, 160, (c, W, H) => {
      rr(c, 0.5, 0.5, W - 1, H - 1, 7); c.strokeStyle = rgba('#000000', 0.7); c.lineWidth = 1; c.stroke();
      rr(c, 1, 1, W - 2, H - 2, 6.5); c.fillStyle = LG(c, 0, 0, W, H, FOIL); c.fill();
      rr(c, 3, 3, W - 6, H - 6, 5); c.fillStyle = rgba(PANEL, 0.97); c.fill();
      c.fillStyle = rgba('#ffffff', 0.05); c.fillRect(7, 3, W - 14, 1);
      rr(c, 7.5, 7.5, W - 15, H - 15, 3); c.strokeStyle = RULE; c.lineWidth = 1; c.stroke();
      c.strokeStyle = rgba(GOLD, 0.85); c.lineWidth = 1;
      bracket(c, 9.5, 9.5, 1, 1, 4); bracket(c, W - 9.5, 9.5, -1, 1, 4); bracket(c, 9.5, H - 9.5, 1, -1, 4); bracket(c, W - 9.5, H - 9.5, -1, -1, 4);
    });

    /* pill buttons */
    const btn = (c, W, H, hot) => {
      const x = 2, y = 2, w = W - 4, h = H - 4, R = h / 2;
      if (hot) { c.save(); c.shadowColor = rgba(GOLD, 0.6); c.shadowBlur = 6; rr(c, x, y, w, h, R); c.fillStyle = GOLD; c.fill(); c.restore(); }
      rr(c, x, y + 1, w, h, R); c.fillStyle = rgba('#000000', 0.6); c.fill();
      rr(c, x, y, w, h, R);
      c.fillStyle = hot ? LG(c, 0, y, 0, y + h, [[0, '#fff0bd'], [0.42, GOLD], [0.55, '#d8b040'], [1, '#a8841c']]) : LG(c, 0, y, 0, y + h, [[0, '#1e2737'], [0.5, '#131a27'], [1, '#0b0e15']]);
      c.fill();
      rr(c, x + 0.75, y + 0.75, w - 1.5, h - 1.5, R - 0.75); c.lineWidth = 1.5;
      c.strokeStyle = hot ? LG(c, 0, y, 0, y + h, [[0, '#fff6d6'], [1, '#6b5210']]) : LG(c, x, 0, x + w, 0, [[0, GOLD_D], [0.5, '#f0d38a'], [1, GOLD_D]]);
      c.stroke();
      c.save(); rr(c, x + 3, y + 2, w - 6, h * 0.45, R); c.fillStyle = LG(c, 0, y, 0, y + h * 0.5, [[0, rgba('#ffffff', hot ? 0.32 : 0.09)], [1, rgba('#ffffff', 0)]]); c.fill(); c.restore();
      if (!hot) { rr(c, x + 2.25, y + 2.25, w - 4.5, h - 4.5, R - 2.25); c.lineWidth = 1; c.strokeStyle = rgba(GOLD, 0.15); c.stroke(); }
    };
    T('btn', 200, 44, (c, W, H) => btn(c, W, H, false));
    T('btnHot', 200, 44, (c, W, H) => btn(c, W, H, true));

    /* hp bars */
    T('hpBar', 60, 6, (c, W, H) => {
      rr(c, 0.5, 0.5, W - 1, H - 1, 1.5); c.fillStyle = '#04060a'; c.fill(); c.lineWidth = 1; c.strokeStyle = '#2a3340'; c.stroke();
      c.fillStyle = rgba('#000000', 0.5); c.fillRect(1, 1, W - 2, 1);
    });
    T('hpFill', 56, 4, (c, W, H) => { c.fillStyle = LG(c, 0, 0, 0, H, [[0, '#c4ffd9'], [0.35, '#7cf9a5'], [1, '#2fbf6a']]); c.fillRect(0, 0, W, H); c.fillStyle = rgba('#ffffff', 0.35); c.fillRect(0, 0, W, 1); });
    T('hpFillW', 56, 4, (c, W, H) => { c.fillStyle = LG(c, 0, 0, 0, H, [[0, '#ffffff'], [0.35, '#e9e9e9'], [1, '#a9a9a9']]); c.fillRect(0, 0, W, H); c.fillStyle = rgba('#ffffff', 0.35); c.fillRect(0, 0, W, 1); });

    /* wave banner — black slab, gold stencil bevel, text slit */
    T('waveBanner', 900, 110, (c, W, H) => {
      const y0 = 8, y1 = 102, ch = 14;
      const slab = () => poly(c, [[ch, y0], [W - ch, y0], [W, y0 + ch], [W, y1 - ch], [W - ch, y1], [ch, y1], [0, y1 - ch], [0, y0 + ch]]);
      c.save(); c.shadowColor = rgba('#000000', 0.7); c.shadowBlur = 8; c.shadowOffsetY = 3; slab(); c.fillStyle = '#05070c'; c.fill(); c.restore();
      slab(); c.fillStyle = LG(c, 0, y0, 0, y1, [[0, '#131923'], [0.5, '#06080d'], [1, '#0f141c']]); c.fill();
      c.save(); slab(); c.clip();
      // stencil hatch, strongest at the ends
      c.lineWidth = 3;
      for (let x = -110; x < W + 110; x += 14) {
        const mx = x + 50, d = Math.min(mx, W - mx), a = 0.13 * clamp((190 - d) / 190, 0, 1);
        if (a <= 0.005) continue;
        c.strokeStyle = rgba(GOLD, a); c.beginPath(); c.moveTo(x, y1 + 2); c.lineTo(x + 100, y0 - 2); c.stroke();
      }
      // gold bevel band along every edge (6px stroke clipped → 3px inside)
      slab(); c.lineWidth = 6; c.strokeStyle = LG(c, 0, y0, 0, y1, [[0, '#f6e3a8'], [0.12, GOLD_D], [0.5, '#8a6a1c'], [0.88, GOLD_D], [1, '#e2bd5a']]); c.stroke();
      const inset = d => poly(c, [[ch + d * 0.41, y0 + d], [W - ch - d * 0.41, y0 + d], [W - d, y0 + ch + d * 0.41], [W - d, y1 - ch - d * 0.41], [W - ch - d * 0.41, y1 - d], [ch + d * 0.41, y1 - d], [d, y1 - ch - d * 0.41], [d, y0 + ch + d * 0.41]]);
      inset(3.5); c.lineWidth = 1; c.strokeStyle = rgba('#000000', 0.75); c.stroke();
      inset(4.5); c.strokeStyle = rgba('#fff4cc', 0.16); c.stroke();
      // stencil cuts: shallow chevrons bitten into the inner half of the bevel, outer hairline stays continuous
      c.fillStyle = '#05070c';
      for (let x = 60; x < W - 60; x += 48) {
        poly(c, [[x, y0 + 1], [x + 12, y0 + 1], [x + 9, y0 + 3.5], [x + 3, y0 + 3.5]]); c.fill();
        poly(c, [[x + 24, y1 - 1], [x + 36, y1 - 1], [x + 33, y1 - 3.5], [x + 27, y1 - 3.5]]); c.fill();
      }
      c.fillStyle = rgba('#fff4cc', 0.5); c.fillRect(ch + 4, y0, W - ch * 2 - 8, 1);
      // text slit
      const sx = 46, sw = W - 92, sy = 32, sh = 46, sc = 12;
      const slit = () => poly(c, [[sx + sc, sy], [sx + sw - sc, sy], [sx + sw, sy + sc], [sx + sw, sy + sh - sc], [sx + sw - sc, sy + sh], [sx + sc, sy + sh], [sx, sy + sh - sc], [sx, sy + sc]]);
      slit(); c.fillStyle = LG(c, 0, sy, 0, sy + sh, [[0, rgba('#000000', 0.62)], [0.5, rgba('#000000', 0.3)], [1, rgba('#000000', 0.62)]]); c.fill();
      slit(); c.fillStyle = LG(c, sx, 0, sx + sw, 0, [[0, rgba(GOLD, 0)], [0.5, rgba(GOLD, 0.08)], [1, rgba(GOLD, 0)]]); c.fill();
      slit(); c.lineWidth = 1; c.strokeStyle = rgba(GOLD, 0.6); c.stroke();
      c.fillStyle = GOLD; diamond(c, sx + 22, sy + sh / 2, 5); diamond(c, sx + sw - 22, sy + sh / 2, 5);
      c.fillStyle = rgba(GOLD, 0.45); diamond(c, sx + 34, sy + sh / 2, 2.5); diamond(c, sx + sw - 34, sy + sh / 2, 2.5);
      c.restore();
    });

    T('starOn', 32, 32, (c) => drawStar5(c, 16, 17, 14, true));
    T('starOff', 32, 32, (c) => drawStar5(c, 16, 17, 14, false));
    T('coinIcon', 18, 18, (c) => drawCoin(c, 9, 9, 8.5, true));
    T('markerIcon', 18, 18, (c) => drawMarker(c, 9, 9, 8.5));
    T('skull', 20, 20, (c) => drawSkull(c, 10, 10, 1));
    T('lockIcon', 20, 24, (c) => drawLock(c, 10, 11.5, 1, true));

    return Promise.resolve(out);
  }

  global.CS_FX = { bakeAll: bakeFX };
  global.CS_UI_ART = { bakeAll: bakeUI, NINE: NINE };
})(typeof window !== 'undefined' ? window : globalThis);
