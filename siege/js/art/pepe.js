/* =========================================================================
   CONTINENTAL SIEGE — the WICK character renderer.
   drawCharacter() is a VERBATIM port of wick-forge's renderer (itself the port
   of wick-shooter's drawDude3 — the quality bar of the whole WICK world): ink-
   outlined filled shapes, two-segment legs with knees and drawn shoes, swaying
   suit coat with lapels + shirt V + tie, the full Pepe head. Deterministic:
   every sway/bob derives from the frame phase k, never the clock.
   Extras for the siege: `look` options (human skin + domino mask for assassins,
   BUILD for heavies, no shades, hat), a hound renderer in the same ink, and
   sheet bakers that feet-anchor frames with the 1px near-black halo.
   Pure canvas 2D — no Phaser. Node-safe (no DOM at load; bakers need a canvas
   factory).
   ========================================================================= */
(function (global) {
  'use strict';

  const unhex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => { const A = unhex(a), B = unhex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  const shadeCol = (h2, f) => f >= 0 ? mix(h2, '#ffffff', f) : mix(h2, '#000000', -f);

  // char-space: feet at y≈0, head top ≈ -66; facing +x. UNIT box for cell fitting.
  const UNIT_W = 58, UNIT_H = 76, FEET_Y = 1.6;

  /* pal = [SKIN, COAT, HAND]; look = { leg, shoe, shirt, build, shades, mask, hair, hat, tie } */
  function drawCharacter(c, pal, opt) {
    opt = opt || {};
    const mode = opt.mode || 'stand', k = opt.k || 0, dy = opt.dy || 0, grip = opt.grip || 'pistol';
    const look = opt.look || {};
    const [SKIN, COAT, HANDC] = pal;
    const BUILD = look.build || 1;
    const legC = look.leg || COAT, shoeC = look.shoe || '#0c0e12', shirtC = look.shirt || '#dfe4ea';
    const shades = look.shades !== false;
    const hairC = look.hair || '#1b2916', hairBack = look.hairBack || '#121c0f';
    const tieC = look.tie || '#0a0a0a';
    const ph = Math.PI * 2 * k / 6;
    const mov = mode === 'run';
    const airF = mode === 'jump' && k >= 1 && k <= 4;
    const crouch = mode === 'jump' && (k === 0 || k === 5);
    const h = 58, w = 26 * Math.min(BUILD, 1.6);
    const bob = mov ? Math.abs(Math.cos(ph)) * 1.7 : 0;
    const breath = mode === 'stand' ? Math.sin(ph) * 0.7 : 0;
    const sway = mov ? Math.sin(ph) * 1.8 : Math.sin(ph) * 0.7;
    c.save();
    c.translate(0, dy - bob - breath);
    if (crouch) { c.translate(0, 1.2); c.scale(1.05, 0.93); }
    const OL = w2 => { c.strokeStyle = 'rgba(7,11,8,0.9)'; c.lineWidth = w2 || 1.3; c.stroke(); };
    const coatD = shadeCol(COAT, -0.38);
    const hipY = -h * 0.42, shY = -h * 0.8, waY = -h * 0.42;
    function drawLeg(hx, phase, col, far) {
      const sw = Math.sin(phase);
      const lift = mov ? Math.max(0, Math.cos(phase)) * 3.4 : 0;
      const fx = hx + sw * (mov ? 7 : 1.2), fy = -3 - lift;
      const kx = (hx + fx) / 2 + 2.2, ky = (hipY + fy) / 2 + 1;
      c.lineCap = 'round';
      c.strokeStyle = 'rgba(7,11,8,0.9)';
      c.lineWidth = (far ? 7.6 : 8.2) + 2.4;
      c.beginPath(); c.moveTo(hx, hipY); c.lineTo(kx, ky); c.stroke();
      c.lineWidth = (far ? 6.4 : 7) + 2.2;
      c.beginPath(); c.moveTo(kx, ky); c.lineTo(fx, fy); c.stroke();
      c.strokeStyle = col;
      c.lineWidth = far ? 7.6 : 8.2;
      c.beginPath(); c.moveTo(hx, hipY); c.lineTo(kx, ky); c.stroke();
      c.lineWidth = far ? 6.4 : 7;
      c.beginPath(); c.moveTo(kx, ky); c.lineTo(fx, fy); c.stroke();
      c.fillStyle = far ? shadeCol(shoeC, -0.35) : shoeC;
      c.beginPath();
      c.moveTo(fx - 3, fy + 1.5); c.lineTo(fx - 3, fy - 2.5);
      c.quadraticCurveTo(fx + 3, fy - 3.5, fx + 6.5, fy - 1);
      c.quadraticCurveTo(fx + 7.5, fy + 1, fx + 6, fy + 1.5);
      c.closePath(); c.fill(); OL(1.2);
    }
    function arm(sxA, syA, hxA, hyA, col, lw, drop) {
      c.lineCap = 'round';
      c.strokeStyle = 'rgba(7,11,8,0.9)'; c.lineWidth = lw + 2.4;
      c.beginPath(); c.moveTo(sxA, syA);
      c.quadraticCurveTo((sxA + hxA) / 2, (syA + hyA) / 2 + drop, hxA, hyA);
      c.stroke();
      c.strokeStyle = col; c.lineWidth = lw;
      c.beginPath(); c.moveTo(sxA, syA);
      c.quadraticCurveTo((sxA + hxA) / 2, (syA + hyA) / 2 + drop, hxA, hyA);
      c.stroke();
    }
    /* legs */
    if (airF) {
      c.lineCap = 'round';
      c.strokeStyle = shadeCol(legC, -0.38); c.lineWidth = 7;
      c.beginPath(); c.moveTo(-3, hipY); c.lineTo(-9, hipY + 9); c.stroke();
      c.lineWidth = 5.8; c.beginPath(); c.moveTo(-9, hipY + 9); c.lineTo(-14, hipY + 18); c.stroke();
      c.fillStyle = shadeCol(shoeC, -0.35); c.fillRect(-18, hipY + 15.5, 9, 4.5);
      c.strokeStyle = shadeCol(legC, -0.12); c.lineWidth = 7.5;
      c.beginPath(); c.moveTo(3, hipY); c.lineTo(10, hipY + 6); c.stroke();
      c.lineWidth = 6.4; c.beginPath(); c.moveTo(10, hipY + 6); c.lineTo(6, hipY + 15); c.stroke();
      c.fillStyle = shoeC; c.fillRect(3, hipY + 12, 9, 4.5);
    } else if (mov) {
      drawLeg(-3, ph + Math.PI, shadeCol(legC, -0.38), true);
      drawLeg(3, ph, shadeCol(legC, -0.12), false);
    } else {
      drawLeg(-3, Math.PI, shadeCol(legC, -0.38), true);
      drawLeg(3, 0, shadeCol(legC, -0.12), false);
    }
    /* coat skirt (cloth sway) */
    {
      const flare = Math.min(9, (mov ? Math.abs(Math.sin(ph)) * 5 + 4 : 3) + 1.5 + (mov ? Math.sin(ph + 1.2) * 2.0 : sway * 1.1));
      c.fillStyle = COAT;
      c.beginPath();
      c.moveTo(w * 0.30, waY - 2);
      c.lineTo(-w * 0.30, waY - 2);
      c.quadraticCurveTo(-w * 0.45 - flare * 0.6, -h * 0.3, -w * 0.5 - flare, -h * 0.15);
      c.quadraticCurveTo(-w * 0.2 - flare * 0.4, -h * 0.2, w * 0.16, -h * 0.24);
      c.closePath(); c.fill(); OL(1.2);
      c.fillStyle = 'rgba(0,0,8,0.3)';
      c.beginPath();
      c.moveTo(-w * 0.30, waY - 2);
      c.quadraticCurveTo(-w * 0.45 - flare * 0.6, -h * 0.3, -w * 0.5 - flare, -h * 0.15);
      c.lineTo(-w * 0.3 - flare * 0.5, -h * 0.2); c.closePath(); c.fill();
    }
    /* torso — rounded shoulders */
    c.fillStyle = COAT;
    c.beginPath();
    c.moveTo(-w * 0.36, waY);
    c.lineTo(-w * 0.47, shY + 7);
    c.quadraticCurveTo(-w * 0.48, shY - 1, -w * 0.26, shY - 1);
    c.lineTo(w * 0.24, shY - 1);
    c.quadraticCurveTo(w * 0.5, shY - 1, w * 0.47, shY + 8);
    c.lineTo(w * 0.36, waY);
    c.closePath(); c.fill(); OL(1.4);
    c.fillStyle = 'rgba(0,0,12,0.26)';
    c.beginPath(); c.moveTo(-w * 0.45, shY + 4); c.lineTo(-w * 0.05, shY - 1); c.lineTo(-w * 0.05, waY); c.lineTo(-w * 0.36, waY); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.07)'; c.fillRect(w * 0.3, shY + 2, 2.5, (waY - shY) - 5);
    /* shirt V */
    c.fillStyle = shirtC;
    c.beginPath(); c.moveTo(-1.5, shY + 1); c.lineTo(6, shY + 2); c.lineTo(1.5, -h * 0.56); c.lineTo(-2, -h * 0.62); c.closePath(); c.fill();
    /* lapels */
    c.fillStyle = shadeCol(COAT, -0.5);
    c.beginPath(); c.moveTo(-1.5, shY + 1); c.lineTo(-7, shY + 9); c.lineTo(-2.5, shY + 13); c.lineTo(-0.3, shY + 6); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(6, shY + 1.5); c.lineTo(10.5, shY + 9.5); c.lineTo(5.8, shY + 13); c.lineTo(3.8, shY + 6); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.12)';
    c.beginPath(); c.moveTo(-1.5, shY + 1); c.lineTo(-7, shY + 9); c.lineTo(-5.8, shY + 9.8); c.lineTo(-0.7, shY + 2.4); c.closePath(); c.fill();
    /* tie */
    c.fillStyle = tieC;
    c.beginPath(); c.moveTo(1.6, shY + 4); c.lineTo(3.8, shY + 6); c.lineTo(3, -h * 0.565); c.lineTo(0.6, -h * 0.585); c.closePath(); c.fill();
    /* ---------- HEAD (full Pepe) ---------- */
    {
      const grn = SKIN, grnD = shadeCol(SKIN, -0.22);
      const hs = sway, hs2 = sway;
      c.fillStyle = hairBack;                               // back hair to shoulders
      c.beginPath();
      c.moveTo(-2, -h - 7);
      c.quadraticCurveTo(-11, -h - 5, -11.5, -h + 6);
      c.quadraticCurveTo(-12, -h + 14, -9, -h + 19);
      c.lineTo(-7, -h + 14); c.lineTo(-5, -h + 18); c.lineTo(-3.5, -h + 12);
      c.lineTo(-2.5, -h + 2); c.closePath(); c.fill(); OL(1.1);
      c.fillStyle = grn;                                     // skull + snout
      c.beginPath();
      c.moveTo(-5, -h + 12);
      c.quadraticCurveTo(-8, -h + 6, -7, -h);
      c.quadraticCurveTo(-6.5, -h - 6.5, 0, -h - 7.5);
      c.quadraticCurveTo(8, -h - 8, 12, -h - 3);
      c.quadraticCurveTo(15, -h, 15, -h + 5);
      c.quadraticCurveTo(15, -h + 10, 9, -h + 12);
      c.quadraticCurveTo(2, -h + 13.5, -5, -h + 12);
      c.closePath(); c.fill(); OL(1.4);
      c.fillStyle = 'rgba(0,0,0,0.10)';
      c.beginPath(); c.ellipse(4, -h + 10.5, 9, 3, 0, 0, 7); c.fill();
      c.fillStyle = hairC;                                   // top mass w/ middle part
      c.beginPath();
      c.moveTo(-8, -h + 4);
      c.quadraticCurveTo(-9.5, -h - 5, -1, -h - 8.4);
      c.quadraticCurveTo(3.5, -h - 9.4, 4, -h - 8.8);
      c.quadraticCurveTo(4.5, -h - 9.4, 9, -h - 8.2);
      c.quadraticCurveTo(14, -h - 6, 14.6, -h - 1);
      c.quadraticCurveTo(15.2 + hs2, -h + 2, 13.8 + hs2 * 1.4, -h + 6.5);
      c.lineTo(12.1 + hs2 * 1.4, -h + 5.4);
      c.quadraticCurveTo(13.1 + hs2 * 0.6, -h + 1, 11.4, -h - 2.6);
      c.quadraticCurveTo(8, -h - 5.6, 4.6, -h - 5.2);
      c.lineTo(4, -h - 4.2);
      c.lineTo(3.4, -h - 5.2);
      c.quadraticCurveTo(0, -h - 5.6, -3, -h - 4);
      c.quadraticCurveTo(-6, -h - 2.6, -6.4, -h + 4);
      c.closePath(); c.fill(); OL(1.2);
      c.strokeStyle = 'rgba(0,0,0,0.28)'; c.lineWidth = 1.4;   // AO under hairline
      c.beginPath(); c.moveTo(-5.5, -h - 3.4); c.quadraticCurveTo(4, -h - 4.2, 11, -h - 2); c.stroke();
      c.fillStyle = hairC;                                   // loose mid strand
      c.beginPath();
      c.moveTo(4.5, -h - 5);
      c.quadraticCurveTo(5.8 + hs * 0.5, -h - 1, 5 + hs * 0.7, -h + 2.6);
      c.lineTo(3.9 + hs * 0.7, -h + 2.1);
      c.quadraticCurveTo(3.7, -h - 1.5, 3.3, -h - 4.7);
      c.closePath(); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.07)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(-5, -h - 4.5); c.quadraticCurveTo(3, -h - 7.6, 11, -h - 4.5); c.stroke();
      /* eyes: whites, heavy flat lids, pupils tucked under */
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(1.5, -h + 0.8, 4.1, 0, 7); c.fill();
      c.beginPath(); c.arc(8.8, -h + 1.2, 4.4, 0, 7); c.fill();
      c.fillStyle = grn;
      c.fillRect(1.5 - 4.5, -h + 0.8 - 4.6, 9, 4.2);
      c.fillRect(8.8 - 4.8, -h + 1.2 - 4.7, 9.6, 4.3);
      c.strokeStyle = look.lid || '#1d3418'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(-2.6, -h + 0.4); c.quadraticCurveTo(1.5, -h + 1, 5.5, -h + 0.5); c.stroke();
      c.beginPath(); c.moveTo(4.4, -h + 0.9); c.quadraticCurveTo(8.8, -h + 1.5, 13.1, -h + 0.9); c.stroke();
      c.strokeStyle = 'rgba(20,40,18,0.4)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(-2, -h - 1.8); c.quadraticCurveTo(1.5, -h - 1.2, 5, -h - 1.7); c.stroke();
      c.beginPath(); c.moveTo(5, -h - 1.3); c.quadraticCurveTo(8.8, -h - 0.7, 12.6, -h - 1.2); c.stroke();
      c.fillStyle = '#141414';
      c.beginPath(); c.arc(2.8, -h + 1.9, 1.5, 0, 7); c.fill();
      c.beginPath(); c.arc(10.2, -h + 2.4, 1.6, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.85)';
      c.fillRect(3, -h + 1.3, 0.8, 0.8); c.fillRect(10.4, -h + 1.8, 0.8, 0.8);
      c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 0.9;
      c.beginPath(); c.arc(1.5, -h + 0.8, 3.1, Math.PI * 1.15, Math.PI * 1.55); c.stroke();
      c.beginPath(); c.arc(8.8, -h + 1.2, 3.4, Math.PI * 1.15, Math.PI * 1.55); c.stroke();
      if (shades) {
        /* sunglasses laid over the eyes */
        c.strokeStyle = '#0a0c10'; c.lineWidth = 1.4; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-3, -h - 0.6); c.lineTo(-6.2, -h - 1.4); c.stroke();
        c.fillStyle = look.shadeFill || '#0b0d12';
        c.beginPath();
        c.moveTo(-3.4, -h - 1);
        c.quadraticCurveTo(-4.2, -h + 2, -1.4, -h + 3.6);
        c.quadraticCurveTo(2, -h + 4.6, 4.3, -h + 2.6);
        c.quadraticCurveTo(6.4, -h + 4.8, 9.6, -h + 4.4);
        c.quadraticCurveTo(13.8, -h + 3.8, 14.4, -h + 0.2);
        c.quadraticCurveTo(14.1, -h - 2, 9.8, -h - 1.8);
        c.quadraticCurveTo(6.2, -h - 1.5, 4.5, -h - 0.4);
        c.quadraticCurveTo(2.6, -h - 1.8, -0.6, -h - 1.7);
        c.quadraticCurveTo(-3, -h - 1.6, -3.4, -h - 1);
        c.closePath(); c.fill(); OL(1.2);
        c.strokeStyle = 'rgba(150,175,205,0.30)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(-2.6, -h - 1.1); c.quadraticCurveTo(1.4, -h - 1.7, 4, -h - 0.7);
        c.moveTo(5.2, -h - 0.7); c.quadraticCurveTo(9.4, -h - 1.6, 13.3, -h - 0.5); c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.72)';
        c.beginPath(); c.moveTo(-1.2, -h - 0.2); c.lineTo(1.2, -h); c.lineTo(-0.2, -h + 2.2); c.lineTo(-2.4, -h + 1.9); c.closePath(); c.fill();
        c.beginPath(); c.moveTo(7.6, -h + 0.2); c.lineTo(9.8, -h + 0.4); c.lineTo(8.6, -h + 2.5); c.lineTo(6.6, -h + 2.2); c.closePath(); c.fill();
      } else if (look.mask) {
        /* domino mask — the High Table's hired help */
        c.fillStyle = look.mask === true ? '#0b0d12' : look.mask;
        c.beginPath();
        c.moveTo(-3.6, -h - 2.2); c.lineTo(14.6, -h - 1.4); c.lineTo(14.2, -h + 4.2); c.lineTo(-3.4, -h + 3.6); c.closePath(); c.fill(); OL(1.1);
        c.fillStyle = 'rgba(255,255,255,0.9)';
        c.beginPath(); c.ellipse(1.6, -h + 1, 2.4, 1.6, 0, 0, 7); c.fill();
        c.beginPath(); c.ellipse(9, -h + 1.4, 2.5, 1.6, 0, 0, 7); c.fill();
        c.fillStyle = '#141414';
        c.beginPath(); c.arc(2.4, -h + 1.2, 1.1, 0, 7); c.fill();
        c.beginPath(); c.arc(9.8, -h + 1.6, 1.1, 0, 7); c.fill();
      }
      /* mouth: wide downturned band + maroon lower lip */
      c.fillStyle = grnD;
      c.beginPath();
      c.moveTo(-2.5, -h + 6.2);
      c.quadraticCurveTo(6, -h + 4.6, 14.8, -h + 6.6);
      c.quadraticCurveTo(16.2, -h + 8.4, 15.2, -h + 10.4);
      c.quadraticCurveTo(8, -h + 12.6, -2, -h + 10.4);
      c.closePath(); c.fill(); OL(1.3);
      c.strokeStyle = look.mouthLine || '#20401b'; c.lineWidth = 1.8;
      c.beginPath(); c.moveTo(-2, -h + 8.2);
      c.quadraticCurveTo(7, -h + 8.0, 13, -h + 9.2);
      c.quadraticCurveTo(14.6, -h + 9.8, 15.0, -h + 10.6); c.stroke();
      c.fillStyle = look.lip || '#8f4034';
      c.beginPath();
      c.moveTo(0.5, -h + 9.6);
      c.quadraticCurveTo(7, -h + 10.6, 13.2, -h + 10.0);
      c.quadraticCurveTo(14.2, -h + 10.6, 13.4, -h + 11.7);
      c.quadraticCurveTo(7, -h + 13.5, 1.5, -h + 11.7);
      c.closePath(); c.fill(); OL(1.1);
      c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(2, -h + 12.2); c.quadraticCurveTo(7.5, -h + 13.6, 13, -h + 11.9); c.stroke();
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.beginPath(); c.arc(13.4, -h + 4.4, 0.8, 0, 7); c.fill();
      /* optional hat: bellhop pillbox / doorman cap / fedora — sits on the hair */
      if (look.hat === 'pillbox') {
        c.fillStyle = look.hatC || '#7a1c2e';
        c.fillRect(-4, -h - 12.5, 16, 6.5); OL(1.2);
        c.fillStyle = '#e8c576'; c.fillRect(-4, -h - 8.2, 16, 1.4);
      } else if (look.hat === 'cap') {
        c.fillStyle = look.hatC || '#141922';
        c.beginPath(); c.moveTo(-6, -h - 6.5); c.quadraticCurveTo(3, -h - 14, 13, -h - 7); c.lineTo(13.5, -h - 5); c.lineTo(-6, -h - 5); c.closePath(); c.fill(); OL(1.2);
        c.fillStyle = '#05070c'; c.fillRect(6, -h - 6.4, 12, 2.2);
        c.fillStyle = '#e8c576'; c.fillRect(0, -h - 7.4, 6, 1.2);
      } else if (look.hat === 'fedora') {
        c.fillStyle = look.hatC || '#141416';
        c.beginPath(); c.ellipse(4, -h - 6, 15, 3.2, 0, 0, 7); c.fill(); OL(1.1);
        c.beginPath(); c.moveTo(-5, -h - 6.5); c.quadraticCurveTo(-3, -h - 16, 4, -h - 16.5); c.quadraticCurveTo(11, -h - 16, 12.5, -h - 6.5); c.closePath(); c.fill(); OL(1.2);
        c.fillStyle = look.hatBand || '#7a1c2e'; c.fillRect(-4.2, -h - 9.5, 16.4, 2.2);
      } else if (look.hat === 'beret') {
        c.fillStyle = look.hatC || '#7a1c2e';
        c.beginPath(); c.ellipse(2, -h - 6.5, 12.5, 4.5, -0.25, 0, 7); c.fill(); OL(1.1);
      }
    }
    /* arms + EMPTY fists — the game composites the weapon later */
    {
      const ay = -h * 0.66 + 1;
      if (grip === 'rifle') {
        arm(-2, shY + 8, 22, ay + 4, coatD, 5.5, 5);
        c.fillStyle = HANDC; c.beginPath(); c.arc(23.2, ay + 3.6, 2.8, 0, 7); c.fill();
      } else if (grip === 'none') {
        arm(-2, shY + 8, -w * 0.42, waY + 3, coatD, 5.5, 3);
        c.fillStyle = HANDC; c.beginPath(); c.arc(-w * 0.42 - 1, waY + 4.5, 2.8, 0, 7); c.fill();
      }
      if (grip !== 'none') {
        arm(3, shY + 7, 12, ay + 1.5, COAT, 6, 4);
        c.fillStyle = HANDC; c.beginPath(); c.arc(13.6, ay + 1, 3.1, 0, 7); c.fill();
      } else {
        arm(3, shY + 7, w * 0.42 + 2, waY + 3, COAT, 6, 3);
        c.fillStyle = HANDC; c.beginPath(); c.arc(w * 0.42 + 3, waY + 4.5, 3.1, 0, 7); c.fill();
      }
      if (look.shield) {
        // riot shield held out front (drawn last so it covers the front arm)
        c.fillStyle = 'rgba(120,150,190,0.55)';
        c.beginPath(); c.moveTo(16, -h * 0.9); c.lineTo(28, -h * 0.9); c.quadraticCurveTo(31, -h * 0.5, 28, -6); c.lineTo(16, -6); c.closePath(); c.fill();
        c.strokeStyle = 'rgba(7,11,8,0.9)'; c.lineWidth = 1.6; c.stroke();
        c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(19, -h * 0.85); c.lineTo(19, -10); c.stroke();
        c.fillStyle = '#c9a227'; c.font = 'bold 6px Arial'; c.fillText('HT', 19, -h * 0.5);
      }
    }
    c.restore();
  }
  // grip point (where the gun's grip sits) in char space, for the pistol/rifle poses
  function fistPoint(grip) {
    const h = 58, ay = -h * 0.66 + 1;
    return grip === 'rifle' ? { x: 23.2, y: ay + 3.6, x2: 13.6, y2: ay + 1 } : { x: 13.6, y: ay + 1 };
  }

  /* ---------- HOUND — the High Table's dog, same ink ---------- */
  function drawHound(c, opt) {
    opt = opt || {};
    const k = opt.k || 0, ph = Math.PI * 2 * k / 6, mov = opt.mode === 'run';
    const body = opt.body || '#3a2a20', dark = shadeCol(body, -0.4);
    c.save();
    c.translate(0, mov ? -Math.abs(Math.sin(ph)) * 1.5 : 0);
    const OL = () => { c.strokeStyle = 'rgba(7,11,8,0.9)'; c.lineWidth = 1.3; c.stroke(); };
    // legs
    const legs = [[-9, 1], [-3, -1], [5, 1], [11, -1]];
    legs.forEach(([lx, s], i) => {
      const sw = mov ? Math.sin(ph + i * 1.6) * 5 : 0;
      c.strokeStyle = 'rgba(7,11,8,0.9)'; c.lineWidth = 6.2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(lx, -14); c.lineTo(lx + sw, -2); c.stroke();
      c.strokeStyle = i % 2 ? body : dark; c.lineWidth = 4;
      c.beginPath(); c.moveTo(lx, -14); c.lineTo(lx + sw, -2); c.stroke();
    });
    // body
    c.fillStyle = body;
    c.beginPath(); c.ellipse(1, -18, 15, 7, 0, 0, 7); c.fill(); OL();
    c.fillStyle = 'rgba(0,0,0,0.22)'; c.beginPath(); c.ellipse(-4, -15.5, 9, 3.5, 0, 0, 7); c.fill();
    // tail
    c.strokeStyle = 'rgba(7,11,8,0.9)'; c.lineWidth = 4.4; c.beginPath(); c.moveTo(-14, -20); c.quadraticCurveTo(-20, -26 + Math.sin(ph) * 2, -18, -30); c.stroke();
    c.strokeStyle = body; c.lineWidth = 2.4; c.beginPath(); c.moveTo(-14, -20); c.quadraticCurveTo(-20, -26 + Math.sin(ph) * 2, -18, -30); c.stroke();
    // head + snout
    c.fillStyle = body;
    c.beginPath(); c.ellipse(15, -24, 7.5, 6, -0.2, 0, 7); c.fill(); OL();
    c.beginPath(); c.moveTo(20, -23); c.lineTo(28, -21.5); c.lineTo(27, -18); c.lineTo(19, -19); c.closePath(); c.fill(); OL();
    c.fillStyle = '#0c0e12'; c.beginPath(); c.arc(28, -21.4, 1.5, 0, 7); c.fill();
    // ear
    c.fillStyle = dark; c.beginPath(); c.moveTo(11, -29); c.lineTo(15, -34); c.lineTo(17, -27); c.closePath(); c.fill(); OL();
    // eye + teeth
    c.fillStyle = '#ff5c5c'; c.beginPath(); c.arc(17, -25.5, 1.4, 0, 7); c.fill();
    c.fillStyle = '#e8e8ea'; c.beginPath(); c.moveTo(21, -18.6); c.lineTo(22.5, -16.5); c.lineTo(24, -18.6); c.closePath(); c.fill();
    // collar
    c.strokeStyle = '#c9a227'; c.lineWidth = 1.6; c.beginPath(); c.arc(11, -21, 5.5, 0.4, 2.2); c.stroke();
    c.restore();
  }

  /* ---------- sheet baking ----------
     Frames are feet-anchored: char-space y=0 sits at frame baseline; scale so
     UNIT_H fits cellH*0.94. Halo = silhouette drawn 4× offset in near-black. */
  function bakeSheet(mk, drawFn, frames, opt) {
    opt = opt || {};
    const SS = opt.ss || 2, cellW = opt.cellW || 96, cellH = opt.cellH || 112;
    const scaleUnits = opt.scale || Math.min(cellW * 0.9 / UNIT_W, cellH * 0.94 / UNIT_H);
    const n = frames.length;
    const cv = mk(cellW * n * SS, cellH * SS); const ctx = cv.getContext('2d');
    const fw = cellW * SS, fh = cellH * SS;
    const spr = mk(fw, fh), sc = spr.getContext('2d');
    const halo = mk(fw, fh), hc = halo.getContext('2d');
    const baseY = fh * (opt.baseYFrac || 0.94);
    frames.forEach((f, i) => {
      sc.setTransform(1, 0, 0, 1, 0, 0); sc.clearRect(0, 0, fw, fh);
      sc.save(); sc.translate(fw / 2, baseY - FEET_Y * scaleUnits * SS); sc.scale(scaleUnits * SS, scaleUnits * SS);
      drawFn(sc, f);
      sc.restore();
      hc.setTransform(1, 0, 0, 1, 0, 0); hc.clearRect(0, 0, fw, fh);
      hc.globalCompositeOperation = 'source-over'; hc.drawImage(spr, 0, 0);
      hc.globalCompositeOperation = 'source-in';
      hc.fillStyle = 'rgba(6,8,12,0.95)'; hc.fillRect(0, 0, fw, fh);
      const bx = i * fw;
      ctx.drawImage(halo, bx - SS, 0); ctx.drawImage(halo, bx + SS, 0);
      ctx.drawImage(halo, bx, -SS); ctx.drawImage(halo, bx, SS);
      ctx.drawImage(spr, bx, 0);
    });
    // downsample to 1x
    const out = mk(cellW * n, cellH); out.getContext('2d').drawImage(cv, 0, 0, cellW * n, cellH);
    return { canvas: out, frameW: cellW, frameH: cellH, frames: n, baseY: cellH * (opt.baseYFrac || 0.94), scaleUnits, fist: null };
  }
  const standFrames = () => [0, 1, 2, 3, 4, 5].map(k => ({ mode: 'stand', k }));
  const runFrames = () => [0, 1, 2, 3, 4, 5].map(k => ({ mode: 'run', k }));

  /** bake stand+run sheets for a character spec {pal, look, grip} → { stand, run, fist:{x,y} px in a frame } */
  function bakeCharacter(mk, spec, opt) {
    opt = opt || {};
    const draw = (c, f) => drawCharacter(c, spec.pal, { mode: f.mode, k: f.k, grip: spec.grip || 'pistol', look: spec.look || {} });
    const stand = bakeSheet(mk, draw, standFrames(), opt);
    const run = bakeSheet(mk, draw, runFrames(), opt);
    // fist point in frame pixels (for gun compositing): frame center x + fist.x*scale, baseY - FEET_Y*scale + fist.y*scale
    const fp = fistPoint(spec.grip || 'pistol');
    const s = stand.scaleUnits;
    stand.fist = { x: stand.frameW / 2 + fp.x * s, y: stand.baseY - FEET_Y * s + fp.y * s };
    if (fp.x2 != null) stand.fist2 = { x: stand.frameW / 2 + fp.x2 * s, y: stand.baseY - FEET_Y * s + fp.y2 * s };
    return { stand, run, fist: stand.fist, fist2: stand.fist2 || null, scaleUnits: s };
  }
  function bakeHound(mk, opt) {
    opt = opt || {};
    const draw = (c, f) => drawHound(c, { mode: f.mode, k: f.k, body: opt.body });
    return { stand: bakeSheet(mk, draw, standFrames(), Object.assign({ cellW: 72, cellH: 56, scale: 1.1 }, opt)), run: bakeSheet(mk, draw, runFrames(), Object.assign({ cellW: 72, cellH: 56, scale: 1.1 }, opt)) };
  }
  /** headshot portrait for cards: head + shoulders, framed */
  function bakePortrait(mk, spec, size) {
    size = size || 96;
    const cv = mk(size, size), c = cv.getContext('2d');
    c.save(); c.translate(size * 0.42, size * 1.42); c.scale(size / 68, size / 68);
    drawCharacter(c, spec.pal, { mode: 'stand', k: 0, grip: spec.grip || 'pistol', look: spec.look || {} });
    c.restore();
    return cv;
  }

  global.CS_PEPE = { drawCharacter, drawHound, fistPoint, bakeSheet, bakeCharacter, bakeHound, bakePortrait, standFrames, runFrames, UNIT_W, UNIT_H, FEET_Y, mix, shadeCol };
})(typeof window !== 'undefined' ? window : globalThis);
