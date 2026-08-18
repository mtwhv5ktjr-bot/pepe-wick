/* =========================================================================
   CONTINENTAL SIEGE — floor art baker (pure canvas 2D, deterministic).
   window.CS_FLOORS = { bakeFloor(mk, floorDef, opts) -> Promise<{canvas, props, ambient}>, PALETTES }
   - canvas  : full W×H painted floor (base, wall band, path runner, doors, gilded inlays, lamps, AO)
   - props   : [{ kind, canvas, x, y, w, h, footY }] set dressing for X cells (feet at x,y on the board)
   - ambient : { rain, lamps:[{x,y,color,r}], neon:[{x,y,w,h,color}], sparks:[{x,y}] }
   No ink outlines on environments: gradients, seeded grain, AO pools, specular strokes.
   Seeded mulberry32 per floor — no Math.random anywhere. Cheap: ~100-250ms per floor.
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
  /** soft AO / drop-shadow ellipse (multiply-ish darkening) */
  function shadowEll(c, x, y, rx, ry, a) {
    c.save(); c.globalCompositeOperation = 'multiply';
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU);
    c.fillStyle = rad(c, x, y, 0, Math.max(rx, ry), [0, 'rgba(0,0,0,' + a + ')', 0.55, 'rgba(0,0,0,' + (a * 0.55) + ')', 1, 'rgba(0,0,0,0)']);
    c.fill(); c.restore();
  }
  /** glow ellipse (screen) */
  function glowEll(c, x, y, rx, ry, color, a) {
    c.save(); c.globalCompositeOperation = 'screen';
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU);
    c.fillStyle = rad(c, x, y, 0, Math.max(rx, ry), [0, rgba(color, a), 0.5, rgba(color, a * 0.45), 1, rgba(color, 0)]);
    c.fill(); c.restore();
  }
  /** vertical-cylinder gradient (light from upper-left) */
  function cyl(c, x, w, base) { return lin(c, x, 0, x + w, 0, [0, shade(base, -0.35), 0.28, shade(base, 0.22), 0.55, base, 1, shade(base, -0.45)]); }
  function ctxFont(px, weight) { return (weight || 'bold') + ' ' + px + 'px "Black Ops One", Impact, "Arial Black", sans-serif'; }

  // ---------- textures ----------
  /** monochrome grain tile (use with globalCompositeOperation='overlay') */
  function grainTex(mk, rng, size, amp) {
    const cv = mk(size, size), c = cv.getContext('2d'), im = c.createImageData(size, size), d = im.data;
    for (let i = 0; i < d.length; i += 4) { const v = clamp(128 + ((rng() + rng() - 1) * amp) | 0, 0, 255); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    c.putImageData(im, 0, 0); return cv;
  }
  function applyGrain(c, tex, x, y, w, h, alpha) {
    c.save(); c.globalCompositeOperation = 'overlay'; c.globalAlpha = alpha; c.fillStyle = c.createPattern(tex, 'repeat'); c.fillRect(x, y, w, h); c.restore();
  }
  /** low-frequency mottling: soft dark/light blotches */
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
  /** long soft specular streaks (screen) */
  function specular(c, rng, W, H, n, color, a, wMin, wMax) {
    c.save(); c.globalCompositeOperation = 'screen'; c.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = rng() * W, y = rng() * H, len = 200 + rng() * 420, ang = -0.75 + (rng() - 0.5) * 0.25;
      const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
      c.strokeStyle = lin(c, x, y, x2, y2, [0, rgba(color, 0), 0.5, rgba(color, a), 1, rgba(color, 0)]);
      c.lineWidth = wMin + rng() * (wMax - wMin); c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke();
    }
    c.restore();
  }
  function vignette(c, W, H, a) {
    c.save(); c.globalCompositeOperation = 'multiply';
    c.fillStyle = rad(c, W / 2, H / 2, H * 0.35, Math.max(W, H) * 0.72, [0, 'rgba(0,0,0,0)', 1, 'rgba(0,0,0,' + a + ')']);
    c.fillRect(0, 0, W, H); c.restore();
  }
  /** marble tile: cream tone + grey veins, tileable-enough (used as pattern for path bodies) */
  function marbleTex(mk, rng, size, tone, vein, veinA) {
    const cv = mk(size, size), c = cv.getContext('2d');
    c.fillStyle = tone; c.fillRect(0, 0, size, size);
    mottle(c, rng, 0, 0, size, size, 10, size * 0.4, 0.05, 0.05);
    veins(c, rng, size, size, 14, vein, veinA);
    applyGrain(c, grainTex(mk, rng, 64, 26), 0, 0, size, size, 0.35);
    return cv;
  }
  function veins(c, rng, W, H, n, color, a) {
    c.save(); c.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = rng() * W, y = rng() * H, len = 160 + rng() * 360, ang = -0.6 + (rng() - 0.5) * 1.2 + (rng() < 0.3 ? Math.PI / 2 : 0);
      const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx, x1 = x + dx * len, y1 = y + dy * len;
      const j1 = (rng() - 0.5) * 70, j2 = (rng() - 0.5) * 70;
      const cx1 = x + dx * len * 0.33 + nx * j1, cy1 = y + dy * len * 0.33 + ny * j1, cx2 = x + dx * len * 0.66 + nx * j2, cy2 = y + dy * len * 0.66 + ny * j2;
      c.strokeStyle = rgba(color, a * (0.5 + rng())); c.lineWidth = 0.5 + rng() * 1.4;
      c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(cx1, cy1, cx2, cy2, x1, y1); c.stroke();
      if (rng() < 0.5) { c.strokeStyle = rgba('#ffffff', a * 0.7); c.lineWidth = 0.6; c.beginPath(); c.moveTo(x + 2, y + 2); c.bezierCurveTo(cx1 + 2, cy1 + 2, cx2 + 2, cy2 + 2, x1 + 2, y1 + 2); c.stroke(); }
    }
    c.restore();
  }
  function fleur(c, x, y, s) {
    c.beginPath(); c.moveTo(x, y - s); c.bezierCurveTo(x + s * .38, y - s * .4, x + s * .38, y + s * .2, x, y + s * .55);
    c.bezierCurveTo(x - s * .38, y + s * .2, x - s * .38, y - s * .4, x, y - s); c.fill();
    c.beginPath(); c.moveTo(x - s * .1, y + s * .1); c.bezierCurveTo(x - s * .95, y - s * .55, x - s * 1.15, y + s * .55, x - s * .15, y + s * .5); c.fill();
    c.beginPath(); c.moveTo(x + s * .1, y + s * .1); c.bezierCurveTo(x + s * .95, y - s * .55, x + s * 1.15, y + s * .55, x + s * .15, y + s * .5); c.fill();
    c.fillRect(x - s * .5, y + s * .55, s, s * .16);
    c.beginPath(); c.moveTo(x - s * .28, y + s * .74); c.lineTo(x + s * .28, y + s * .74); c.lineTo(x, y + s * 1.15); c.closePath(); c.fill();
  }

  // ---------- grid & route ----------
  function parseGrid(map, COLS, ROWS) {
    const g = { cells: [], S: null, E: null, X: [], G: [], path: [], build: [] };
    for (let r = 0; r < ROWS; r++) {
      const row = (map && map[r]) || ''; g.cells.push([]);
      for (let c = 0; c < COLS; c++) {
        const ch = row[c] || '.'; g.cells[r].push(ch);
        if (ch === 'S') g.S = { c, r }; else if (ch === 'E') g.E = { c, r };
        else if (ch === 'X') g.X.push({ c, r }); else if (ch === 'G') g.G.push({ c, r });
        if (ch === '#' || ch === 'S' || ch === 'E') g.path.push({ c, r }); else g.build.push({ c, r });
      }
    }
    g.isPath = (c, r) => r >= 0 && r < ROWS && c >= 0 && c < COLS && 'S#E'.indexOf(g.cells[r][c]) >= 0;
    g.rowHasPath = (r) => g.path.some(p => p.r === r);
    // route: BFS parent chain S→E, then append any stray path cells as tiny segments
    g.route = [];
    if (g.S && g.E) {
      const key = (c, r) => r * COLS + c, prev = new Map(), q = [g.S]; prev.set(key(g.S.c, g.S.r), null);
      while (q.length) {
        const cur = q.shift(); if (cur.c === g.E.c && cur.r === g.E.r) break;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nc = cur.c + dc, nr = cur.r + dr; if (!g.isPath(nc, nr) || prev.has(key(nc, nr))) continue;
          prev.set(key(nc, nr), cur); q.push({ c: nc, r: nr });
        }
      }
      let cur = prev.has(key(g.E.c, g.E.r)) ? g.E : null; const chain = [];
      while (cur) { chain.push(cur); cur = prev.get(key(cur.c, cur.r)); }
      g.route = chain.reverse();
    }
    const onRoute = new Set(g.route.map(p => p.r * COLS + p.c));
    g.stray = g.path.filter(p => !onRoute.has(p.r * COLS + p.c));
    return g;
  }
  /** cell-centre polyline for the route, ends extended off-board when S/E sit on the edge */
  function routePoints(g, CELL, COLS, ROWS) {
    const pts = g.route.map(p => ({ x: p.c * CELL + CELL / 2, y: p.r * CELL + CELL / 2 }));
    if (!pts.length) return pts;
    const ext = (p, cell) => {
      const q = { x: p.x, y: p.y };
      if (cell.c === 0) q.x = -CELL; else if (cell.c === COLS - 1) q.x = COLS * CELL + CELL;
      else if (cell.r === 0) q.y = -CELL; else if (cell.r === ROWS - 1) q.y = ROWS * CELL + CELL;
      return q;
    };
    const s = ext(pts[0], g.S), e = ext(pts[pts.length - 1], g.E);
    if (s.x !== pts[0].x || s.y !== pts[0].y) pts.unshift(s);
    if (e.x !== pts[pts.length - 1].x || e.y !== pts[pts.length - 1].y) pts.push(e);
    return pts;
  }
  function strokeRoute(c, pts, w, style, dash, comp, alpha) {
    if (pts.length < 2) return;
    c.save(); c.lineJoin = 'round'; c.lineCap = 'round'; c.lineWidth = w; c.strokeStyle = style;
    if (comp) c.globalCompositeOperation = comp; if (alpha != null) c.globalAlpha = alpha; if (dash) c.setLineDash(dash);
    c.beginPath(); c.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y); c.stroke(); c.restore();
  }
  /** door orientation: which board edge S/E touch ('W','E','N','S') or 'in' for interior */
  function edgeOf(cell, COLS, ROWS) { if (!cell) return 'in'; if (cell.c === 0) return 'W'; if (cell.c === COLS - 1) return 'E'; if (cell.r === 0) return 'N'; if (cell.r === ROWS - 1) return 'S'; return 'in'; }

  // ---------- palettes ----------
  const PALETTES = {
    brass: { name: 'THE LOBBY', base: 'marble', path: 'carpet', wall: 'panels', door: 'walnut',
      floor: '#ede3d0', floor2: '#d9ccb4', vein: '#8d8574', inlay: '#c9a227',
      runner: '#5f1824', runnerTrim: '#d3aa3a', runnerDark: '#2a0a10',
      wallA: '#4b2f1c', wallB: '#2a180b', rail: '#e8c576', lamp: '#e8c576', lampA: 0.28, gilt: '#e8c576',
      props: [['sofa', 'palm'], ['column', 'palm'], ['luggage', 'sofa'], ['palm', 'column'], ['deskConcierge', 'palm'], ['sofa', 'floorLamp']] },
    wine: { name: 'THE MEZZANINE', base: 'carpet', path: 'marble', wall: 'balustrade', door: 'walnut',
      floor: '#4d1620', floor2: '#2f0b12', inlay: '#c9a227', vein: '#8d8574',
      runner: '#e6dccb', runnerTrim: '#c9a227', runnerDark: '#3a2c1c',
      wallA: '#e0d4bf', wallB: '#7a6a52', rail: '#e8c576', lamp: '#f2cf7a', lampA: 0.24, gilt: '#e8c576',
      props: [['balustrade', 'palm'], ['column', 'cello'], ['musicStand', 'chair'], ['settee', 'floorLamp'], ['palm', 'balustrade'], ['column', 'settee']] },
    emerald: { name: 'THE SOMMELIER BAR', base: 'parquet', path: 'carpet', wall: 'racks', door: 'walnut',
      floor: '#4a3320', floor2: '#2c1c10', inlay: '#c9a227',
      runner: '#1e5b3d', runnerTrim: '#c9a227', runnerDark: '#0d2a1c',
      wallA: '#2a1a10', wallB: '#160c06', rail: '#c9a227', lamp: '#f0b64a', lampA: 0.26, gilt: '#e8c576', neonSign: '#7cf9a5',
      props: [['wineRack', 'cask'], ['barCounter', 'stool'], ['tastingTable', 'stool'], ['cask', 'wineRack'], ['wineRack', 'iceBucket'], ['barCounter', 'cask']] },
    gold: { name: 'THE VAULT', base: 'steel', path: 'hazard', wall: 'steel', door: 'steel',
      floor: '#57606d', floor2: '#333a45', inlay: '#e8c576',
      runner: '#dcb43a', runnerTrim: '#1a1a1a', runnerDark: '#22262c',
      wallA: '#3a424e', wallB: '#1c2027', rail: '#8f9aa8', lamp: '#bcd7ff', lampA: 0.22, gilt: '#ffd66b',
      props: [['vaultDoor', 'goldBars'], ['coinPress', 'goldBars'], ['safe', 'coinCart'], ['coinPress', 'safe'], ['goldBars', 'coinCart'], ['vaultDoor', 'coinPress']] },
    ash: { name: 'ADMINISTRATION', base: 'lino', path: 'tape', wall: 'admin', door: 'elevator',
      floor: '#6c7078', floor2: '#474b54', inlay: '#e8c576',
      runner: '#9a8f84', runnerTrim: '#c0392b', runnerDark: '#33363c',
      wallA: '#5a5e58', wallB: '#2c2f2c', rail: '#a88a4a', lamp: '#ffae42', lampA: 0.28, gilt: '#e8c576', crt: '#7cf9a5',
      props: [['deskTypewriter', 'filingCabinet'], ['crtDesk', 'paperBoxes'], ['filingCabinet', 'tubeStation'], ['deskPhone', 'waterCooler'], ['paperBoxes', 'deskTypewriter'], ['tubeStation', 'crtDesk']] },
    neon: { name: 'THE ROOFTOP', base: 'concrete', path: 'helipad', wall: 'parapet', door: 'lift', rain: true,
      floor: '#2e3541', floor2: '#171c26', inlay: '#e8c576',
      runner: '#3f4753', runnerTrim: '#e0c455', runnerDark: '#12161d',
      wallA: '#3a404a', wallB: '#1a1e26', rail: '#6b7380', lamp: '#ff4fa3', lampA: 0.15, gilt: '#e8c576', neonSign: '#ff3d8f',
      props: [['acUnit', 'crates'], ['neonSign', 'generator'], ['radioMast', 'ventStack'], ['waterTank', 'acUnit'], ['crates', 'satDish'], ['acUnit', 'ventStack']] },
    blood: { name: 'THE PIT', base: 'pitcrete', path: 'pitlane', wall: 'cage', door: 'cage',
      floor: '#3a3634', floor2: '#1c1918', inlay: '#e8c576',
      runner: '#443e3c', runnerTrim: '#b3221e', runnerDark: '#120c0b',
      wallA: '#2b2725', wallB: '#100d0c', rail: '#6d6660', lamp: '#ff8a4a', lampA: 0.22, gilt: '#e8c576', beacon: '#ff2a2a',
      props: [['oilDrum', 'crates'], ['ringPost', 'oilDrum'], ['crates', 'cagePanel'], ['oilDrum', 'ringPost'], ['cagePanel', 'crates'], ['workLamp', 'oilDrum']] },
  };

  // ---------- base flooring ----------
  function cellTiles(env, lineA, lightA, toneA) {
    // subtle per-cell grout + tone variation on build cells (keeps placement legible without a hard grid)
    const { ctx: c, CELL, COLS, ROWS, rng, grid } = env;
    for (let r = 0; r < ROWS; r++) for (let col = 0; col < COLS; col++) {
      if (grid.isPath(col, r)) continue;
      const x = col * CELL, y = r * CELL, t = (rng() - 0.5) * toneA;
      c.fillStyle = t > 0 ? 'rgba(255,255,255,' + t + ')' : 'rgba(0,0,0,' + (-t) + ')'; c.fillRect(x, y, CELL, CELL);
    }
    c.save(); c.lineWidth = 1;
    for (let col = 0; col <= COLS; col++) { c.strokeStyle = 'rgba(0,0,0,' + lineA + ')'; c.beginPath(); c.moveTo(col * CELL + 0.5, 0); c.lineTo(col * CELL + 0.5, ROWS * CELL); c.stroke(); c.strokeStyle = 'rgba(255,255,255,' + lightA + ')'; c.beginPath(); c.moveTo(col * CELL + 1.5, 0); c.lineTo(col * CELL + 1.5, ROWS * CELL); c.stroke(); }
    for (let r = 0; r <= ROWS; r++) { c.strokeStyle = 'rgba(0,0,0,' + lineA + ')'; c.beginPath(); c.moveTo(0, r * CELL + 0.5); c.lineTo(COLS * CELL, r * CELL + 0.5); c.stroke(); c.strokeStyle = 'rgba(255,255,255,' + lightA + ')'; c.beginPath(); c.moveTo(0, r * CELL + 1.5); c.lineTo(COLS * CELL, r * CELL + 1.5); c.stroke(); }
    c.restore();
  }
  const BASES = {
    marble(env) {
      const { ctx: c, W, H, CELL, COLS, ROWS, rng, pal, mk } = env;
      c.fillStyle = lin(c, 0, 0, W * 0.3, H, [0, shade(pal.floor, 0.04), 0.5, pal.floor, 1, pal.floor2]); c.fillRect(0, 0, W, H);
      mottle(c, rng, 0, 0, W, H, 24, CELL * 3, 0.08, 0.10);
      // warm brass-light patches (chandelier warmth) so the cream never reads flat
      c.save(); c.globalCompositeOperation = 'multiply';
      for (let i = 0; i < 9; i++) { const x = rng() * W, y = rng() * H, r = CELL * (2 + rng() * 3); c.fillStyle = rad(c, x, y, 0, r, [0, 'rgba(236,205,140,0.26)', 1, 'rgba(255,255,255,0)']); c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
      c.restore();
      veins(c, rng, W, H, 30, pal.vein, 0.20);
      applyGrain(c, grainTex(mk, rng, 128, 22), 0, 0, W, H, 0.24);
      cellTiles(env, 0.10, 0.16, 0.06);
      // brass inlay grid on the tile joints + small rosettes at intersections
      c.save(); c.strokeStyle = rgba(pal.inlay, 0.34); c.lineWidth = 1.5;
      for (let col = 0; col <= COLS; col++) { c.beginPath(); c.moveTo(col * CELL + 1, 0); c.lineTo(col * CELL + 1, H); c.stroke(); }
      for (let r = 0; r <= ROWS; r++) { c.beginPath(); c.moveTo(0, r * CELL + 1); c.lineTo(W, r * CELL + 1); c.stroke(); }
      c.fillStyle = rgba(pal.inlay, 0.55);
      for (let col = 1; col < COLS; col++) for (let r = 1; r < ROWS; r++) { c.beginPath(); c.arc(col * CELL + 1, r * CELL + 1, 2.2, 0, TAU); c.fill(); }
      c.restore();
      specular(c, rng, W, H, 7, '#ffffff', 0.09, 8, 34);
    },
    carpet(env) {
      const { ctx: c, W, H, CELL, rng, pal, mk } = env;
      c.fillStyle = lin(c, 0, 0, W * 0.2, H, [0, shade(pal.floor, 0.06), 0.5, pal.floor, 1, pal.floor2]); c.fillRect(0, 0, W, H);
      applyGrain(c, grainTex(mk, rng, 96, 46), 0, 0, W, H, 0.5);
      mottle(c, rng, 0, 0, W, H, 22, CELL * 3, 0.14, 0.06);
      // gold fleur lattice
      const t = CELL, tile = mk(t, t), tc = tile.getContext('2d');
      tc.fillStyle = rgba(pal.inlay, 0.22); fleur(tc, t / 2, t / 2 - 2, t * 0.14);
      tc.fillStyle = rgba(pal.inlay, 0.14); fleur(tc, 0, -2, t * 0.10); fleur(tc, t, -2, t * 0.10); fleur(tc, 0, t - 2, t * 0.10); fleur(tc, t, t - 2, t * 0.10);
      tc.strokeStyle = rgba(pal.inlay, 0.10); tc.lineWidth = 1; tc.beginPath(); tc.moveTo(t / 2, 0); tc.lineTo(t, t / 2); tc.lineTo(t / 2, t); tc.lineTo(0, t / 2); tc.closePath(); tc.stroke();
      c.save(); c.fillStyle = c.createPattern(tile, 'repeat'); c.fillRect(0, 0, W, H); c.restore();
      cellTiles(env, 0.06, 0.05, 0.05);
    },
    parquet(env) {
      const { ctx: c, W, H, CELL, rng, pal, mk } = env;
      const t = CELL, tile = mk(t * 2, t * 2), tc = tile.getContext('2d'), n = 4, s = t / n;
      for (let by = 0; by < 2; by++) for (let bx = 0; bx < 2; bx++) {
        const horiz = (bx + by) % 2 === 0, x0 = bx * t, y0 = by * t;
        for (let i = 0; i < n; i++) {
          const tone = mixc(pal.floor, pal.floor2, rng() * 0.6);
          if (horiz) { tc.fillStyle = lin(tc, x0, y0 + i * s, x0, y0 + (i + 1) * s, [0, shade(tone, 0.10), 0.5, tone, 1, shade(tone, -0.18)]); tc.fillRect(x0, y0 + i * s, t, s); }
          else { tc.fillStyle = lin(tc, x0 + i * s, y0, x0 + (i + 1) * s, y0, [0, shade(tone, 0.10), 0.5, tone, 1, shade(tone, -0.18)]); tc.fillRect(x0 + i * s, y0, s, t); }
          // grain lines
          tc.strokeStyle = 'rgba(0,0,0,0.16)'; tc.lineWidth = 0.7;
          for (let g = 0; g < 3; g++) { const o = (0.2 + rng() * 0.6) * s; tc.beginPath(); if (horiz) { tc.moveTo(x0, y0 + i * s + o); tc.lineTo(x0 + t, y0 + i * s + o + (rng() - 0.5) * 2); } else { tc.moveTo(x0 + i * s + o, y0); tc.lineTo(x0 + i * s + o + (rng() - 0.5) * 2, y0 + t); } tc.stroke(); }
        }
        tc.strokeStyle = 'rgba(0,0,0,0.35)'; tc.lineWidth = 1; tc.strokeRect(x0 + 0.5, y0 + 0.5, t - 1, t - 1);
      }
      c.save(); c.fillStyle = c.createPattern(tile, 'repeat'); c.fillRect(0, 0, W, H); c.restore();
      applyGrain(c, grainTex(mk, rng, 128, 20), 0, 0, W, H, 0.25);
      mottle(c, rng, 0, 0, W, H, 24, CELL * 3, 0.20, 0.05);
      cellTiles(env, 0.05, 0.03, 0.06);
      specular(c, rng, W, H, 5, '#ffdca0', 0.06, 10, 40);
    },
    steel(env) {
      const { ctx: c, W, H, CELL, COLS, ROWS, rng, pal, mk } = env;
      c.fillStyle = lin(c, 0, 0, W * 0.2, H, [0, shade(pal.floor, 0.05), 0.5, pal.floor, 1, pal.floor2]); c.fillRect(0, 0, W, H);
      // diamond plate
      const d = Math.round(CELL / 4), tile = mk(d, d), tc = tile.getContext('2d');
      const dia = (x, y) => { const s = d * 0.22; tc.fillStyle = 'rgba(255,255,255,0.20)'; tc.beginPath(); tc.moveTo(x, y - s); tc.lineTo(x + s, y); tc.lineTo(x - s, y); tc.closePath(); tc.fill();
        tc.fillStyle = 'rgba(0,0,0,0.30)'; tc.beginPath(); tc.moveTo(x - s, y); tc.lineTo(x + s, y); tc.lineTo(x, y + s); tc.closePath(); tc.fill(); };
      dia(d * 0.25, d * 0.25); dia(d * 0.75, d * 0.75);
      c.save(); c.fillStyle = c.createPattern(tile, 'repeat'); c.globalAlpha = 0.7; c.fillRect(0, 0, W, H); c.restore();
      applyGrain(c, grainTex(mk, rng, 128, 24), 0, 0, W, H, 0.3);
      mottle(c, rng, 0, 0, W, H, 30, CELL * 2.5, 0.22, 0.08);
      cellTiles(env, 0.08, 0.05, 0.05);
      // plate seams every 2 cells + rivets
      c.save();
      for (let col = 0; col <= COLS; col += 2) { c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(col * CELL - 1, 0, 2, H); c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(col * CELL + 1, 0, 1, H); }
      for (let r = 0; r <= ROWS; r += 2) { c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, r * CELL - 1, W, 2); c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(0, r * CELL + 1, W, 1); }
      for (let col = 0; col <= COLS; col += 2) for (let r = 0; r <= ROWS; r += 2) for (const [ox, oy] of [[6, 6], [-6, 6], [6, -6], [-6, -6]]) {
        const x = col * CELL + ox, y = r * CELL + oy; c.fillStyle = rad(c, x - 1, y - 1, 0, 3, [0, 'rgba(255,255,255,0.5)', 1, 'rgba(20,24,30,0.7)']); c.beginPath(); c.arc(x, y, 2.6, 0, TAU); c.fill();
      }
      c.restore();
      specular(c, rng, W, H, 6, '#cfe4ff', 0.10, 8, 30);
    },
    lino(env) {
      const { ctx: c, W, H, CELL, COLS, ROWS, rng, pal, mk } = env;
      c.fillStyle = lin(c, 0, 0, W * 0.2, H, [0, shade(pal.floor, 0.05), 0.5, pal.floor, 1, pal.floor2]); c.fillRect(0, 0, W, H);
      applyGrain(c, grainTex(mk, rng, 96, 40), 0, 0, W, H, 0.42);
      // half-cell checker + speckle
      const h2 = CELL / 2;
      c.save();
      for (let r = 0; r < ROWS * 2; r++) for (let col = 0; col < COLS * 2; col++) if ((r + col) % 2 === 0) { c.fillStyle = 'rgba(255,255,255,0.045)'; c.fillRect(col * h2, r * h2, h2, h2); }
      c.restore();
      mottle(c, rng, 0, 0, W, H, 26, CELL * 3, 0.16, 0.08);
      cellTiles(env, 0.10, 0.07, 0.04);
      // scuffs
      c.save(); c.lineCap = 'round';
      for (let i = 0; i < 40; i++) { const x = rng() * W, y = rng() * H, l = 10 + rng() * 40, a = rng() * TAU; c.strokeStyle = 'rgba(0,0,0,' + (0.05 + rng() * 0.08) + ')'; c.lineWidth = 1 + rng() * 2; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a + 0.5) * l * 0.5, y + Math.sin(a + 0.5) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); }
      c.restore();
      specular(c, rng, W, H, 5, '#ffffff', 0.06, 10, 36);
    },
    concrete(env, dark) {
      const { ctx: c, W, H, CELL, COLS, ROWS, rng, pal, mk } = env;
      c.fillStyle = lin(c, 0, 0, W * 0.2, H, [0, shade(pal.floor, 0.05), 0.5, pal.floor, 1, pal.floor2]); c.fillRect(0, 0, W, H);
      applyGrain(c, grainTex(mk, rng, 128, 40), 0, 0, W, H, 0.45);
      mottle(c, rng, 0, 0, W, H, 40, CELL * 2.5, 0.22, 0.07);
      cellTiles(env, 0.06, 0.05, 0.05);
      // slab seams every 2 cells + cracks
      c.save();
      for (let col = 0; col <= COLS; col += 2) { c.fillStyle = 'rgba(0,0,0,0.40)'; c.fillRect(col * CELL - 1, 0, 2, H); c.fillStyle = 'rgba(255,255,255,0.07)'; c.fillRect(col * CELL + 1, 0, 1, H); }
      for (let r = 0; r <= ROWS; r += 2) { c.fillStyle = 'rgba(0,0,0,0.40)'; c.fillRect(0, r * CELL - 1, W, 2); c.fillStyle = 'rgba(255,255,255,0.07)'; c.fillRect(0, r * CELL + 1, W, 1); }
      c.lineCap = 'round';
      for (let i = 0; i < 14; i++) {
        let x = rng() * W, y = rng() * H; c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y);
        for (let s = 0; s < 6; s++) { x += (rng() - 0.5) * 40; y += (rng() - 0.5) * 40; c.lineTo(x, y); } c.stroke();
      }
      c.restore();
      if (!dark) {
        // wet sheen + puddles reflecting neon
        specular(c, rng, W, H, 8, '#9fb8ff', 0.09, 12, 44);
        for (let i = 0; i < 14; i++) {
          const x = rng() * W, y = CELL + rng() * (H - CELL), rx = CELL * (0.4 + rng() * 0.7), ry = rx * (0.3 + rng() * 0.2);
          const tint = ['#ff3d8f', '#7cf9a5', '#4fb3ff', '#e8c576'][i % 4];
          c.save(); c.beginPath();   // irregular puddle = 3 overlapping ellipses
          for (let k = 0; k < 3; k++) c.ellipse(x + (rng() - 0.5) * rx * 0.8, y + (rng() - 0.5) * ry * 0.8, rx * (0.55 + rng() * 0.45), ry * (0.55 + rng() * 0.45), 0, 0, TAU);
          c.fillStyle = lin(c, x, y - ry, x, y + ry, [0, 'rgba(6,9,16,0.45)', 0.55, rgba(tint, 0.10), 1, 'rgba(160,185,230,0.16)']); c.fill();
          c.globalCompositeOperation = 'screen'; c.fillStyle = rad(c, x, y + ry * 0.4, 0, rx * 0.8, [0, rgba(tint, 0.14), 1, rgba(tint, 0)]); c.fill();
          c.globalCompositeOperation = 'source-over'; c.strokeStyle = 'rgba(255,255,255,0.10)'; c.lineWidth = 1; c.beginPath(); c.ellipse(x + (rng() - 0.5) * rx * 0.5, y + (rng() - 0.5) * ry * 0.5, 3 + rng() * 6, 1.5 + rng() * 2, 0, 0, TAU); c.stroke();
          c.restore();
        }
      }
    },
    pitcrete(env) {
      const { ctx: c, W, H, CELL, rng } = env;
      BASES.concrete(env, true);
      // drainage grates on some build cells + old blood stains
      c.save();
      for (let i = 0; i < 6; i++) {
        const cell = env.grid.build[Math.floor(rng() * env.grid.build.length)]; if (!cell || env.grid.cells[cell.r][cell.c] !== '.') continue;
        const x = cell.c * CELL + CELL / 2, y = cell.r * CELL + CELL / 2, w = CELL * 0.62, h = CELL * 0.62;
        c.fillStyle = '#0a0908'; rr(c, x - w / 2, y - h / 2, w, h, 3); c.fill();
        c.fillStyle = '#5a5450'; for (let b = 0; b < 6; b++) c.fillRect(x - w / 2 + 3, y - h / 2 + 3 + b * (h - 6) / 6, w - 6, 2);
        c.fillStyle = 'rgba(0,0,0,0.5)'; for (let b = 0; b < 6; b++) c.fillRect(x - w / 2 + 3, y - h / 2 + 5 + b * (h - 6) / 6, w - 6, 3);
        c.strokeStyle = 'rgba(255,255,255,0.10)'; c.lineWidth = 1; rr(c, x - w / 2, y - h / 2, w, h, 3); c.stroke();
        c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x - w / 2 - 6, y - h / 2, 6, h + 6); c.fillRect(x - w / 2, y + h / 2, w, 6);
      }
      c.globalCompositeOperation = 'multiply';
      for (let i = 0; i < 12; i++) { const x = rng() * W, y = rng() * H, r = 12 + rng() * 34; c.fillStyle = rad(c, x, y, 0, r, [0, 'rgba(120,10,10,0.55)', 0.6, 'rgba(90,8,8,0.30)', 1, 'rgba(60,0,0,0)']); c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
      c.restore();
    },
  };

  // ---------- path runners ----------
  function stripeTex(mk, size, a, b) {
    const cv = mk(size, size), c = cv.getContext('2d'); c.fillStyle = a; c.fillRect(0, 0, size, size); c.fillStyle = b;
    for (let i = -size; i < size * 2; i += size / 2) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + size / 4, 0); c.lineTo(i + size / 4 - size, size); c.lineTo(i - size, size); c.closePath(); c.fill(); }
    return cv;
  }
  const PATHS = {
    carpet(env, pts) {
      const { ctx: c, CELL, pal, grainT } = env, W = CELL * 0.78;
      strokeRoute(c, pts, W + CELL * 0.4, 'rgba(0,0,0,0.16)', null, 'multiply');
      strokeRoute(c, pts, W + CELL * 0.16, 'rgba(0,0,0,0.22)', null, 'multiply');
      strokeRoute(c, pts, W + 7, pal.runnerDark);
      strokeRoute(c, pts, W + 4, pal.runnerTrim);
      strokeRoute(c, pts, W, pal.runner);
      strokeRoute(c, pts, W - 12, rgba(pal.runnerTrim, 0.75));
      strokeRoute(c, pts, W - 15, pal.runner);
      strokeRoute(c, pts, W - 26, 'rgba(255,255,255,0.05)', null, 'screen');
      strokeRoute(c, pts, W, c.createPattern(grainT, 'repeat'), null, 'overlay', 0.5);
      strokeRoute(c, pts, W + 4, 'rgba(255,255,255,0.10)', null, 'screen');
    },
    marble(env, pts) {
      const { ctx: c, CELL, pal, grainT, mk, rng } = env, W = CELL * 0.8;
      const tex = marbleTex(mk, rng, 256, pal.runner, pal.vein, 0.22);
      strokeRoute(c, pts, W + CELL * 0.4, 'rgba(0,0,0,0.20)', null, 'multiply');
      strokeRoute(c, pts, W + CELL * 0.16, 'rgba(0,0,0,0.25)', null, 'multiply');
      strokeRoute(c, pts, W + 7, pal.runnerDark);
      strokeRoute(c, pts, W + 4, pal.runnerTrim);
      strokeRoute(c, pts, W, c.createPattern(tex, 'repeat'));
      strokeRoute(c, pts, W - 12, rgba(pal.runnerTrim, 0.55));
      strokeRoute(c, pts, W - 14, c.createPattern(tex, 'repeat'));
      strokeRoute(c, pts, W, c.createPattern(grainT, 'repeat'), null, 'overlay', 0.25);
      strokeRoute(c, pts, W - 30, 'rgba(255,255,255,0.10)', null, 'screen');
    },
    hazard(env, pts) {
      const { ctx: c, CELL, pal, grainT, mk } = env, W = CELL * 0.9;
      strokeRoute(c, pts, W + CELL * 0.3, 'rgba(0,0,0,0.25)', null, 'multiply');
      strokeRoute(c, pts, W + 5, pal.runnerDark);
      strokeRoute(c, pts, W, c.createPattern(stripeTex(mk, 24, pal.runner, '#15161a'), 'repeat'));
      strokeRoute(c, pts, W - 14, shade(pal.runner, -0.05));
      strokeRoute(c, pts, W - 34, 'rgba(255,255,255,0.08)', null, 'screen');
      strokeRoute(c, pts, W - 14, c.createPattern(grainT, 'repeat'), null, 'overlay', 0.6);
      strokeRoute(c, pts, W - 14, 'rgba(0,0,0,0.18)', null, 'multiply', 0.5);
      strokeRoute(c, pts, W - 44, 'rgba(0,0,0,0.25)', [CELL * 0.6, CELL * 0.9], 'multiply');
    },
    tape(env, pts) {
      const { ctx: c, CELL, pal, grainT } = env, W = CELL * 0.9;
      strokeRoute(c, pts, W + CELL * 0.3, 'rgba(0,0,0,0.16)', null, 'multiply');
      strokeRoute(c, pts, W + 3, pal.runnerDark);
      strokeRoute(c, pts, W, pal.runnerTrim);
      strokeRoute(c, pts, W - 10, pal.runner);
      strokeRoute(c, pts, W - 10, c.createPattern(grainT, 'repeat'), null, 'overlay', 0.45);
      strokeRoute(c, pts, W, 'rgba(255,255,255,0.35)', [CELL * 0.18, CELL * 0.14]);   // tape ticks over the red edge bands
      strokeRoute(c, pts, W - 10, pal.runner);
      strokeRoute(c, pts, W - 10, c.createPattern(grainT, 'repeat'), null, 'overlay', 0.45);
      strokeRoute(c, pts, 2, 'rgba(255,255,255,0.28)', [CELL * 0.3, CELL * 0.22]);
      strokeRoute(c, pts, W - 30, 'rgba(255,255,255,0.05)', null, 'screen');
    },
    helipad(env, pts) {
      const { ctx: c, CELL, pal, grainT, rng, grid } = env, W = CELL * 0.9;
      strokeRoute(c, pts, W + CELL * 0.3, 'rgba(0,0,0,0.25)', null, 'multiply');
      strokeRoute(c, pts, W + 8, rgba(pal.runnerTrim, 0.85));
      strokeRoute(c, pts, W, pal.runner);
      strokeRoute(c, pts, W, c.createPattern(grainT, 'repeat'), null, 'overlay', 0.55);
      strokeRoute(c, pts, W + 8, c.createPattern(grainT, 'repeat'), null, 'overlay', 0.7);
      strokeRoute(c, pts, 3, 'rgba(255,255,255,0.5)', [CELL * 0.35, CELL * 0.28]);
      // faded helipad circle + H on the longest horizontal run nearest the middle rows (never row 0)
      const r = grid.route, ROWS = env.ROWS; let best = null;
      for (let i = 0; i < r.length; i++) { let j = i; while (j + 1 < r.length && (r[j + 1].r === r[i].r)) j++; const len = j - i, score = len - Math.abs(r[i].r - ROWS / 2) * 2; if (len > 5 && r[i].r > 0 && (!best || score > best.score)) best = { len, i, score }; i = j; }
      if (best) {
        const mid = r[best.i + (best.len >> 1)], x = mid.c * CELL + CELL / 2, y = mid.r * CELL + CELL / 2, R = CELL * 1.1, hh = CELL * 0.6, hw = CELL * 0.36;
        c.save(); c.globalAlpha = 0.5; c.strokeStyle = pal.runnerTrim; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.arc(x, y, R, 0, TAU); c.stroke();
        c.lineWidth = 7; c.beginPath(); c.moveTo(x - hw, y - hh); c.lineTo(x - hw, y + hh); c.moveTo(x + hw, y - hh); c.lineTo(x + hw, y + hh); c.moveTo(x - hw, y); c.lineTo(x + hw, y); c.stroke(); c.restore();
      }
      // wet lane: puddle streaks
      c.save(); c.globalCompositeOperation = 'screen';
      for (let i = 0; i < 10; i++) { const p = pts[1 + Math.floor(rng() * Math.max(1, pts.length - 2))]; if (!p) break; c.fillStyle = rad(c, p.x, p.y, 0, CELL * 0.6, [0, 'rgba(120,150,220,0.14)', 1, 'rgba(120,150,220,0)']); c.beginPath(); c.arc(p.x, p.y, CELL * 0.6, 0, TAU); c.fill(); }
      c.restore();
    },
    pitlane(env, pts) {
      const { ctx: c, CELL, pal, grainT, rng } = env, W = CELL * 0.9;
      strokeRoute(c, pts, W + CELL * 0.3, 'rgba(0,0,0,0.30)', null, 'multiply');
      strokeRoute(c, pts, W + 4, pal.runnerDark);
      strokeRoute(c, pts, W, pal.runner);
      strokeRoute(c, pts, W, c.createPattern(grainT, 'repeat'), null, 'overlay', 0.6);
      strokeRoute(c, pts, W - 4, rgba(pal.runnerTrim, 0.85));
      strokeRoute(c, pts, W - 12, pal.runner);
      strokeRoute(c, pts, W - 12, c.createPattern(grainT, 'repeat'), null, 'overlay', 0.6);
      strokeRoute(c, pts, W - 12, 'rgba(255,255,255,0.05)', null, 'screen');
      // blood-dark stains dragged along the lane
      c.save(); c.globalCompositeOperation = 'multiply';
      for (let i = 0; i < 26; i++) { const p = pts[1 + Math.floor(rng() * Math.max(1, pts.length - 2))]; if (!p) break; const x = p.x + (rng() - 0.5) * CELL * 0.5, y = p.y + (rng() - 0.5) * CELL * 0.5, r0 = 6 + rng() * 22; c.fillStyle = rad(c, x, y, 0, r0, [0, 'rgba(110,8,8,0.6)', 1, 'rgba(60,0,0,0)']); c.beginPath(); c.arc(x, y, r0, 0, TAU); c.fill(); }
      c.restore();
    },
  };
  function paintStray(env) {   // path cells not on the S→E chain (shouldn't exist, but never leave a hole)
    const { ctx: c, CELL, pal, grid } = env;
    for (const p of grid.stray) { c.fillStyle = pal.runner; c.fillRect(p.c * CELL + 4, p.r * CELL + 4, CELL - 8, CELL - 8); }
  }
  function paintGilded(env) {
    const { ctx: c, CELL, pal, grid, ambient } = env;
    for (const g of grid.G) {
      const x = g.c * CELL + CELL / 2, y = g.r * CELL + CELL / 2, s = CELL * 0.33;
      glowEll(c, x, y, CELL * 0.75, CELL * 0.75, pal.gilt, 0.34);
      c.save(); c.translate(x, y); c.rotate(Math.PI / 4);
      c.strokeStyle = rgba(shade(pal.gilt, -0.45), 0.45); c.lineWidth = 3.5; c.strokeRect(-s, -s, s * 2, s * 2);
      c.strokeStyle = rgba(pal.gilt, 0.75); c.lineWidth = 1.6; c.strokeRect(-s, -s, s * 2, s * 2);
      c.strokeStyle = rgba(pal.gilt, 0.35); c.lineWidth = 1; c.strokeRect(-s * 0.72, -s * 0.72, s * 1.44, s * 1.44);
      c.fillStyle = rgba(pal.gilt, 0.7); for (const [ox, oy] of [[-s, -s], [s, -s], [-s, s], [s, s]]) { c.beginPath(); c.arc(ox, oy, 2.5, 0, TAU); c.fill(); }
      c.restore();
      c.fillStyle = rad(c, x, y, 0, s * 0.35, [0, rgba(pal.gilt, 0.55), 1, rgba(pal.gilt, 0)]); c.beginPath(); c.arc(x, y, s * 0.35, 0, TAU); c.fill();
      ambient.lamps.push({ x, y, color: pal.gilt, r: CELL * 0.7, kind: 'gilded' });
    }
  }

  // ---------- wall band (backdrop, one cell high) ----------
  function nightCity(c, x, y, w, h, rng, neonA) {
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    c.fillStyle = lin(c, x, y, x, y + h, [0, '#070a14', 0.6, '#101830', 1, '#1a2340']); c.fillRect(x, y, w, h);
    const tints = ['#ff3d8f', '#4fb3ff', '#7cf9a5', '#e8c576'];
    for (let i = 0; i < 2; i++) { const gx = x + rng() * w, gy = y + h * (0.55 + rng() * 0.4), gr = w * (0.3 + rng() * 0.4); c.fillStyle = rad(c, gx, gy, 0, gr, [0, rgba(tints[Math.floor(rng() * 4)], neonA), 1, 'rgba(0,0,0,0)']); c.fillRect(x, y, w, h); }
    let bx = x - 4;
    while (bx < x + w) { const bw = 6 + rng() * 14, bh = h * (0.25 + rng() * 0.6); c.fillStyle = mixc('#0b0f1c', '#1d2438', rng()); c.fillRect(bx, y + h - bh, bw, bh);
      for (let wy = y + h - bh + 3; wy < y + h - 2; wy += 4) for (let wx = bx + 2; wx < bx + bw - 2; wx += 3) if (rng() < 0.4) { c.fillStyle = rng() < 0.7 ? 'rgba(255,225,150,0.9)' : 'rgba(150,220,255,0.9)'; c.fillRect(wx, wy, 1.6, 2); }
      bx += bw + 1 + rng() * 3; }
    c.restore();
  }
  function neonText(env, text, x, y, px, color, glowR) {
    const { ctx: c, mk } = env; const w = Math.max(60, text.length * px * 0.8) + glowR * 4, h = px * 1.6 + glowR * 4;
    const cv = mk(Math.ceil(w), Math.ceil(h)), t = cv.getContext('2d');
    t.font = 'bold ' + px + 'px Arial, Helvetica, sans-serif'; t.textAlign = 'center'; t.textBaseline = 'middle'; try { t.letterSpacing = Math.round(px * 0.12) + 'px'; } catch (e) { /* older canvas */ }
    t.shadowColor = color; t.shadowBlur = glowR; t.fillStyle = rgba(color, 0.95); t.fillText(text, w / 2, h / 2); t.fillText(text, w / 2, h / 2);
    t.shadowBlur = 0; t.fillStyle = mixc(color, '#ffffff', 0.6); t.font = 'bold ' + Math.round(px * 0.9) + 'px Arial, Helvetica, sans-serif'; t.fillText(text, w / 2, h / 2);
    c.drawImage(cv, x - w / 2, y - h / 2);
    env.ambient.neon.push({ x: x - w / 2 + glowR * 2, y: y - px * 0.8, w: w - glowR * 4, h: px * 1.6, color });
  }
  function baseboard(env, color) {
    const { ctx: c, W, CELL } = env;
    c.fillStyle = lin(c, 0, CELL - 9, 0, CELL, [0, shade(color, 0.15), 0.4, color, 1, shade(color, -0.4)]); c.fillRect(0, CELL - 9, W, 9);
    c.save(); c.globalCompositeOperation = 'multiply'; c.fillStyle = lin(c, 0, CELL, 0, CELL * 1.7, [0, 'rgba(0,0,0,0.38)', 1, 'rgba(0,0,0,0)']); c.fillRect(0, CELL, W, CELL * 0.7); c.restore();
  }
  const WALLS = {
    panels(env) {
      const { ctx: c, W, CELL, COLS, rng, pal, ambient } = env;
      for (let k = 0; k < COLS; k++) {
        const x = k * CELL; c.fillStyle = lin(c, x, 0, x, CELL, [0, pal.wallB, 0.45, pal.wallA, 1, shade(pal.wallB, -0.2)]); c.fillRect(x, 0, CELL, CELL);
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x, 0, 2, CELL); c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(x + 2, 0, 1, CELL);
        if (k % 3 === 1) {  // tall window → neon city
          const wx = x + 8, wy = 4, ww = CELL - 16, wh = CELL * 0.72;
          nightCity(c, wx, wy, ww, wh, rng, 0.35);
          c.strokeStyle = shade(pal.rail, -0.2); c.lineWidth = 3; c.strokeRect(wx, wy, ww, wh); c.lineWidth = 1.5; c.beginPath(); c.moveTo(wx + ww / 2, wy); c.lineTo(wx + ww / 2, wy + wh); c.moveTo(wx, wy + wh * 0.4); c.lineTo(wx + ww, wy + wh * 0.4); c.stroke();
          c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(wx + 3, wy + 3, ww * 0.35, wh * 0.35);
        } else {           // walnut panel with bevel + brass sconce
          const px = x + 7, py = 6, pw = CELL - 14, ph = CELL * 0.62;
          c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(px, py, pw, ph); c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(px, py, pw, 1.5); c.fillRect(px, py, 1.5, ph);
          c.fillStyle = lin(c, px, py, px + pw, py + ph, [0, shade(pal.wallA, 0.10), 1, shade(pal.wallA, -0.10)]); c.fillRect(px + 3, py + 3, pw - 6, ph - 6);
          if (k % 3 === 2 && k < COLS - 1) { const sx = x + CELL / 2, sy = CELL * 0.36; glowEll(c, sx, sy, CELL * 0.4, CELL * 0.34, pal.lamp, 0.55); c.fillStyle = lin(c, sx - 5, sy, sx + 5, sy, [0, shade(pal.rail, -0.3), 0.5, shade(pal.rail, 0.3), 1, shade(pal.rail, -0.4)]); rr(c, sx - 5, sy - 2, 10, 14, 3); c.fill(); c.fillStyle = 'rgba(255,240,200,0.9)'; c.beginPath(); c.ellipse(sx, sy - 5, 6, 3.5, 0, 0, TAU); c.fill(); ambient.lamps.push({ x: sx, y: sy, color: pal.lamp, r: CELL * 0.6, kind: 'sconce' }); }
        }
      }
      // brass chair rail
      const ry = CELL * 0.8; c.fillStyle = lin(c, 0, ry - 2, 0, ry + 3, [0, shade(pal.rail, 0.35), 0.5, pal.rail, 1, shade(pal.rail, -0.45)]); c.fillRect(0, ry - 2, W, 5);
      baseboard(env, shade(pal.wallB, -0.1));
    },
    balustrade(env) {
      const { ctx: c, W, CELL, COLS, rng, pal, ambient } = env;
      // the lobby below, seen through the balusters
      c.fillStyle = lin(c, 0, 0, 0, CELL, [0, '#120a06', 0.6, '#1e120a', 1, '#0d0805']); c.fillRect(0, 0, W, CELL);
      for (let i = 0; i < 4; i++) { const gx = W * (0.12 + 0.25 * i) + rng() * 40; glowEll(c, gx, CELL * 0.55, CELL * 1.6, CELL * 0.6, pal.lamp, 0.35); ambient.lamps.push({ x: gx, y: CELL * 0.5, color: pal.lamp, r: CELL, kind: 'chandelier' }); }
      const stone = pal.wallA, ry0 = CELL * 0.22, ry1 = CELL * 0.85;
      // balusters
      const step = CELL / 4;
      for (let x = step / 2; x < W; x += step) {
        c.fillStyle = cyl(c, x - 4, 8, stone); c.fillRect(x - 4, ry0 + 6, 8, ry1 - ry0 - 6);
        c.fillStyle = cyl(c, x - 6, 12, stone); c.beginPath(); c.ellipse(x, ry0 + (ry1 - ry0) * 0.55, 6.5, 9, 0, 0, TAU); c.fill();
        c.fillStyle = cyl(c, x - 6, 12, stone); c.fillRect(x - 6, ry1 - 5, 12, 5);
      }
      c.fillStyle = lin(c, 0, ry0, 0, ry0 + 8, [0, shade(stone, 0.25), 0.5, stone, 1, shade(stone, -0.35)]); c.fillRect(0, ry0, W, 8);
      c.fillStyle = lin(c, 0, ry1, 0, CELL, [0, shade(stone, 0.15), 0.5, shade(stone, -0.1), 1, shade(stone, -0.45)]); c.fillRect(0, ry1, W, CELL - ry1);
      c.fillStyle = lin(c, 0, ry0 - 3, 0, ry0, [0, shade(pal.rail, 0.3), 1, shade(pal.rail, -0.3)]); c.fillRect(0, ry0 - 3, W, 3);
      // columns every 4 cells
      for (let k = 2; k < COLS; k += 4) { const x = k * CELL - CELL * 0.22, w = CELL * 0.44; c.fillStyle = cyl(c, x, w, shade(stone, 0.05)); c.fillRect(x, 0, w, CELL); c.fillStyle = shade(stone, -0.25); c.fillRect(x - 3, CELL - 10, w + 6, 10); c.fillStyle = shade(stone, 0.1); c.fillRect(x - 3, 0, w + 6, 6); }
      baseboard(env, shade(stone, -0.3));
    },
    racks(env) {
      const { ctx: c, W, CELL, COLS, rng, pal, ambient } = env;
      c.fillStyle = lin(c, 0, 0, 0, CELL, [0, pal.wallB, 0.5, pal.wallA, 1, shade(pal.wallB, -0.2)]); c.fillRect(0, 0, W, CELL);
      const bottle = (x, y, r) => { c.fillStyle = rad(c, x - r * 0.35, y - r * 0.35, 0, r, [0, '#4f8a5a', 0.4, '#1f4a2c', 1, '#0b1a10']); c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, TAU); c.fill(); };
      for (let k = 0; k < COLS; k++) {
        const x = k * CELL;
        if (k % 4 === 3) {   // shelf section w/ standing bottles + banker lamp
          c.fillStyle = shade(pal.wallB, -0.3); c.fillRect(x + 4, 4, CELL - 8, CELL * 0.8);
          for (let s = 0; s < 2; s++) { const sy = CELL * (0.38 + s * 0.4); c.fillStyle = shade(pal.wallA, 0.15); c.fillRect(x + 4, sy, CELL - 8, 3);
            for (let b = 0; b < 5; b++) { const bx = x + 9 + b * ((CELL - 16) / 5), bh = CELL * (0.22 + rng() * 0.08), col = ['#3d7d4a', '#7a2a2a', '#c8a44a', '#2f5d8a'][Math.floor(rng() * 4)]; c.fillStyle = lin(c, bx, 0, bx + 6, 0, [0, shade(col, -0.3), 0.4, shade(col, 0.2), 1, shade(col, -0.5)]); c.fillRect(bx, sy - bh, 6, bh); c.fillRect(bx + 2, sy - bh - 5, 2, 5); c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(bx + 1, sy - bh + 2, 1.2, bh * 0.6); } }
          const lx = x + CELL / 2, ly = CELL * 0.2; glowEll(c, lx, ly + 10, CELL * 0.45, CELL * 0.35, pal.lamp, 0.55);
          c.fillStyle = lin(c, lx - 12, ly, lx + 12, ly, [0, '#0f3d2a', 0.4, '#2d7a52', 1, '#0a2a1c']); c.beginPath(); c.moveTo(lx - 12, ly + 6); c.quadraticCurveTo(lx, ly - 8, lx + 12, ly + 6); c.closePath(); c.fill();
          c.fillStyle = 'rgba(255,235,180,0.9)'; c.beginPath(); c.ellipse(lx, ly + 6, 9, 2.5, 0, 0, TAU); c.fill(); c.fillStyle = shade(pal.rail, -0.2); c.fillRect(lx - 1, ly - 2, 2, 8);
          ambient.lamps.push({ x: lx, y: ly, color: pal.lamp, r: CELL * 0.6, kind: 'banker' });
        } else {             // diamond rack of bottle ends
          c.fillStyle = shade(pal.wallB, -0.25); c.fillRect(x + 3, 3, CELL - 6, CELL * 0.82);
          const g = CELL / 5;
          for (let ry = 0; ry < 4; ry++) for (let cx = 0; cx < 5; cx++) { const bx = x + 3 + g * 0.5 + cx * (CELL - 6) / 5, by = 3 + g * 0.5 + ry * (CELL * 0.82 - 6) / 4; if ((cx + ry) % 2 === 0) bottle(bx, by, g * 0.36); else { c.fillStyle = 'rgba(0,0,0,0.5)'; c.beginPath(); c.arc(bx, by, g * 0.34, 0, TAU); c.fill(); } }
          c.strokeStyle = 'rgba(255,255,255,0.05)'; c.lineWidth = 1; for (let i = -4; i < 6; i++) { c.beginPath(); c.moveTo(x + i * g, 3); c.lineTo(x + i * g + CELL * 0.82, CELL * 0.85); c.stroke(); c.beginPath(); c.moveTo(x + i * g, CELL * 0.85); c.lineTo(x + i * g + CELL * 0.82, 3); c.stroke(); }
        }
      }
      neonText(env, 'SOMMELIER', W * 0.5, CELL * 0.42, CELL * 0.34, pal.neonSign, 8);
      c.fillStyle = lin(c, 0, CELL * 0.85, 0, CELL * 0.85 + 4, [0, shade(pal.rail, 0.3), 1, shade(pal.rail, -0.3)]); c.fillRect(0, CELL * 0.85, W, 4);
      baseboard(env, shade(pal.wallB, -0.1));
    },
    steel(env) {
      const { ctx: c, W, CELL, COLS, pal, ambient } = env;
      c.fillStyle = lin(c, 0, 0, 0, CELL, [0, pal.wallB, 0.5, pal.wallA, 1, shade(pal.wallB, -0.2)]); c.fillRect(0, 0, W, CELL);
      for (let k = 0; k < COLS; k++) { const x = k * CELL; c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(x, 0, 2, CELL); c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(x + 2, 0, 1, CELL);
        for (const [ox, oy] of [[8, 8], [CELL - 8, 8], [8, CELL * 0.7], [CELL - 8, CELL * 0.7]]) { c.fillStyle = rad(c, x + ox - 1, oy - 1, 0, 3, [0, 'rgba(255,255,255,0.5)', 1, 'rgba(0,0,0,0.6)']); c.beginPath(); c.arc(x + ox, oy, 2.5, 0, TAU); c.fill(); }
        if (k % 3 === 1) { const lx = x + CELL / 2, ly = CELL * 0.18; c.fillStyle = 'rgba(210,230,255,0.9)'; rr(c, lx - CELL * 0.3, ly - 2, CELL * 0.6, 4, 2); c.fill(); glowEll(c, lx, ly + 8, CELL * 0.6, CELL * 0.4, pal.lamp, 0.45); ambient.lamps.push({ x: lx, y: ly, color: pal.lamp, r: CELL * 0.7, kind: 'strip' }); }
      }
      c.fillStyle = c.createPattern(stripeTex(env.mk, 20, '#d9b13a', '#15161a'), 'repeat'); c.fillRect(0, CELL * 0.78, W, 6);
      baseboard(env, shade(pal.wallB, -0.1));
    },
    admin(env) {
      const { ctx: c, W, CELL, COLS, rng, pal, ambient } = env;
      c.fillStyle = lin(c, 0, 0, 0, CELL, [0, pal.wallB, 0.5, pal.wallA, 1, shade(pal.wallB, -0.15)]); c.fillRect(0, 0, W, CELL);
      for (let k = 0; k < COLS; k++) {
        const x = k * CELL;
        if (k % 4 === 0) {          // pigeonholes
          c.fillStyle = shade(pal.wallB, -0.2); c.fillRect(x + 4, 4, CELL - 8, CELL * 0.74);
          for (let r = 0; r < 4; r++) for (let q = 0; q < 4; q++) { const hx = x + 6 + q * (CELL - 12) / 4, hy = 6 + r * (CELL * 0.74 - 4) / 4, hw = (CELL - 12) / 4 - 2, hh = (CELL * 0.74 - 4) / 4 - 2; c.fillStyle = '#141412'; c.fillRect(hx, hy, hw, hh); if (rng() < 0.6) { c.fillStyle = mixc('#d8d0b8', '#8a8470', rng()); c.fillRect(hx + 2, hy + hh * 0.35, hw - 4, hh * 0.6); } }
        } else if (k % 4 === 2) {   // notice board / clock
          if (k % 8 === 2) { c.fillStyle = '#5a3d22'; c.fillRect(x + 6, 6, CELL - 12, CELL * 0.6); c.fillStyle = '#7d5a34'; c.fillRect(x + 9, 9, CELL - 18, CELL * 0.6 - 6); for (let p = 0; p < 5; p++) { c.fillStyle = mixc('#e8e0c8', '#c8c0a0', rng()); c.fillRect(x + 11 + rng() * (CELL - 30), 11 + rng() * (CELL * 0.35), 10 + rng() * 6, 12 + rng() * 6); c.fillStyle = '#c0392b'; c.beginPath(); c.arc(x + 14 + rng() * (CELL - 30), 12 + rng() * (CELL * 0.4), 1.5, 0, TAU); c.fill(); } }
          else { const cx = x + CELL / 2, cy = CELL * 0.36, r = CELL * 0.22; c.fillStyle = '#2a2a28'; c.beginPath(); c.arc(cx, cy, r + 3, 0, TAU); c.fill(); c.fillStyle = '#e8e2d0'; c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fill(); c.strokeStyle = '#222'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx, cy - r * 0.7); c.moveTo(cx, cy); c.lineTo(cx + r * 0.5, cy + r * 0.3); c.stroke(); }
        }
        if (k % 4 === 3) { const sx = x + CELL / 2, sy = CELL * 0.22; glowEll(c, sx, sy + 8, CELL * 0.5, CELL * 0.4, pal.lamp, 0.55); c.fillStyle = lin(c, sx - 10, sy, sx + 10, sy, [0, '#2a2a2a', 0.5, '#6a6a68', 1, '#1a1a1a']); c.beginPath(); c.moveTo(sx - 11, sy + 4); c.lineTo(sx + 11, sy + 4); c.lineTo(sx + 6, sy - 6); c.lineTo(sx - 6, sy - 6); c.closePath(); c.fill(); c.fillStyle = 'rgba(255,200,120,0.95)'; c.beginPath(); c.ellipse(sx, sy + 4, 9, 2.5, 0, 0, TAU); c.fill(); ambient.lamps.push({ x: sx, y: sy, color: pal.lamp, r: CELL * 0.6, kind: 'sodium' }); }
      }
      // pneumatic tube run
      const ty = CELL * 0.86; c.fillStyle = lin(c, 0, ty - 4, 0, ty + 4, [0, shade(pal.rail, -0.35), 0.4, shade(pal.rail, 0.35), 1, shade(pal.rail, -0.5)]); c.fillRect(0, ty - 4, W, 8);
      for (let k = 1; k < COLS; k += 5) { const x = k * CELL + CELL * 0.5; c.fillStyle = lin(c, x - 4, 0, x + 4, 0, [0, shade(pal.rail, -0.35), 0.4, shade(pal.rail, 0.35), 1, shade(pal.rail, -0.5)]); c.fillRect(x - 4, 0, 8, ty); c.fillStyle = shade(pal.rail, -0.1); rr(c, x - 7, ty - 12, 14, 16, 3); c.fill(); c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(x - 5, ty - 10, 3, 12); }
      baseboard(env, shade(pal.wallB, -0.15));
    },
    parapet(env) {
      const { ctx: c, W, CELL, rng, pal, ambient } = env;
      // sky + skyline
      c.fillStyle = lin(c, 0, 0, 0, CELL * 0.78, [0, '#05070f', 0.6, '#0e1526', 1, '#1a2540']); c.fillRect(0, 0, W, CELL * 0.78);
      const tints = ['#ff3d8f', '#4fb3ff', '#7cf9a5', '#e8c576'];
      for (let i = 0; i < 6; i++) { const gx = W * (i + 0.5) / 6 + (rng() - 0.5) * 80; c.fillStyle = rad(c, gx, CELL * 0.75, 0, CELL * 1.2, [0, rgba(tints[i % 4], 0.35), 1, 'rgba(0,0,0,0)']); c.fillRect(0, 0, W, CELL * 0.78); }
      let bx = -6;
      while (bx < W) { const bw = 10 + rng() * 26, bh = CELL * (0.2 + rng() * 0.55); c.fillStyle = mixc('#0a0e1a', '#1c2438', rng()); c.fillRect(bx, CELL * 0.78 - bh, bw, bh);
        for (let wy = CELL * 0.78 - bh + 3; wy < CELL * 0.76; wy += 5) for (let wx = bx + 3; wx < bx + bw - 3; wx += 4) if (rng() < 0.35) { c.fillStyle = rng() < 0.7 ? 'rgba(255,225,150,0.85)' : 'rgba(150,220,255,0.85)'; c.fillRect(wx, wy, 2, 2.4); }
        if (rng() < 0.2) { c.fillStyle = tints[Math.floor(rng() * 4)]; c.fillRect(bx + 2, CELL * 0.78 - bh - 3, bw - 4, 2); }
        bx += bw + 2 + rng() * 6; }
      // parapet coping + inner face
      c.fillStyle = lin(c, 0, CELL * 0.72, 0, CELL * 0.84, [0, shade(pal.wallA, 0.35), 0.5, shade(pal.wallA, 0.15), 1, shade(pal.wallA, -0.1)]); c.fillRect(0, CELL * 0.72, W, CELL * 0.12);
      c.fillStyle = lin(c, 0, CELL * 0.84, 0, CELL, [0, pal.wallA, 1, shade(pal.wallB, -0.2)]); c.fillRect(0, CELL * 0.84, W, CELL * 0.16);
      c.fillStyle = 'rgba(0,0,0,0.3)'; for (let x = 0; x < W; x += CELL) c.fillRect(x + CELL * 0.5, CELL * 0.72, 1.5, CELL * 0.28);
      // (the big THE CONTINENTAL neon is a free-standing prop — row 0 usually carries the lane here)
      if (!env.grid.rowHasPath(0)) { neonText(env, 'THE CONTINENTAL', W * 0.5, CELL * 0.36, CELL * 0.42, pal.neonSign, 10); ambient.lamps.push({ x: W * 0.5, y: CELL * 0.4, color: pal.neonSign, r: CELL * 2, kind: 'neon' }); }
      c.save(); c.globalCompositeOperation = 'multiply'; c.fillStyle = lin(c, 0, CELL, 0, CELL * 1.5, [0, 'rgba(0,0,0,0.3)', 1, 'rgba(0,0,0,0)']); c.fillRect(0, CELL, W, CELL * 0.5); c.restore();
    },
    cage(env) {
      const { ctx: c, W, CELL, COLS, rng, pal, ambient } = env;
      c.fillStyle = lin(c, 0, 0, 0, CELL, [0, pal.wallB, 0.5, pal.wallA, 1, shade(pal.wallB, -0.2)]); c.fillRect(0, 0, W, CELL);
      // block courses
      c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1.5;
      for (let r = 0; r < 4; r++) { const y = r * CELL / 4; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); for (let x = (r % 2) * CELL / 2; x < W; x += CELL) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + CELL / 4); c.stroke(); } }
      // chain-link + cage bars
      c.strokeStyle = 'rgba(200,200,200,0.14)'; c.lineWidth = 1;
      for (let i = -CELL; i < W + CELL; i += 9) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + CELL * 0.8, CELL * 0.8); c.stroke(); c.beginPath(); c.moveTo(i, CELL * 0.8); c.lineTo(i + CELL * 0.8, 0); c.stroke(); }
      for (let x = CELL * 0.5; x < W; x += CELL) { c.fillStyle = lin(c, x - 3, 0, x + 3, 0, [0, '#1a1917', 0.4, '#6d6660', 1, '#0d0c0b']); c.fillRect(x - 3, 0, 6, CELL * 0.86); }
      c.fillStyle = lin(c, 0, CELL * 0.8, 0, CELL * 0.86, [0, '#5a534e', 1, '#1a1715']); c.fillRect(0, CELL * 0.8, W, 6);
      // red emergency lights + one hanging work-lamp
      for (let k = 3; k < COLS; k += 7) { const lx = k * CELL + CELL / 2, ly = CELL * 0.16; c.fillStyle = '#3a0c0c'; rr(c, lx - 9, ly - 6, 18, 12, 3); c.fill(); c.fillStyle = pal.beacon; rr(c, lx - 6, ly - 4, 12, 8, 2); c.fill(); glowEll(c, lx, ly + 10, CELL * 0.9, CELL * 0.6, pal.beacon, 0.55); ambient.neon.push({ x: lx - 9, y: ly - 6, w: 18, h: 12, color: pal.beacon, kind: 'beacon' }); ambient.lamps.push({ x: lx, y: ly, color: pal.beacon, r: CELL * 1.2, kind: 'beacon' }); }
      const wx = W * 0.62, wy = CELL * 0.5; c.strokeStyle = '#111'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(wx, 0); c.lineTo(wx, wy - 8); c.stroke();
      c.fillStyle = lin(c, wx - 12, wy, wx + 12, wy, [0, '#2a2a28', 0.5, '#7a7a74', 1, '#1a1a18']); c.beginPath(); c.moveTo(wx - 12, wy + 6); c.lineTo(wx + 12, wy + 6); c.lineTo(wx + 5, wy - 8); c.lineTo(wx - 5, wy - 8); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,225,170,0.95)'; c.beginPath(); c.ellipse(wx, wy + 6, 10, 3, 0, 0, TAU); c.fill(); glowEll(c, wx, wy + 14, CELL * 0.8, CELL * 0.6, pal.lamp, 0.55);
      ambient.lamps.push({ x: wx, y: wy, color: pal.lamp, r: CELL * 1.6, kind: 'worklamp', swing: true });
      ambient.sparks.push({ x: W * 0.3, y: CELL * 0.3, kind: 'conduit' });
      c.fillStyle = '#222'; c.fillRect(W * 0.3 - 30, CELL * 0.28, 60, 4); c.fillStyle = '#0a0a0a'; c.fillRect(W * 0.3 - 3, CELL * 0.26, 6, 8);
      baseboard(env, shade(pal.wallB, -0.15));
    },
  };

  // ---------- doors (spawn / exit) ----------
  function doorGeom(env, cell) {
    const { CELL } = env; const cx = cell.c * CELL + CELL / 2, cy = cell.r * CELL + CELL / 2;
    const dw = CELL * 0.74, dh = cell.r === 0 ? CELL * 0.86 : CELL * 1.05, bottom = cy + CELL * 0.34;
    return { x: cx - dw / 2, y: bottom - dh, w: dw, h: dh, cx, cy, bottom };
  }
  const DOORS = {
    walnut(env, cell, isExit) {
      const { ctx: c, pal, CELL } = env, g = doorGeom(env, cell);
      shadowEll(c, g.cx + 4, g.bottom + 2, g.w * 0.7, CELL * 0.14, 0.5);
      c.fillStyle = shade(pal.wallB, -0.2); rr(c, g.x - 5, g.y - 5, g.w + 10, g.h + 5, 4); c.fill();
      c.fillStyle = lin(c, g.x, g.y, g.x, g.y + g.h, [0, '#0a0604', 0.6, '#1c1008', 1, '#2a180c']); c.fillRect(g.x, g.y, g.w, g.h);   // dark opening
      if (isExit) { c.fillStyle = lin(c, g.x, g.y, g.x + g.w, g.y, [0, shade(pal.rail, -0.35), 0.5, shade(pal.rail, 0.25), 1, shade(pal.rail, -0.4)]); c.fillRect(g.x, g.y, g.w, g.h);
        c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(g.x + g.w / 2 - 1, g.y, 2, g.h); c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(g.x + 4, g.y + 6, g.w / 2 - 8, g.h - 12); c.fillRect(g.x + g.w / 2 + 4, g.y + 6, g.w / 2 - 8, g.h - 12);
        // floor indicator
        c.fillStyle = '#111'; rr(c, g.cx - 12, g.y - 12, 24, 10, 3); c.fill(); c.fillStyle = pal.gilt; c.font = ctxFont(8); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('▲', g.cx, g.y - 7);
      } else {
        for (let i = 0; i < 2; i++) { const lx = g.x + i * g.w / 2 + 2, lw = g.w / 2 - 4; c.fillStyle = lin(c, lx, g.y, lx + lw, g.y, [0, shade(pal.wallA, 0.1), 0.5, shade(pal.wallA, -0.05), 1, shade(pal.wallA, -0.35)]); c.fillRect(lx, g.y + 3, lw, g.h - 3);
          c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(lx + 4, g.y + 8, lw - 8, g.h * 0.36); c.fillRect(lx + 4, g.y + g.h * 0.52, lw - 8, g.h * 0.4);
          c.fillStyle = shade(pal.rail, 0.1); c.beginPath(); c.arc(i ? lx + 5 : lx + lw - 5, g.y + g.h * 0.55, 2.5, 0, TAU); c.fill(); }
        c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(g.cx - 1.5, g.y + 3, 3, g.h - 3);
      }
      c.fillStyle = shade(pal.rail, -0.1); c.fillRect(g.x - 5, g.y - 5, g.w + 10, 4);
    },
    steel(env, cell, isExit) {
      const { ctx: c, pal, CELL, mk } = env, g = doorGeom(env, cell);
      shadowEll(c, g.cx + 4, g.bottom + 2, g.w * 0.7, CELL * 0.14, 0.5);
      c.fillStyle = shade(pal.wallB, -0.2); rr(c, g.x - 6, g.y - 6, g.w + 12, g.h + 6, 3); c.fill();
      c.fillStyle = c.createPattern(stripeTex(mk, 16, '#d9b13a', '#15161a'), 'repeat'); c.fillRect(g.x - 6, g.y - 6, g.w + 12, 5);
      c.fillStyle = lin(c, g.x, g.y, g.x + g.w, g.y, [0, shade(pal.wallA, -0.2), 0.4, shade(pal.wallA, 0.25), 1, shade(pal.wallA, -0.4)]); c.fillRect(g.x, g.y, g.w, g.h);
      c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(g.cx - 1.5, g.y, 3, g.h);
      for (const [ox, oy] of [[6, 6], [g.w - 6, 6], [6, g.h - 8], [g.w - 6, g.h - 8]]) { c.fillStyle = rad(c, g.x + ox - 1, g.y + oy - 1, 0, 3, [0, 'rgba(255,255,255,0.6)', 1, 'rgba(0,0,0,0.6)']); c.beginPath(); c.arc(g.x + ox, g.y + oy, 2.6, 0, TAU); c.fill(); }
      const wy = g.y + g.h * 0.5; c.strokeStyle = shade(pal.rail, 0.1); c.lineWidth = 3; c.beginPath(); c.arc(g.cx, wy, g.w * 0.22, 0, TAU); c.stroke(); c.lineWidth = 2; for (let i = 0; i < 3; i++) { const a = i * TAU / 3; c.beginPath(); c.moveTo(g.cx, wy); c.lineTo(g.cx + Math.cos(a) * g.w * 0.22, wy + Math.sin(a) * g.w * 0.22); c.stroke(); }
      if (isExit) { c.fillStyle = '#0a2a12'; rr(c, g.cx - 14, g.y - 4, 28, 9, 2); c.fill(); c.fillStyle = '#7cf9a5'; c.font = ctxFont(7); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('EXIT', g.cx, g.y + 1); }
    },
    elevator(env, cell, isExit) {
      const { ctx: c, pal, CELL } = env, g = doorGeom(env, cell);
      shadowEll(c, g.cx + 4, g.bottom + 2, g.w * 0.7, CELL * 0.14, 0.5);
      c.fillStyle = lin(c, g.x - 6, g.y, g.x + g.w + 6, g.y, [0, shade(pal.rail, -0.4), 0.5, shade(pal.rail, 0.2), 1, shade(pal.rail, -0.5)]); rr(c, g.x - 6, g.y - 8, g.w + 12, g.h + 8, 3); c.fill();
      c.fillStyle = lin(c, g.x, g.y, g.x, g.y + g.h, [0, '#0a0906', 0.5, '#2a2416', 1, '#0d0b07']); c.fillRect(g.x, g.y, g.w, g.h);
      c.fillStyle = 'rgba(255,220,150,0.6)'; c.fillRect(g.cx - 2, g.y, 4, g.h);
      c.save(); c.globalCompositeOperation = 'screen'; c.fillStyle = lin(c, g.x, g.bottom, g.x, g.bottom + CELL * 0.4, [0, 'rgba(255,220,150,0.35)', 1, 'rgba(255,220,150,0)']); c.fillRect(g.x - 4, g.bottom, g.w + 8, CELL * 0.4); c.restore();
      const gap = isExit ? 0.30 : 0.42;
      for (let i = 0; i < 2; i++) { const lx = i ? g.cx + g.w * gap / 2 : g.x, lw = g.w * (0.5 - gap / 2); c.fillStyle = lin(c, lx, g.y, lx + lw, g.y, [0, shade(pal.rail, -0.35), 0.45, shade(pal.rail, 0.3), 1, shade(pal.rail, -0.45)]); c.fillRect(lx, g.y, lw, g.h); c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(lx + 3, g.y + 5, lw - 6, g.h - 10); }
      c.fillStyle = '#111'; rr(c, g.cx - 14, g.y - 16, 28, 11, 3); c.fill(); c.fillStyle = isExit ? '#7cf9a5' : pal.gilt; c.font = ctxFont(8); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(isExit ? '▼ B' : '▲ ' + (env.floor.id || 1), g.cx, g.y - 10);
    },
    lift(env, cell, isExit) {
      const { ctx: c, pal, CELL } = env, g = doorGeom(env, cell);
      shadowEll(c, g.cx + 4, g.bottom + 2, g.w * 0.75, CELL * 0.14, 0.55);
      c.fillStyle = lin(c, g.x - 8, g.y, g.x + g.w + 8, g.y, [0, '#2a2f38', 0.4, '#5a626e', 1, '#1a1e26']); rr(c, g.x - 8, g.y - 10, g.w + 16, g.h + 10, 3); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(g.x - 8, g.y - 10, g.w + 16, 4);
      c.fillStyle = lin(c, g.x, g.y, g.x, g.y + g.h, [0, '#06080c', 0.6, '#151a22', 1, '#0a0d12']); c.fillRect(g.x, g.y, g.w, g.h);
      c.fillStyle = 'rgba(255,190,90,0.7)'; c.fillRect(g.cx - 1.5, g.y, 3, g.h);
      for (let i = 0; i < 2; i++) { const lx = i ? g.cx + g.w * 0.18 : g.x, lw = g.w * 0.32; c.fillStyle = lin(c, lx, g.y, lx + lw, g.y, [0, '#3a414c', 0.5, '#6d7683', 1, '#262b33']); c.fillRect(lx, g.y, lw, g.h); c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(lx + 3, g.y + 4, lw - 6, g.h * 0.5); }
      c.fillStyle = '#1a0a0a'; rr(c, g.cx - 18, g.y - 9, 36, 10, 2); c.fill(); c.fillStyle = isExit ? '#7cf9a5' : '#ff5c5c'; c.font = ctxFont(7); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(isExit ? 'EXIT' : 'SERVICE', g.cx, g.y - 4);
      glowEll(c, g.cx, g.y - 4, 24, 10, isExit ? '#7cf9a5' : '#ff5c5c', 0.5);
    },
    cage(env, cell, isExit) {
      const { ctx: c, pal, CELL } = env, g = doorGeom(env, cell);
      shadowEll(c, g.cx + 4, g.bottom + 2, g.w * 0.7, CELL * 0.14, 0.5);
      c.fillStyle = '#0d0b0a'; rr(c, g.x - 5, g.y - 5, g.w + 10, g.h + 5, 3); c.fill();
      c.fillStyle = lin(c, g.x, g.y, g.x, g.y + g.h, [0, '#050404', 1, '#1a1210']); c.fillRect(g.x, g.y, g.w, g.h);
      glowEll(c, g.cx, g.y + g.h * 0.4, g.w * 0.6, g.h * 0.5, pal.beacon, 0.35);
      for (let i = 0; i <= 5; i++) { const bx = g.x + i * g.w / 5; c.fillStyle = lin(c, bx - 2, 0, bx + 2, 0, [0, '#1a1917', 0.4, '#7a736c', 1, '#0d0c0b']); c.fillRect(bx - 2, g.y, 4, g.h); }
      c.fillStyle = '#5a534e'; c.fillRect(g.x, g.y + g.h * 0.5 - 2, g.w, 4);
      c.strokeStyle = '#8a837c'; c.lineWidth = 2; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(g.x + 4, g.y + g.h * 0.5); c.quadraticCurveTo(g.cx, g.y + g.h * 0.62, g.x + g.w - 4, g.y + g.h * 0.5); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#c9a227'; c.beginPath(); c.arc(g.cx, g.y + g.h * 0.6, 4, 0, TAU); c.fill();
    },
  };

  // ---------- lamp pools ----------
  function paintLamps(env) {
    const { ctx: c, CELL, pal, grid, ambient, rng } = env;
    const r = grid.route, step = Math.max(6, Math.floor(r.length / 6));
    for (let i = Math.floor(step / 2); i < r.length; i += step) {
      const p = r[i], x = p.c * CELL + CELL / 2 + (rng() - 0.5) * CELL * 0.4, y = p.r * CELL + CELL / 2 + (rng() - 0.5) * CELL * 0.4;
      glowEll(c, x, y, CELL * 2.3, CELL * 2.3, pal.lamp, pal.lampA);
      ambient.lamps.push({ x, y, color: pal.lamp, r: CELL * 2.3, kind: 'ceiling' });
    }
  }
  function paintPropAO(env) {
    const { ctx: c, CELL, grid } = env;
    for (const p of grid.X) if (p.r > 0) shadowEll(c, p.c * CELL + CELL / 2 + CELL * 0.06, p.r * CELL + CELL * 0.72, CELL * 0.5, CELL * 0.22, 0.36);
  }

  // ---------- props (drawn in a 64-unit space, foot line at y=0, x centred; scaled by CELL/64) ----------
  const P = {};   // kind -> { w, h, footY, draw(c, rng, pal) }
  function box3(c, x, y, w, h, d, col, topCol) {   // upright box: front face (x,y..y+h) + oblique top face d deep, light from upper-left
    c.fillStyle = lin(c, x, 0, x + w, 0, [0, shade(col, 0.12), 0.5, col, 1, shade(col, -0.28)]); c.fillRect(x, y, w, h);
    c.fillStyle = topCol || shade(col, 0.28); c.beginPath(); c.moveTo(x, y); c.lineTo(x + d * 0.6, y - d); c.lineTo(x + w + d * 0.6, y - d); c.lineTo(x + w, y); c.closePath(); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x + w - 2, y, 2, h);
  }
  function cylV(c, x, y, w, h, col) {   // vertical cylinder standing on y (bottom), top ellipse
    c.fillStyle = cyl(c, x - w / 2, w, col); c.fillRect(x - w / 2, y - h, w, h);
    c.fillStyle = shade(col, 0.30); c.beginPath(); c.ellipse(x, y - h, w / 2, w * 0.22, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(x, y, w / 2, w * 0.22, 0, 0, Math.PI); c.fill();
  }
  function foot(c, w, a) { c.fillStyle = rad(c, 3, 2, 0, w * 0.5, [0, 'rgba(0,0,0,' + a + ')', 0.6, 'rgba(0,0,0,' + (a * 0.5) + ')', 1, 'rgba(0,0,0,0)']); c.beginPath(); c.ellipse(3, 2, w * 0.5, w * 0.16, 0, 0, TAU); c.fill(); }
  function leaf(c, x0, y0, x1, y1, w, col) {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 - 10, nx = -(y1 - y0), ny = (x1 - x0), L = Math.hypot(nx, ny) || 1;
    c.fillStyle = col; c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(mx + nx / L * w, my + ny / L * w, x1, y1); c.quadraticCurveTo(mx - nx / L * w * 0.6, my - ny / L * w * 0.6, x0, y0); c.fill();
  }
  const UPH = { brass: '#6b1a28', wine: '#b8912a', emerald: '#3d7a52' };
  P.palm = { w: 72, h: 104, footY: 100, draw(c, rng, pal) {
    foot(c, 46, 0.45);
    c.fillStyle = cyl(c, -14, 28, pal.rail || '#c9a227'); c.beginPath(); c.moveTo(-14, -30); c.lineTo(14, -30); c.lineTo(10, 0); c.lineTo(-10, 0); c.closePath(); c.fill();
    c.fillStyle = shade(pal.rail || '#c9a227', 0.2); c.fillRect(-16, -33, 32, 5); c.fillStyle = '#2a1a10'; c.beginPath(); c.ellipse(0, -33, 14, 4, 0, 0, TAU); c.fill();
    c.fillStyle = '#5a3a20'; c.fillRect(-2, -52, 4, 20);
    for (let i = 0; i < 8; i++) { const a = -Math.PI * 0.95 + i * (Math.PI * 0.9 / 7), L = 30 + rng() * 14, dr = 8 + rng() * 10; leaf(c, 0, -52, Math.cos(a) * L, -52 + Math.sin(a) * L + dr, 6 + rng() * 3, mixc('#1f5c33', '#4c9a4a', rng())); }
    for (let i = 0; i < 4; i++) { const a = -Math.PI * 0.8 + i * (Math.PI * 0.6 / 3), L = 22 + rng() * 8; leaf(c, 0, -54, Math.cos(a) * L, -54 + Math.sin(a) * L - 4, 5, mixc('#3d8a48', '#7cc46a', rng())); }
  } };
  P.column = { w: 44, h: 126, footY: 122, draw(c, rng, pal) {
    foot(c, 40, 0.5); const stone = '#e2d7c3';
    c.fillStyle = lin(c, -20, -12, -20, 0, [0, shade(stone, 0.05), 1, shade(stone, -0.35)]); c.fillRect(-20, -12, 40, 12);
    c.fillStyle = cyl(c, -13, 26, stone); c.fillRect(-13, -114, 26, 102);
    for (let i = 0; i < 5; i++) { c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(-13 + 2 + i * 5, -114, 1.2, 102); }
    c.fillStyle = lin(c, -19, -122, -19, -114, [0, shade(stone, 0.15), 1, shade(stone, -0.2)]); c.fillRect(-19, -122, 38, 8);
    c.fillStyle = shade(pal.rail || '#c9a227', 0.1); c.fillRect(-15, -114, 30, 3); c.fillRect(-15, -15, 30, 3);
  } };
  function sofa(c, rng, col, w) {
    foot(c, w, 0.45);
    for (const lx of [-w / 2 + 6, w / 2 - 6]) { c.fillStyle = '#c9a227'; c.fillRect(lx - 2, -6, 4, 6); }
    c.fillStyle = lin(c, 0, -46, 0, -20, [0, shade(col, 0.15), 1, shade(col, -0.15)]); rr(c, -w / 2 + 6, -46, w - 12, 26, 8); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.35)'; for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(-w / 2 + 14 + i * (w - 28) / 3, -40 + r * 10, 1.6, 0, TAU); c.fill(); }
    c.fillStyle = lin(c, 0, -24, 0, -6, [0, shade(col, 0.22), 1, shade(col, -0.05)]); rr(c, -w / 2 + 6, -24, w - 12, 18, 5); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(-1, -22, 2, 14);
    for (const s of [-1, 1]) { c.fillStyle = lin(c, s * (w / 2 - 6), 0, s * w / 2, 0, [0, shade(col, 0.1), 1, shade(col, -0.35)]); rr(c, s > 0 ? w / 2 - 12 : -w / 2, -32, 12, 26, 6); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,0.10)'; rr(c, -w / 2 + 8, -44, w - 16, 6, 3); c.fill();
  }
  P.sofa = { w: 70, h: 56, footY: 52, draw(c, rng, pal) { sofa(c, rng, UPH[pal.key] || '#6b1a28', 66); } };
  P.settee = { w: 70, h: 56, footY: 52, draw(c, rng, pal) { sofa(c, rng, '#d8c8a8', 62); } };
  P.luggage = { w: 58, h: 76, footY: 72, draw(c, rng, pal) {
    foot(c, 44, 0.45); const br = pal.rail || '#c9a227';
    for (const s of [-1, 1]) { c.fillStyle = cyl(c, s * 21 - 2, 4, br); c.fillRect(s * 21 - 2, -66, 4, 62); c.fillStyle = '#222'; c.beginPath(); c.arc(s * 18, -3, 4, 0, TAU); c.fill(); }
    c.strokeStyle = shade(br, 0.1); c.lineWidth = 3.5; c.beginPath(); c.moveTo(-21, -66); c.quadraticCurveTo(0, -78, 21, -66); c.stroke();
    c.fillStyle = lin(c, 0, -10, 0, -4, [0, '#7a1e2c', 1, '#3a0c14']); c.fillRect(-24, -10, 48, 6);
    const cases = [['#5a3a22', 40, 14], ['#2a2a30', 32, 12], ['#7a5a3a', 24, 10]]; let y = -10;
    for (const [col, w, h] of cases) { y -= h; c.fillStyle = lin(c, -w / 2, y, w / 2, y, [0, shade(col, 0.15), 1, shade(col, -0.25)]); rr(c, -w / 2, y, w, h, 2); c.fill(); c.fillStyle = shade(br, 0.1); c.fillRect(-w / 2 + 4, y + h / 2 - 1.5, 4, 3); c.fillRect(w / 2 - 8, y + h / 2 - 1.5, 4, 3); c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(-w / 2 + 2, y + 1, w - 4, 2); }
  } };
  P.deskConcierge = { w: 68, h: 62, footY: 58, draw(c, rng, pal) {
    foot(c, 60, 0.45); box3(c, -32, -34, 64, 34, 8, '#3a2214', '#5a3a24');
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(-28, -30, 26, 26); c.fillRect(2, -30, 26, 26); c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(-27, -29, 24, 2);
    c.fillStyle = shade(pal.rail || '#c9a227', 0.05); c.fillRect(-32, -35, 64, 2);
    c.fillStyle = '#e8c576'; c.beginPath(); c.arc(-14, -44, 5, Math.PI, 0); c.fill(); c.fillRect(-19, -44, 10, 2); c.fillStyle = '#fff2c0'; c.beginPath(); c.arc(-15, -46, 1.5, 0, TAU); c.fill();
    c.fillStyle = '#7a1e2c'; c.fillRect(6, -46, 18, 8); c.fillStyle = '#e8dcc0'; c.fillRect(8, -45, 14, 6);
  } };
  P.floorLamp = { w: 40, h: 106, footY: 102, draw(c, rng, pal) {
    foot(c, 26, 0.35); const br = pal.rail || '#c9a227';
    c.fillStyle = lin(c, -12, -4, 12, -4, [0, shade(br, -0.3), 0.5, shade(br, 0.2), 1, shade(br, -0.4)]); c.beginPath(); c.ellipse(0, -2, 12, 4, 0, 0, TAU); c.fill();
    c.fillStyle = cyl(c, -2, 4, br); c.fillRect(-2, -80, 4, 78);
    glowEll(c, 0, -74, 24, 16, pal.lamp || '#e8c576', 0.6);
    c.fillStyle = lin(c, -16, -100, 16, -100, [0, '#d8c8a8', 0.5, '#f4ecd8', 1, '#b8a888']); c.beginPath(); c.moveTo(-11, -100); c.lineTo(11, -100); c.lineTo(17, -78); c.lineTo(-17, -78); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,240,200,0.9)'; c.beginPath(); c.ellipse(0, -78, 17, 4, 0, 0, TAU); c.fill();
  } };
  P.balustrade = { w: 66, h: 56, footY: 52, draw(c, rng, pal) {
    foot(c, 60, 0.4); const stone = '#e0d4bf';
    c.fillStyle = lin(c, 0, -8, 0, 0, [0, shade(stone, 0.05), 1, shade(stone, -0.4)]); c.fillRect(-32, -8, 64, 8);
    for (let i = 0; i < 4; i++) { const x = -24 + i * 16; c.fillStyle = cyl(c, x - 3, 6, stone); c.fillRect(x - 3, -44, 6, 36); c.fillStyle = cyl(c, x - 5, 10, stone); c.beginPath(); c.ellipse(x, -24, 5.5, 8, 0, 0, TAU); c.fill(); c.fillRect(x - 5, -13, 10, 5); }
    c.fillStyle = lin(c, 0, -52, 0, -44, [0, shade(stone, 0.2), 0.5, stone, 1, shade(stone, -0.3)]); c.fillRect(-33, -52, 66, 8);
    c.fillStyle = shade(pal.rail || '#c9a227', 0.15); c.fillRect(-33, -54, 66, 2);
  } };
  P.cello = { w: 44, h: 100, footY: 96, draw(c, rng, pal) {
    foot(c, 30, 0.4); const wood = '#a3521f';
    c.fillStyle = '#222'; c.fillRect(-1, -6, 2, 6);
    c.fillStyle = lin(c, -16, 0, 16, 0, [0, shade(wood, -0.2), 0.4, shade(wood, 0.25), 1, shade(wood, -0.4)]);
    c.beginPath(); c.ellipse(0, -22, 16, 18, 0, 0, TAU); c.fill(); c.beginPath(); c.ellipse(0, -48, 13, 15, 0, 0, TAU); c.fill(); c.fillRect(-14, -46, 28, 22);
    c.fillStyle = 'rgba(0,0,0,0.5)'; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 7, -34, 1.5, 6, 0, 0, TAU); c.fill(); }
    c.fillStyle = '#1a0e08'; c.fillRect(-2, -92, 4, 60); c.fillRect(-4, -34, 8, 10); c.fillStyle = '#2a1a10'; c.beginPath(); c.arc(0, -94, 4, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 0.6; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-2 + i * 1.3, -90); c.lineTo(-2 + i * 1.3, -30); c.stroke(); }
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.ellipse(-6, -50, 4, 9, 0.3, 0, TAU); c.fill();
  } };
  P.musicStand = { w: 44, h: 84, footY: 80, draw(c, rng, pal) {
    foot(c, 26, 0.35); c.strokeStyle = '#1a1a1a'; c.lineWidth = 2.5; c.lineCap = 'round';
    for (const a of [-0.9, 0.9, 0]) { c.beginPath(); c.moveTo(0, -12); c.lineTo(Math.sin(a) * 12, a === 0 ? -2 : 0); c.stroke(); }
    c.fillStyle = '#222'; c.fillRect(-1.5, -56, 3, 46);
    c.fillStyle = lin(c, -16, -78, 16, -52, [0, '#1a1a1a', 1, '#3a3a3a']); c.beginPath(); c.moveTo(-16, -74); c.lineTo(16, -78); c.lineTo(17, -52); c.lineTo(-15, -48); c.closePath(); c.fill();
    c.fillStyle = '#efe6d0'; c.beginPath(); c.moveTo(-13, -72); c.lineTo(13, -75); c.lineTo(14, -54); c.lineTo(-12, -51); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 0.7; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(-11, -68 + i * 3.5); c.lineTo(11, -70.5 + i * 3.5); c.stroke(); }
  } };
  P.chair = { w: 36, h: 62, footY: 58, draw(c, rng, pal) {
    foot(c, 26, 0.35); const gold = '#c9a227';
    for (const x of [-12, 12, -9, 9]) { c.fillStyle = shade(gold, x > 10 || x < -10 ? -0.1 : -0.35); c.fillRect(x - 1.5, -22, 3, 22); }
    c.fillStyle = lin(c, 0, -26, 0, -18, [0, '#8a1e2e', 1, '#5a1020']); rr(c, -14, -27, 28, 9, 3); c.fill();
    c.strokeStyle = gold; c.lineWidth = 3; rr(c, -11, -56, 22, 30, 8); c.stroke(); c.fillStyle = 'rgba(122,30,46,0.9)'; rr(c, -8, -52, 16, 22, 5); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(-12, -25, 24, 2);
  } };
  P.wineRack = { w: 62, h: 104, footY: 100, draw(c, rng, pal) {
    foot(c, 52, 0.5); box3(c, -28, -92, 56, 92, 6, '#2a1a10', '#4a3020');
    c.fillStyle = '#120a06'; c.fillRect(-25, -89, 50, 86);
    for (let r = 0; r < 6; r++) for (let q = 0; q < 4; q++) { const bx = -19 + q * 12.6 + (r % 2) * 6, by = -82 + r * 14; if (bx > 22) continue; if (rng() < 0.75) { c.fillStyle = rad(c, bx - 2, by - 2, 0, 5.5, [0, '#4f8a5a', 0.4, '#1f4a2c', 1, '#0b1a10']); c.beginPath(); c.arc(bx, by, 5, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,0.4)'; c.beginPath(); c.arc(bx - 1.6, by - 1.6, 1.4, 0, TAU); c.fill(); } else { c.fillStyle = '#050302'; c.beginPath(); c.arc(bx, by, 5, 0, TAU); c.fill(); } }
    c.strokeStyle = 'rgba(160,110,60,0.35)'; c.lineWidth = 1.5; for (let i = -3; i < 6; i++) { c.beginPath(); c.moveTo(-25 + i * 14, -89); c.lineTo(-25 + i * 14 + 40, -3); c.stroke(); c.beginPath(); c.moveTo(-25 + i * 14, -3); c.lineTo(-25 + i * 14 + 40, -89); c.stroke(); }
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(-28, -92, 56, 3);
  } };
  P.cask = { w: 52, h: 62, footY: 58, draw(c, rng, pal) {
    foot(c, 44, 0.45); const wood = '#6b4423';
    c.fillStyle = '#2a1a10'; c.fillRect(-20, -6, 40, 6);
    c.fillStyle = cyl(c, -20, 40, wood); c.beginPath(); c.moveTo(-17, -6); c.quadraticCurveTo(-24, -30, -17, -52); c.lineTo(17, -52); c.quadraticCurveTo(24, -30, 17, -6); c.closePath(); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.18)'; for (let i = 1; i < 6; i++) c.fillRect(-20 + i * 6.5, -50, 1.2, 44);
    for (const y of [-14, -44]) { c.fillStyle = lin(c, 0, y - 3, 0, y + 3, [0, '#3a3a3a', 0.5, '#7a7a7a', 1, '#222']); c.fillRect(-21, y - 3, 42, 6); }
    c.fillStyle = shade(wood, 0.35); c.beginPath(); c.ellipse(0, -52, 17, 5, 0, 0, TAU); c.fill(); c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.arc(0, -52, 2.5, 0, TAU); c.fill();
  } };
  P.barCounter = { w: 70, h: 74, footY: 70, draw(c, rng, pal) {
    foot(c, 64, 0.5); box3(c, -33, -40, 66, 40, 8, '#2e1c10', '#1a1a1e');
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(-30, -36, 28, 30); c.fillRect(2, -36, 28, 30);
    c.fillStyle = shade(pal.rail || '#c9a227', 0.05); c.fillRect(-33, -6, 66, 3);
    c.fillStyle = lin(c, -33, -49, 33, -49, [0, '#111', 0.5, '#33333a', 1, '#0d0d10']); c.fillRect(-33, -49, 70, 9); c.fillStyle = 'rgba(255,255,255,0.14)'; c.fillRect(-31, -48, 60, 2);
    const cols = ['#3d7d4a', '#7a2a2a', '#c8a44a']; for (let i = 0; i < 3; i++) { const bx = -20 + i * 14, col = cols[i]; c.fillStyle = lin(c, bx, 0, bx + 7, 0, [0, shade(col, -0.3), 0.4, shade(col, 0.2), 1, shade(col, -0.5)]); c.fillRect(bx, -68, 7, 20); c.fillRect(bx + 2.5, -74, 2, 6); c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(bx + 1, -66, 1.2, 12); }
    for (const gx of [18, 26]) { c.fillStyle = 'rgba(200,230,255,0.35)'; c.beginPath(); c.moveTo(gx - 4, -60); c.lineTo(gx + 4, -60); c.lineTo(gx + 1, -52); c.lineTo(gx - 1, -52); c.closePath(); c.fill(); c.fillRect(gx - 0.7, -52, 1.4, 4); c.fillRect(gx - 3, -49, 6, 1.2); }
  } };
  P.stool = { w: 32, h: 56, footY: 52, draw(c, rng, pal) {
    foot(c, 22, 0.35); const br = pal.rail || '#c9a227';
    c.fillStyle = lin(c, -10, -3, 10, -3, [0, shade(br, -0.35), 0.5, shade(br, 0.2), 1, shade(br, -0.4)]); c.beginPath(); c.ellipse(0, -2, 10, 3.5, 0, 0, TAU); c.fill();
    c.fillStyle = cyl(c, -2, 4, br); c.fillRect(-2, -44, 4, 42); c.strokeStyle = shade(br, -0.1); c.lineWidth = 2; c.beginPath(); c.ellipse(0, -18, 8, 3, 0, 0, TAU); c.stroke();
    c.fillStyle = lin(c, 0, -52, 0, -44, [0, '#3d8a58', 1, '#1a4a2c']); c.beginPath(); c.ellipse(0, -48, 13, 5, 0, 0, TAU); c.fill(); c.fillRect(-13, -48, 26, 4); c.fillStyle = '#123a20'; c.beginPath(); c.ellipse(0, -44, 13, 5, 0, 0, Math.PI); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.ellipse(-3, -49, 6, 2, 0, 0, TAU); c.fill();
  } };
  P.tastingTable = { w: 60, h: 74, footY: 70, draw(c, rng, pal) {
    foot(c, 44, 0.45);
    c.fillStyle = lin(c, -14, -3, 14, -3, [0, '#3a2214', 0.5, '#5a3a24', 1, '#2a1a10']); c.beginPath(); c.ellipse(0, -2, 14, 5, 0, 0, TAU); c.fill();
    c.fillStyle = cyl(c, -3, 6, '#4a2e1c'); c.fillRect(-3, -34, 6, 32);
    c.fillStyle = lin(c, 0, -42, 0, -30, [0, '#4a2e1c', 1, '#2a1a10']); c.beginPath(); c.ellipse(0, -36, 26, 9, 0, 0, TAU); c.fill(); c.fillRect(-26, -36, 52, 4); c.fillStyle = '#5a3a24'; c.beginPath(); c.ellipse(0, -36, 26, 9, 0, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,0.10)'; c.beginPath(); c.ellipse(-6, -38, 12, 3, 0, 0, TAU); c.fill();
    glowEll(c, -8, -46, 20, 12, pal.lamp || '#f0b64a', 0.6);
    c.fillStyle = lin(c, -18, -60, 2, -60, [0, '#0f3d2a', 0.4, '#2d7a52', 1, '#0a2a1c']); c.beginPath(); c.moveTo(-19, -54); c.quadraticCurveTo(-8, -66, 3, -54); c.closePath(); c.fill(); c.fillStyle = 'rgba(255,235,180,0.9)'; c.beginPath(); c.ellipse(-8, -54, 9, 2.5, 0, 0, TAU); c.fill(); c.fillStyle = '#c9a227'; c.fillRect(-9, -52, 2, 14);
    for (const gx of [10, 18]) { c.fillStyle = 'rgba(180,40,60,0.55)'; c.beginPath(); c.ellipse(gx, -46, 3.5, 4, 0, 0, TAU); c.fill(); c.fillStyle = 'rgba(200,230,255,0.35)'; c.beginPath(); c.arc(gx, -48, 4, 0, TAU); c.fill(); c.fillRect(gx - 0.7, -44, 1.4, 5); c.fillRect(gx - 3, -39, 6, 1.2); }
  } };
  P.iceBucket = { w: 32, h: 68, footY: 64, draw(c, rng, pal) {
    foot(c, 22, 0.35); const br = pal.rail || '#c9a227';
    c.strokeStyle = shade(br, -0.1); c.lineWidth = 2; for (const a of [-0.5, 0.5, 0]) { c.beginPath(); c.moveTo(0, -30); c.lineTo(Math.sin(a) * 11, 0); c.stroke(); }
    c.fillStyle = lin(c, -12, 0, 12, 0, [0, '#8a8f98', 0.4, '#e6eaf0', 1, '#5a5f68']); c.beginPath(); c.moveTo(-12, -50); c.lineTo(12, -50); c.lineTo(9, -26); c.lineTo(-9, -26); c.closePath(); c.fill();
    c.fillStyle = '#c8ccd4'; c.beginPath(); c.ellipse(0, -50, 12, 4, 0, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.ellipse(0, -50, 9, 2.5, 0, 0, TAU); c.fill();
    c.fillStyle = lin(c, -1, 0, 5, 0, [0, '#1a4a2c', 0.4, '#3d8a58', 1, '#0d2a18']); c.fillRect(0, -64, 5, 16); c.fillStyle = '#c9a227'; c.fillRect(-0.5, -66, 6, 4);
  } };

  // vault
  P.vaultDoor = { w: 84, h: 116, footY: 110, draw(c, rng, pal, mk) {
    foot(c, 76, 0.55); const steel = '#4a525e', br = '#d3aa3a';
    box3(c, -38, -104, 76, 104, 6, steel, shade(steel, 0.3));
    c.fillStyle = c.createPattern(stripeTex(mk, 14, '#d9b13a', '#15161a'), 'repeat'); c.fillRect(-38, -8, 76, 6);
    for (const [ox, oy] of [[-32, -98], [32, -98], [-32, -14], [32, -14]]) { c.fillStyle = rad(c, ox - 1, oy - 1, 0, 3.5, [0, 'rgba(255,255,255,0.6)', 1, 'rgba(0,0,0,0.6)']); c.beginPath(); c.arc(ox, oy, 3, 0, TAU); c.fill(); }
    const cy0 = -56, R = 33;
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.beginPath(); c.arc(3, cy0 + 3, R + 3, 0, TAU); c.fill();
    c.fillStyle = lin(c, -R, cy0 - R, R, cy0 + R, [0, shade(br, 0.35), 0.5, br, 1, shade(br, -0.45)]); c.beginPath(); c.arc(0, cy0, R + 2, 0, TAU); c.fill();
    c.fillStyle = lin(c, -R, cy0 - R, R, cy0 + R, [0, shade(steel, 0.35), 0.5, steel, 1, shade(steel, -0.35)]); c.beginPath(); c.arc(0, cy0, R - 4, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 2; c.beginPath(); c.arc(0, cy0, R - 10, 0, TAU); c.stroke();
    for (let i = 0; i < 12; i++) { const a = i * TAU / 12; c.fillStyle = shade(br, 0.1); c.beginPath(); c.arc(Math.cos(a) * (R - 7), cy0 + Math.sin(a) * (R - 7), 1.8, 0, TAU); c.fill(); }
    c.fillStyle = lin(c, -10, cy0 - 10, 10, cy0 + 10, [0, shade(br, 0.4), 1, shade(br, -0.4)]); c.beginPath(); c.arc(0, cy0, 9, 0, TAU); c.fill();
    c.strokeStyle = shade(br, 0.25); c.lineWidth = 3.5; c.lineCap = 'round'; for (let i = 0; i < 3; i++) { const a = i * TAU / 3 + 0.4; c.beginPath(); c.moveTo(Math.cos(a) * 4, cy0 + Math.sin(a) * 4); c.lineTo(Math.cos(a) * 20, cy0 + Math.sin(a) * 20); c.stroke(); }
    c.strokeStyle = shade(br, 0.1); c.lineWidth = 3; c.beginPath(); c.arc(0, cy0, 20, 0, TAU); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.ellipse(-12, cy0 - 16, 10, 5, -0.7, 0, TAU); c.fill();
    for (const hy of [-88, -30]) { c.fillStyle = lin(c, -40, 0, -32, 0, [0, shade(steel, 0.3), 1, shade(steel, -0.4)]); rr(c, -41, hy, 9, 12, 2); c.fill(); }
  } };
  P.goldBars = { w: 62, h: 52, footY: 48, draw(c, rng, pal) {
    foot(c, 56, 0.5); glowEll(c, 0, -14, 34, 20, '#ffd66b', 0.45);
    c.fillStyle = lin(c, 0, -8, 0, 0, [0, '#6a4a2a', 1, '#3a2814']); c.fillRect(-28, -6, 56, 6); c.fillStyle = 'rgba(0,0,0,0.3)'; for (let i = 0; i < 4; i++) c.fillRect(-26 + i * 14, -6, 4, 6);
    const bar = (x, y) => { c.fillStyle = lin(c, x - 9, y - 6, x + 9, y + 3, [0, '#fff0a0', 0.4, '#e2b83a', 1, '#8a6410']); c.beginPath(); c.moveTo(x - 9, y); c.lineTo(x - 7, y - 7); c.lineTo(x + 7, y - 7); c.lineTo(x + 9, y); c.closePath(); c.fill(); c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(x - 6, y - 6.5, 12, 1.5); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x - 9, y - 1, 18, 1); };
    for (let i = 0; i < 3; i++) bar(-18 + i * 18, -6); for (let i = 0; i < 2; i++) bar(-9 + i * 18, -13); bar(0, -20);
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.font = ctxFont(4); c.textAlign = 'center'; c.fillText('999.9', 0, -8);
  } };
  P.coinPress = { w: 66, h: 100, footY: 94, draw(c, rng, pal) {
    foot(c, 56, 0.5); const body = '#2f5240', br = '#d3aa3a';
    box3(c, -24, -70, 48, 70, 8, body, shade(body, 0.3));
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(-20, -66, 40, 22); c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(-20, -66, 40, 2);
    c.fillStyle = lin(c, -14, -40, 14, -40, [0, '#111', 0.5, '#3a3a3a', 1, '#0a0a0a']); c.fillRect(-14, -40, 28, 22); c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(-12, -38, 24, 2);
    c.fillStyle = lin(c, -6, 0, 6, 0, [0, shade(br, -0.35), 0.5, shade(br, 0.3), 1, shade(br, -0.45)]); c.fillRect(-6, -84, 12, 14); c.fillStyle = shade(br, 0.1); c.fillRect(-16, -88, 32, 5);
    c.save(); c.translate(24, -52); c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.arc(2, 2, 17, 0, TAU); c.fill(); c.fillStyle = lin(c, -16, -16, 16, 16, [0, '#8a8f98', 0.5, '#4a4f58', 1, '#1a1e26']); c.beginPath(); c.arc(0, 0, 16, 0, TAU); c.fill(); c.strokeStyle = '#c8ccd4'; c.lineWidth = 2.5; for (let i = 0; i < 5; i++) { const a = i * TAU / 5; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * 12, Math.sin(a) * 12); c.stroke(); } c.beginPath(); c.arc(0, 0, 13, 0, TAU); c.stroke(); c.fillStyle = shade(br, 0.2); c.beginPath(); c.arc(0, 0, 3.5, 0, TAU); c.fill(); c.restore();
    for (let i = 0; i < 6; i++) { c.fillStyle = lin(c, -20 + i * 5, 0, -12 + i * 5, 0, [0, '#8a6410', 0.4, '#ffe08a', 1, '#c8962a']); c.beginPath(); c.ellipse(-16 + i * 5 - (i % 2) * 2, -3 - Math.floor(i / 2) * 2.5, 6, 2.2, 0, 0, TAU); c.fill(); }
    glowEll(c, 0, -30, 20, 12, '#ffd66b', 0.35); c.fillStyle = 'rgba(255,200,120,0.9)'; c.beginPath(); c.arc(-14, -30, 1.5, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(-23, -69, 3, 68);
  } };
  P.safe = { w: 58, h: 78, footY: 74, draw(c, rng, pal) {
    foot(c, 52, 0.5); const steel = '#3a414c', br = '#d3aa3a';
    for (const x of [-22, 18]) { c.fillStyle = '#111'; c.fillRect(x, -5, 6, 5); }
    box3(c, -26, -68, 52, 63, 8, steel, shade(steel, 0.35));
    c.fillStyle = 'rgba(0,0,0,0.3)'; rr(c, -22, -64, 44, 55, 2); c.fill(); c.fillStyle = lin(c, -20, 0, 20, 0, [0, shade(steel, 0.05), 1, shade(steel, -0.25)]); rr(c, -20, -62, 40, 51, 2); c.fill();
    c.fillStyle = lin(c, -8, -46, 8, -30, [0, shade(br, 0.4), 1, shade(br, -0.4)]); c.beginPath(); c.arc(0, -40, 8, 0, TAU); c.fill(); c.fillStyle = shade(steel, -0.2); c.beginPath(); c.arc(0, -40, 5, 0, TAU); c.fill(); c.fillStyle = shade(br, 0.3); c.fillRect(-0.7, -45, 1.4, 4);
    c.strokeStyle = shade(br, 0.1); c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(10, -30); c.lineTo(10, -20); c.moveTo(6, -25); c.lineTo(14, -25); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(-19, -61, 12, 2); c.fillStyle = shade(br, 0.1); c.font = ctxFont(4); c.textAlign = 'center'; c.fillText('CONTINENTAL', 0, -54);
  } };
  P.coinCart = { w: 62, h: 60, footY: 56, draw(c, rng, pal) {
    foot(c, 52, 0.45); const steel = '#4a525e';
    for (const x of [-18, 18]) { c.fillStyle = rad(c, x - 1, -5, 0, 6, [0, '#666', 1, '#111']); c.beginPath(); c.arc(x, -5, 6, 0, TAU); c.fill(); }
    box3(c, -26, -32, 52, 26, 6, steel, shade(steel, 0.25)); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(-23, -29, 46, 3);
    c.strokeStyle = shade(steel, 0.2); c.lineWidth = 3; c.beginPath(); c.moveTo(24, -32); c.lineTo(30, -52); c.lineTo(20, -54); c.stroke();
    glowEll(c, 0, -40, 26, 12, '#ffd66b', 0.4);
    for (let i = 0; i < 26; i++) { const x = -22 + rng() * 44, y = -34 - rng() * 12 * (1 - Math.abs(x) / 30); c.fillStyle = lin(c, x - 3, y, x + 3, y, [0, '#8a6410', 0.4, '#ffe08a', 1, '#c8962a']); c.beginPath(); c.ellipse(x, y, 3.2, 1.4, 0, 0, TAU); c.fill(); }
  } };
  // administration
  function desk(c, col) { box3(c, -32, -34, 64, 34, 8, col, shade(col, 0.35)); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(-28, -30, 20, 26); c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(-4, -30, 32, 12); c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(-27, -29, 18, 1.5); c.fillRect(-27, -19, 18, 1.5); c.fillStyle = '#c8ccd4'; c.fillRect(-20, -25, 5, 1.5); c.fillRect(-20, -15, 5, 1.5); }
  P.deskTypewriter = { w: 68, h: 70, footY: 66, draw(c, rng, pal) {
    foot(c, 60, 0.45); desk(c, '#4d5a4a');
    c.fillStyle = '#e8e2d0'; c.fillRect(-2, -56, 14, 16); c.fillStyle = 'rgba(0,0,0,0.3)'; for (let i = 0; i < 4; i++) c.fillRect(0, -53 + i * 3, 10, 0.8);
    c.fillStyle = lin(c, -14, -50, 14, -50, [0, '#111', 0.5, '#3a3a3a', 1, '#0a0a0a']); rr(c, -14, -50, 28, 12, 3); c.fill(); c.fillStyle = '#222'; c.fillRect(-16, -44, 32, 3); c.fillStyle = 'rgba(255,255,255,0.15)'; for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(-11 + i * 4.4 + r * 2, -47 + r * 3.5, 1.1, 0, TAU); c.fill(); }
    glowEll(c, 22, -46, 20, 12, pal.lamp || '#ffae42', 0.65);
    c.fillStyle = '#c9a227'; c.fillRect(24, -56, 2, 16); c.fillStyle = lin(c, 14, -60, 34, -60, [0, '#2a2a2a', 0.5, '#6a6a68', 1, '#1a1a1a']); c.beginPath(); c.moveTo(14, -54); c.lineTo(34, -54); c.lineTo(30, -62); c.lineTo(18, -62); c.closePath(); c.fill(); c.fillStyle = 'rgba(255,200,120,0.95)'; c.beginPath(); c.ellipse(24, -54, 9, 2.5, 0, 0, TAU); c.fill();
    c.fillStyle = '#e8e2d0'; c.fillRect(-30, -44, 12, 8); c.fillStyle = '#d8d0b8'; c.fillRect(-29, -46, 12, 8);
  } };
  P.deskPhone = { w: 68, h: 68, footY: 64, draw(c, rng, pal) {
    foot(c, 60, 0.45); desk(c, '#5a5348');
    c.fillStyle = '#1f4a2c'; c.fillRect(-26, -46, 30, 10);
    c.fillStyle = lin(c, 8, -52, 30, -52, [0, '#111', 0.5, '#3a3a3a', 1, '#0a0a0a']); rr(c, 8, -52, 22, 12, 3); c.fill(); c.fillStyle = '#222'; rr(c, 6, -58, 26, 6, 3); c.fill(); c.fillStyle = 'rgba(255,255,255,0.15)'; c.beginPath(); c.arc(19, -46, 4, 0, TAU); c.fill(); c.fillStyle = '#e8e2d0'; c.beginPath(); c.arc(19, -46, 2.5, 0, TAU); c.fill();
    c.fillStyle = '#7a4a2a'; c.fillRect(-16, -50, 10, 6); c.fillStyle = '#e8e2d0'; c.fillRect(-15, -55, 8, 6); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(-14, -53, 6, 0.8); c.fillRect(-14, -51, 6, 0.8);
    glowEll(c, -8, -40, 18, 8, '#ffae42', 0.25);
  } };
  P.crtDesk = { w: 68, h: 72, footY: 68, draw(c, rng, pal) {
    foot(c, 60, 0.45); desk(c, '#4a4d55');
    glowEll(c, 8, -50, 24, 16, pal.crt || '#7cf9a5', 0.55);
    c.fillStyle = lin(c, -6, -66, 22, -66, [0, '#d8d0b8', 0.5, '#e8e2d0', 1, '#a8a088']); rr(c, -6, -66, 28, 24, 3); c.fill(); c.fillStyle = '#c8c0a8'; c.fillRect(-2, -42, 20, 3);
    c.fillStyle = lin(c, 0, -63, 0, -46, [0, '#0a2a18', 1, '#0d3a22']); rr(c, -3, -63, 22, 18, 2); c.fill(); c.fillStyle = rgba(pal.crt || '#7cf9a5', 0.85); for (let i = 0; i < 5; i++) c.fillRect(-1, -61 + i * 3.2, 4 + rng() * 12, 1.2);
    c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(-2, -62, 8, 6);
    c.fillStyle = '#c8c0a8'; rr(c, -28, -44, 24, 8, 2); c.fill(); c.fillStyle = 'rgba(0,0,0,0.3)'; for (let i = 0; i < 6; i++) c.fillRect(-26 + i * 3.6, -42, 2.4, 4);
  } };
  P.filingCabinet = { w: 46, h: 100, footY: 96, draw(c, rng, pal) {
    foot(c, 40, 0.5); const col = '#5a6a5c'; box3(c, -20, -92, 40, 92, 8, col, shade(col, 0.35));
    for (let i = 0; i < 4; i++) { const y = -88 + i * 22; c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(-18, y, 36, 20); c.fillStyle = lin(c, -17, 0, 17, 0, [0, shade(col, 0.15), 1, shade(col, -0.2)]); c.fillRect(-17, y + 1, 34, 18); c.fillStyle = '#c8ccd4'; c.fillRect(-5, y + 9, 10, 2); c.fillStyle = '#e8e2d0'; c.fillRect(-12, y + 3, 10, 4); c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(-11, y + 4.5, 8, 0.8); }
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(-18, -66, 36, 3); c.fillStyle = '#e8e2d0'; c.fillRect(-14, -70, 26, 5); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(-12, -68, 20, 0.8);
  } };
  P.tubeStation = { w: 44, h: 108, footY: 104, draw(c, rng, pal) {
    foot(c, 34, 0.45); const br = '#a88a4a', dark = '#2c2f2c';
    box3(c, -16, -34, 32, 34, 6, dark, shade(dark, 0.4));
    c.fillStyle = cyl(c, -6, 12, br); c.fillRect(-6, -104, 12, 72); c.fillStyle = shade(br, 0.3); c.fillRect(-8, -104, 16, 4); c.fillRect(-8, -36, 16, 4);
    c.fillStyle = 'rgba(0,0,0,0.5)'; rr(c, -12, -30, 24, 22, 3); c.fill(); c.fillStyle = 'rgba(180,220,255,0.18)'; rr(c, -10, -28, 20, 18, 2); c.fill();
    c.fillStyle = lin(c, -6, 0, 6, 0, [0, shade(br, -0.3), 0.5, shade(br, 0.4), 1, shade(br, -0.4)]); rr(c, -6, -26, 12, 14, 5); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(-4, -100, 2, 60); c.fillStyle = shade(br, 0.1); c.beginPath(); c.arc(9, -22, 2.5, 0, TAU); c.fill();
  } };
  P.paperBoxes = { w: 58, h: 60, footY: 56, draw(c, rng, pal) {
    foot(c, 52, 0.45); const tan = '#b89a6a';
    box3(c, -26, -18, 52, 18, 8, tan, shade(tan, 0.25)); box3(c, -22, -36, 44, 18, 8, shade(tan, -0.05), shade(tan, 0.2)); box3(c, -14, -50, 30, 14, 7, shade(tan, 0.05), shade(tan, 0.3));
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(-26, -19, 52, 1.5); c.fillRect(-22, -37, 44, 1.5);
    c.fillStyle = '#e8e2d0'; c.fillRect(-18, -12, 12, 7); c.fillRect(-14, -30, 12, 7); c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(-16, -10, 8, 0.8); c.fillRect(-16, -8, 6, 0.8); c.fillRect(-12, -28, 8, 0.8);
    c.fillStyle = '#e8e2d0'; c.save(); c.translate(24, -6); c.rotate(0.3); c.fillRect(-6, -8, 12, 16); c.restore();
  } };
  P.waterCooler = { w: 36, h: 96, footY: 92, draw(c, rng, pal) {
    foot(c, 26, 0.4); box3(c, -12, -56, 24, 56, 6, '#d8d8d8', '#f0f0f0');
    c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(-10, -50, 20, 22); c.fillStyle = '#4fb3ff'; c.fillRect(-2, -34, 3, 4); c.fillStyle = '#ff5c5c'; c.fillRect(2, -34, 3, 4);
    c.fillStyle = 'rgba(80,170,255,0.55)'; c.beginPath(); c.moveTo(-11, -60); c.lineTo(11, -60); c.lineTo(9, -88); c.lineTo(-9, -88); c.closePath(); c.fill(); c.fillStyle = 'rgba(80,170,255,0.7)'; c.beginPath(); c.ellipse(0, -88, 9, 3, 0, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(-7, -84, 3, 20);
    c.fillStyle = '#e8e2d0'; c.fillRect(-14, -50, 4, 6); c.fillRect(-14, -44, 4, 6);
  } };
  // rooftop
  P.acUnit = { w: 68, h: 64, footY: 60, draw(c, rng, pal) {
    foot(c, 60, 0.5); const g = '#6d7278'; box3(c, -30, -50, 60, 50, 10, g, shade(g, 0.3));
    c.fillStyle = 'rgba(0,0,0,0.3)'; for (let i = 0; i < 9; i++) c.fillRect(-26, -46 + i * 4.5, 52, 2);
    c.fillStyle = shade(g, 0.15); c.beginPath(); c.ellipse(-2, -55, 18, 7, 0, 0, TAU); c.fill(); c.fillStyle = 'rgba(0,0,0,0.5)'; c.beginPath(); c.ellipse(-2, -55, 15, 5.5, 0, 0, TAU); c.fill(); c.strokeStyle = 'rgba(200,205,210,0.7)'; c.lineWidth = 1.5; for (let i = 0; i < 4; i++) { const a = i * TAU / 4; c.beginPath(); c.moveTo(-2, -55); c.lineTo(-2 + Math.cos(a) * 13, -55 + Math.sin(a) * 4.8); c.stroke(); }
    c.fillStyle = 'rgba(120,70,30,0.35)'; c.fillRect(-28, -22, 3, 22); c.fillRect(20, -30, 2, 30); c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(-29, -49, 3, 48);
    c.fillStyle = '#c8ccd4'; c.fillRect(30, -20, 8, 3); c.fillRect(35, -20, 3, 20);
  } };
  P.crates = { w: 60, h: 58, footY: 54, draw(c, rng, pal) {
    foot(c, 54, 0.45); const wood = '#8a6a3a';
    box3(c, -28, -26, 40, 26, 8, wood, shade(wood, 0.25)); box3(c, 6, -20, 22, 20, 6, shade(wood, -0.1), shade(wood, 0.2)); box3(c, -22, -48, 30, 22, 7, shade(wood, 0.05), shade(wood, 0.3));
    c.fillStyle = 'rgba(0,0,0,0.25)'; for (const [x, y, w, h] of [[-28, -26, 40, 26], [-22, -48, 30, 22], [6, -20, 22, 20]]) { c.fillRect(x, y + h * 0.33, w, 1.2); c.fillRect(x, y + h * 0.66, w, 1.2); c.fillRect(x + 2, y, 1.2, h); c.fillRect(x + w - 3, y, 1.2, h); }
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.font = ctxFont(5); c.textAlign = 'center'; c.fillText('HT', -8, -12); c.fillText('WICK', -7, -34);
  } };
  P.generator = { w: 58, h: 58, footY: 54, draw(c, rng, pal, mk) {
    foot(c, 52, 0.45); const y = '#8a7a2a'; box3(c, -26, -34, 52, 34, 8, y, shade(y, 0.3));
    c.fillStyle = 'rgba(0,0,0,0.3)'; for (let i = 0; i < 5; i++) c.fillRect(-22, -30 + i * 5, 20, 2.5); c.fillStyle = '#111'; rr(c, 4, -28, 16, 12, 2); c.fill(); c.fillStyle = '#7cf9a5'; c.fillRect(7, -25, 10, 2); c.fillStyle = '#ff5c5c'; c.fillRect(7, -21, 4, 2);
    c.fillStyle = cyl(c, 14, 6, '#333'); c.fillRect(14, -50, 6, 16); c.fillStyle = '#222'; c.fillRect(12, -52, 10, 3);
    c.strokeStyle = '#111'; c.lineWidth = 2; c.beginPath(); c.moveTo(-26, -6); c.quadraticCurveTo(-36, -2, -34, 4); c.stroke();
    c.fillStyle = c.createPattern(stripeTex(mk, 8, '#d9b13a', '#15161a'), 'repeat'); c.fillRect(-26, -4, 52, 3);
  } };
  P.radioMast = { w: 48, h: 140, footY: 134, draw(c, rng, pal) {
    foot(c, 30, 0.4); c.fillStyle = '#333'; c.fillRect(-14, -4, 28, 4);
    c.strokeStyle = '#8a8f98'; c.lineWidth = 2; c.beginPath(); c.moveTo(-12, -4); c.lineTo(-3, -124); c.moveTo(12, -4); c.lineTo(3, -124); c.stroke();
    c.strokeStyle = '#6a6f78'; c.lineWidth = 1; for (let i = 0; i < 12; i++) { const t = i / 12, y = -4 - t * 120, hw = 12 - t * 9; c.beginPath(); c.moveTo(-hw, y); c.lineTo(hw, y); c.moveTo(-hw, y); c.lineTo(hw * 0.9, y - 9); c.stroke(); }
    c.fillStyle = '#c8ccd4'; c.fillRect(-1.5, -134, 3, 12); glowEll(c, 0, -134, 12, 12, '#ff2a2a', 0.8); c.fillStyle = '#ff5c5c'; c.beginPath(); c.arc(0, -134, 3, 0, TAU); c.fill();
    c.fillStyle = 'rgba(200,205,210,0.9)'; c.beginPath(); c.ellipse(9, -96, 6, 8, 0.4, 0, TAU); c.fill(); c.strokeStyle = 'rgba(200,205,210,0.5)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-3, -110); c.lineTo(-22, 0); c.moveTo(3, -110); c.lineTo(22, 0); c.stroke();
  } };
  P.ventStack = { w: 42, h: 78, footY: 74, draw(c, rng, pal) {
    foot(c, 30, 0.4); const g = '#7a8088';
    c.fillStyle = shade(g, -0.2); c.beginPath(); c.ellipse(0, -2, 15, 5, 0, 0, TAU); c.fill(); cylV(c, 0, -3, 18, 60, g);
    c.fillStyle = lin(c, -20, -70, 20, -70, [0, shade(g, -0.2), 0.4, shade(g, 0.35), 1, shade(g, -0.4)]); c.beginPath(); c.moveTo(-20, -66); c.quadraticCurveTo(0, -80, 20, -66); c.lineTo(20, -62); c.quadraticCurveTo(0, -70, -20, -62); c.closePath(); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.beginPath(); c.ellipse(0, -63, 9, 3, 0, 0, TAU); c.fill(); c.fillStyle = 'rgba(120,70,30,0.3)'; c.fillRect(4, -50, 3, 40);
  } };
  P.waterTank = { w: 60, h: 100, footY: 94, draw(c, rng, pal) {
    foot(c, 52, 0.5); const g = '#5a5f66';
    c.strokeStyle = '#3a3f46'; c.lineWidth = 3; for (const x of [-20, -7, 7, 20]) { c.beginPath(); c.moveTo(x, -30); c.lineTo(x * 1.2, 0); c.stroke(); }
    cylV(c, 0, -30, 50, 46, g); for (const y of [-40, -60]) { c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(-25, y, 50, 2.5); }
    c.fillStyle = lin(c, -25, -80, 25, -80, [0, shade(g, -0.25), 0.4, shade(g, 0.3), 1, shade(g, -0.4)]); c.beginPath(); c.moveTo(-26, -76); c.lineTo(0, -92); c.lineTo(26, -76); c.closePath(); c.fill();
    c.strokeStyle = '#8a8f98'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(19, -76); c.lineTo(23, -2); c.moveTo(24, -76); c.lineTo(28, -2); c.stroke(); for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(19.5 + i * 0.5, -70 + i * 9); c.lineTo(24.5 + i * 0.5, -70 + i * 9); c.stroke(); }
    c.fillStyle = 'rgba(120,70,30,0.35)'; c.fillRect(-14, -70, 3, 30);
  } };
  P.satDish = { w: 58, h: 78, footY: 74, draw(c, rng, pal) {
    foot(c, 30, 0.4); c.fillStyle = '#333'; c.beginPath(); c.ellipse(0, -2, 12, 4, 0, 0, TAU); c.fill(); c.fillStyle = cyl(c, -3, 6, '#6a6f78'); c.fillRect(-3, -40, 6, 38);
    c.save(); c.translate(-2, -52); c.rotate(-0.5); c.fillStyle = lin(c, -20, -20, 20, 20, [0, '#e2e6ea', 0.5, '#9aa0a8', 1, '#4a4f58']); c.beginPath(); c.ellipse(0, 0, 22, 16, 0, 0, TAU); c.fill(); c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(0, 0, 18, 12, 0, 0, TAU); c.fill(); c.strokeStyle = '#c8ccd4'; c.lineWidth = 2; c.beginPath(); c.moveTo(-6, 6); c.lineTo(14, -14); c.stroke(); c.fillStyle = '#c8ccd4'; c.beginPath(); c.arc(14, -14, 3, 0, TAU); c.fill(); c.restore();
  } };
  P.neonSign = { w: 132, h: 122, footY: 116, draw(c, rng, pal) {
    foot(c, 110, 0.5); const s = '#4a505a';
    for (const x of [-52, 52]) { c.fillStyle = cyl(c, x - 4, 8, s); c.fillRect(x - 4, -48, 8, 48); c.fillStyle = '#333'; c.fillRect(x - 9, -3, 18, 3); }
    c.strokeStyle = '#3a4048'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(-52, -6); c.lineTo(52, -40); c.moveTo(-52, -40); c.lineTo(52, -6); c.stroke();
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(-58, -105, 122, 62); c.fillStyle = lin(c, 0, -110, 0, -46, [0, '#0e1118', 1, '#05070b']); c.fillRect(-62, -110, 124, 62);
    c.strokeStyle = 'rgba(255,255,255,0.10)'; c.lineWidth = 2; c.strokeRect(-61, -109, 122, 60);
    const neon = pal.neonSign || '#ff3d8f';
    c.save(); c.textAlign = 'center'; c.textBaseline = 'middle'; c.shadowColor = neon; c.shadowBlur = 14; c.fillStyle = neon;
    // fit the word to the 124px box whatever face is loaded (Black Ops One is wider than the Impact fallback)
    let fs = 22; c.font = ctxFont(fs); const mw = c.measureText('CONTINENTAL').width; if (mw > 106) fs = Math.max(11, Math.floor(22 * 106 / mw));
    c.font = ctxFont(14); for (let i = 0; i < 3; i++) c.fillText('THE', 0, -95); c.font = ctxFont(fs); for (let i = 0; i < 3; i++) c.fillText('CONTINENTAL', 0, -70);
    c.shadowBlur = 0; c.fillStyle = 'rgba(255,255,255,0.85)'; c.font = ctxFont(14); c.fillText('THE', 0, -95); c.font = ctxFont(fs); c.fillText('CONTINENTAL', 0, -70); c.restore();
    glowEll(c, 0, -80, 70, 34, neon, 0.35);
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1; for (const x of [-40, 0, 40]) { c.beginPath(); c.moveTo(x, -49); c.lineTo(x, -42); c.stroke(); }
  } };
  // pit
  P.oilDrum = { w: 48, h: 66, footY: 62, draw(c, rng, pal) {
    foot(c, 40, 0.5); const col = rng() < 0.5 ? '#8a2a20' : '#2a4a6a';
    cylV(c, 0, -2, 36, 56, col); for (const y of [-20, -40]) { c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(-18, y - 1.5, 36, 3); c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(-18, y - 3, 36, 1.5); }
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.beginPath(); c.arc(-6, -58, 3, 0, TAU); c.fill(); c.fillStyle = 'rgba(120,70,30,0.35)'; c.fillRect(-10, -50, 4, 34); c.fillRect(8, -30, 3, 24);
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.font = ctxFont(6); c.textAlign = 'center'; c.fillText('HT-7', 0, -26);
  } };
  P.ringPost = { w: 44, h: 104, footY: 100, draw(c, rng, pal) {
    foot(c, 30, 0.45); c.fillStyle = '#333'; c.fillRect(-12, -4, 24, 4); c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(-12, -4, 24, 1);
    c.fillStyle = cyl(c, -8, 16, '#b3221e'); rr(c, -8, -96, 16, 92, 6); c.fill(); c.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < 6; i++) c.fillRect(-8, -90 + i * 14, 16, 1.5);
    c.fillStyle = '#c8ccd4'; c.beginPath(); c.arc(0, -96, 6, 0, TAU); c.fill();
    for (let i = 0; i < 3; i++) { const y = -84 + i * 20; c.strokeStyle = i === 1 ? '#e8e2d0' : '#b3221e'; c.lineWidth = 3.5; c.lineCap = 'round'; c.beginPath(); c.moveTo(-8, y); c.quadraticCurveTo(-30, y + 6, -40, y + 24 + i * 6); c.stroke(); c.fillStyle = '#c8ccd4'; c.fillRect(-11, y - 2, 4, 4); }
  } };
  P.cagePanel = { w: 66, h: 104, footY: 100, draw(c, rng, pal) {
    foot(c, 60, 0.4); const s = '#5a534e';
    for (const x of [-30, 30]) { c.fillStyle = cyl(c, x - 3, 6, s); c.fillRect(x - 3, -98, 6, 98); c.fillStyle = '#333'; c.fillRect(x - 6, -3, 12, 3); }
    c.fillStyle = lin(c, 0, -100, 0, -94, [0, shade(s, 0.2), 1, shade(s, -0.3)]); c.fillRect(-33, -100, 66, 5);
    c.save(); c.beginPath(); c.rect(-27, -95, 54, 95); c.clip(); c.strokeStyle = 'rgba(215,215,220,0.30)'; c.lineWidth = 0.9;
    for (let i = -14; i < 14; i++) { c.beginPath(); c.moveTo(-30 + i * 9, -95); c.lineTo(-30 + i * 9 + 95, 0); c.stroke(); c.beginPath(); c.moveTo(-30 + i * 9 + 95, -95); c.lineTo(-30 + i * 9, 0); c.stroke(); }
    c.strokeStyle = 'rgba(0,0,0,0.20)'; for (let i = -14; i < 14; i++) { c.beginPath(); c.moveTo(-29 + i * 9, -95); c.lineTo(-29 + i * 9 + 95, 0); c.stroke(); } c.restore();
    c.strokeStyle = '#8a837c'; c.lineWidth = 2; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(-30, -70); c.quadraticCurveTo(0, -60, 30, -70); c.stroke(); c.setLineDash([]);
  } };
  P.workLamp = { w: 44, h: 104, footY: 100, draw(c, rng, pal) {
    foot(c, 30, 0.4); c.strokeStyle = '#d9b13a'; c.lineWidth = 3; c.lineCap = 'round'; for (const a of [-0.55, 0.55, 0.05]) { c.beginPath(); c.moveTo(0, -40); c.lineTo(Math.sin(a) * 18, 0); c.stroke(); }
    c.fillStyle = cyl(c, -2.5, 5, '#d9b13a'); c.fillRect(-2.5, -86, 5, 48);
    glowEll(c, 4, -84, 40, 30, '#ffe6b0', 0.7);
    c.fillStyle = lin(c, -14, -100, 14, -76, [0, '#2a2a28', 0.5, '#6a6a68', 1, '#1a1a18']); rr(c, -14, -100, 28, 20, 3); c.fill(); c.fillStyle = 'rgba(255,240,200,0.95)'; rr(c, -11, -97, 22, 14, 2); c.fill(); c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-11, -95 + i * 4); c.lineTo(11, -95 + i * 4); c.stroke(); }
    c.strokeStyle = '#111'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, -76); c.quadraticCurveTo(10, -50, 22, 0); c.stroke();
  } };
  P.crate = P.crates;

  function makeProp(mk, kind, rng, pal, k) {
    const spec = P[kind] || P.crates, w = Math.ceil(spec.w * k), h = Math.ceil(spec.h * k), footY = Math.round(spec.footY * k);
    const cv = mk(w, h), c = cv.getContext('2d'); c.save(); c.translate(w / 2, footY); c.scale(k, k); spec.draw(c, rng, pal, mk); c.restore();
    return { kind, canvas: cv, w, h, footY };
  }
  function buildProps(env) {
    const { mk, rng, pal, CELL, COLS, grid, ambient } = env, k = CELL / 64, out = [];
    // group X cells into horizontal runs (pairs), assign kinds from the palette list with variety
    const seen = new Set(), key = (c, r) => r * COLS + c; let pairIdx = 0;
    for (const p of grid.X) {
      if (seen.has(key(p.c, p.r))) continue;
      const run = [p]; seen.add(key(p.c, p.r));
      let c2 = p.c + 1; while (grid.X.some(q => q.c === c2 && q.r === p.r) && !seen.has(key(c2, p.r))) { run.push({ c: c2, r: p.r }); seen.add(key(c2, p.r)); c2++; }
      const kinds = pal.props[pairIdx % pal.props.length]; pairIdx++;
      run.forEach((cell, i) => {
        const kind = kinds[i % kinds.length], pr = makeProp(mk, kind, rng, pal, k);
        let x = cell.c * CELL + CELL / 2 + (rng() - 0.5) * CELL * 0.12, y = cell.r * CELL + CELL * 0.72 + (rng() - 0.5) * CELL * 0.08;
        if (kind === 'neonSign' && run.length > 1) x = (run[0].c + run[run.length - 1].c + 1) * CELL / 2;   // the sign spans the pair
        pr.x = Math.round(x); pr.y = Math.round(y); pr.cell = { c: cell.c, r: cell.r }; out.push(pr);
        if (kind === 'neonSign') { ambient.neon.push({ x: pr.x - 60 * k, y: pr.y - 108 * k, w: 120 * k, h: 60 * k, color: pal.neonSign || '#ff3d8f', kind: 'sign' }); ambient.lamps.push({ x: pr.x, y: pr.y - 80 * k, color: pal.neonSign || '#ff3d8f', r: CELL * 2, kind: 'neon' }); }
        if (kind === 'coinPress') ambient.sparks.push({ x: pr.x - 14 * k, y: pr.y - 30 * k, kind: 'press' });
        if (kind === 'radioMast') ambient.sparks.push({ x: pr.x, y: pr.y - 134 * k, kind: 'mast' });
        if (kind === 'workLamp') ambient.lamps.push({ x: pr.x + 4 * k, y: pr.y - 84 * k, color: '#ffe6b0', r: CELL * 1.6, kind: 'worklamp', swing: true });
        if (kind === 'goldBars' || kind === 'coinCart') ambient.lamps.push({ x: pr.x, y: pr.y - 14 * k, color: '#ffd66b', r: CELL * 0.8, kind: 'gold' });
        if (kind === 'crtDesk') ambient.lamps.push({ x: pr.x + 8 * k, y: pr.y - 50 * k, color: pal.crt || '#7cf9a5', r: CELL * 0.7, kind: 'crt' });
        if (kind === 'deskTypewriter' || kind === 'tastingTable' || kind === 'floorLamp') ambient.lamps.push({ x: pr.x, y: pr.y - 50 * k, color: pal.lamp, r: CELL * 0.8, kind: 'desk' });
      });
    }
    return out;
  }

  // ---------- bake ----------
  function bakeFloor(mk, floorDef, opts) {
    return new Promise((resolve) => {
      opts = Object.assign({ W: 1280, H: 768, CELL: 64 }, opts || {});
      const W = opts.W, H = opts.H, CELL = opts.CELL, COLS = Math.round(W / CELL), ROWS = Math.round(H / CELL);
      floorDef = floorDef || {};
      const key = PALETTES[floorDef.palette] ? floorDef.palette : 'brass';
      const pal = Object.assign({ key }, PALETTES[key]);
      const rng = mulberry32(0x5EED0 + ((floorDef.id || 1) * 7919) + key.length * 131);
      const grid = parseGrid(floorDef.map, COLS, ROWS);
      const cv = mk(W, H), ctx = cv.getContext('2d');
      const env = { ctx, mk, rng, W, H, CELL, COLS, ROWS, pal, grid, floor: floorDef, ambient: { rain: !!pal.rain, lamps: [], neon: [], sparks: [] } };
      env.grainT = grainTex(mk, rng, 96, 34);
      const pts = routePoints(grid, CELL, COLS, ROWS);
      BASES[pal.base](env);
      WALLS[pal.wall](env);                       // backdrop, one cell high — row-0 path is drawn over it
      paintGilded(env);
      PATHS[pal.path](env, pts); paintStray(env);
      const door = DOORS[pal.door] || DOORS.walnut;
      if (grid.S) door(env, grid.S, false); if (grid.E) door(env, grid.E, true);
      paintLamps(env);
      vignette(ctx, W, H, pal.key === 'neon' || pal.key === 'blood' ? 0.55 : pal.key === 'brass' ? 0.5 : 0.42);
      paintPropAO(env);
      const props = buildProps(env);
      resolve({ canvas: cv, props, ambient: env.ambient, wallH: CELL, cell: CELL, cols: COLS, rows: ROWS });
    });
  }
  global.CS_FLOORS = { bakeFloor, PALETTES, PROP_KINDS: Object.keys(P) };
})(typeof window !== 'undefined' ? window : globalThis);
