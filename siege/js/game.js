/* =========================================================================
   CONTINENTAL SIEGE v2 — the Phaser presentation. Graphics-first rebuild.
   RULES LIVE IN js/core.js (pure sim, 56px cells, BOARD_Y 48). This layer maps
   sim space → a 1280×768 screen (board 20×12×56 at (0,68), K = 1; HUD 44 above,
   24px cornice, 160px rail right, 28px legend below), renders state each frame,
   and turns the sim's event queue (returned by CS.step) into pictures + sound.
   Art is baked ONCE at boot from canvas: js/art/pepe.js (operatives/enemies),
   guns.js (on-chain gun art), fx.js, floors.js, title.js. Never draw per-frame canvas.
   ========================================================================= */
(function () {
  'use strict';
  const W = 1280, H = 768, CELL = 56;                // canvas; board = 20×12 cells at CELL 56 → 1120×672 (K = 1), offset (0,68); rail 160 right; 28px strip below
  const HUD_H = 44;                                  // top strip; 24px cornice between it and the board so row-0 walkers keep heads + hp bars visible
  const BX = 0, BY = 68, BW = CS.COLS * CELL, BH = CS.ROWS * CELL, RAIL_X = BX + BW; // HUD strip above, card rail right
  const K = CELL / CS.CELL;                          // sim px → screen px
  const SX = x => BX + (x - CS.BOARD_X) * K, SY = y => BY + (y - CS.BOARD_Y) * K, SR = r => r * K;
  const FONT = '"Black Ops One", Impact, sans-serif', MONO = 'Consolas, "Courier New", monospace';
  const GOLD = '#e8c576', GOLD_D = '#c9a227', DIM = '#7c8798', GREEN = '#7cf9a5', RED = '#ff5c5c', INK = '#cdd6e3';
  const AUD = window.CS_AUDIO;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const ART = { chars: {}, guns: {}, fx: null, ui: null, floors: {}, ready: false, wallet: null };
  const HOTKEYS = Object.keys(CS.TURRETS);

  // ---------------- progress ----------------
  // storage that never throws (private mode / quota / disabled storage): every record is best-effort
  const LS = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };
  function loadProg() { try { return JSON.parse(LS.get('cs_prog') || '{}'); } catch (e) { return {}; } }
  function saveProg(p) { LS.set('cs_prog', JSON.stringify(p)); }
  function starsFor(floor, diff) { const p = loadProg(); return (p.stars && p.stars['f' + floor + '_' + diff]) || 0; }
  function setStars(floor, diff, n) { const p = loadProg(); p.stars = p.stars || {}; const k = 'f' + floor + '_' + diff; p.stars[k] = Math.max(p.stars[k] || 0, n); saveProg(p); }
  function starsAny(floor) { let b = 0; for (const d in CS.DIFFS) b = Math.max(b, starsFor(floor, d)); return b; }
  // campaign is 9 floors now (THE PIT keeps id 7 and is not part of the chain)
  function unlockedFloor() { let u = CS.CAMPAIGN[0]; for (const id of CS.CAMPAIGN) { if (starsAny(id) > 0) { const nx = CS.nextFloor(id); if (nx) u = nx; } } return u; }
  function isUnlocked(id) { const i = CS.CAMPAIGN.indexOf(id); if (i <= 0) return true; return starsAny(CS.CAMPAIGN[i - 1]) > 0; }
  function todayUTC() { const d = new Date(); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); }
  const ACCOUNTS = [
    ['Room 217 has been “occupied” since 1969. Housekeeping does not knock.', 'The concierge logs every marker spent on the marble. Tonight’s count: yours.', 'The front desk keeps a list of names that check in and never out. Yours is penciled.'],
    ['The balcony rail is polished twice daily. Blood is bad for brass.', 'Cassian tips the string quartet to play louder between nine and ten.', 'A marker signed on the mezzanine bought the east stairwell. Both directions.'],
    ['The ’86 vintage is a code. Nobody drinks the ’86.', 'Medics bill the house in gold coins. The house bills you in favors.', 'Ares once ordered the tasting menu and signed the tip in knives.'],
    ['The coin press runs at night. The night runs long.', 'Shield crews are paid by the dent. Audit their kevlar invoices.', 'One coin in every hundred is struck with the Director’s profile. Keep it.'],
    ['Accounts payable pays in lead when the ink runs dry.', 'Ghost payroll: forty-one names, no faces, one desk that is always warm.', 'The lift to the roof requires a signature. In triplicate. Notarized.'],
    ['The helipad was poured over the old garden. Some things still grow.', 'The Director’s dashes are timed to the lighthouse across the bay. Count five.', 'KJP GEAR requisitions route through the rooftop office. All sales final, half burned.'],
    ['Five service corridors, one menu. The sous-chef bones everything the same way.', 'The walk-in holds more than veal. Housekeeping stopped asking in ’94.', 'Every plate that leaves the pass is counted. So is every man.'],
    ['The quartet has played the same four bars since the Marquis bought the room.', 'The parquet was laid over the old vault door. Listen for the hollow step.', 'A waltz is three counts. So is the reload he taught them.'],
    ['The scotch is 1926. The Elder is older. He does not drink it.', 'The penthouse has one way in and no way to be late.', 'Whoever holds this floor holds the ledger. Nobody has held it twice.'],
  ];
  const redact = (line, idx) => line.split(' ').map((w, i) => ((i + idx) % 4 === 0 ? w.slice(0, 1) + '█'.repeat(Math.max(2, w.length - 1)) : '█'.repeat(Math.max(2, w.length)))).join(' ');

  // ---------------- NFT gun → tower envelope (≤ +10% DPS, honest to the card) ----------------
  const GUN_MODS = { // by WICK ARSENAL gun type: the card's printed character, kept inside the envelope
    1: { dmgMult: 1.02, rofMult: 1.03, rangeMult: 1.00 }, 2: { dmgMult: 0.96, rofMult: 1.12, rangeMult: 0.98 }, 3: { dmgMult: 1.09, rofMult: 0.98, rangeMult: 0.96 },
    4: { dmgMult: 1.06, rofMult: 1.00, rangeMult: 1.06 }, 5: { dmgMult: 1.03, rofMult: 1.06, rangeMult: 1.00 },
    11: { dmgMult: 1.05, rofMult: 1.04, rangeMult: 1.00 }, 12: { dmgMult: 1.00, rofMult: 1.09, rangeMult: 1.00 }, 13: { dmgMult: 1.09, rofMult: 1.00, rangeMult: 0.98 },
    14: { dmgMult: 1.06, rofMult: 1.02, rangeMult: 1.06 }, 15: { dmgMult: 1.07, rofMult: 1.02, rangeMult: 1.00 }, 16: { dmgMult: 1.05, rofMult: 1.04, rangeMult: 1.00 },
  };
  const GUN_FOR_TURRET = { pistol: [1, 11, 12, 15], smg: [2, 12], shotgun: [3, 13], sniper: [4, 14], gatling: [15, 5, 16] }; // which owned types can skin which operative
  function gunModsFor(wallet) {
    const out = {};
    if (!wallet || !wallet.gunTypes) return out;
    for (const def in GUN_FOR_TURRET) {
      const t = GUN_FOR_TURRET[def].find(x => wallet.gunTypes.includes(x));
      // full core mod shape — core does `0.7 + mod.refundBonus` unguarded on sell (NaN coins otherwise), and reads coinKill/markChance
      if (t) { const m = GUN_MODS[t]; const p = m.dmgMult * m.rofMult; const s = p > 1.10 ? Math.sqrt(1.10 / p) : 1; out[def] = { dmgMult: +(m.dmgMult * s).toFixed(4), rofMult: +(m.rofMult * s).toFixed(4), rangeMult: m.rangeMult, refundBonus: 0, coinKill: 0, markChance: 0, gunType: t, gunName: (window.WICK_GUNS && window.WICK_GUNS[t] ? window.WICK_GUNS[t].name : 'GUN ' + t) }; }
    }
    return out;
  }

  // ---------------- text helpers ----------------
  function txt(scene, x, y, s, size, color, extra) {
    return scene.add.text(x, y, s, Object.assign({ fontFamily: FONT, fontSize: size + 'px', color: color || INK }, extra || {}));
  }
  // Consolas has no ⛁ (U+26C1) — the coin glyph only exists in the display face — so mono text swaps it for ¤ (Latin-1, everywhere)
  const MONO_FIX = v => (typeof v === 'string' ? v.replace(/⛁/g, '¤') : v);
  function mono(scene, x, y, s, size, color, extra) {
    const t = scene.add.text(x, y, MONO_FIX(s), Object.assign({ fontFamily: MONO, fontSize: size + 'px', color: color || INK }, extra || {}));
    const orig = t.setText.bind(t); t.setText = v => orig(Array.isArray(v) ? v.map(MONO_FIX) : MONO_FIX(v)); return t;
  }
  function nine(scene, key, x, y, w, h, depth) {
    const n = ART.ui && ART.ui.NINE ? ART.ui.NINE : { left: 14, top: 14, right: 14, bottom: 14 };
    const o = scene.add.nineslice(x, y, key, undefined, w, h, n.left, n.right, n.top, n.bottom).setOrigin(0);
    if (depth != null) o.setDepth(depth);
    return o;
  }
  function button(scene, x, y, w, h, label, cb, opts) {
    opts = opts || {};
    const bg = scene.add.nineslice(x, y, opts.hot ? 'ui_btnHot' : 'ui_btn', undefined, w, h, 14, 14, 14, 14).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(opts.depth || 20);
    const t = txt(scene, x, y, label, opts.size || 15, opts.hot ? '#0b0e15' : (opts.color || GOLD)).setOrigin(0.5).setDepth((opts.depth || 20) + 1);
    if (opts.sub) mono(scene, x, y + h / 2 + 12, opts.sub, 10, DIM).setOrigin(0.5).setDepth((opts.depth || 20) + 1);
    bg.on('pointerover', () => { bg.setTexture('ui_btnHot'); t.setColor('#0b0e15'); });
    bg.on('pointerout', () => { bg.setTexture(opts.hot ? 'ui_btnHot' : 'ui_btn'); t.setColor(opts.hot ? '#0b0e15' : (opts.color || GOLD)); });
    bg.on('pointerdown', () => { AUD.unlock(); AUD.play('ui'); cb(); });
    return { bg, t, destroy() { bg.destroy(); t.destroy(); } };
  }

  // =====================================================================
  //  BOOT — bake the whole WICK world into textures
  // =====================================================================
  class Boot extends Phaser.Scene {
    constructor() { super('Boot'); }
    create() {
      const g = this.add.graphics();
      g.fillStyle(0x05070c, 1).fillRect(0, 0, W, H);
      const t = txt(this, W / 2, H / 2 - 40, 'THE CONTINENTAL', 44, GOLD).setOrigin(0.5);
      const s = mono(this, W / 2, H / 2 + 12, 'RACKING THE HOUSE IRON…', 12, DIM).setOrigin(0.5);
      const bar = this.add.graphics();
      const prog = (f, label) => { bar.clear().fillStyle(0x222b38, 1).fillRect(W / 2 - 200, H / 2 + 40, 400, 6).fillStyle(0xe8c576, 1).fillRect(W / 2 - 200, H / 2 + 40, 400 * f, 6); s.setText(label); };
      this.bakeAll(prog).then(() => { ART.ready = true; this.scene.start('Title'); }).catch(e => { console.error('bake failed', e); s.setText('BAKE FAILED — ' + e.message).setColor(RED); });
    }
    async bakeAll(prog) {
      const tex = this.textures;
      // The display face MUST be resident before anything is baked — every canvas baker (title sign,
      // neon, cards) measures and paints with it; on a slow link the woff2 can land AFTER Boot starts
      // and the fallback face would be baked in forever. Wait for it (bounded), then re-measure the boot text.
      prog(0.02, 'WAKING THE HOUSE FONT');
      try { if (document.fonts && document.fonts.load) await Promise.race([Promise.all([document.fonts.load('58px "Black Ops One"'), document.fonts.load('bold 22px "Black Ops One"')]), new Promise(r => setTimeout(r, 4000))]); } catch (e) {}
      this.children.list.forEach(o => { if (o.type === 'Text') o.updateText(); });
      const addSheet = (key, sheet) => { if (tex.exists(key)) tex.remove(key); tex.addSpriteSheet(key, sheet.canvas, { frameWidth: sheet.frameW, frameHeight: sheet.frameH }); };
      const addCanvas = (key, cv) => { if (tex.exists(key)) tex.remove(key); tex.addCanvas(key, cv); };
      // 1. operatives
      const ops = Object.keys(CS_CAST.OPERATIVES);
      for (let i = 0; i < ops.length; i++) {
        const id = ops[i], sp = CS_CAST.OPERATIVES[id];
        const b = CS_PEPE.bakeCharacter(mk, sp, { cellW: 96, cellH: 112 });
        addSheet('op_' + id + '_stand', b.stand); addSheet('op_' + id + '_run', b.run);
        this.anims.create({ key: 'op_' + id + '_stand', frames: this.anims.generateFrameNumbers('op_' + id + '_stand', { start: 0, end: 5 }), frameRate: 6, repeat: -1 });
        addCanvas('portrait_' + id, CS_PEPE.bakePortrait(mk, sp, 120));
        ART.chars['op_' + id] = { fist: b.fist, fist2: b.fist2, frameW: 96, frameH: 112, baseY: b.stand.baseY, spec: sp };
        prog(0.05 + 0.25 * i / ops.length, 'RACKING ' + sp.title);
        await new Promise(r => setTimeout(r, 0));
      }
      // 2. enemies: 3 variants each (skin × coat), hound, 6 bosses
      const en = Object.keys(CS_CAST.ENEMY_LOOKS);
      for (let i = 0; i < en.length; i++) {
        const id = en[i], L = CS_CAST.ENEMY_LOOKS[id];
        if (id === 'boss') continue;
        for (let v = 0; v < 3; v++) {
          const skin = CS_CAST.SKINS[(v * 2 + i) % CS_CAST.SKINS.length], coat = L.coats[v % L.coats.length];
          const spec = { pal: [skin, coat, skin], look: L.look, grip: L.grip };
          const b = CS_PEPE.bakeCharacter(mk, spec, { cellW: 96, cellH: L.cellH || 112 });
          addSheet('en_' + id + v + '_stand', b.stand); addSheet('en_' + id + v + '_run', b.run);
          this.anims.create({ key: 'en_' + id + v + '_run', frames: this.anims.generateFrameNumbers('en_' + id + v + '_run', { start: 0, end: 5 }), frameRate: 10, repeat: -1 });
          this.anims.create({ key: 'en_' + id + v + '_stand', frames: this.anims.generateFrameNumbers('en_' + id + v + '_stand', { start: 0, end: 5 }), frameRate: 6, repeat: -1 });
          ART.chars['en_' + id + v] = { fist: b.fist, fist2: b.fist2, frameW: 96, frameH: L.cellH || 112, baseY: b.stand.baseY, gun: L.gun, grip: L.grip };
        }
        prog(0.3 + 0.25 * i / en.length, 'HIRING THE HELP · ' + id.toUpperCase());
        await new Promise(r => setTimeout(r, 0));
      }
      { const h = CS_PEPE.bakeHound(mk); addSheet('en_hound_run', h.run); addSheet('en_hound_stand', h.stand);
        this.anims.create({ key: 'en_hound_run', frames: this.anims.generateFrameNumbers('en_hound_run', { start: 0, end: 5 }), frameRate: 14, repeat: -1 });
        ART.chars.en_hound = { frameW: 72, frameH: 56, baseY: 56 * 0.94, hound: true }; }
      CS_CAST.BOSS_LOOKS.forEach((B, i) => {
        const skin = CS_CAST.SKINS[i % CS_CAST.SKINS.length];
        const b = CS_PEPE.bakeCharacter(mk, { pal: [skin, B.coat, skin], look: B.look, grip: 'rifle' }, { cellW: 110, cellH: 136 });
        addSheet('en_boss' + i + '_stand', b.stand); addSheet('en_boss' + i + '_run', b.run);
        this.anims.create({ key: 'en_boss' + i + '_run', frames: this.anims.generateFrameNumbers('en_boss' + i + '_run', { start: 0, end: 5 }), frameRate: 8, repeat: -1 });
        ART.chars['en_boss' + i] = { fist: b.fist, fist2: b.fist2, frameW: 110, frameH: 136, baseY: b.stand.baseY, gun: B.gun, grip: 'rifle' };
      });
      prog(0.6, 'DRAWING THE IRON');
      // 3. guns (all on-chain types) at hand scale + card scale
      for (const t of [1, 2, 3, 4, 5, 11, 12, 13, 14, 15, 16]) {
        const g = await CS_GUNS.bakeGun(mk, t, { px: 56 }); if (g) { addCanvas('gun_' + t, g.canvas); ART.guns[t] = g; }
        const gc = await CS_GUNS.bakeGun(mk, t, { px: 120 }); if (gc) addCanvas('guncard_' + t, gc.canvas);
      }
      prog(0.7, 'STRIKING SPARKS');
      // 4. fx + ui
      if (window.CS_FX) { const fx = await CS_FX.bakeAll(mk); ART.fx = fx; for (const k in fx) addCanvas('fx_' + k, fx[k].canvas); }
      if (window.CS_UI_ART) { const ui = await CS_UI_ART.bakeAll(mk); ART.ui = ui; ART.ui.NINE = CS_UI_ART.NINE || { left: 14, top: 14, right: 14, bottom: 14 }; for (const k in ui) if (ui[k] && ui[k].canvas) addCanvas('ui_' + k, ui[k].canvas); }
      // fallbacks so the game runs even if a kit is missing
      const need = ['ui_btn', 'ui_btnHot', 'ui_panel', 'ui_card', 'ui_cardSel', 'ui_cardLocked', 'ui_frameGold', 'ui_hpBar', 'ui_hpFill', 'ui_waveBanner', 'ui_starOn', 'ui_starOff', 'ui_coinIcon', 'ui_markerIcon', 'fx_glow', 'fx_spark', 'fx_tracer', 'fx_muzzle0', 'fx_muzzle1', 'fx_muzzle2', 'fx_ring', 'fx_smoke', 'fx_coin', 'fx_marker', 'fx_keg', 'fx_arc', 'fx_slowRing', 'fx_shimmer', 'fx_healCross', 'fx_hit', 'fx_shell', 'fx_rangeRing', 'fx_placeOk', 'fx_placeBad', 'fx_crit', 'fx_coinPop', 'fx_bulletHole', 'ui_skull', 'ui_lockIcon'];
      for (const k of need) if (!tex.exists(k)) addCanvas(k, fallbackTex(k));
      // dust mote + rain drop
      addCanvas('fx_dot', (() => { const c = mk(8, 8), x = c.getContext('2d'); const g = x.createRadialGradient(4, 4, 0, 4, 4, 4); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 8, 8); return c; })());
      addCanvas('fx_rain', (() => { const c = mk(3, 26), x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, 26); g.addColorStop(0, 'rgba(200,220,255,0)'); g.addColorStop(1, 'rgba(200,220,255,0.8)'); x.fillStyle = g; x.fillRect(0, 0, 3, 26); return c; })());
      addCanvas('fx_noise', (() => { const c = mk(256, 256), x = c.getContext('2d'); const id = x.createImageData(256, 256); const rng = CS.mulberry32(7); for (let i = 0; i < id.data.length; i += 4) { const v = 128 + (rng() - 0.5) * 60; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; } x.putImageData(id, 0, 0); return c; })());
      // 5. the hotel at night (title backdrop) — anchors tell Title where the lamp, hero and buttons live
      if (window.CS_TITLE_ART) { try { prog(0.78, 'LIGHTING THE MARQUEE'); const t = await CS_TITLE_ART.bake(mk, { W, H }); ART.title = t; addCanvas('title_bg', t.canvas); } catch (e) { console.warn('title bake failed', e); } }
      // 6. every floor, baked once (10–60 ms each) — Battle installs from ART.floors, the elevator shows thumbnails
      if (window.CS_FLOORS) {
        for (const f of CS.FLOORS) {
          prog(0.8 + 0.18 * (f.id - 1) / CS.FLOORS.length, 'DRESSING ' + f.name);
          try {
            const out = await CS_FLOORS.bakeFloor(mk, f, { W: BW, H: BH, CELL });
            ART.floors[f.id] = out; addCanvas('floor_' + f.id, out.canvas);
            const th = mk(280, 168), tx = th.getContext('2d'); tx.drawImage(out.canvas, 0, 0, 280, 168);
            for (const p of (out.props || [])) tx.drawImage(p.canvas, (p.x - p.canvas.width / 2) / 4, (p.y - p.footY) / 4, p.canvas.width / 4, p.canvas.height / 4);
            addCanvas('floorthumb_' + f.id, th);
          } catch (e) { console.warn('floor bake failed', f.id, e); }
        }
      }
      prog(1, 'THE HOUSE IS OPEN');
    }
  }
  function fallbackTex(k) {
    const c = mk(64, 64), x = c.getContext('2d');
    if (k === 'ui_btnHot') { x.fillStyle = '#c9a227'; x.fillRect(0, 0, 64, 64); x.strokeStyle = '#e8c576'; x.lineWidth = 3; x.strokeRect(2, 2, 60, 60); }
    else if (/btn|panel|card|frame|Banner/.test(k)) { x.fillStyle = '#0e1420'; x.fillRect(0, 0, 64, 64); x.strokeStyle = '#c9a227'; x.lineWidth = 3; x.strokeRect(2, 2, 60, 60); }
    else if (/glow|spark|dot/.test(k)) { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); }
    else if (/star/.test(k)) { x.fillStyle = k === 'ui_starOn' ? '#e8c576' : '#2a2f3a'; x.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 12 : 28, a = -Math.PI / 2 + i * Math.PI / 5; x.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } x.closePath(); x.fill(); }
    else if (/hpFill/.test(k)) { x.fillStyle = '#7cf9a5'; x.fillRect(0, 0, 64, 64); }
    else if (/hpBar/.test(k)) { x.fillStyle = '#0b0e15'; x.fillRect(0, 0, 64, 64); }
    else if (/placeOk/.test(k)) { x.fillStyle = 'rgba(124,249,165,0.35)'; x.fillRect(0, 0, 64, 64); }
    else if (/placeBad/.test(k)) { x.fillStyle = 'rgba(255,92,92,0.35)'; x.fillRect(0, 0, 64, 64); }
    else if (/rangeRing/.test(k)) { x.strokeStyle = 'rgba(255,255,255,0.7)'; x.setLineDash([3, 4]); x.beginPath(); x.arc(32, 32, 30, 0, 7); x.stroke(); }
    else { x.fillStyle = '#e8c576'; x.beginPath(); x.arc(32, 32, 20, 0, 7); x.fill(); }
    return c;
  }

  // =====================================================================
  //  TITLE — the hotel at night, rain, neon, the operative under the lamp
  // =====================================================================
  class Title extends Phaser.Scene {
    constructor() { super('Title'); }
    create() {
      const add = this.add;
      const T = ART.title; // { anchors, ambient } from CS_TITLE_ART (baked at Boot); falls back to a plain night if the baker is missing
      const A = (T && T.anchors) || { title: { x: W / 2, y: 76 }, hero: { x: 502, y: 592 }, lamp: { x: 452, y: 418, color: '#ffd9a0', r: 96 }, marquee: { x: 510, y: 410, w: 260, h: 36 }, buttons: { y: 655 }, footer: { y: 745 }, windows: [], car: null };
      const AMB = (T && T.ambient) || { rain: true, lamps: [], neon: [], steam: [], puddles: [] };
      if (this.textures.exists('title_bg')) add.image(0, 0, 'title_bg').setOrigin(0).setDepth(0);
      else { const sky = add.graphics().setDepth(0); sky.fillGradientStyle(0x05070c, 0x05070c, 0x0e1420, 0x141b2b, 1).fillRect(0, 0, W, H); }
      const hexCol = h => Phaser.Display.Color.HexStringToColor(h || '#ffd9a0').color;
      // living light: lamp pools breathe, neon buzzes, a few hotel windows flicker, steam rises from the drains
      (AMB.lamps || []).forEach((l, i) => {
        const g = add.image(l.x, l.y, 'fx_glow').setTint(hexCol(l.color)).setBlendMode(Phaser.BlendModes.ADD).setScale((l.r || 60) / 40).setAlpha(0.28).setDepth(2);
        this.tweens.add({ targets: g, alpha: { from: 0.22, to: 0.36 }, duration: 1400 + (i * 397) % 1300, yoyo: true, repeat: -1 });
      });
      (AMB.neon || []).forEach((n, i) => {
        const g = add.image(n.x + (n.w || 0) / 2, n.y + (n.h || 0) / 2, 'fx_glow').setTint(hexCol(n.color)).setBlendMode(Phaser.BlendModes.ADD).setScale(Math.max(0.8, (n.w || 60) / 50), Math.max(0.6, (n.h || 40) / 50)).setAlpha(0.2).setDepth(2);
        this.tweens.add({ targets: g, alpha: { from: 0.12, to: 0.28 }, duration: 80 + (i * 61) % 140, yoyo: true, repeat: -1, hold: 300 + (i * 233) % 900, repeatDelay: 200 + (i * 173) % 1100 });
      });
      (A.windows || []).slice(0, 12).forEach((w, i) => { if (i % 3 !== 0) return; const r = add.rectangle(w.x + w.w / 2, w.y + w.h / 2, w.w, w.h, 0x000000, 0).setDepth(1); this.tweens.add({ targets: r, fillAlpha: { from: 0, to: 0.35 }, duration: 60 + i * 20, yoyo: true, repeat: -1, repeatDelay: 2200 + i * 900, hold: 40 }); });
      (AMB.steam || []).forEach(s => { add.particles(s.x, s.y, 'fx_smoke', { lifespan: { min: 1800, max: 3200 }, speedY: { min: -14, max: -30 }, speedX: { min: -6, max: 10 }, quantity: 1, frequency: 320, alpha: { start: 0.22, end: 0 }, scale: { start: 0.5, end: 1.6 }, blendMode: 'SCREEN' }).setDepth(3); });
      // neon title in the quiet sky band
      const ty = A.title.y;
      // the sign is BAKED at 2× (title_sign / title_sign_glow) — a Text + glow postFX rendered as a blocky low-res tube; this is real neon glass
      if (!this.textures.exists('title_sign')) bakeTitleSign(this.textures);
      const glow = add.image(A.title.x, ty - 6, 'title_sign_glow').setScale(0.5).setDepth(5).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.9);
      const sign = add.image(A.title.x, ty - 6, 'title_sign').setScale(0.5).setDepth(6);
      this.tweens.add({ targets: [sign, glow], alpha: { from: 1, to: 0.78 }, duration: 70, yoyo: true, repeat: -1, repeatDelay: 2400, hold: 60 });
      this.tweens.add({ targets: glow, scale: { from: 0.5, to: 0.507 }, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      mono(this, A.title.x, ty + 62, 'THE HIGH TABLE IS COMING UP THE STAIRS · HOLD EVERY FLOOR', 12, DIM).setOrigin(0.5).setDepth(6);
      // the operative under the street lamp — BABA YAGA when the ledger says holder, THE CONCIERGE otherwise
      const holder = !!(ART.wallet && ART.wallet.count > 0);
      const opId = holder ? 'gatling' : 'pistol', HS = 1.55;
      const ch = ART.chars['op_' + opId];
      const op = add.sprite(A.hero.x, A.hero.y, 'op_' + opId + '_stand').setOrigin(0.5, ch ? ch.baseY / ch.frameH : 0.94).setScale(HS).setDepth(4);
      op.play('op_' + opId + '_stand');
      add.ellipse(A.hero.x, A.hero.y + 2, 54, 14, 0x000000, 0.4).setDepth(3);
      const gt = (gunModsFor(ART.wallet)[opId] || {}).gunType || (CS_CAST.OPERATIVES[opId] && CS_CAST.OPERATIVES[opId].gun);
      if (gt && ART.guns[gt] && ch) { const g = ART.guns[gt]; const gun = add.image(0, 0, 'gun_' + gt).setOrigin(g.grip.x / g.w, g.grip.y / g.h).setScale(HS).setDepth(5); const follow = () => { const a = ch.fist2 || ch.fist; gun.setPosition(op.x + (a.x - ch.frameW / 2) * HS, op.y - (ch.baseY - a.y) * HS); }; this.events.on('update', follow); this.events.once('shutdown', () => this.events.off('update', follow)); }
      // rain over everything
      if (AMB.rain !== false) add.particles(0, 0, 'fx_rain', { x: { min: -100, max: W }, y: -30, lifespan: 1400, speedY: { min: 520, max: 700 }, speedX: { min: 60, max: 110 }, quantity: 3, frequency: 16, alpha: { start: 0.5, end: 0.08 }, scale: { min: 0.7, max: 1.1 }, blendMode: 'ADD' }).setDepth(7);
      // menu on the street band
      const by = A.buttons.y;
      const unlocked = unlockedFloor();
      button(this, W / 2 - 250, by, 220, 46, 'ENTER THE HOTEL', () => this.scene.start('Floors'), { hot: true, sub: 'FLOOR ' + unlocked + ' UNLOCKED' });
      const pitBest = parseInt(LS.get('cs_pit_best') || '0', 10);
      button(this, W / 2, by, 220, 46, 'THE PIT', () => this.scene.start('Battle', { floor: 7, difficulty: LS.get('cs_diff') || 'operative', mode: 'endless' }), { sub: pitBest ? 'ENDLESS · BEST WAVE ' + pitBest : 'ENDLESS DESCENT' });
      const ct = CS.dailyContract(todayUTC());
      const dailyBest = parseInt(LS.get('cs_daily_' + ct.date) || '0', 10);
      button(this, W / 2 + 250, by, 220, 46, 'DAILY CONTRACT', () => this.scene.start('Battle', { floor: ct.floor, difficulty: ct.difficulty, mode: 'daily', mutators: ct.mutators, seed: ct.seed, contract: ct }), { sub: 'F' + ct.floor + ' · ' + CS.DIFFS[ct.difficulty].name + (dailyBest ? ' · BEST ' + dailyBest : '') });
      // wallet — a REAL button under the menu (the old bottom-right text line was invisible to players)
      walletButton(this, W / 2, by + 60, 360, 36, () => this.scene.restart());
      const unlockedLines = CS.CAMPAIGN.reduce((n, id) => n + Math.min(3, starsAny(id)), 0);
      const acct = mono(this, 16, H - 16, '⬦ HOUSE ACCOUNTS ' + unlockedLines + '/' + (CS.CAMPAIGN.length * 3), 12, GOLD).setOrigin(0, 1).setDepth(20).setInteractive({ useHandCursor: true });
      acct.on('pointerdown', () => { AUD.unlock(); AUD.play('ui'); showAccounts(this); });
      const soundT = mono(this, 200, H - 16, '♪ ' + AUD.soundLabel(), 12, DIM).setOrigin(0, 1).setDepth(20).setInteractive({ useHandCursor: true });
      soundT.on('pointerdown', () => { AUD.unlock(); const md = AUD.cycleSound(); soundT.setText('♪ ' + AUD.soundLabel()); if (md !== 'off') AUD.play('ui'); });
      const shakeT = mono(this, 372, H - 16, LS.get('cs_shake') === '0' ? '⌁ SHAKE OFF' : '⌁ SHAKE ON', 12, DIM).setOrigin(0, 1).setDepth(20).setInteractive({ useHandCursor: true });
      shakeT.on('pointerdown', () => { const off = LS.get('cs_shake') !== '0'; LS.set('cs_shake', off ? '0' : '1'); shakeT.setText(off ? '⌁ SHAKE OFF' : '⌁ SHAKE ON'); AUD.play('ui'); });
      mono(this, W - 16, H - 16, 'A KJP GEAR OPERATION · YOUR WICK ARSENAL GUNS IN THEIR HANDS · FREE PLAY', 10, DIM).setOrigin(1, 1).setDepth(20);
      try { this.cameras.main.postFX.addVignette(0.5, 0.5, 0.92, 0.32); } catch (e) {}
      this.input.once('pointerdown', () => AUD.unlock());
      AUD.setState({ scene: 'title', intensity: 0, active: false, danger: false, boss: false });
    }
  }
  // CONNECT WALLET button used by Title / Floors / Battle. Shows the connected summary once the
  // ledger is read; `onDone(res)` lets the scene re-skin itself. Fails soft with the reason on the button.
  function walletButton(scene, x, y, w, h, onDone, opts) {
    opts = opts || {};
    const label = () => ART.wallet ? '✓ GEAR ×' + ART.wallet.count + ' · GUNS ×' + ART.wallet.gunCount + (ART.wallet.gunTypes.length ? ' — IRON ON THE FLOOR' : '') : '🔗 CONNECT WALLET · USE YOUR ARSENAL GUNS';
    const b = button(scene, x, y, w, h, label(), async () => {
      if (ART.wallet || b.busy) return; b.busy = true; b.t.setText('CHECKING THE LEDGER…');
      const r = await CS_NFT.connect(); if (r.ok) ART.wallet = r;
      b.busy = false;
      if (!scene.sys.isActive() || !b.t.active) return;
      if (r.ok) { b.t.setText(label()); if (onDone) onDone(r); }
      else { b.t.setText(r.err === 'NO WALLET DETECTED' ? 'NO WALLET — OPEN THIS PAGE IN METAMASK / RABBY' : r.err); scene.time.delayedCall(3200, () => { if (b.t.active) b.t.setText(label()); }); }
    }, { hot: !ART.wallet, size: opts.size || 12, depth: opts.depth || 20, color: ART.wallet ? GREEN : GOLD });
    return b;
  }
  // The title sign, baked at 2× and displayed at 0.5 so the tubes are smooth. Two textures: the sign itself
  // (glass tubes with a hot core + brass SIEGE) and a separate soft glow layer the scene pulses additively.
  function bakeTitleSign(textures) {
    const S = 2, CW = 640 * S, CH = 150 * S; // 640×150 logical
    const font = (px) => 'normal ' + px + 'px "Black Ops One", Impact, "Arial Black", sans-serif';
    const fit = (x, text, px, max) => { x.font = font(px); const w = x.measureText(text).width; return w > max ? Math.floor(px * max / w) : px; };
    // --- glow layer ---
    const gc = mk(CW, CH), g = gc.getContext('2d');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const px1 = fit(g, 'THE CONTINENTAL', 58 * S, 600 * S), y1 = 48 * S;
    g.font = font(px1);
    for (const [blur, a] of [[46 * S, 0.55], [22 * S, 0.5], [10 * S, 0.6]]) { g.shadowColor = 'rgba(61,255,176,' + a + ')'; g.shadowBlur = blur; g.fillStyle = 'rgba(61,255,176,0.001)'; g.fillText('THE CONTINENTAL', CW / 2, y1); g.fillText('THE CONTINENTAL', CW / 2, y1); }
    g.shadowBlur = 0;
    // --- sign layer ---
    const sc = mk(CW, CH), c = sc.getContext('2d');
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    // dark backing tube (the glass when unlit) gives the letters an edge against the sky
    c.font = font(px1);
    c.lineWidth = 6 * S; c.strokeStyle = 'rgba(4,20,14,0.85)'; c.strokeText('THE CONTINENTAL', CW / 2, y1);
    // tube body: green glass gradient, top-lit
    const tube = c.createLinearGradient(0, y1 - px1 * 0.5, 0, y1 + px1 * 0.5);
    tube.addColorStop(0, '#d9ffe9'); tube.addColorStop(0.28, '#8dffc4'); tube.addColorStop(0.62, '#3dffb0'); tube.addColorStop(1, '#22c987');
    c.shadowColor = 'rgba(61,255,176,0.9)'; c.shadowBlur = 8 * S; c.fillStyle = tube; c.fillText('THE CONTINENTAL', CW / 2, y1); c.fillText('THE CONTINENTAL', CW / 2, y1);
    c.shadowBlur = 0;
    // hot white core: a thinner pass, slightly up, clipped to the glyphs
    c.save(); c.globalCompositeOperation = 'source-atop';
    const core = c.createLinearGradient(0, y1 - px1 * 0.5, 0, y1 + px1 * 0.5);
    core.addColorStop(0, 'rgba(255,255,255,0.85)'); core.addColorStop(0.35, 'rgba(255,255,255,0.35)'); core.addColorStop(0.5, 'rgba(255,255,255,0)'); core.addColorStop(1, 'rgba(0,0,0,0.18)');
    c.fillStyle = core; c.fillRect(0, 0, CW, CH);
    // glass seam highlight along the top edge of every stroke
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 1.2 * S; c.strokeText('THE CONTINENTAL', CW / 2, y1 - 1.5 * S);
    c.restore();
    // brass SIEGE, letter-spaced, bevelled
    const word = 'S I E G E', px2 = 30 * S, y2 = 108 * S;
    c.font = font(px2);
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillText(word, CW / 2 + 2 * S, y2 + 3 * S);
    const brass = c.createLinearGradient(0, y2 - px2 * 0.5, 0, y2 + px2 * 0.5);
    brass.addColorStop(0, '#fff3c8'); brass.addColorStop(0.42, '#e8c576'); brass.addColorStop(0.55, '#c9a227'); brass.addColorStop(1, '#8a6a14');
    c.lineWidth = 3 * S; c.strokeStyle = 'rgba(40,26,4,0.9)'; c.strokeText(word, CW / 2, y2);
    c.fillStyle = brass; c.fillText(word, CW / 2, y2);
    c.save(); c.globalCompositeOperation = 'source-atop'; c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1 * S; c.strokeText(word, CW / 2, y2 - 1.2 * S); c.restore();
    // brass rule under the word, with two rivets
    c.fillStyle = 'rgba(232,197,118,0.55)'; c.fillRect(CW / 2 - 150 * S, y2 + 24 * S, 300 * S, 1.5 * S);
    for (const dx of [-158, 158]) { c.beginPath(); c.arc(CW / 2 + dx * S, y2 + 24.7 * S, 2.2 * S, 0, Math.PI * 2); c.fillStyle = '#e8c576'; c.fill(); }
    textures.addCanvas('title_sign', sc); textures.addCanvas('title_sign_glow', gc);
  }
  function walletLine() {
    const w = ART.wallet;
    if (!w) return 'CONNECT WALLET — NFT PERKS: GEAR = markers + BABA YAGA · GUNS = your iron on the floor';
    return 'GEAR ×' + w.count + ' (+' + Math.min(10, w.count) + '❖) · GUNS ×' + w.gunCount + (w.gunTypes.length ? ' [' + w.gunTypes.map(t => (window.WICK_GUNS && window.WICK_GUNS[t] ? window.WICK_GUNS[t].name : t)).slice(0, 3).join(', ') + ']' : '');
  }
  function showAccounts(scene) {
    const dim = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.86).setDepth(90).setInteractive();
    const panel = scene.add.nineslice(W / 2, H / 2, 'ui_panel', undefined, 940, 660, 14, 14, 14, 14).setDepth(91);
    const parts = ['HOUSE ACCOUNTS — LEDGER OF THE CONTINENTAL', ''];
    for (const f of CS.CAMPAIGN) { const st = starsAny(f); parts.push(CS.floorById(f).name + '  ' + '★'.repeat(st) + '☆'.repeat(3 - st)); for (let i = 0; i < 3; i++) { const lore = ACCOUNTS[CS.stageOf(f) - 1] || ACCOUNTS[0]; parts.push('  ' + (st > i ? lore[i] : redact(lore[i], i))); } parts.push(''); }
    parts.push('EARN STARS TO UNSEAL THE LEDGER · TAP TO CLOSE');
    const t = mono(scene, W / 2, H / 2, parts.join('\n'), 12, INK, { align: 'left', lineSpacing: 4, wordWrap: { width: 880 } }).setOrigin(0.5).setDepth(92);
    dim.on('pointerdown', () => { dim.destroy(); panel.destroy(); t.destroy(); });
  }

  // =====================================================================
  //  FLOORS — the elevator panel
  // =====================================================================
  class Floors extends Phaser.Scene {
    constructor() { super('Floors'); }
    create() {
      this.diff = LS.get('cs_diff') || 'operative';
      this.doct = LS.get('cs_doct') || 'none';
      const bg = this.add.graphics(); bg.fillGradientStyle(0x0b0e15, 0x0b0e15, 0x141b2b, 0x0e1420, 1).fillRect(0, 0, W, H);
      const unlocked = unlockedFloor();
      // the highest floor you hold, blurred and dim, behind the panel
      if (this.textures.exists('floor_' + unlocked)) { const back = this.add.image(W / 2, H / 2 + 20, 'floor_' + unlocked).setScale(1.2).setAlpha(0.22); try { back.postFX.addBlur(0, 2, 2, 1.2); } catch (e) {} const veil = this.add.graphics(); veil.fillGradientStyle(0x05070c, 0x05070c, 0x05070c, 0x05070c, 0.55, 0.55, 0.85, 0.85).fillRect(0, 0, W, H); }
      txt(this, W / 2, 32, 'THE ELEVATOR', 28, GOLD).setOrigin(0.5);
      mono(this, W / 2, 58, 'PICK A FLOOR · PICK YOUR TERMS · THE DOORS CLOSE BEHIND YOU', 10, DIM).setOrigin(0.5);
      const floors = CS.FLOORS.filter(f => !f.endless);
      const CW = 300, CH = 176, TW = 276, TH = 128;
      floors.forEach((f, i) => {
        const x = W / 2 + ((i % 3) - 1) * 326, y = 176 + Math.floor(i / 3) * 190;
        const locked = !isUnlocked(f.id);
        const card = this.add.nineslice(x, y, 'ui_panel', undefined, CW, CH, 14, 14, 14, 14).setOrigin(0.5).setInteractive({ useHandCursor: !locked });
        const frame = this.add.nineslice(x, y, 'ui_frameGold', undefined, CW, CH, 14, 14, 14, 14).setOrigin(0.5).setAlpha(locked ? 0.25 : 0.7);
        const ty = y - CH / 2 + 10 + TH / 2; // thumbnail centre
        const hasThumb = this.textures.exists('floorthumb_' + f.id);
        const thumb = hasThumb ? this.add.image(x, ty, 'floorthumb_' + f.id) : this.add.rectangle(x, ty, TW, TH, 0x141822);
        if (locked) thumb.setTint ? thumb.setTint(0x55606e).setAlpha(0.6) : thumb.setAlpha(0.6);
        // name plate over the bottom of the thumbnail
        const plate = this.add.graphics(); plate.fillGradientStyle(0x05070c, 0x05070c, 0x05070c, 0x05070c, 0, 0, 0.9, 0.9).fillRect(x - TW / 2, ty + TH / 2 - 44, TW, 44);
        txt(this, x - TW / 2 + 10, ty + TH / 2 - 30, 'FLOOR ' + CS.stageOf(f.id), 10, locked ? DIM : GOLD_D).setOrigin(0, 0.5);
        const nameT = txt(this, x - TW / 2 + 10, ty + TH / 2 - 13, f.name, 16, locked ? DIM : '#fff').setOrigin(0, 0.5);
        for (let fs = 16; fs > 10 && nameT.width > TW - 90; fs--) nameT.setFontSize(fs);
        const st = starsFor(f.id, this.diff);
        for (let s = 0; s < 3; s++) this.add.image(x + TW / 2 - 66 + s * 24, ty + TH / 2 - 22, s < st ? 'ui_starOn' : 'ui_starOff').setScale(0.5).setAlpha(locked ? 0.4 : 1);
        // footer row: intro / lock line + waves
        const fy = y + CH / 2 - 16;
        const prev = CS.CAMPAIGN[CS.CAMPAIGN.indexOf(f.id) - 1];
        mono(this, x - CW / 2 + 12, fy, locked ? 'LOCKED — CLEAR ' + (CS.floorById(prev) ? CS.floorById(prev).name : '') : f.intro.split('.')[0].toUpperCase(), 8, locked ? DIM : INK).setOrigin(0, 0.5);
        mono(this, x + CW / 2 - 12, fy, f.waves + ' WAVES', 9, locked ? DIM : GOLD).setOrigin(1, 0.5);
        if (locked) { this.add.image(x, ty - 10, 'ui_lockIcon').setScale(1.1).setAlpha(0.9); }
        else {
          card.on('pointerover', () => { frame.setAlpha(1); this.tweens.add({ targets: thumb, scale: 1.03, duration: 120 }); });
          card.on('pointerout', () => { frame.setAlpha(0.7); this.tweens.add({ targets: thumb, scale: 1, duration: 120 }); });
          card.on('pointerdown', () => { AUD.unlock(); AUD.play('ui'); this.scene.start('Battle', { floor: f.id, difficulty: this.diff, doctrine: this.doct, mode: 'campaign' }); });
        }
      });
      // difficulty + perk — every option explained ON the button so nobody has to click around to learn what it does.
      // Defaults (OPERATIVE + HOUSE STANDARD) are the intended game: a new player can just pick a floor.
      const dy = 700;
      const DIFF_SUB = { operative: 'STANDARD · intended game', ghost: 'HARDER · +35% enemy hp', babayaga: 'BRUTAL · +80% enemy hp' };
      const DOCT_SUB = { none: 'no trade-off · default', iron: '+8% dmg / −20⛁ bonus', ledger: '+10% bounty / −5% rof', doors: '+4 markers / −40⛁ start' };
      mono(this, 120, dy - 30, 'DIFFICULTY  — how hard they come up the stairs', 10, DIM);
      let dx = 120;
      for (const d in CS.DIFFS) { const on = d === this.diff; button(this, dx + 80, dy, 160, 36, CS.DIFFS[d].name, () => { this.diff = d; LS.set('cs_diff', d); this.scene.restart(); }, { hot: on, size: 13, sub: DIFF_SUB[d] }); dx += 172; }
      mono(this, 700, dy - 30, 'PERK (optional)  — one trade-off for the whole floor, or leave HOUSE STANDARD', 10, DIM);
      let ox = 700; for (const k in CS.DOCTRINES) { const on = k === this.doct; button(this, ox + 66, dy, 132, 36, CS.DOCTRINES[k].name, () => { this.doct = k; LS.set('cs_doct', k); this.scene.restart(); }, { hot: on, size: 11, sub: DOCT_SUB[k] }); ox += 140; }
      const chosen = (this.diff === 'operative' && this.doct === 'none') ? 'YOUR TERMS: OPERATIVE · HOUSE STANDARD — the intended experience. New here? Just pick a floor.' : 'YOUR TERMS: ' + CS.DIFFS[this.diff].name + ' · ' + CS.DOCTRINES[this.doct].name + ' — ' + CS.DOCTRINES[this.doct].desc.toLowerCase();
      mono(this, W / 2, dy + 42, chosen, 10, GOLD).setOrigin(0.5);
      mono(this, W / 2, dy + 58, 'ON THE FLOOR: pick an operative (1-9), click a tile to post, SEND WAVE · click a posted unit for targeting orders · THE HOUSE spends a fat bank', 9, DIM).setOrigin(0.5);
      button(this, 84, 32, 132, 30, '◂ LOBBY', () => this.scene.start('Title'), { size: 11 });
      walletButton(this, W - 196, 46, 352, 32, () => this.scene.restart(), { size: 11 });
      AUD.setState({ scene: 'floors', intensity: 0, active: false, danger: false, boss: false });
      try { this.cameras.main.postFX.addVignette(0.5, 0.5, 0.95, 0.28); } catch (e) {}
    }
  }

  window.__CS_SCENES = { Boot, Title, Floors };
  window.__CS_SHARED = { W, H, CELL, HUD_H, BX, BY, BW, BH, RAIL_X, K, LS, walletButton, SX, SY, SR, FONT, MONO, GOLD, GOLD_D, DIM, GREEN, RED, INK, ART, mk, txt, mono, nine, button, HOTKEYS, starsFor, setStars, starsAny, gunModsFor, walletLine, todayUTC };
})();
