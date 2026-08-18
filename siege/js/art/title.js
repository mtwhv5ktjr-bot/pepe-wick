/* =========================================================================
   CONTINENTAL SIEGE — title-screen backdrop baker (pure canvas 2D, deterministic).
   window.CS_TITLE_ART = { bake(mk, opts) -> Promise<{ canvas, anchors, ambient }> }
   - canvas  : full W×H painted night street: the Continental's stone façade, marquee,
               red carpet, street lamp, the black fastback at the kerb, wet asphalt + puddles.
   - anchors : { title, hero, lamp, marquee, buttons, footer, windows[], car } in canvas px
   - ambient : { rain:true, lamps[], neon[], steam[], puddles[] } hints for the Phaser layer
   Painted in a fixed 1280×768 design space and scaled to W×H. No ink outlines on the
   environment: gradients, seeded grain, AO pools, specular strokes. mulberry32 only —
   no Math.random / Date / document (the caller supplies `mk`). ~150-300 ms in Chrome.
   ========================================================================= */
(function (global) {
  'use strict';

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // ---------- colour helpers ----------
  function hex2rgb(h) {
    h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(h, a) { const [r, g, b] = hex2rgb(h); return 'rgba(' + r + ',' + g + ',' + b + ',' + (a == null ? 1 : a) + ')'; }
  function mixc(a, b, t) {
    const A = hex2rgb(a), B = hex2rgb(b);
    return '#' + [0, 1, 2].map(i => clamp(Math.round(A[i] + (B[i] - A[i]) * t), 0, 255).toString(16).padStart(2, '0')).join('');
  }
  const shade = (h, k) => (k >= 0 ? mixc(h, '#ffffff', k) : mixc(h, '#000000', -k));

  // ---------- geometry helpers ----------
  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  function lin(c, x0, y0, x1, y1, stops) { const g = c.createLinearGradient(x0, y0, x1, y1); for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]); return g; }
  function rad(c, x, y, r0, r1, stops) { const g = c.createRadialGradient(x, y, r0, x, y, r1); for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]); return g; }
  function ell(c, x, y, rx, ry, style) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fillStyle = style; c.fill(); }
  /** truly elliptical soft radial (scaled circle) — no hard edge on the minor axis */
  function softEll(c, x, y, rx, ry, stops, comp, alpha) {
    if (rx <= 0 || ry <= 0) return;
    c.save(); if (comp) c.globalCompositeOperation = comp; if (alpha != null) c.globalAlpha = alpha;
    c.translate(x, y); c.scale(1, ry / rx);
    c.fillStyle = rad(c, 0, 0, 0, rx, stops); c.beginPath(); c.arc(0, 0, rx, 0, TAU); c.fill(); c.restore();
  }
  /** soft AO / drop-shadow ellipse (multiply darkening) */
  function shadowEll(c, x, y, rx, ry, a) { softEll(c, x, y, rx, ry, [0, 'rgba(0,0,0,' + a + ')', 0.55, 'rgba(0,0,0,' + (a * 0.55) + ')', 1, 'rgba(0,0,0,0)'], 'multiply'); }
  /** glow ellipse (screen) */
  function glowEll(c, x, y, rx, ry, color, a) { softEll(c, x, y, rx, ry, [0, rgba(color, a), 0.45, rgba(color, a * 0.45), 1, rgba(color, 0)], 'screen'); }
  function ctxFont(px, weight) { return (weight || 'bold') + ' ' + px + 'px "Black Ops One", Impact, "Arial Black", sans-serif'; }
  function serifFont(px) { return 'bold ' + px + 'px Georgia, "Times New Roman", Times, serif'; }
  /** arched (round-headed) window path */
  function archPath(c, x, y, w, h) {
    const r = w / 2; c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y + r); c.arc(x + r, y + r, r, Math.PI, 0); c.lineTo(x + w, y + h); c.closePath();
  }
  function line(c, x0, y0, x1, y1, style, w) { c.strokeStyle = style; c.lineWidth = w || 1; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }

  // ---------- textures ----------
  function grainTex(mk, rng, size, amp) {
    const cv = mk(size, size), c = cv.getContext('2d'), im = c.createImageData(size, size), d = im.data;
    for (let i = 0; i < d.length; i += 4) { const v = clamp(128 + ((rng() + rng() - 1) * amp) | 0, 0, 255); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    c.putImageData(im, 0, 0); return cv;
  }
  function applyGrain(c, tex, x, y, w, h, alpha) {
    c.save(); c.globalCompositeOperation = 'overlay'; c.globalAlpha = alpha; c.fillStyle = c.createPattern(tex, 'repeat'); c.fillRect(x, y, w, h); c.restore();
  }
  function mottle(c, rng, x0, y0, w, h, n, r, aDark, aLight) {
    c.save();
    for (let i = 0; i < n; i++) {
      const x = x0 + rng() * w, y = y0 + rng() * h, rad0 = r * (0.5 + rng()), dark = rng() < 0.55;
      c.globalCompositeOperation = dark ? 'multiply' : 'screen';
      const col = dark ? '0,0,0' : '255,255,255', a = dark ? aDark : aLight;
      c.fillStyle = rad(c, x, y, 0, rad0, [0, 'rgba(' + col + ',' + a + ')', 1, 'rgba(' + col + ',0)']);
      c.beginPath(); c.arc(x, y, rad0, 0, TAU); c.fill();
    }
    c.restore();
  }
  function vignette(c, W, H, a) {
    c.save(); c.globalCompositeOperation = 'multiply';
    c.fillStyle = rad(c, W / 2, H / 2, H * 0.35, Math.max(W, H) * 0.72, [0, 'rgba(0,0,0,0)', 1, 'rgba(0,0,0,' + a + ')']);
    c.fillRect(0, 0, W, H); c.restore();
  }
  /** centred text drawn char-by-char with manual letter spacing (font-agnostic, measureText-fitted) */
  function spacedWidth(c, text, sp) { let w = 0; for (let i = 0; i < text.length; i++) w += c.measureText(text[i]).width; return w + sp * (text.length - 1); }
  function fitSpaced(c, text, maxW, maxPx, minPx, fontFn, spK) {
    let px = maxPx; c.font = fontFn(px);
    while (px > minPx && spacedWidth(c, text, px * spK) > maxW) { px -= 1; c.font = fontFn(px); }
    return px;
  }
  function drawSpaced(c, text, cx, y, sp) {
    const w = spacedWidth(c, text, sp); let x = cx - w / 2; c.textAlign = 'left';
    for (let i = 0; i < text.length; i++) { c.fillText(text[i], x, y); x += c.measureText(text[i]).width + sp; }
  }

  // ---------- design space ----------
  const DW = 1280, DH = 768;
  const L = {                                     // layout constants (design px)
    hotelX0: 320, hotelX1: 960, base: 548,        // façade footprint; pavement starts at `base`
    kerbY: 596, roadY: 606,                       // pavement 548..596, kerb 596..606, asphalt 606..768
    cornice: 146, belt: 388,                      // heavy cornice / piano-nobile belt course
    canopy: { x: 510, y: 410, w: 260, h: 36 },
    door: { x: 590, y: 446, w: 100, h: 104 },
    lamp: { x: 452, base: 590, head: 418 },
    hero: { x: 502, y: 592 },
    car: { x0: 794, x1: 1026, roof: 550, wheelY: 602 },
    title: { x: 640, y: 76 }, buttonsY: 655, footerY: 745,
  };
  const STONE = '#6b6250', STONE_HI = '#8a8069', STONE_LO = '#3d382e';
  const AMBER0 = '#f0b64a', AMBER1 = '#ffd9a0', GOLD = '#e8c576', GREEN = '#3dffb0', GREEN2 = '#7cf9a5', MAGENTA = '#ff3d8f';

  // ======================================================================
  // 1. SKY
  // ======================================================================
  function paintSky(env) {
    const { c, rng } = env;
    c.fillStyle = lin(c, 0, 0, 0, DH, [0, '#03040b', 0.22, '#060915', 0.45, '#0c1124', 0.72, '#141b33', 1, '#182038']);
    c.fillRect(0, 0, DW, DH);
    // city glow low on the horizon (rooftop line ~ y 300): teal-warm, the hotel will cover the middle
    softEll(c, 640, 400, 760, 220, [0, 'rgba(70,100,120,0.34)', 0.5, 'rgba(50,70,100,0.16)', 1, 'rgba(0,0,0,0)'], 'screen');
    softEll(c, 200, 330, 300, 90, [0, 'rgba(120,60,90,0.14)', 1, 'rgba(0,0,0,0)'], 'screen');    // magenta bleed, far left
    softEll(c, 1090, 320, 320, 100, [0, 'rgba(50,140,100,0.16)', 1, 'rgba(0,0,0,0)'], 'screen');  // green bleed, far right
    // moon: veiled disc + faint halo, top-right (well clear of the title band's text)
    glowEll(c, 1128, 96, 170, 130, '#8fa3cc', 0.11);
    glowEll(c, 1128, 96, 62, 54, '#c9d6ee', 0.16);
    c.fillStyle = 'rgba(214,224,242,0.42)'; c.beginPath(); c.arc(1128, 96, 15, 0, TAU); c.fill();
    c.fillStyle = 'rgba(160,175,205,0.35)'; c.beginPath(); c.arc(1122, 92, 11, 0, TAU); c.fill();  // veiled edge
    // cloud wisps (kept below the title band, very faint)
    c.save(); c.globalCompositeOperation = 'screen';
    for (let i = 0; i < 18; i++) {
      const x = rng() * DW, y = 118 + rng() * 190, rx = 90 + rng() * 170, ry = 6 + rng() * 14;
      softEll(c, x, y, rx, ry, [0, 'rgba(120,140,185,' + (0.045 + rng() * 0.05) + ')', 1, 'rgba(0,0,0,0)'], 'screen');
    }
    c.restore();
    // a handful of tiny stars in the gaps between clouds (rain night → few, dim, none in the title band)
    for (let i = 0; i < 26; i++) { const x = rng() * DW, y = 140 + rng() * 120; if (x > 330 && x < 950) continue; c.fillStyle = 'rgba(200,215,240,' + (0.15 + rng() * 0.25) + ')'; c.fillRect(x, y, 1, 1); }
    applyGrain(c, env.grainT, 0, 0, DW, 340, 0.12);
  }

  // ======================================================================
  // 2. CITY (far hazy blocks + near flanking buildings + neon)
  // ======================================================================
  function paintFarSkyline(env) {
    const { c, rng } = env;
    let x = -30;
    while (x < DW + 30) {
      const w = 24 + rng() * 74, top = 236 + rng() * 130, tone = mixc('#0c1020', '#1a2138', rng());
      c.fillStyle = tone; c.fillRect(x, top, w, 560 - top);
      if (rng() < 0.3) { c.fillStyle = shade(tone, -0.2); c.fillRect(x + w * 0.3, top - 10 - rng() * 14, w * 0.4, 30); }  // penthouse / bulkhead
      for (let wy = top + 6; wy < 470; wy += 7) for (let wx = x + 3; wx < x + w - 3; wx += 6) if (rng() < 0.11) { c.fillStyle = rng() < 0.75 ? 'rgba(255,215,140,0.55)' : 'rgba(120,255,190,0.45)'; c.fillRect(wx, wy, 2, 3); }
      x += w + 2 + rng() * 6;
    }
    // atmospheric haze: far blocks sink into the night toward street level
    c.fillStyle = lin(c, 0, 230, 0, 560, [0, 'rgba(12,16,34,0.20)', 0.5, 'rgba(12,16,32,0.55)', 1, 'rgba(12,16,30,0.85)']); c.fillRect(0, 230, DW, 330);
    // a red aircraft beacon on the tallest far mast
    c.fillStyle = 'rgba(255,60,60,0.8)'; c.fillRect(1064, 226, 2, 2); glowEll(c, 1065, 227, 8, 8, '#ff3030', 0.35);
    line(c, 1065, 228, 1065, 250, 'rgba(30,36,60,0.9)', 1.2);
  }

  function nearBlock(env, b) {
    const { c, rng } = env;
    const w = b.x1 - b.x0, H = L.base - b.top;
    // face: lit from the street below, darkening upward; slight left/right shading toward the hotel
    c.fillStyle = lin(c, 0, b.top, 0, L.base, [0, shade(b.tone, -0.45), 0.55, b.tone, 1, shade(b.tone, 0.18)]); c.fillRect(b.x0, b.top, w, H);
    c.fillStyle = lin(c, b.x0, 0, b.x1, 0, b.hotelSide === 'right' ? [0, 'rgba(0,0,0,0.25)', 1, 'rgba(255,200,140,0.06)'] : [0, 'rgba(255,200,140,0.06)', 1, 'rgba(0,0,0,0.25)']); c.fillRect(b.x0, b.top, w, H);
    mottle(c, rng, b.x0, b.top, w, H, 10, 60, 0.12, 0.05);
    // brick/stone courses
    c.save(); c.globalAlpha = 0.16; c.strokeStyle = '#000'; c.lineWidth = 1;
    for (let y = b.top + 8; y < L.base; y += b.course || 9) { c.beginPath(); c.moveTo(b.x0, y + 0.5); c.lineTo(b.x1, y + 0.5); c.stroke(); }
    c.restore();
    // parapet
    c.fillStyle = shade(b.tone, 0.22); c.fillRect(b.x0, b.top, w, 4); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(b.x0, b.top + 4, w, 5);
    // windows: rect grid, ~30% lit
    const pw = 12, ph = 17, px = 30, py = 36;
    for (let y = b.top + 20; y < L.base - 60; y += py) for (let x = b.x0 + 12; x < b.x1 - 14; x += px) {
      const lit = rng() < 0.32, cool = rng() < 0.22;
      c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(x - 1, y - 1, pw + 2, ph + 2);
      if (lit) {
        const col = cool ? '#8fd9c9' : rng() < 0.5 ? '#f2c078' : '#ffdca4', k = 0.55 + rng() * 0.45;
        c.fillStyle = lin(c, 0, y, 0, y + ph, [0, rgba(col, k), 1, rgba(mixc(col, '#7a4a20', 0.5), k)]); c.fillRect(x, y, pw, ph);
        if (rng() < 0.6) { c.fillStyle = 'rgba(40,20,10,0.55)'; c.fillRect(x + (rng() < 0.5 ? 0 : pw * 0.6), y, pw * 0.4, ph); }  // half-drawn curtain
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x + pw / 2 - 0.5, y, 1, ph);
        glowEll(c, x + pw / 2, y + ph / 2, 16, 14, col, 0.10 * k);
        env.lights.push({ x: x + pw / 2, y: y + ph, w: pw, color: col, a: 0.20 * k });
        if (rng() < 0.15) env.extraWindows.push({ x, y, w: pw, h: ph });
      } else {
        c.fillStyle = lin(c, 0, y, 0, y + ph, [0, '#141a2c', 1, '#07090f']); c.fillRect(x, y, pw, ph);
        c.fillStyle = 'rgba(120,150,200,0.10)'; c.fillRect(x, y, pw, 3);
      }
      c.fillStyle = shade(b.tone, 0.3); c.fillRect(x - 2, y + ph, pw + 4, 1.5);  // sill
    }
    // fire escape zigzag on brick blocks
    if (b.escape) {
      c.save(); c.strokeStyle = 'rgba(8,8,10,0.85)'; c.lineWidth = 1.5;
      const ex = b.escape, ew = 34;
      for (let y = b.top + 44; y < L.base - 70; y += 36) {
        c.beginPath(); c.moveTo(ex, y); c.lineTo(ex + ew, y); c.stroke();                       // landing
        c.beginPath(); c.moveTo(ex + ew, y); c.lineTo(ex + 6, y + 36); c.stroke();               // stair
        for (let k = 0; k <= ew; k += 6) { c.beginPath(); c.moveTo(ex + k, y - 8); c.lineTo(ex + k, y); c.stroke(); }  // railing
      }
      c.restore();
    }
    // street level: dark shopfront / service door with a dim cold light
    const sy = L.base - 52;
    c.fillStyle = shade(b.tone, -0.5); c.fillRect(b.x0 + 8, sy, w - 16, 52);
    if (b.shop) {
      const sx = b.shop, sw = 76;
      c.fillStyle = lin(c, 0, sy + 6, 0, L.base - 8, [0, '#1a2a30', 1, '#0a1218']); c.fillRect(sx, sy + 6, sw, 40);
      c.fillStyle = 'rgba(95,180,165,0.16)'; c.fillRect(sx + 4, sy + 10, sw - 8, 12);
      glowEll(c, sx + sw / 2, sy + 22, 60, 26, '#5fb3a1', 0.10);
      env.lights.push({ x: sx + sw / 2, y: L.base, w: sw * 0.6, color: '#5fb3a1', a: 0.08 });
      // awning
      c.fillStyle = lin(c, 0, sy - 6, 0, sy + 6, [0, '#3a1e22', 1, '#1a0c10']); c.beginPath(); c.moveTo(sx - 6, sy - 4); c.lineTo(sx + sw + 6, sy - 4); c.lineTo(sx + sw + 2, sy + 8); c.lineTo(sx - 2, sy + 8); c.closePath(); c.fill();
    }
    if (b.door) { c.fillStyle = '#07080c'; c.fillRect(b.door, sy + 8, 22, 44); c.fillStyle = 'rgba(255,190,110,0.35)'; c.fillRect(b.door + 9, sy + 4, 4, 3); glowEll(c, b.door + 11, sy + 8, 18, 12, '#ffb866', 0.16); }
    // water tower on the roof
    if (b.tower) {
      const tx = b.tower, ty = b.top;
      c.strokeStyle = '#0d0d10'; c.lineWidth = 2;
      for (const dx of [-14, -5, 5, 14]) { c.beginPath(); c.moveTo(tx + dx * 1.15, ty); c.lineTo(tx + dx, ty - 22); c.stroke(); }
      c.fillStyle = lin(c, tx - 16, 0, tx + 16, 0, [0, '#15151a', 0.35, '#3a3a42', 0.6, '#2a2a30', 1, '#0d0d10']); rr(c, tx - 16, ty - 58, 32, 36, 3); c.fill();
      c.fillStyle = '#0a0a0d'; c.beginPath(); c.moveTo(tx - 19, ty - 57); c.lineTo(tx + 19, ty - 57); c.lineTo(tx, ty - 74); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(tx - 12, ty - 56, 3, 32);
      for (let k = 0; k < 3; k++) line(c, tx - 16, ty - 50 + k * 11, tx + 16, ty - 50 + k * 11, 'rgba(0,0,0,0.5)', 1);
    }
    if (b.mast) { line(c, b.mast, b.top, b.mast, b.top - 46, '#0d0d10', 2); c.fillStyle = '#ff3a3a'; c.fillRect(b.mast - 1, b.top - 48, 3, 3); glowEll(c, b.mast, b.top - 46, 9, 9, '#ff3030', 0.5); }
    if (b.chimney) { c.fillStyle = lin(c, b.chimney - 7, 0, b.chimney + 7, 0, [0, '#08080a', 0.5, '#2a2428', 1, '#0a0a0c']); c.fillRect(b.chimney - 7, b.top - 26, 14, 26); c.fillRect(b.chimney - 9, b.top - 28, 18, 4); }
    if (b.antenna) { const ax = b.antenna; line(c, ax, b.top, ax, b.top - 34, '#0d0d10', 1.5); for (let k = 0; k < 4; k++) line(c, ax - 10 + k * 2, b.top - 30 + k * 6, ax + 10 - k * 2, b.top - 30 + k * 6, '#0d0d10', 1); }
    // rain-wet parapet highlight
    c.fillStyle = 'rgba(200,220,255,0.06)'; c.fillRect(b.x0, b.top, w, 1.5);
  }

  function neonSign(env, x, y, w, h, color, vertical) {
    const { c } = env;
    // sign box
    c.fillStyle = '#0a0a0e'; rr(c, x - 3, y - 3, w + 6, h + 6, 2); c.fill();
    // wash on the wall
    glowEll(c, x + w / 2, y + h / 2, (vertical ? 70 : w * 1.1), (vertical ? h * 0.8 : 46), color, 0.24);
    c.save(); c.globalCompositeOperation = 'screen'; c.lineCap = 'round';
    c.shadowColor = color; c.shadowBlur = 10;
    c.strokeStyle = rgba(color, 0.9); c.lineWidth = 2; rr(c, x, y, w, h, 2); c.stroke();
    // abstract glyph strokes (unreadable at distance)
    c.strokeStyle = mixc(color, '#ffffff', 0.55); c.lineWidth = 2;
    if (vertical) { for (let gy = y + 8; gy < y + h - 6; gy += 12) { c.beginPath(); c.moveTo(x + 4, gy); c.lineTo(x + w - 4, gy); c.stroke(); if (((gy / 12) | 0) % 2) { c.beginPath(); c.moveTo(x + 4, gy); c.lineTo(x + 4, gy + 6); c.stroke(); } } }
    else { for (let gx = x + 6; gx < x + w - 4; gx += 9) { c.beginPath(); c.moveTo(gx, y + 4); c.lineTo(gx, y + h - 4); c.stroke(); if (((gx / 9) | 0) % 2) { c.beginPath(); c.moveTo(gx, y + 4); c.lineTo(gx + 5, y + 4); c.stroke(); } } }
    c.restore();
    env.ambient.neon.push({ x, y, w, h, color });
    env.ambient.lamps.push({ x: x + w / 2, y: y + h / 2, color, r: 70, kind: 'neon' });
    env.lights.push({ x: x + w / 2, y: y + h, w: vertical ? 14 : w * 0.7, color, a: 0.30 });
  }

  function paintCity(env) {
    const { c } = env;
    paintFarSkyline(env);
    const blocks = [
      { x0: -4, x1: 160, top: 232, tone: '#1c181d', course: 6, escape: 40, tower: 0, mast: 128, chimney: 22, shop: 0, door: 96, hotelSide: 'right' },
      { x0: 160, x1: 322, top: 286, tone: '#191b22', course: 12, tower: 262, antenna: 200, shop: 186, hotelSide: 'right' },
      { x0: 958, x1: 1126, top: 270, tone: '#1c1a20', course: 11, shop: 1030, door: 990, chimney: 1100, hotelSide: 'left' },
      { x0: 1126, x1: 1284, top: 214, tone: '#181720', course: 7, escape: 1152, tower: 1246, antenna: 1180, hotelSide: 'left' },
    ];
    for (const b of blocks) nearBlock(env, b);
    // neon: magenta bar sign far left, WICK-green vertical sign far right
    neonSign(env, 34, 322, 84, 18, MAGENTA, false);
    neonSign(env, 1236, 300, 16, 124, GREEN, true);
    // alley gaps either side of the hotel (depth)
    c.fillStyle = lin(c, 0, 200, 0, L.base, [0, 'rgba(0,0,0,0.6)', 1, 'rgba(0,0,0,0.95)']); c.fillRect(310, 200, 12, L.base - 200); c.fillRect(958, 200, 12, L.base - 200);
  }

  // ======================================================================
  // 3. THE HOTEL
  // ======================================================================
  function stoneWindow(env, x, y, w, h, o) {
    const { c, rng } = env;
    const k = o.k == null ? 1 : o.k;                                        // light intensity of this floor
    const stone = o.stone || STONE;
    // surround ring (lighter dressed stone), lit from lower-left (street)
    c.fillStyle = lin(c, x - 6, y + h, x + w + 6, y - 6, [0, shade(stone, 0.22), 0.5, shade(stone, 0.10), 1, shade(stone, -0.10)]);
    archPath(c, x - 6, y - 6, w + 12, h + 6); c.fill();
    // keystone
    c.fillStyle = shade(stone, 0.30); c.beginPath(); c.moveTo(x + w / 2 - 4, y - 8); c.lineTo(x + w / 2 + 4, y - 8); c.lineTo(x + w / 2 + 3, y + 1); c.lineTo(x + w / 2 - 3, y + 1); c.closePath(); c.fill();
    // reveal (deep shadow)
    c.fillStyle = 'rgba(0,0,0,0.62)'; archPath(c, x - 2, y - 2, w + 4, h + 2); c.fill();
    // glass
    if (o.lit) {
      const warm = rng(), kk = k * (0.72 + rng() * 0.28);                     // per-window warmth + brightness variety
      const A0 = warm < 0.25 ? '#f39a3a' : warm < 0.7 ? AMBER0 : '#f4c76a', A1 = warm < 0.25 ? '#ffc98a' : warm < 0.7 ? AMBER1 : '#fff0cc';
      const a0 = mixc(A0, '#6a3e14', 1 - kk), a1 = mixc(A1, '#7a5220', 1 - kk);
      c.fillStyle = lin(c, 0, y, 0, y + h, [0, a1, 0.55, mixc(a0, a1, 0.5), 1, a0]); archPath(c, x, y, w, h); c.fill();
      c.save(); archPath(c, x, y, w, h); c.clip();
      // lamp glow inside + curtains
      softEll(c, x + w * (0.35 + rng() * 0.3), y + h * 0.45, w * 0.55, h * 0.4, [0, 'rgba(255,245,215,' + 0.5 * k + ')', 1, 'rgba(255,245,215,0)'], 'screen');
      const cw = w * (0.18 + rng() * 0.16), curt = 'rgba(70,32,20,' + (0.55 + rng() * 0.25) + ')';
      c.fillStyle = curt; c.beginPath(); c.moveTo(x, y); c.lineTo(x + cw, y); c.bezierCurveTo(x + cw * 0.5, y + h * 0.4, x + cw * 1.2, y + h * 0.7, x + cw * 0.7, y + h); c.lineTo(x, y + h); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(x + w, y); c.lineTo(x + w - cw, y); c.bezierCurveTo(x + w - cw * 0.5, y + h * 0.4, x + w - cw * 1.2, y + h * 0.7, x + w - cw * 0.7, y + h); c.lineTo(x + w, y + h); c.closePath(); c.fill();
      if (rng() < 0.35) { c.fillStyle = 'rgba(80,40,24,0.5)'; c.fillRect(x, y, w, h * 0.16); }  // pelmet / half-drawn blind
      if (o.figure) {                                                         // silhouette at the window
        c.fillStyle = 'rgba(14,10,8,0.92)'; const fx = x + w * 0.52, fy = y + h * 0.42, hr = w * 0.13;
        c.beginPath(); c.arc(fx, fy, hr, 0, TAU); c.fill();
        rr(c, fx - w * 0.28, fy + hr * 0.9, w * 0.56, h * 0.7, w * 0.16); c.fill();
      }
      // mullions
      c.fillStyle = 'rgba(30,18,10,0.7)'; c.fillRect(x + w / 2 - 1, y, 2, h); c.fillRect(x, y + h * 0.42, w, 1.6); c.fillRect(x, y + w / 2 - 1, w, 1.6);
      // wet glass sheen
      c.fillStyle = lin(c, x, y, x + w * 0.4, y + h * 0.5, [0, 'rgba(255,255,255,0.20)', 1, 'rgba(255,255,255,0)']); c.fillRect(x, y, w, h);
      c.restore();
      glowEll(c, x + w / 2, y + h / 2, w * 1.5, h * 1.0, AMBER0, 0.14 * k);
      env.lights.push({ x: x + w / 2, y: y + h, w, color: AMBER0, a: 0.28 * k });
    } else {
      c.fillStyle = lin(c, 0, y, 0, y + h, [0, '#182036', 0.35, '#0b0f1a', 1, '#05070c']); archPath(c, x, y, w, h); c.fill();
      c.save(); archPath(c, x, y, w, h); c.clip();
      c.fillStyle = lin(c, x, y, x + w * 0.5, y + h * 0.6, [0, 'rgba(140,165,215,0.22)', 1, 'rgba(140,165,215,0)']); c.fillRect(x, y, w, h);
      c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(x + w / 2 - 1, y, 2, h); c.fillRect(x, y + h * 0.42, w, 1.5);
      if (rng() < 0.4) { c.fillStyle = 'rgba(255,190,120,' + (0.05 + rng() * 0.08) + ')'; c.fillRect(x, y, w, h); }  // faint TV / hall light
      c.restore();
    }
    // sill
    c.fillStyle = lin(c, 0, y + h, 0, y + h + 5, [0, shade(stone, 0.32), 1, shade(stone, 0.05)]); c.fillRect(x - 8, y + h, w + 16, 5);
    c.fillStyle = lin(c, 0, y + h + 5, 0, y + h + 12, [0, 'rgba(0,0,0,0.42)', 1, 'rgba(0,0,0,0)']); c.fillRect(x - 8, y + h + 5, w + 16, 7);
    // wrought-iron balconette (piano nobile)
    if (o.balcony) {
      const by = y + h - 16, bx = x - 8, bw = w + 16;
      c.fillStyle = shade(stone, 0.18); c.fillRect(bx - 2, y + h - 1, bw + 4, 3);
      c.strokeStyle = 'rgba(10,10,12,0.95)'; c.lineWidth = 1.2;
      for (let vx = bx + 2; vx <= bx + bw - 2; vx += 4.5) { c.beginPath(); c.moveTo(vx, by); c.lineTo(vx, y + h); c.stroke(); }
      c.lineWidth = 2; c.beginPath(); c.moveTo(bx - 1, by); c.lineTo(bx + bw + 1, by); c.stroke();
      c.lineWidth = 1; c.beginPath(); c.moveTo(bx, by + 8); c.lineTo(bx + bw, by + 8); c.stroke();
      // scroll ornament in the middle
      c.beginPath(); c.arc(x + w / 2 - 4, by + 8, 3.5, 0, Math.PI, true); c.stroke(); c.beginPath(); c.arc(x + w / 2 + 4, by + 8, 3.5, 0, Math.PI, true); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(bx - 1, by - 1, bw + 2, 1);
    }
  }

  function paintHotel(env) {
    const { c, rng } = env;
    const X0 = L.hotelX0, X1 = L.hotelX1, W = X1 - X0, BASE = L.base;
    c.save(); c.beginPath(); c.rect(X0 - 8, 0, W + 16, BASE); c.clip();   // (own layer) keep blends inside the façade + cornice overhang
    // ---- façade body: warm limestone at street level, dissolving into the night above the cornice
    c.fillStyle = lin(c, 0, 0, 0, BASE, [0, '#04050c', 0.10, '#0b0c12', 0.19, '#1c1b1c', 0.27, '#3b372e', 0.5, '#524b3c', 0.75, '#635a48', 1, '#6e6553']);
    c.fillRect(X0, 0, W, BASE);
    // lateral shading (lamp on the left, dark alley edges) + mottling
    c.fillStyle = lin(c, X0, 0, X1, 0, [0, 'rgba(0,0,0,0.30)', 0.12, 'rgba(0,0,0,0)', 0.9, 'rgba(0,0,0,0)', 1, 'rgba(0,0,0,0.32)']); c.fillRect(X0, 0, W, BASE);
    mottle(c, rng, X0, 150, W, BASE - 150, 26, 70, 0.10, 0.06);
    // ashlar courses (upper floors)
    c.save(); c.globalAlpha = 0.14; c.strokeStyle = '#000'; c.lineWidth = 1;
    for (let y = L.cornice + 24; y < L.belt; y += 16) { c.beginPath(); c.moveTo(X0, y + 0.5); c.lineTo(X1, y + 0.5); c.stroke(); }
    c.restore();
    // ---- quoins (corner blocks)
    for (const side of [0, 1]) {
      let y = L.cornice + 24, k = 0;
      while (y < L.belt - 4) {
        const qw = k % 2 ? 16 : 24, qx = side ? X1 - qw : X0;
        c.fillStyle = shade(STONE, k % 2 ? 0.06 : 0.14); c.fillRect(qx, y, qw, 14);
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(qx, y + 14, qw, 2);
        c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(qx, y, qw, 1);
        y += 16; k++;
      }
    }
    // ---- string courses
    const course = (y, h, hi) => {
      c.fillStyle = lin(c, 0, y, 0, y + h, [0, shade(STONE, hi), 0.6, shade(STONE, hi - 0.15), 1, shade(STONE, -0.2)]); c.fillRect(X0 - 3, y, W + 6, h);
      c.fillStyle = lin(c, 0, y + h, 0, y + h + 8, [0, 'rgba(0,0,0,0.42)', 1, 'rgba(0,0,0,0)']); c.fillRect(X0, y + h, W, 8);
    };
    course(228, 4, 0.18); course(298, 4, 0.18);
    // ---- heavy cornice with dentils (top of the visible façade; above it the hotel runs off into the dark)
    c.fillStyle = lin(c, 0, L.cornice, 0, L.cornice + 22, [0, '#2a2721', 0.25, '#4d4739', 0.55, '#3d382e', 1, '#1a1815']); c.fillRect(X0 - 8, L.cornice, W + 16, 22);
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(X0 - 8, L.cornice + 22, W + 16, 3);
    for (let x = X0 - 6; x < X1 + 6; x += 12) { c.fillStyle = '#4a4438'; c.fillRect(x + 2, L.cornice + 16, 6, 6); c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(x + 8, L.cornice + 16, 4, 6); }
    c.fillStyle = lin(c, 0, L.cornice + 25, 0, L.cornice + 46, [0, 'rgba(0,0,0,0.5)', 1, 'rgba(0,0,0,0)']); c.fillRect(X0, L.cornice + 25, W, 21);
    // attic storey above the cornice: slate mansard band with dim dormers, then the hotel dissolves into the night
    c.fillStyle = lin(c, 0, L.cornice - 44, 0, L.cornice, [0, '#111216', 0.5, '#1c1c20', 1, '#26241f']); c.fillRect(X0 + 4, L.cornice - 44, W - 8, 44);
    for (const bx of [360, 430, 500, 570, 640, 710, 780, 850, 920]) {
      c.fillStyle = 'rgba(0,0,0,0.55)'; archPath(c, bx - 9, L.cornice - 36, 18, 26); c.fill();
      c.fillStyle = 'rgba(70,64,54,0.5)'; c.fillRect(bx - 12, L.cornice - 10, 24, 2);
      if (bx === 570 || bx === 850) { c.fillStyle = 'rgba(200,150,80,0.10)'; archPath(c, bx - 7, L.cornice - 34, 14, 24); c.fill(); }
    }
    c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(X0 + 4, L.cornice - 44, W - 8, 1);
    // ---- upper window rows (arched)
    const bays = []; for (let k = 0; k < 9; k++) bays.push(360 + 70 * k);
    const rows = [
      { y: 174, h: 48, w: 34, p: 0.42, k: 0.62 },
      { y: 238, h: 54, w: 38, p: 0.58, k: 0.82 },
      { y: 308, h: 74, w: 46, p: 0.66, k: 0.96, balcony: true },
    ];
    const figureAt = { row: 1, bay: 6 };
    rows.forEach((r, ri) => bays.forEach((bx, bi) => {
      const lit = rng() < r.p, x = bx - r.w / 2, figure = lit && ri === figureAt.row && bi === figureAt.bay;
      stoneWindow(env, x, r.y, r.w, r.h, { lit: lit || figure, k: r.k, balcony: r.balcony, figure });
      if ((lit || figure) && ri >= 1 && env.anchors.windows.length < 12) env.anchors.windows.push({ x, y: r.y, w: r.w, h: r.h });
    }));
    // ---- belt course (heavy, bracketed) between piano nobile and the ground floor
    c.fillStyle = lin(c, 0, L.belt, 0, L.belt + 12, [0, shade(STONE, 0.28), 0.5, shade(STONE, 0.12), 1, shade(STONE, -0.18)]); c.fillRect(X0 - 5, L.belt, W + 10, 12);
    for (let x = X0 + 4; x < X1; x += 35) { c.fillStyle = shade(STONE, 0.05); c.fillRect(x, L.belt + 12, 8, 7); c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(x + 8, L.belt + 12, 3, 7); }
    c.fillStyle = lin(c, 0, L.belt + 12, 0, L.belt + 30, [0, 'rgba(0,0,0,0.42)', 1, 'rgba(0,0,0,0)']); c.fillRect(X0, L.belt + 12, W, 18);
    // ---- ground floor: rusticated stone (banded joints, staggered blocks)
    const gy0 = L.belt + 12, gy1 = BASE;
    c.fillStyle = lin(c, 0, gy0, 0, gy1, [0, '#635a48', 1, '#746a56']); c.fillRect(X0, gy0, W, gy1 - gy0);
    // warm wash from doors/lamps on the rustication
    softEll(c, 640, 520, 260, 130, [0, 'rgba(255,190,110,0.22)', 1, 'rgba(0,0,0,0)'], 'screen');
    softEll(c, 470, 520, 150, 110, [0, 'rgba(255,205,140,0.16)', 1, 'rgba(0,0,0,0)'], 'screen');
    for (let y = gy0 + 8, row = 0; y < gy1; y += 16, row++) {
      c.fillStyle = 'rgba(0,0,0,0.30)'; c.fillRect(X0, y, W, 2.2); c.fillStyle = 'rgba(255,255,255,0.09)'; c.fillRect(X0, y + 2.2, W, 1);
      for (let x = X0 + (row % 2 ? 22 : 0); x < X1; x += 44) { c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(x, y - 16, 2, 16); }
    }
    mottle(c, rng, X0, gy0, W, gy1 - gy0, 12, 40, 0.10, 0.06);
    // plinth
    c.fillStyle = lin(c, 0, BASE - 12, 0, BASE, [0, '#4a4438', 1, '#2e2a22']); c.fillRect(X0, BASE - 12, W, 12);
    // ---- ground floor arched windows (lobby glow: brightest windows in the picture)
    for (const cx of [372, 444, 836, 908]) {
      const w = 52, h = 96, x = cx - w / 2, y = 444;
      stoneWindow(env, x, y, w, h, { lit: true, k: 1.0, stone: '#746a56' });
      // sheer curtain vertical folds + chandelier glint
      c.save(); archPath(c, x, y, w, h); c.clip();
      for (let fx = x + 3; fx < x + w; fx += 6) { c.fillStyle = 'rgba(255,255,255,0.09)'; c.fillRect(fx, y, 2, h); }
      softEll(c, x + w / 2, y + 22, 12, 9, [0, 'rgba(255,255,255,0.75)', 1, 'rgba(255,255,255,0)'], 'screen');
      c.restore();
    }
    // ---- entrance: brass-and-glass double doors, recessed
    const D = L.door;
    c.fillStyle = 'rgba(0,0,0,0.75)'; c.fillRect(D.x - 8, D.y - 6, D.w + 16, D.h + 8);
    c.fillStyle = lin(c, 0, D.y, 0, D.y + D.h, [0, '#c9a227', 0.3, '#f0d27a', 0.55, '#c9a227', 1, '#7a5610']); rr(c, D.x - 4, D.y - 4, D.w + 8, D.h + 6, 2); c.fill();
    // door leaves
    for (const side of [0, 1]) {
      const lx = D.x + side * (D.w / 2), lw = D.w / 2;
      c.fillStyle = lin(c, 0, D.y, 0, D.y + D.h, [0, '#ffe9bf', 0.35, '#f5c65a', 0.75, '#c9902e', 1, '#7d5a1c']); c.fillRect(lx + 2, D.y, lw - 4, D.h);
      c.save(); c.beginPath(); c.rect(lx + 2, D.y, lw - 4, D.h); c.clip();
      // lobby interior: chandelier + marble floor band + reception glow
      softEll(c, lx + lw / 2, D.y + 22, 20, 14, [0, 'rgba(255,255,255,0.9)', 1, 'rgba(255,255,255,0)'], 'screen');
      c.fillStyle = 'rgba(120,70,20,0.35)'; c.fillRect(lx + 2, D.y + D.h * 0.62, lw - 4, 6);
      c.fillStyle = 'rgba(255,255,255,0.14)'; c.fillRect(lx + 2, D.y + D.h * 0.7, lw - 4, D.h * 0.3);
      if (side === 0) { c.fillStyle = 'rgba(30,18,10,0.85)'; c.beginPath(); c.arc(lx + lw * 0.55, D.y + 40, 6, 0, TAU); c.fill(); rr(c, lx + lw * 0.55 - 11, D.y + 46, 22, 46, 6); c.fill(); }  // concierge silhouette
      // glass sheen
      c.fillStyle = lin(c, lx, D.y, lx + lw, D.y + D.h, [0, 'rgba(255,255,255,0.28)', 0.4, 'rgba(255,255,255,0)', 1, 'rgba(255,255,255,0.10)']); c.fillRect(lx, D.y, lw, D.h);
      c.restore();
      // brass rails: mid push bar + kick plate + stile
      c.fillStyle = lin(c, 0, D.y + 52, 0, D.y + 58, [0, '#fff0c0', 0.5, '#d4aa3a', 1, '#8a6414']); c.fillRect(lx + 6, D.y + 52, lw - 12, 5);
      c.fillStyle = lin(c, 0, D.y + D.h - 14, 0, D.y + D.h, [0, '#e8c576', 1, '#8a6414']); c.fillRect(lx + 2, D.y + D.h - 14, lw - 4, 14);
      c.fillStyle = 'rgba(80,50,10,0.8)'; c.fillRect(lx + (side ? 1 : lw - 3), D.y, 2, D.h);
    }
    // warm spill under the canopy onto the door + wall
    softEll(c, 640, D.y - 2, 150, 40, [0, 'rgba(255,205,120,0.35)', 1, 'rgba(0,0,0,0)'], 'screen');
    env.lights.push({ x: 640, y: BASE, w: 90, color: '#ffd9a0', a: 0.42 });
    env.ambient.lamps.push({ x: 640, y: D.y + D.h * 0.4, color: '#ffd9a0', r: 110, kind: 'doors' });
    // ---- canopy / marquee
    const M = L.canopy;
    // suspension rods to the belt course
    c.strokeStyle = 'rgba(210,170,80,0.55)'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(M.x + 6, M.y - 6); c.lineTo(M.x + 44, L.belt + 12); c.stroke(); c.beginPath(); c.moveTo(M.x + M.w - 6, M.y - 6); c.lineTo(M.x + M.w - 44, L.belt + 12); c.stroke();
    // top surface (seen from slightly above): wet dark, sheen
    c.fillStyle = lin(c, 0, M.y - 8, 0, M.y, [0, '#2a2c34', 1, '#111318']); c.beginPath(); c.moveTo(M.x - 6, M.y); c.lineTo(M.x + M.w + 6, M.y); c.lineTo(M.x + M.w - 2, M.y - 8); c.lineTo(M.x + 2, M.y - 8); c.closePath(); c.fill();
    c.fillStyle = 'rgba(200,220,255,0.10)'; c.fillRect(M.x + 4, M.y - 8, M.w - 8, 1.2);
    // front face
    c.fillStyle = lin(c, 0, M.y, 0, M.y + M.h, [0, '#1a1b21', 0.5, '#0c0d11', 1, '#07080b']); c.fillRect(M.x - 6, M.y, M.w + 12, M.h);
    // side returns
    c.fillStyle = '#050608'; c.fillRect(M.x - 10, M.y - 4, 4, M.h + 4); c.fillRect(M.x + M.w + 6, M.y - 4, 4, M.h + 4);
    // gold trim lines + underside bulbs
    c.fillStyle = 'rgba(232,197,118,0.55)'; c.fillRect(M.x - 6, M.y + 1, M.w + 12, 1); c.fillRect(M.x - 6, M.y + M.h - 5, M.w + 12, 1);
    for (let bx = M.x + 6; bx < M.x + M.w; bx += 8) { c.fillStyle = '#ffe6a8'; c.beginPath(); c.arc(bx, M.y + M.h - 2, 1.4, 0, TAU); c.fill(); }
    c.fillStyle = lin(c, 0, M.y + M.h - 6, 0, M.y + M.h + 26, [0, 'rgba(255,214,140,0.42)', 1, 'rgba(255,214,140,0)']); c.save(); c.globalCompositeOperation = 'screen'; c.fillRect(M.x - 6, M.y + M.h - 6, M.w + 12, 32); c.restore();
    // "THE CONTINENTAL" — gold serif brass letters, fitted to the canopy with measureText
    const text = 'THE CONTINENTAL', maxW = M.w - 24;
    const px = fitSpaced(c, text, maxW, 26, 10, serifFont, 0.16), sp = px * 0.16;
    c.textBaseline = 'middle';
    c.save(); c.shadowColor = 'rgba(255,200,90,0.55)'; c.shadowBlur = 6;
    c.fillStyle = 'rgba(0,0,0,0.7)'; drawSpaced(c, text, M.x + M.w / 2 + 1, M.y + M.h / 2 + 1, sp);
    c.fillStyle = lin(c, 0, M.y + M.h / 2 - px * 0.5, 0, M.y + M.h / 2 + px * 0.5, [0, '#fff4cc', 0.45, '#e8c576', 0.7, '#c9a227', 1, '#8a6414']);
    drawSpaced(c, text, M.x + M.w / 2, M.y + M.h / 2, sp); c.restore();
    c.textBaseline = 'alphabetic';
    env.ambient.neon.push({ x: M.x, y: M.y, w: M.w, h: M.h, color: GOLD, kind: 'marquee' });
    // ---- brass lanterns flanking the entrance
    for (const lx of [490, 790]) {
      const ly = 424;
      c.strokeStyle = '#0d0d10'; c.lineWidth = 2; c.beginPath(); c.moveTo(lx, ly - 18); c.lineTo(lx, ly - 24); c.stroke();
      c.fillStyle = '#0a0a0d'; c.beginPath(); c.moveTo(lx - 8, ly - 12); c.lineTo(lx + 8, ly - 12); c.lineTo(lx, ly - 20); c.closePath(); c.fill();
      c.fillStyle = lin(c, 0, ly - 12, 0, ly + 12, [0, '#fff1cc', 0.5, '#f5c25a', 1, '#c98a24']); c.fillRect(lx - 6, ly - 12, 12, 22);
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(lx - 0.7, ly - 12, 1.4, 22); c.fillRect(lx - 6, ly - 1, 12, 1.4);
      c.fillStyle = lin(c, lx - 7, 0, lx + 7, 0, [0, '#8a6414', 0.5, '#e8c576', 1, '#7a5610']); c.fillRect(lx - 7, ly + 10, 14, 3); c.fillRect(lx - 7, ly - 13, 14, 2);
      glowEll(c, lx, ly, 46, 40, '#ffcf80', 0.42);
      env.ambient.lamps.push({ x: lx, y: ly, color: '#ffcf80', r: 44, kind: 'lantern' });
      env.lights.push({ x: lx, y: BASE, w: 14, color: '#ffcf80', a: 0.22 });
    }
    // façade AO at the pavement line
    c.fillStyle = lin(c, 0, BASE - 6, 0, BASE, [0, 'rgba(0,0,0,0)', 1, 'rgba(0,0,0,0.35)']); c.fillRect(X0, BASE - 6, W, 6);
    applyGrain(c, env.grainT, X0, 0, W, BASE, 0.14);
    c.restore();   // end façade clip
    // dissolve: the hotel runs off the top of the frame — erase it into the night sky above the
    // cornice (this layer is composited over the sky, so the real sky shows through) → quiet title band
    c.save(); c.globalCompositeOperation = 'destination-out';
    c.fillStyle = lin(c, 0, 0, 0, L.cornice + 34, [0, 'rgba(0,0,0,1)', 0.3, 'rgba(0,0,0,0.97)', 0.55, 'rgba(0,0,0,0.80)', 0.8, 'rgba(0,0,0,0.35)', 1, 'rgba(0,0,0,0)']);
    c.fillRect(X0 - 12, 0, W + 24, L.cornice + 34); c.restore();
  }

  // ======================================================================
  // 4. PAVEMENT (carpet, stanchions, umbrella stand, kerb)
  // ======================================================================
  function paintPavement(env) {
    const { c, rng } = env;
    const y0 = L.base, y1 = L.kerbY;
    c.fillStyle = lin(c, 0, y0, 0, y1, [0, '#25262c', 0.5, '#303138', 1, '#3a3b43']); c.fillRect(0, y0, DW, y1 - y0);
    // wet paving mirrors the sky a touch (cool sheen), warm where the hotel light lands
    c.fillStyle = lin(c, 0, y0, 0, y1, [0, 'rgba(90,110,150,0.06)', 1, 'rgba(90,110,150,0.14)']); c.fillRect(0, y0, DW, y1 - y0);
    // paving joints (slight perspective: nearer courses taller)
    c.save(); c.strokeStyle = 'rgba(0,0,0,0.30)'; c.lineWidth = 1;
    for (const y of [y0 + 14, y0 + 30]) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(DW, y + 0.5); c.stroke(); }
    for (let x = 6; x < DW; x += 46) { c.beginPath(); c.moveTo(x, y0); c.lineTo(x + 3, y1); c.stroke(); }
    c.strokeStyle = 'rgba(255,255,255,0.06)'; for (const y of [y0 + 15, y0 + 31]) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(DW, y + 0.5); c.stroke(); }
    c.restore();
    mottle(c, rng, 0, y0, DW, y1 - y0, 20, 50, 0.14, 0.06);
    // wet: façade reflections smeared onto the pavement (screen)
    c.save(); c.globalCompositeOperation = 'screen';
    for (const l of env.lights) { if (l.y > y0 + 1) continue; c.fillStyle = lin(c, 0, y0, 0, y1, [0, rgba(l.color, l.a * 0.55), 1, rgba(l.color, l.a * 0.08)]); c.fillRect(l.x - l.w * 0.55, y0, l.w * 1.1, y1 - y0); }
    c.restore();
    // AO under the façades
    c.fillStyle = lin(c, 0, y0, 0, y0 + 14, [0, 'rgba(0,0,0,0.45)', 1, 'rgba(0,0,0,0)']); c.fillRect(0, y0, DW, 14);
    // ---- red carpet runner (doors → kerb, widening toward the viewer) with gold trim
    const D = L.door, cx = D.x + D.w / 2;
    const carpet = (dw0, dw1, style) => { c.beginPath(); c.moveTo(cx - dw0, y0 - 1); c.lineTo(cx + dw0, y0 - 1); c.lineTo(cx + dw1, y1 + 1); c.lineTo(cx - dw1, y1 + 1); c.closePath(); c.fillStyle = style; c.fill(); };
    carpet(48, 60, '#c9a227'); carpet(45, 56, lin(c, cx - 56, 0, cx + 56, 0, [0, '#4a0c18', 0.5, '#7a1626', 1, '#4a0c18']));
    c.save(); c.globalCompositeOperation = 'screen'; carpet(45, 56, lin(c, 0, y0, 0, y1, [0, 'rgba(255,190,120,0.35)', 1, 'rgba(255,190,120,0.06)'])); c.restore();
    // ---- light pools: door spill + lamp pool
    softEll(c, cx, y0 + 26, 150, 34, [0, 'rgba(255,205,130,0.34)', 1, 'rgba(0,0,0,0)'], 'screen');
    softEll(c, L.lamp.x + 16, y0 + 40, 120, 30, [0, 'rgba(255,220,160,0.62)', 0.5, 'rgba(255,215,150,0.28)', 1, 'rgba(0,0,0,0)'], 'screen');
    // ---- brass stanchions + velvet rope (two per side, receding along the carpet)
    const posts = [];
    for (const side of [-1, 1]) {
      const p1 = { x: cx + side * 58, y: y0 + 16 }, p2 = { x: cx + side * 68, y: y1 - 2 }; posts.push(p1, p2);
      // rope swag between the two posts
      c.strokeStyle = '#8a1a2c'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(p1.x, p1.y - 22); c.quadraticCurveTo((p1.x + p2.x) / 2 + side * 3, (p1.y + p2.y) / 2 - 8, p2.x, p2.y - 22); c.stroke();
      c.strokeStyle = 'rgba(255,120,140,0.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(p1.x, p1.y - 23); c.quadraticCurveTo((p1.x + p2.x) / 2 + side * 3, (p1.y + p2.y) / 2 - 9, p2.x, p2.y - 23); c.stroke();
    }
    for (const p of posts) {
      shadowEll(c, p.x, p.y + 1, 8, 3, 0.5);
      c.fillStyle = lin(c, p.x - 6, 0, p.x + 6, 0, [0, '#7a5610', 0.4, '#f0d27a', 0.6, '#c9a227', 1, '#5a3e0a']);
      ell(c, p.x, p.y, 6, 2.5, c.fillStyle); c.fillRect(p.x - 1.6, p.y - 26, 3.2, 26);
      c.beginPath(); c.arc(p.x, p.y - 27, 3, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(p.x - 1, p.y - 24, 0.8, 20);
    }
    // ---- brass umbrella stand, right of the entrance
    const ux = 726, uy = y1 - 6;
    shadowEll(c, ux, uy + 1, 10, 3, 0.5);
    c.fillStyle = lin(c, ux - 8, 0, ux + 8, 0, [0, '#5a3e0a', 0.35, '#e8c576', 0.55, '#c9a227', 1, '#4a3208']); rr(c, ux - 8, uy - 28, 16, 28, 2); c.fill();
    ell(c, ux, uy - 28, 8, 3, '#2a1c08');
    for (const [dx, h] of [[-4, 16], [0, 20], [3, 13]]) { c.strokeStyle = '#0c0c10'; c.lineWidth = 2; c.beginPath(); c.moveTo(ux + dx, uy - 28); c.lineTo(ux + dx + 1, uy - 28 - h); c.stroke(); c.beginPath(); c.arc(ux + dx + 3, uy - 28 - h, 2.5, Math.PI, 0); c.stroke(); }
    c.fillStyle = 'rgba(255,255,255,0.28)'; c.fillRect(ux - 5, uy - 26, 1.2, 24);
    // ---- kerb
    c.fillStyle = lin(c, 0, y1, 0, y1 + 4, [0, '#66686e', 1, '#4a4c52']); c.fillRect(0, y1, DW, 4);
    c.fillStyle = lin(c, 0, y1 + 4, 0, L.roadY, [0, '#2a2b30', 1, '#15161a']); c.fillRect(0, y1 + 4, DW, L.roadY - y1 - 4);
    c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(0, y1, DW, 1);
    applyGrain(c, env.grainT, 0, y0, DW, L.roadY - y0, 0.16);
  }

  // ======================================================================
  // 5. STREET LAMP
  // ======================================================================
  function paintLamp(env) {
    const { c } = env;
    const { x, base, head } = L.lamp;
    // volumetric cone (rain catches the light)
    c.save(); c.globalCompositeOperation = 'screen';
    c.fillStyle = lin(c, 0, head, 0, base + 10, [0, 'rgba(255,215,150,0.26)', 0.45, 'rgba(255,215,150,0.09)', 1, 'rgba(255,215,150,0.03)']);
    c.beginPath(); c.moveTo(x - 8, head + 10); c.lineTo(x + 8, head + 10); c.lineTo(x + 104, base + 8); c.lineTo(x - 86, base + 8); c.closePath(); c.fill();
    c.restore();
    glowEll(c, x + 30, head + 60, 130, 120, '#ffd9a0', 0.12);          // wall wash behind
    // plinth
    shadowEll(c, x, base + 1, 14, 4, 0.55);
    c.fillStyle = lin(c, x - 9, 0, x + 9, 0, [0, '#08080a', 0.4, '#3a3a40', 0.6, '#26262c', 1, '#050506']); rr(c, x - 9, base - 14, 18, 14, 2); c.fill();
    c.fillStyle = lin(c, x - 6, 0, x + 6, 0, [0, '#08080a', 0.4, '#44444a', 0.6, '#2a2a30', 1, '#050506']); rr(c, x - 6, base - 22, 12, 9, 2); c.fill();
    // fluted column, tapering
    c.fillStyle = lin(c, x - 4, 0, x + 4, 0, [0, '#08080a', 0.35, '#4a4a52', 0.55, '#2c2c32', 1, '#050506']);
    c.beginPath(); c.moveTo(x - 4.5, base - 22); c.lineTo(x + 4.5, base - 22); c.lineTo(x + 2.6, head + 16); c.lineTo(x - 2.6, head + 16); c.closePath(); c.fill();
    for (const cy of [base - 66, head + 70]) { c.fillStyle = '#0a0a0c'; rr(c, x - 6, cy, 12, 5, 2); c.fill(); c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(x - 5, cy, 10, 1); }
    // ladder bar with curls
    c.strokeStyle = '#0a0a0c'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x - 17, head + 44); c.lineTo(x + 17, head + 44); c.stroke();
    c.lineWidth = 1.5; c.beginPath(); c.arc(x - 17, head + 40, 4, Math.PI * 0.5, Math.PI * 1.9); c.stroke(); c.beginPath(); c.arc(x + 17, head + 40, 4, Math.PI * 1.1, Math.PI * 2.5); c.stroke();
    // lantern head: neck, glass, cap, finial
    c.fillStyle = '#0a0a0c'; rr(c, x - 7, head + 12, 14, 5, 1); c.fill();
    c.fillStyle = lin(c, 0, head - 14, 0, head + 12, [0, '#fff6dc', 0.45, '#ffd98a', 1, '#e0a040']);
    c.beginPath(); c.moveTo(x - 10, head + 12); c.lineTo(x + 10, head + 12); c.lineTo(x + 8, head - 14); c.lineTo(x - 8, head - 14); c.closePath(); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(x - 0.8, head - 14, 1.6, 26); c.fillRect(x - 9, head - 2, 18, 1.2);   // glazing bars
    c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillRect(x - 6, head - 12, 1.5, 22);                                       // spec on glass
    c.fillStyle = '#0a0a0c'; c.beginPath(); c.moveTo(x - 12, head - 14); c.lineTo(x + 12, head - 14); c.lineTo(x + 5, head - 24); c.lineTo(x - 5, head - 24); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.14)'; c.fillRect(x - 11, head - 14.5, 22, 1);
    c.fillStyle = '#0a0a0c'; c.beginPath(); c.arc(x, head - 27, 3, 0, TAU); c.fill(); c.fillRect(x - 0.8, head - 24, 1.6, 4);
    // glow
    glowEll(c, x, head, 34, 30, '#fff0c8', 0.75);
    glowEll(c, x, head, 90, 84, '#ffd9a0', 0.32);
    env.ambient.lamps.push({ x, y: head, color: '#ffd9a0', r: 96, kind: 'street' });
    env.lights.push({ x, y: base, w: 24, color: '#ffd9a0', a: 0.42 });
  }

  // ======================================================================
  // 6. STREET (asphalt, drain, puddles + reflections, wet sheen)
  // ======================================================================
  function paintStreet(env) {
    const { c, rng } = env;
    const y0 = L.roadY, y1 = DH;
    c.fillStyle = lin(c, 0, y0, 0, y1, [0, '#101217', 0.35, '#141821', 1, '#1a1f2a']); c.fillRect(0, y0, DW, y1 - y0);
    mottle(c, rng, 0, y0, DW, y1 - y0, 40, 90, 0.16, 0.05);
    // aggregate speckle
    for (let i = 0; i < 900; i++) { const x = rng() * DW, y = y0 + rng() * (y1 - y0); c.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.25)'; c.fillRect(x, y, 1.2, 1.2); }
    // kerb-side yellow line + faded lane dashes (kept dim: menu buttons live here)
    c.fillStyle = 'rgba(214,180,60,0.20)'; c.fillRect(0, y0 + 6, DW, 2);
    c.fillStyle = 'rgba(230,230,235,0.11)'; for (let x = 20; x < DW; x += 96) c.fillRect(x, 730, 44, 3);
    // storm drain (left, near the lamp) — steam source
    const dx = 372, dy = y0 + 6;
    c.fillStyle = lin(c, 0, dy, 0, dy + 10, [0, '#0a0b0e', 1, '#1a1c22']); rr(c, dx - 24, dy, 48, 10, 2); c.fill();
    for (let sx = dx - 19; sx < dx + 20; sx += 6) { c.fillStyle = '#020204'; c.fillRect(sx, dy + 2, 3, 6); }
    c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(dx - 24, dy, 48, 1);
    // manhole (far right)
    const mx = 1122, my = 700;
    ell(c, mx, my, 22, 8, '#0c0d11'); ell(c, mx, my, 19, 6.5, lin(c, 0, my - 7, 0, my + 7, [0, '#23252c', 1, '#101115']));
    c.strokeStyle = 'rgba(255,255,255,0.09)'; c.lineWidth = 1; c.beginPath(); c.ellipse(mx, my, 19, 6.5, 0, 0, TAU); c.stroke();
    // ---- long smeared reflections of every light source across the wet asphalt (screen, faint)
    c.save(); c.globalCompositeOperation = 'screen';
    for (const l of env.lights) {
      const len = 70 + l.a * 240;
      c.fillStyle = lin(c, 0, y0, 0, y0 + len, [0, rgba(l.color, l.a * 0.30), 0.4, rgba(l.color, l.a * 0.12), 1, rgba(l.color, 0)]);
      c.fillRect(l.x - l.w * 0.55, y0, l.w * 1.1, len);
    }
    c.restore();
    // ---- puddles: sky-blue sheet + clipped, brighter reflections + ripples
    const puddles = [
      { x: 296, y: 704, rx: 138, ry: 15 }, { x: 640, y: 740, rx: 190, ry: 17 },
      { x: 1006, y: 690, rx: 112, ry: 12 }, { x: 1180, y: 736, rx: 84, ry: 10 }, { x: 150, y: 646, rx: 66, ry: 8 },
    ];
    for (const p of puddles) {
      // slightly irregular outline (three overlapping ellipses) so it doesn't read as a stamped oval
      const outline = () => { c.beginPath(); c.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, TAU); c.ellipse(p.x - p.rx * 0.35, p.y + p.ry * 0.25, p.rx * 0.5, p.ry * 0.9, 0, 0, TAU); c.ellipse(p.x + p.rx * 0.4, p.y - p.ry * 0.2, p.rx * 0.45, p.ry * 0.8, 0, 0, TAU); };
      c.save(); outline(); c.clip();
      // sheet of standing water: mirrors the sky (cool) — only a touch lighter than the asphalt
      c.fillStyle = lin(c, 0, p.y - p.ry, 0, p.y + p.ry, [0, 'rgba(40,54,86,0.55)', 0.5, 'rgba(30,40,66,0.55)', 1, 'rgba(18,24,40,0.55)']); c.fillRect(p.x - p.rx * 1.6, p.y - p.ry * 1.6, p.rx * 3.2, p.ry * 3.2);
      c.globalCompositeOperation = 'screen';
      for (const l of env.lights) {
        if (Math.abs(l.x - p.x) > p.rx + 20) continue;
        const wob = (rng() - 0.5) * 3;
        c.fillStyle = lin(c, 0, p.y - p.ry, 0, p.y + p.ry, [0, rgba(l.color, l.a * 0.95), 0.55, rgba(l.color, l.a * 0.6), 1, rgba(l.color, l.a * 0.25)]);
        c.fillRect(l.x - l.w * 0.6 + wob, p.y - p.ry * 1.6, l.w * 1.2, p.ry * 3.2);
      }
      // rain rings + one dark ripple band
      for (let i = 0; i < 4; i++) { const rx0 = p.x + (rng() - 0.5) * p.rx * 1.6, ry0 = p.y + (rng() - 0.5) * p.ry * 1.4, r = 3 + rng() * 9; c.strokeStyle = 'rgba(200,220,255,0.16)'; c.lineWidth = 1; c.beginPath(); c.ellipse(rx0, ry0, r, r * 0.35, 0, 0, TAU); c.stroke(); }
      c.globalCompositeOperation = 'multiply'; c.strokeStyle = 'rgba(0,0,0,0.30)'; c.lineWidth = 1.2; const rb = p.y + (rng() - 0.5) * p.ry; c.beginPath(); c.moveTo(p.x - p.rx, rb); c.lineTo(p.x + p.rx, rb); c.stroke();
      c.restore();
      // far-edge glint (light catches the rim)
      c.strokeStyle = 'rgba(200,220,255,0.12)'; c.lineWidth = 1; c.beginPath(); c.ellipse(p.x, p.y, p.rx, p.ry, 0, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
      env.ambient.puddles.push({ x: p.x, y: p.y, rx: p.rx, ry: p.ry });
    }
    // wet sheen: broad soft specular streaks (screen)
    c.save(); c.globalCompositeOperation = 'screen'; c.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const x = rng() * DW, y = y0 + rng() * (y1 - y0), len = 120 + rng() * 260, ang = -0.35 + (rng() - 0.5) * 0.2, x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
      c.strokeStyle = lin(c, x, y, x2, y2, [0, 'rgba(180,200,240,0)', 0.5, 'rgba(180,200,240,0.05)', 1, 'rgba(180,200,240,0)']); c.lineWidth = 6 + rng() * 14; c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke();
    }
    c.restore();
    applyGrain(c, env.grainT, 0, y0, DW, y1 - y0, 0.18);
    env.ambient.steam.push({ x: dx, y: dy }, { x: mx, y: my - 2 });
  }

  // ======================================================================
  // 7. THE CAR — black '69 fastback at the kerb
  // ======================================================================
  function paintCar(env) {
    const { c } = env;
    const K = L.car, x0 = K.x0, x1 = K.x1, wy = K.wheelY, roof = K.roof;
    const bodyBot = wy + 4;
    // reflection in the wet asphalt (inverted dark mass + red streaks) — drawn first
    c.save(); c.globalCompositeOperation = 'multiply';
    c.fillStyle = lin(c, 0, bodyBot, 0, bodyBot + 44, [0, 'rgba(0,0,0,0.55)', 1, 'rgba(0,0,0,0)']); c.fillRect(x0 + 6, bodyBot, x1 - x0 - 12, 44);
    c.restore();
    shadowEll(c, (x0 + x1) / 2, bodyBot + 2, (x1 - x0) / 2 + 6, 9, 0.7);
    // body silhouette
    // '69 fastback: long hood, cabin set back, roof sweeping down to a short kicked-up tail
    const body = () => {
      c.beginPath(); c.moveTo(x0 + 4, bodyBot); c.lineTo(x0, bodyBot - 14); c.lineTo(x0 + 2, roof + 26); c.lineTo(x0 + 12, roof + 22);        // nose / grille
      c.lineTo(x0 + 92, roof + 20); c.lineTo(x0 + 118, roof + 2); c.lineTo(x0 + 158, roof); c.quadraticCurveTo(x0 + 190, roof + 4, x1 - 22, roof + 18); // hood, A-pillar, roof, fastback
      c.lineTo(x1 - 4, roof + 20); c.lineTo(x1, roof + 30); c.lineTo(x1 - 2, bodyBot); c.closePath();
    };
    body(); c.fillStyle = lin(c, 0, roof, 0, bodyBot, [0, '#34363e', 0.18, '#15161b', 0.5, '#0a0b0e', 0.85, '#08090c', 1, '#040405']); c.fill();
    c.save(); body(); c.clip();
    // horizontal reflections: warm hotel/lamp light on the flank, cool sky along the roof
    c.fillStyle = lin(c, x0, 0, x1, 0, [0, 'rgba(255,200,130,0.10)', 0.35, 'rgba(255,200,130,0.02)', 0.7, 'rgba(120,150,210,0.06)', 1, 'rgba(0,0,0,0)']); c.fillRect(x0, roof, x1 - x0, bodyBot - roof);
    c.fillStyle = 'rgba(255,255,255,0.28)'; c.fillRect(x0 + 122, roof + 1.5, 60, 1.2);                                   // roof spec
    c.fillStyle = 'rgba(255,255,255,0.16)'; c.fillRect(x0 + 10, roof + 21, 84, 1);                                        // hood edge
    c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(x0 + 6, roof + 40, x1 - x0 - 12, 1);                               // body crease
    c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(x0 + 6, roof + 41, x1 - x0 - 12, 8);
    // side glass (blue-black with a sky reflection band) + pillars — door glass, then the long fastback quarter glass
    c.fillStyle = lin(c, 0, roof + 3, 0, roof + 22, [0, '#2a3550', 0.5, '#111826', 1, '#0a0e18']);
    c.beginPath(); c.moveTo(x0 + 100, roof + 21); c.lineTo(x0 + 122, roof + 5); c.lineTo(x0 + 156, roof + 3.5); c.quadraticCurveTo(x0 + 186, roof + 6, x1 - 34, roof + 19); c.lineTo(x1 - 34, roof + 21); c.closePath(); c.fill();
    c.fillStyle = 'rgba(160,190,240,0.20)'; c.beginPath(); c.moveTo(x0 + 106, roof + 20); c.lineTo(x0 + 124, roof + 8); c.lineTo(x0 + 152, roof + 7); c.lineTo(x0 + 160, roof + 20); c.closePath(); c.fill();
    c.fillStyle = '#050608'; c.fillRect(x0 + 160, roof + 3, 3, 19);                                                       // B-pillar
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(x0 + 100, roof + 21, x1 - 34 - (x0 + 100), 2);                            // window sill line
    // door seam + handle, wheel-arch shading
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(x0 + 96, roof + 24, 1.5, 34); c.fillRect(x0 + 164, roof + 24, 1.5, 34); c.fillStyle = 'rgba(200,200,210,0.35)'; rr(c, x0 + 146, roof + 33, 12, 2.5, 1); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(x0 + 40, roof + 26, 8, 2); c.fillRect(x0 + 40, roof + 31, 8, 2);           // hood scoop vents
    c.fillStyle = 'rgba(0,0,0,0.5)'; ell(c, x0 + 46, wy, 22, 20, 'rgba(0,0,0,0.5)'); ell(c, x1 - 44, wy, 22, 20, 'rgba(0,0,0,0.5)');
    // chrome bumpers, side scoop hint
    c.fillStyle = lin(c, 0, bodyBot - 10, 0, bodyBot - 6, [0, '#c8ccd6', 1, '#5a5f6b']); c.fillRect(x0 - 2, bodyBot - 10, 26, 4); c.fillRect(x1 - 24, bodyBot - 10, 26, 4);
    c.restore();
    // wheels
    for (const wx of [x0 + 46, x1 - 44]) {
      c.fillStyle = '#050506'; c.beginPath(); c.arc(wx, wy, 15, 0, TAU); c.fill();
      c.fillStyle = lin(c, wx - 8, wy - 8, wx + 8, wy + 8, [0, '#8a8f9a', 0.5, '#3a3d45', 1, '#15161a']); c.beginPath(); c.arc(wx, wy, 8, 0, TAU); c.fill();
      c.fillStyle = '#0c0d10'; c.beginPath(); c.arc(wx, wy, 3, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 1; c.beginPath(); c.arc(wx, wy, 8.5, Math.PI * 1.1, Math.PI * 1.7); c.stroke();
    }
    // tail lights (three red bars, rear = right) + glow; headlight off (dark lens)
    for (let i = 0; i < 3; i++) { c.fillStyle = '#ff2a2a'; c.fillRect(x1 - 7, roof + 32 + i * 5, 5, 3); }
    glowEll(c, x1 - 4, roof + 38, 26, 18, '#ff2a2a', 0.55);
    c.fillStyle = lin(c, 0, roof + 26, 0, roof + 36, [0, '#3a3f4c', 1, '#0d0f14']); c.beginPath(); c.arc(x0 + 8, roof + 30, 4.5, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.arc(x0 + 7, roof + 29, 1.5, 0, TAU); c.fill();
    // red streak in the wet + light lists
    c.save(); c.globalCompositeOperation = 'screen'; c.fillStyle = lin(c, 0, bodyBot, 0, bodyBot + 60, [0, 'rgba(255,42,42,0.30)', 1, 'rgba(255,42,42,0)']); c.fillRect(x1 - 12, bodyBot, 12, 60); c.restore();
    env.ambient.lamps.push({ x: x1 - 5, y: roof + 38, color: '#ff2a2a', r: 28, kind: 'taillight' });
    env.anchors.car = { x: (x0 + x1) / 2, y: bodyBot };
  }

  // ======================================================================
  // 8. ATMOSPHERE + POST
  // ======================================================================
  function paintSteam(env) {
    const { c, rng } = env;
    for (const s of env.ambient.steam) {
      for (let i = 0; i < 7; i++) {
        const t = i / 6, x = s.x + 8 + t * 34 + (rng() - 0.5) * 10, y = s.y - 6 - t * 58, r = 10 + t * 26;
        softEll(c, x, y, r, r * 0.8, [0, 'rgba(190,200,220,' + (0.09 * (1 - t * 0.6)) + ')', 1, 'rgba(190,200,220,0)'], 'screen');
      }
    }
  }
  function paintRain(env) {
    const { c, rng } = env;
    c.save(); c.lineCap = 'round';
    for (let i = 0; i < 300; i++) {
      const x = rng() * DW, y = rng() * DH, len = 10 + rng() * 22, a = (0.03 + rng() * 0.05) * (y < 150 ? 0.6 : 1);
      c.strokeStyle = 'rgba(190,205,235,' + a + ')'; c.lineWidth = 0.8 + rng() * 0.6;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x - len * 0.16, y + len); c.stroke();
    }
    c.restore();
  }
  function post(env) {
    const { c } = env;
    // split-tone: cool teal into the shadows, warm around the entrance
    c.save(); c.globalCompositeOperation = 'multiply'; c.fillStyle = 'rgb(226,236,250)'; c.fillRect(0, 0, DW, DH); c.restore();
    softEll(c, 640, 520, 420, 240, [0, 'rgba(255,190,110,0.11)', 1, 'rgba(0,0,0,0)'], 'screen');
    // rain scatters the entrance/lamp light: a low warm haze hugging the ground floor
    softEll(c, 600, 500, 520, 120, [0, 'rgba(255,205,150,0.09)', 1, 'rgba(0,0,0,0)'], 'screen');
    softEll(c, L.lamp.x, L.lamp.head + 40, 140, 150, [0, 'rgba(255,220,170,0.10)', 1, 'rgba(0,0,0,0)'], 'screen');
    // keep the menu strip calm: gentle darkening across the button band + footer
    c.fillStyle = lin(c, 0, 612, 0, DH, [0, 'rgba(0,0,0,0)', 0.25, 'rgba(0,0,0,0.20)', 1, 'rgba(0,0,0,0.42)']); c.fillRect(0, 612, DW, DH - 612);
    // keep the title band quiet: soft darkening at the very top
    c.fillStyle = lin(c, 0, 0, 0, 150, [0, 'rgba(0,0,0,0.30)', 0.6, 'rgba(0,0,0,0.12)', 1, 'rgba(0,0,0,0)']); c.fillRect(0, 0, DW, 150);
    vignette(c, DW, DH, 0.58);
    applyGrain(c, env.grainT, 0, 0, DW, DH, 0.13);
  }

  // ======================================================================
  // bake
  // ======================================================================
  function bake(mk, opts) {
    return new Promise((resolve) => {
      opts = Object.assign({ W: 1280, H: 768, seed: 0x51E6E }, opts || {});
      const W = opts.W, H = opts.H, sx = W / DW, sy = H / DH;
      const rng = mulberry32(opts.seed | 0);
      const cv = mk(W, H), c = cv.getContext('2d');
      c.save(); c.scale(sx, sy);
      const env = {
        c, mk, rng, lights: [], extraWindows: [],
        ambient: { rain: true, lamps: [], neon: [], steam: [], puddles: [] },
        anchors: { windows: [] },
      };
      env.grainT = grainTex(mk, rng, 96, 34);
      paintSky(env);
      paintCity(env);
      // the hotel is painted on its own layer so its top can be erased into the sky
      const hotelCv = mk(W, H), hc = hotelCv.getContext('2d'); hc.save(); hc.scale(sx, sy);
      env.c = hc; paintHotel(env); hc.restore(); env.c = c;
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(hotelCv, 0, 0); c.restore();
      softEll(c, 640, 118, 400, 56, [0, 'rgba(60,72,104,0.09)', 1, 'rgba(0,0,0,0)'], 'screen');   // thin mist where the façade dissolves
      paintPavement(env);
      paintLamp(env);
      paintStreet(env);
      paintCar(env);
      paintSteam(env);
      paintRain(env);
      post(env);
      c.restore();
      // ---- anchors (design → canvas px)
      const P = (x, y) => ({ x: Math.round(x * sx), y: Math.round(y * sy) });
      const R = (r) => ({ x: Math.round(r.x * sx), y: Math.round(r.y * sy), w: Math.round(r.w * sx), h: Math.round(r.h * sy) });
      const kr = Math.min(sx, sy);
      const A = env.anchors, M = L.canopy;
      const anchors = {
        title: P(L.title.x, L.title.y),
        hero: P(L.hero.x, L.hero.y),
        lamp: Object.assign(P(L.lamp.x, L.lamp.head), { color: '#ffd9a0', r: Math.round(96 * kr) }),
        marquee: R(M),
        buttons: { y: Math.round(L.buttonsY * sy) },
        footer: { y: Math.round(L.footerY * sy) },
        windows: A.windows.concat(env.extraWindows).slice(0, 12).map(R),   // hotel windows first, then a few city ones
        car: A.car ? P(A.car.x, A.car.y) : undefined,
      };
      const am = env.ambient;
      const ambient = {
        rain: true,
        lamps: am.lamps.map(l => Object.assign({}, l, P(l.x, l.y), { r: Math.round(l.r * kr) })),
        neon: am.neon.map(n => Object.assign({}, n, R(n))),
        steam: am.steam.map(s => P(s.x, s.y)),
        puddles: am.puddles.map(p => Object.assign(P(p.x, p.y), { rx: Math.round(p.rx * sx), ry: Math.round(p.ry * sy) })),
      };
      resolve({ canvas: cv, anchors, ambient });
    });
  }

  global.CS_TITLE_ART = { bake };
})(typeof window !== 'undefined' ? window : globalThis);
