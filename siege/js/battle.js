/* =========================================================================
   CONTINENTAL SIEGE v2 — BATTLE scene. Renders CS state on the baked floor,
   turns sim events into FX + sound, and owns the HUD (cards, selection, banners).
   ========================================================================= */
(function () {
  'use strict';
  const S = window.__CS_SHARED;
  const { W, H, CELL, HUD_H, BX, BY, BW, BH, RAIL_X, K, LS, walletButton, SX, SY, SR, FONT, MONO, GOLD, GOLD_D, DIM, GREEN, RED, INK, ART, mk, txt, mono, button, HOTKEYS, starsFor, setStars, gunModsFor, walletLine } = S;
  const AUD = window.CS_AUDIO;
  const D = { floor: 0, floorFx: 1, deco: 2, ground: 3, shadow: 4, world: 10, /* world objects sort within 10..2000 by y */ air: 2100, fxTop: 2200, hud: 3000, panel: 3100, banner: 3200, overlay: 4000 };
  const ANIM_MS = 1000 / 60;
  const ENEMY_SCALE = { goon: 0.62, runner: 0.58, heavy: 0.7, shield: 0.66, hound: 1.0, medic: 0.6, ghost: 0.62, boss: 0.74 };
  const SHOT_SFX = { pistol: 'shot_pistol', smg: 'shot_smg', shotgun: 'shot_shotgun', sniper: 'shot_sniper', gatling: 'shot_gatling', tesla: 'tesla', keg: 'lob' };
  const ACCENT = { pistol: 0xffd27f, smg: 0x7cf9a5, shotgun: 0xff9d3d, sniper: 0x7fd0ff, gatling: 0xffd23f, tesla: 0x9ff3ff, keg: 0xff7a2f };

  class Battle extends Phaser.Scene {
    constructor() { super('Battle'); }
    init(opts) {
      this.opts = opts || { floor: 1, difficulty: 'operative', mode: 'campaign' };
      // Phaser reuses this scene instance across start/restart — every per-run flag must be reset here, not assumed fresh
      this.finished = false; this.grain = null; this.lightning = null; this.floorImg = null; this.fallbackG = null; this.pauseVeil = this.pauseT = this.pauseS = null; this.auto = false;
      this.propSprites = []; this.ambientObjs = []; this.bannerObjs = null; this.selPanel = null; this.tipPanel = null; this.dmgTexts = [];
    }
    async create() {
      const o = this.opts;
      this.wallet = ART.wallet;
      const gunMods = gunModsFor(this.wallet);
      const coreOpts = { floor: o.floor, difficulty: o.difficulty, doctrine: o.doctrine || 'none', mode: o.mode, mutators: o.mutators || {}, seed: o.seed, gunMods, holder: !!(this.wallet && this.wallet.count > 0), gearCount: this.wallet ? this.wallet.count : 0 };
      if (o.mode === 'daily' && o.contract) { coreOpts.bonusCoins = o.contract.bonusCoins || 0; }
      this.core = CS.createGame(coreOpts);
      this.gunMods = gunMods;
      this.banned = o.mode === 'daily' && o.contract ? o.contract.banned : null;
      this.speed = 1; this.paused = false; this.acc = 0; this.selDef = null; this.selTid = null; this.hoverCell = null;
      this.enemyViews = new Map(); this.turretViews = new Map(); this.lobViews = new Map(); this.deadFx = [];
      this.rngV = CS.mulberry32(99);
      // ---- floor
      const f = this.core.floor;
      this.buildFloor(f);
      this.buildHud();
      this.buildTray();
      this.input.on('pointermove', p => this.onMove(p));
      this.input.on('pointerdown', p => this.onDown(p));
      this.input.keyboard.on('keydown', e => this.onKey(e));
      try { this.cameras.main.postFX.addVignette(0.5, 0.5, 0.96, 0.30); } catch (e) {}
      this.fxLayer = this.add.layer().setDepth(D.fxTop);
      try { this.fxLayer.postFX.addBloom(0xffffff, 1, 1, 0.9, 1.15); } catch (e) {}
      this.banner('FLOOR ' + f.id + ' — ' + f.name, f.intro, 2600);
      AUD.setState({ scene: 'battle', floor: f.id, intensity: 0.08, active: false, boss: false, danger: false });
      this.input.once('pointerdown', () => AUD.unlock());
      // the HTML arcade links share the top-left with the floor name — hide them while the floor is live
      const links = document.getElementById('links'); if (links) links.style.display = 'none';
      this.events.once('shutdown', () => { this.enemyViews.clear(); this.turretViews.clear(); this.lobViews.clear(); if (links) links.style.display = ''; });
    }

    // ---------------------------------------------------------------- floor
    buildFloor(f) {
      const key = 'floor_' + f.id;
      if (!this.textures.exists(key)) {
        if (window.CS_FLOORS) {
          const out = CS_FLOORS.bakeFloorSync ? CS_FLOORS.bakeFloorSync(mk, f, { W: BW, H: BH, CELL }) : null;
          if (out) this.installFloor(f, out); else { CS_FLOORS.bakeFloor(mk, f, { W: BW, H: BH, CELL }).then(res => { this.installFloor(f, res); }); this.drawFallbackFloor(f); }
        } else this.drawFallbackFloor(f);
      } else this.installFloor(f, ART.floors[f.id]);
    }
    installFloor(f, out) {
      const key = 'floor_' + f.id;
      ART.floors[f.id] = out;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, out.canvas);
      if (this.floorImg) this.floorImg.destroy();
      if (this.fallbackG) { this.fallbackG.destroy(); this.fallbackG = null; }
      this.floorImg = this.add.image(BX, BY, key).setOrigin(0).setDepth(D.floor);
      (this.propSprites || []).forEach(p => p.destroy()); this.propSprites = [];
      (out.props || []).forEach((p, i) => {
        const pk = 'prop_' + f.id + '_' + i;
        if (!this.textures.exists(pk)) this.textures.addCanvas(pk, p.canvas);
        const sp = this.add.image(BX + p.x, BY + p.y, pk).setOrigin(0.5, p.footY / p.canvas.height).setDepth(D.world + p.y);
        this.propSprites.push(sp);
      });
      // ambient
      const amb = out.ambient || {};
      (this.ambientObjs || []).forEach(a => a.destroy()); this.ambientObjs = [];
      (amb.lamps || []).forEach(l => {
        const g = this.add.image(BX + l.x, BY + l.y, 'fx_glow').setTint(Phaser.Display.Color.HexStringToColor(l.color || '#ffd9a0').color).setBlendMode(Phaser.BlendModes.ADD).setScale((l.r || 60) / 48).setAlpha(0.35).setDepth(D.floorFx);
        this.tweens.add({ targets: g, alpha: { from: 0.28, to: 0.42 }, duration: 1200 + Math.random() * 1400, yoyo: true, repeat: -1 });
        this.ambientObjs.push(g);
      });
      (amb.neon || []).forEach(n => { // neon signs already painted on the floor — add the buzz: an additive halo that flickers
        const col = Phaser.Display.Color.HexStringToColor(n.color || '#3dffb0').color;
        const g = this.add.image(BX + n.x + (n.w || 0) / 2, BY + n.y + (n.h || 0) / 2, 'fx_glow').setTint(col).setBlendMode(Phaser.BlendModes.ADD).setScale(Math.max(1, (n.w || 96) / 60), Math.max(0.5, (n.h || 24) / 40)).setAlpha(0.16).setDepth(D.floorFx);
        this.tweens.add({ targets: g, alpha: { from: 0.1, to: 0.22 }, duration: 90 + Math.random() * 160, yoyo: true, repeat: -1, hold: 400 + Math.random() * 1200, repeatDelay: Math.random() * 900 });
        this.ambientObjs.push(g);
      });
      if (amb.rain) {
        const rain = this.add.particles(0, 0, 'fx_rain', { x: { min: -60, max: W }, y: -30, lifespan: 1300, speedY: { min: 560, max: 760 }, speedX: { min: 40, max: 90 }, quantity: 3, frequency: 14, alpha: { start: 0.45, end: 0.05 }, scale: { min: 0.6, max: 1 }, blendMode: 'ADD' }).setDepth(D.air);
        this.ambientObjs.push(rain);
        this.lightning = 0;
      }
      (amb.sparks || []).forEach(s => { const e = this.add.particles(BX + s.x, BY + s.y, 'fx_spark', { lifespan: { min: 300, max: 700 }, speed: { min: 20, max: 90 }, angle: { min: 200, max: 340 }, gravityY: 240, quantity: 1, frequency: 260, scale: { start: 0.5, end: 0 }, alpha: { start: 1, end: 0 }, tint: 0xffd27f, blendMode: 'ADD' }).setDepth(D.air); this.ambientObjs.push(e); });
      // dust motes everywhere (cheap ambience)
      const motes = this.add.particles(0, 0, 'fx_dot', { x: { min: 0, max: W }, y: { min: 60, max: H }, lifespan: 6000, speedY: { min: -6, max: -14 }, speedX: { min: -6, max: 6 }, quantity: 1, frequency: 220, alpha: { start: 0, end: 0.35, ease: 'Sine.easeInOut' }, scale: { min: 0.3, max: 0.7 }, blendMode: 'ADD' }).setDepth(D.air);
      this.ambientObjs.push(motes);
      // film grain
      if (!this.grain) { this.grain = this.add.tileSprite(0, 0, W, H, 'fx_noise').setOrigin(0).setAlpha(0.06).setBlendMode(Phaser.BlendModes.OVERLAY).setDepth(D.overlay - 1); }
    }
    drawFallbackFloor(f) {
      const g = this.add.graphics().setDepth(D.floor); this.fallbackG = g;
      g.fillStyle(0x141822, 1).fillRect(BX, BY, BW, BH);
      const P = this.core.parsed;
      for (let r = 0; r < CS.ROWS; r++) for (let c = 0; c < CS.COLS; c++) { const ch = f.map[r][c]; const x = BX + c * CELL, y = BY + r * CELL; if (ch === '#' || ch === 'S' || ch === 'E') g.fillStyle(0x5a1620, 1).fillRect(x + 4, y + 4, CELL - 8, CELL - 8); else if (ch === 'X') g.fillStyle(0x0b0e15, 1).fillRect(x + 8, y + 8, CELL - 16, CELL - 16); else if (ch === 'G') g.fillStyle(0x3a2f14, 1).fillRect(x + 2, y + 2, CELL - 4, CELL - 4); else g.lineStyle(1, 0x222b38, 0.5).strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1); }
    }

    // ---------------------------------------------------------------- HUD
    buildHud() {
      const c = this.core;
      const hy = HUD_H / 2;
      // cornice: the dark band between the HUD and the top of the wall — row-0 walkers' heads + hp bars live here
      const cg = this.add.graphics().setDepth(D.floor - 1); cg.fillGradientStyle(0x03040a, 0x03040a, 0x0b0e15, 0x0b0e15, 1, 1, 1, 1).fillRect(0, HUD_H, W, BY - HUD_H);
      this.hudBg = this.add.nineslice(W / 2, hy - 14, 'ui_panel', undefined, W + 28, HUD_H + 28, 14, 14, 14, 14).setDepth(D.hud); // the 14px nineslice padding hangs OFF the top edge, never over the cornice
      this.hudFloor = txt(this, 16, hy, c.floor.name + (this.opts.mode === 'daily' ? ' · DAILY' : this.opts.mode === 'endless' ? ' · ENDLESS' : '') + (c.doctrine.id !== 'none' ? ' · ' + c.doctrine.name : ''), 15, GOLD).setOrigin(0, 0.5).setDepth(D.hud + 1);
      this.hudWave = txt(this, W / 2 - 40, hy, '', 14, INK).setOrigin(0.5).setDepth(D.hud + 1);
      this.add.image(W - 392, hy, 'ui_coinIcon').setDepth(D.hud + 1).setScale(0.9);
      this.hudCoins = txt(this, W - 378, hy, '', 16, GOLD).setOrigin(0, 0.5).setDepth(D.hud + 1);
      this.add.image(W - 268, hy, 'ui_markerIcon').setDepth(D.hud + 1).setScale(0.9);
      this.hudMarkers = txt(this, W - 254, hy, '', 16, GREEN).setOrigin(0, 0.5).setDepth(D.hud + 1);
      this.btnWave = button(this, W - 64, hy, 116, 32, 'SEND WAVE', () => this.sendWave(), { hot: true, size: 12, depth: D.hud + 1 });
      this.auto = false; this.btnAuto = button(this, W - 156, hy, 60, 28, 'AUTO', () => this.toggleAuto(), { size: 11, depth: D.hud + 1 });
      this.btnSpeed = button(this, W / 2 + 130, hy, 56, 28, '×1', () => { this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1; this.btnSpeed.t.setText('×' + this.speed); }, { size: 12, depth: D.hud + 1 });
      this.btnPause = button(this, W / 2 + 194, hy, 56, 28, '❚❚', () => this.togglePause(), { size: 12, depth: D.hud + 1 });
      this.btnQuit = button(this, W / 2 - 230, hy, 84, 28, '◂ QUIT', () => this.scene.start('Floors'), { size: 11, depth: D.hud + 1 });
      // ghost cursor + range ring
      this.ghost = this.add.sprite(0, 0, 'op_pistol_stand').setOrigin(0.5, 0.94).setAlpha(0.6).setDepth(D.air).setVisible(false);
      this.ghostGun = this.add.image(0, 0, 'gun_1').setDepth(D.air).setVisible(false).setAlpha(0.7);
      this.ring = this.add.image(0, 0, 'fx_rangeRing').setDepth(D.floorFx + 1).setVisible(false).setAlpha(0.8);
      this.cellOverlay = this.add.image(0, 0, 'fx_placeOk').setDepth(D.floorFx + 1).setVisible(false);
      this.selRing = this.add.image(0, 0, 'fx_rangeRing').setDepth(D.floorFx + 1).setVisible(false).setTint(0xe8c576);
      this.dmgTexts = [];
      const ly = BY + BH + (H - BY - BH) / 2;
      this.add.rectangle(BX + BW / 2, ly, BW, H - BY - BH, 0x05070c, 1).setDepth(D.hud);
      this.legend = mono(this, BX + 12, ly, '1-9 PICK · CLICK A TILE TO POST · SHIFT-CLICK KEEPS PLACING · SPACE SENDS · A AUTO-SEND · U UPGRADE · M MAX · S SELL · P PAUSE', 10, DIM).setOrigin(0, 0.5).setDepth(D.hud + 1);
      this.toastT = mono(this, BX + BW / 2, BY + 30, '', 12, GOLD).setOrigin(0.5).setDepth(D.banner).setAlpha(0);
    }
    buildTray() {
      const defs = HOTKEYS.map(id => CS.TURRETS[id]);
      const railW = W - RAIL_X, railCX = RAIL_X + railW / 2;
      const cardW = railW - 22, cardH = 72, gap = 4; const x0 = railCX, y0 = HUD_H + 8 + cardH / 2;
      const railBg = this.add.nineslice(railCX + 14, HUD_H + (H - HUD_H) / 2, 'ui_panel', undefined, railW + 28, H - HUD_H + 28, 14, 14, 14, 14).setDepth(D.hud - 1); // padding hangs off the right edge, not over column 19
      this.railTitle = mono(this, railCX, H - 12, 'THE STAFF · 1-9', 9, DIM).setOrigin(0.5).setDepth(D.hud + 1);
      // wallet: bottom-right of the legend strip; connecting mid-floor re-skins the staff live
      const ly = BY + BH + (H - BY - BH) / 2;
      this.walletBtn = walletButton(this, RAIL_X - 150, ly, 280, 22, r => this.applyWallet(r), { size: 10, depth: D.hud + 2 });
      this.cards = {};
      defs.forEach((def, i) => {
        const x = x0, y = y0 + i * (cardH + gap);
        const sp = CS_CAST.OPERATIVES[def.id];
        const bg = this.add.nineslice(x, y, 'ui_card', undefined, cardW, cardH, 14, 14, 14, 14).setOrigin(0.5).setDepth(D.hud).setInteractive({ useHandCursor: true });
        const art = this.add.image(x - cardW / 2 + 32, y - 3, 'portrait_' + def.id).setDepth(D.hud + 1).setScale(0.5);
        const gunT = this.gunTypeFor(def.id);
        const gun = gunT ? this.add.image(x + 28, y - 21, 'gun_' + gunT).setDepth(D.hud + 1).setScale(0.86).setAngle(-12) : null;
        const name = txt(this, x + 22, y + 9, sp.title.replace('THE ', ''), 10, INK).setOrigin(0.5).setDepth(D.hud + 1);
        this.add.rectangle(x + 22, y + 9, name.width + 10, 13, 0x0b0e15, 0.8).setDepth(D.hud + 0.5); // mask the card's stretched name-slot notches behind the label
        const cost = txt(this, x + 22, y + 24, '', 11, GOLD).setOrigin(0.5).setDepth(D.hud + 1);
        const key = mono(this, x - cardW / 2 + 6, y - cardH / 2 + 4, def.hotkey, 9, DIM).setDepth(D.hud + 1);
        const c = { def, bg, art, gun, name, cost, key, x, y, w: cardW, h: cardH };
        bg.on('pointerover', () => this.showCardTip(c)); bg.on('pointerout', () => this.hideCardTip());
        bg.on('pointerdown', () => this.selectDef(def.id));
        this.cards[def.id] = c;
      });
      this.tipPanel = null;
      this.selPanel = null;
    }
    // wallet connected during a floor: mods into the sim, gear markers (leak-relative: startMarkers too), tray + turret guns re-skinned
    applyWallet(r) {
      const c = this.core; this.wallet = r; this.gunMods = gunModsFor(r); c.gunMods = this.gunMods;
      if (!c.holder && r.count > 0) { c.holder = true; c.gearCount = r.count; const add = Math.min(10, r.count); c.markers += add; c.startMarkers += add; }
      for (const k in this.cards) { const cd = this.cards[k]; const gt = this.gunTypeFor(k); if (cd.gun && gt && ART.guns[gt]) cd.gun.setTexture('gun_' + gt); }
      for (const [tid, v] of this.turretViews) { const t = c.turrets.find(x => x.tid === tid); if (!t) continue; const gt = this.gunTypeFor(t.def); if (v.gun && gt && ART.guns[gt] && v.gunType !== gt) { const g = ART.guns[gt]; v.gun.setTexture('gun_' + gt).setOrigin(g.grip.x / g.w, g.grip.y / g.h); v.gunType = gt; if (gt >= 11) { try { v.gun.postFX.addGlow(0xffd23f, 2, 0, false, 0.1, 8); } catch (e) {} } } }
      if (this.selDef) { const gt = this.gunTypeFor(this.selDef); if (gt && ART.guns[gt]) { const g = ART.guns[gt]; this.ghostGun.setTexture('gun_' + gt).setOrigin(g.grip.x / g.w, g.grip.y / g.h); } }
      this.syncHud(); this.toast('LEDGER READ — YOUR IRON IS ON THE FLOOR' + (r.count > 0 ? ' · +' + Math.min(10, r.count) + ' MARKERS' : ''), 2000); AUD.play('upgrade');
    }
    gunTypeFor(defId) { const m = this.gunMods[defId]; if (m && m.gunType) return m.gunType; const sp = CS_CAST.OPERATIVES[defId]; return sp && sp.gun; }
    showCardTip(c) {
      this.hideCardTip();
      const def = c.def, sp = CS_CAST.OPERATIVES[def.id], m = this.gunMods[def.id];
      const lines = [sp.title + ' — ' + def.name, sp.line, def.desc, ''];
      lines.push('DMG ' + def.dmg + ' · ROF ' + def.rof + '/s · RANGE ' + Math.round(def.range * K / CELL * 10) / 10 + ' cells' + (def.kind !== 'hitscan' ? ' · ' + def.kind.toUpperCase() : ''));
      if (m) lines.push('YOUR ' + m.gunName + ' · ×' + m.dmgMult + ' dmg · ×' + m.rofMult + ' rof' + (m.rangeMult !== 1 ? ' · ×' + m.rangeMult + ' range' : ''));
      if (def.holderOnly) lines.push(this.core.holder ? 'KJP GEAR ON FILE — cleared' : 'HOLDERS ONLY — KJP GEAR');
      const ty = Math.min(H - 20, c.y + 60);
      const t = mono(this, RAIL_X - 28, ty, lines.join('\n'), 11, INK, { align: 'right', wordWrap: { width: 320 } }).setOrigin(1, 1).setDepth(D.panel + 1);
      const p = this.add.nineslice(RAIL_X - 14, ty + 12, 'ui_panel', undefined, Math.max(240, t.width + 30), t.height + 24, 14, 14, 14, 14).setOrigin(1, 1).setDepth(D.panel);
      this.tipPanel = [p, t];
    }
    hideCardTip() { if (this.tipPanel) { this.tipPanel.forEach(o => o.destroy()); this.tipPanel = null; } }
    selectDef(id) {
      if (this.paused) { this.toast('PAUSED — NO ACTIONS', 800); AUD.play('deny'); return; }
      const def = CS.TURRETS[id];
      if (def.holderOnly && !this.core.holder) { this.toast('HOLDERS ONLY — KJP GEAR', 1400); AUD.play('deny'); return; }
      if (this.banned === id) { this.toast('CONFISCATED FOR TODAY’S CONTRACT', 1400); AUD.play('deny'); return; }
      this.selDef = this.selDef === id ? null : id; this.selTid = null; this.closeSel();
      AUD.play('ui');
      for (const k in this.cards) this.cards[k].bg.setTexture(k === this.selDef ? 'ui_cardSel' : 'ui_card');
      const ch = ART.chars['op_' + id];
      this.ghost.setTexture('op_' + id + '_stand').setVisible(!!this.selDef);
      const gt = this.gunTypeFor(id);
      if (gt && ART.guns[gt]) { const g = ART.guns[gt]; this.ghostGun.setTexture('gun_' + gt).setOrigin(g.grip.x / g.w, g.grip.y / g.h).setVisible(!!this.selDef); } else this.ghostGun.setVisible(false);
      this.ring.setVisible(!!this.selDef); this.cellOverlay.setVisible(!!this.selDef);
    }
    toast(msg, ms) { this.toastT.setText(msg).setAlpha(1); this.tweens.killTweensOf(this.toastT); this.tweens.add({ targets: this.toastT, alpha: 0, delay: ms || 1200, duration: 300 }); }
    banner(big, small, ms) {
      // one banner at a time — a new one retires the old (intro banner vs WAVE 1 used to overprint)
      if (this.bannerObjs) { const old = this.bannerObjs; this.bannerObjs = null; this.tweens.killTweensOf(old); this.tweens.add({ targets: old, alpha: 0, y: '-=14', duration: 160, onComplete: () => old.forEach(o => o.destroy()) }); }
      const y = 190;
      const slab = this.add.image(W / 2, y, 'ui_waveBanner').setDepth(D.banner).setAlpha(0).setScale(1.06, 1);
      const t1 = txt(this, W / 2, y - 12, big, 34, GOLD).setOrigin(0.5).setDepth(D.banner + 1).setAlpha(0);
      const t2 = mono(this, W / 2, y + 26, small || '', 12, INK).setOrigin(0.5).setDepth(D.banner + 1).setAlpha(0);
      const objs = this.bannerObjs = [slab, t1, t2];
      this.tweens.add({ targets: objs, alpha: 1, duration: 220 });
      this.tweens.add({ targets: slab, scaleX: 1, duration: 260, ease: 'Back.easeOut' });
      this.tweens.add({ targets: objs, alpha: 0, delay: ms || 2000, duration: 400, onComplete: () => { if (this.bannerObjs === objs) this.bannerObjs = null; objs.forEach(o => o.destroy()); } });
    }

    // ---------------------------------------------------------------- input
    cellFromPointer(p) { const c = Math.floor((p.x - BX) / CELL), r = Math.floor((p.y - BY) / CELL); if (c < 0 || r < 0 || c >= CS.COLS || r >= CS.ROWS) return null; return { c, r }; }
    hideGhost() { this.ghost.setVisible(false); this.ghostGun.setVisible(false); this.ring.setVisible(false); this.cellOverlay.setVisible(false); }
    onMove(p) {
      if (this.finished) return;
      const cell = this.cellFromPointer(p); this.hoverCell = cell;
      if (!cell || !this.selDef || this.paused || p.x >= RAIL_X || p.y < BY || this.overUI(p)) { this.hideGhost(); return; } // off the board: never leave a ghost hanging over the HUD/rail
      if (this.selDef && cell) {
        const cx = BX + cell.c * CELL + CELL / 2, cy = BY + cell.r * CELL + CELL / 2;
        const ok = CS.canPlace(this.core, this.selDef, cell.c, cell.r).ok && this.core.coins >= CS.TURRETS[this.selDef].cost;
        this.ghost.setPosition(cx, cy + 22).setVisible(p.x < RAIL_X && p.y > BY);
        const ch = ART.chars['op_' + this.selDef];
        if (this.ghostGun.visible !== undefined && this.ghostGun.texture.key !== '__MISSING') { const a = ch.fist2 || ch.fist; const sc = 0.62; this.ghostGun.setPosition(cx + (a.x - 48) * sc, cy + 22 - (112 * 0.94 - a.y) * sc).setScale(sc).setVisible(this.ghost.visible); }
        const st = CS.turretStats(this.core, { def: this.selDef, tier: 1 });
        const rr = SR(CS.TURRETS[this.selDef].range * (this.gunMods[this.selDef] ? this.gunMods[this.selDef].rangeMult : 1));
        this.ring.setPosition(cx, cy).setScale(rr * 2 / 128).setVisible(this.ghost.visible && rr > 0).setTint(ok ? 0xffffff : 0xff5c5c);
        this.cellOverlay.setTexture(ok ? 'fx_placeOk' : 'fx_placeBad').setPosition(cx, cy).setVisible(this.ghost.visible);
      }
    }
    onDown(p) {
      if (this.finished || p.x >= RAIL_X || p.y < BY || this.overUI(p)) return; // results panel up / rail / hud / selection panel
      if (this.paused) { this.toast('PAUSED — NO ACTIONS', 800); AUD.play('deny'); return; }
      const cell = this.cellFromPointer(p); if (!cell) return;
      const here = CS.turretAt(this.core, cell.c, cell.r);
      if (this.selDef && !here) {
        const r = CS.place(this.core, this.selDef, cell.c, cell.r);
        if (!r.ok) { this.toast(r.err || 'CAN’T PLACE THERE', 1200); AUD.play('deny'); return; }
        AUD.play('place');
        if (!p.event.shiftKey) this.selectDef(this.selDef); // deselect unless shift held
        return;
      }
      if (here) { if (this.selDef) this.selectDef(this.selDef); this.openSel(here.tid); } else this.closeSel();
    }
    onKey(e) {
      if (this.finished) return; // results panel owns the screen
      const k = e.key;
      if (k === 'Escape') { if (this.selDef) this.selectDef(this.selDef); this.closeSel(); }
      const idx = HOTKEYS.findIndex(id => CS.TURRETS[id].hotkey === k); if (idx >= 0) this.selectDef(HOTKEYS[idx]);
      if (k === ' ') { this.sendWave(); }
      if (k === 'a' || k === 'A') this.toggleAuto();
      if (k === 'm' || k === 'M') { if (this.selTid != null) this.maxUpgrade(); }
      if (k === 'p' || k === 'P') { this.togglePause(); return; }
      if (this.paused) { if (k !== 'Escape') { this.toast('PAUSED — NO ACTIONS', 800); } return; }
      if (k === 'u' || k === 'U') { if (this.selTid != null) this.doUpgrade(); }
      if (k === 's' && this.selTid != null) this.doSell();
    }
    sendWave() { if (this.paused) { this.toast('PAUSED — UNPAUSE FIRST', 900); AUD.play('deny'); return { ok: false }; } const r = CS.startWave(this.core); if (r.ok) { AUD.play('wave'); this.hideCardTip(); } return r; }
    // House rule: no pausing mid-wave (only between waves), and a paused floor takes NO actions — pause is a break, not a planning exploit
    togglePause() {
      if (!this.paused && this.core.waveActive) { this.toast('NO PAUSING MID-WAVE — HOLD THE FLOOR', 1200); AUD.play('deny'); return; }
      this.paused = !this.paused; this.btnPause.t.setText(this.paused ? '▶' : '❚❚');
      if (this.paused) { this.hideGhost(); this.hideCardTip(); this.closeSel(); if (!this.pauseVeil) { this.pauseVeil = this.add.rectangle(BX + BW / 2, BY + BH / 2, BW, BH, 0x05070c, 0.45).setDepth(D.panel - 1); this.pauseT = txt(this, BX + BW / 2, BY + BH / 2, 'PAUSED', 40, GOLD).setOrigin(0.5).setDepth(D.panel); this.pauseS = mono(this, BX + BW / 2, BY + BH / 2 + 34, 'the floor waits · no actions while paused · P or ▶ to resume', 11, INK).setOrigin(0.5).setDepth(D.panel); } }
      else { [this.pauseVeil, this.pauseT, this.pauseS].forEach(o => o && o.destroy()); this.pauseVeil = this.pauseT = this.pauseS = null; }
    }
    // AUTO: the next wave is called ~1.6 s after the floor is held (power-user request) — off by default, hotkey A
    toggleAuto() { this.auto = !this.auto; this.btnAuto.bg.setTexture(this.auto ? 'ui_btnHot' : 'ui_btn'); this.btnAuto.t.setColor(this.auto ? '#0b0e15' : GOLD); this.btnAuto.t.setText(this.auto ? 'AUTO ✓' : 'AUTO'); this.toast(this.auto ? 'AUTO-SEND ON — waves roll as soon as the floor is held' : 'AUTO-SEND OFF', 1400); AUD.play('ui'); if (this.auto && !this.core.waveActive && !this.core.over) this.sendWave(); }
    maxUpgrade() { const c = this.core; let n = 0; while (this.selTid != null) { const r = CS.upgrade(c, this.selTid); if (!r.ok) break; n++; } if (n) { AUD.play('upgrade'); const t = c.turrets.find(x => x.tid === this.selTid); if (t) this.puff(SX(t.x), SY(t.y) - 20, 0xe8c576); this.openSel(this.selTid); } else { AUD.play('deny'); this.toast(c.turrets.find(x => x.tid === this.selTid) && c.turrets.find(x => x.tid === this.selTid).tier >= CS.TIERS ? 'ALREADY MAX TIER' : 'NOT ENOUGH COIN', 1000); } }

    // ---------------------------------------------------------------- selection panel
    openSel(tid) {
      this.closeSel(); this.selTid = tid;
      const t = this.core.turrets.find(x => x.tid === tid); if (!t) return;
      const def = CS.TURRETS[t.def], sp = CS_CAST.OPERATIVES[t.def], st = CS.turretStats(this.core, t);
      const px = SX(t.x), py = SY(t.y);
      const x = px + 150 > RAIL_X - 20 ? px - 150 : px + 150, y = Math.max(BY + 110, Math.min(H - 110, py));
      const rr = SR(st.range); this.selRing.setPosition(px, py).setScale(rr * 2 / 128).setVisible(rr > 0);
      const panel = this.add.nineslice(x, y, 'ui_panel', undefined, 260, 200, 14, 14, 14, 14).setOrigin(0.5).setDepth(D.panel);
      this.selRect = { x0: x - 130, y0: y - 100, x1: x + 130, y1: y + 100 }; // scene pointer handlers must not fall through the panel onto the board
      const title = txt(this, x, y - 82, sp.title + ' · T' + t.tier, 14, GOLD).setOrigin(0.5).setDepth(D.panel + 1);
      const m = this.gunMods[t.def];
      const info = mono(this, x, y - 40, ['DMG ' + st.dmg.toFixed(1) + ' · ROF ' + st.rof.toFixed(2) + '/s', 'RANGE ' + (st.range * K / CELL).toFixed(1) + ' cells' + (t.gilded ? ' · GILDED +10%' : ''), 'KILLS ' + (t.kills || 0) + ' · DEALT ' + Math.round(t.dealt || 0), m ? 'IRON: ' + m.gunName : (t.auraDmg ? 'RALLIED' : '')].join('\n'), 11, INK, { align: 'center' }).setOrigin(0.5).setDepth(D.panel + 1);
      const up = t.tier < CS.TIERS ? CS.tierCost(def, t.tier + 1) : null;
      const b1 = button(this, x - 74, y + 42, 100, 32, up ? 'UP ' + up + '⛁' : 'MAX TIER', () => this.doUpgrade(), { hot: !!up && this.core.coins >= up, size: 11, depth: D.panel + 1 });
      const bMax = button(this, x + 8, y + 42, 54, 32, 'MAX', () => this.maxUpgrade(), { size: 10, depth: D.panel + 1, color: up ? GOLD : DIM });
      const refund = Math.round(def.cost * 0.7 + (t.tier > 1 ? CS.tierCost(def, 2) * 0.7 : 0) + (t.tier > 2 ? CS.tierCost(def, 3) * 0.7 : 0));
      const b2 = button(this, x + 82, y + 42, 84, 32, 'SELL ' + refund + '⛁', () => this.doSell(), { size: 10, depth: D.panel + 1 });
      const b3 = button(this, x, y + 80, 240, 28, 'PRIORITY: ' + (t.priority || 'first').toUpperCase(), () => { CS.cyclePriority(this.core, tid); this.openSel(tid); }, { size: 10, depth: D.panel + 1 });
      this.selPanel = [panel, title, info, b1, bMax, b2, b3];
    }
    closeSel() { if (this.selPanel) { this.selPanel.forEach(o => o.destroy()); this.selPanel = null; } this.selRect = null; this.selTid = null; this.selRing.setVisible(false); }
    overUI(p) { const r = this.selRect; return !!(r && p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1); }
    doUpgrade() { const r = CS.upgrade(this.core, this.selTid); if (r.ok) { AUD.play('upgrade'); const t = this.core.turrets.find(x => x.tid === this.selTid); if (t) this.puff(SX(t.x), SY(t.y) - 20, 0xe8c576); this.openSel(this.selTid); } else { AUD.play('deny'); this.toast(r.err || 'NOT ENOUGH COIN', 1000); } }
    doSell() { const r = CS.sell(this.core, this.selTid); if (r.ok) { AUD.play('sell'); this.closeSel(); } }

    // ---------------------------------------------------------------- update
    update(time, dtMs) {
      if (!this.core) return;
      const c = this.core;
      if (!this.paused && !c.over) {
        this.acc += Math.min(0.1, dtMs / 1000) * this.speed;
        const step = 1 / 60; let n = 0;
        // CS.step() RETURNS the drained event queue (core contract) — never drain again after it
        while (this.acc >= step && n++ < 24) { const evs = CS.step(c, step); this.acc -= step; this.handleEvents(evs); } // 24 = ×3 speed at ~8 fps still keeps up; beyond that we drop time rather than spiral
        if (this.acc > 0.5) this.acc = 0.5;
      }
      this.syncEnemies(); this.syncTurrets(); this.syncLobs(); this.syncHud();
      // adaptive score: intensity from the floor state, throttled to 4 Hz
      if ((this.musicT = (this.musicT || 0) + dtMs) > 250) { this.musicT = 0; const boss = c.enemies.some(e => e.boss); const I = c.waveActive ? Math.min(1, 0.3 + 0.45 * Math.min(1, c.enemies.length / 14) + 0.25 * (c.floor.endless ? Math.min(1, c.wave / 12) : c.wave / c.floor.waves)) : 0.08; AUD.setState({ scene: 'battle', floor: c.floorId, intensity: I, active: !!c.waveActive, boss, danger: c.markers > 0 && c.markers <= 5 }); }
      if (this.lightning != null) { if (Math.random() < 0.0015) { this.cameras.main.flash(180, 220, 230, 255, false); } }
      // dmg texts drift
      for (let i = this.dmgTexts.length - 1; i >= 0; i--) { const d = this.dmgTexts[i]; d.y -= 0.6 * this.speed; if (time > d.die) { d.destroy(); this.dmgTexts.splice(i, 1); } }
      if (this.grain) this.grain.setTilePosition(Math.random() * 256, Math.random() * 256);
    }
    syncHud() {
      const c = this.core;
      const wmax = c.floor.endless ? '∞' : c.floor.waves;
      this.hudWave.setText('WAVE ' + c.wave + ' / ' + wmax + (c.waveActive ? '  ·  ' + c.enemies.length + ' ON THE FLOOR' : c.wave < (c.floor.endless ? 999 : c.floor.waves) ? '  ·  SEND WHEN READY' : ''));
      this.hudCoins.setText(c.coins + '');
      this.hudMarkers.setText(c.markers + '');
      this.hudMarkers.setColor(c.markers <= 5 ? RED : GREEN);
      this.btnWave.bg.setAlpha(c.waveActive || c.over ? 0.35 : 1);
      for (const k in this.cards) { const cd = this.cards[k]; const def = cd.def; const gate = def.holderOnly && !c.holder ? 'LOCKED' : this.banned === k ? 'BANNED' : null; cd.cost.setText(gate === 'LOCKED' ? 'KJP GEAR' : gate === 'BANNED' ? 'CONFISCATED' : def.cost + '⛁'); cd.cost.setColor(gate ? DIM : c.coins >= def.cost ? GOLD : RED); cd.bg.setAlpha(gate ? 0.55 : 1); }
    }
    // ---- enemies
    syncEnemies() {
      const c = this.core, seen = new Set();
      for (const e of c.enemies) {
        seen.add(e.eid);
        let v = this.enemyViews.get(e.eid);
        const p = CS.posAlong(c.parsed, e.d);
        const x = SX(p.x), y = SY(p.y);
        if (!v) v = this.makeEnemyView(e, x, y);
        // facing: from delta
        const dx = x - (v.lastX == null ? x : v.lastX);
        if (Math.abs(dx) > 0.2) v.body.setFlipX(dx < 0);
        v.lastX = x;
        v.body.setPosition(x, y + 6);
        if (v.gun) { const a = v.ch.fist2 || v.ch.fist; const s = Math.abs(v.body.scaleX), gs = s * 1.15; const gx = (a.x - v.ch.frameW / 2) * s, gy = (v.ch.baseY - a.y) * s; v.gun.setPosition(v.body.x + gx * (v.body.flipX ? -1 : 1), v.body.y - gy).setScale(v.body.flipX ? -gs : gs, gs).setDepth(D.world + y + 1); }
        v.shadow.setPosition(x, y + 8);
        v.body.setDepth(D.world + y);
        // hp bar
        const frac = Math.max(0, e.hp / e.maxHp);
        const by = Math.max(HUD_H + 8, y - v.h - 6); // row-0 walkers: never tuck the bar under the HUD
        v.hpBg.setPosition(x, by).setVisible(frac < 1 || e.boss); v.hp.setPosition(x - 28, by).setVisible(v.hpBg.visible).setScale(frac, 1);
        v.hp.setTint(e.boss ? 0xff5c5c : frac > 0.5 ? 0x7cf9a5 : frac > 0.25 ? 0xffd75e : 0xff5c5c);
        // states
        const cloak = e.cloaked;
        v.body.setAlpha(cloak ? 0.28 : 1); if (v.gun) v.gun.setAlpha(cloak ? 0.28 : 1);
        v.shimmer.setPosition(x, y - v.h / 2).setVisible(!!e.type.match(/ghost/) && cloak);
        if (e.slowT > 0) { v.body.setTint(0x9ff3ff); v.slow.setPosition(x, y + 4).setVisible(true).setAngle(v.slow.angle + 2); } else { if (v.hitT > 0) { v.hitT -= 1; v.body.setTint(0xffffff); } else v.body.clearTint(); v.slow.setVisible(false); }
        if (v.hitT > 0 && !(e.slowT > 0)) v.body.setTintFill(0xffffff);
        v.name.setPosition(x, Math.max(HUD_H + 8, y - v.h - 6) - 14).setVisible(!!e.boss);
      }
      for (const [eid, v] of this.enemyViews) if (!seen.has(eid)) { this.killEnemyView(eid, v); }
    }
    makeEnemyView(e, x, y) {
      const type = e.type;
      let key, ch, scale;
      if (type === 'hound') { key = 'en_hound'; ch = ART.chars.en_hound; scale = 1; }
      else if (type === 'boss') { const bi = this.core.floor.endless ? (this.core.wave % 6) : (this.core.floorId - 1) % 6; key = 'en_boss' + bi; ch = ART.chars[key]; scale = ENEMY_SCALE.boss; }
      else { const vnum = e.eid % 3; key = 'en_' + type + vnum; ch = ART.chars[key]; scale = ENEMY_SCALE[type] || 0.62; }
      const body = this.add.sprite(x, y, key + '_run').setOrigin(0.5, ch.baseY / ch.frameH).setScale(scale).setDepth(D.world + y);
      body.play(key + '_run');
      const shadow = this.add.ellipse(x, y + 8, 30 * scale + 8, 10 * scale + 4, 0x000000, 0.35).setDepth(D.shadow);
      const h = (ch.frameH * (ch.baseY / ch.frameH)) * scale;
      const hpBg = this.add.image(x, y - h - 6, 'ui_hpBar').setDepth(D.air).setScale(1, 1);
      const hp = this.add.image(x - 28, y - h - 6, 'ui_hpFill').setOrigin(0, 0.5).setDepth(D.air + 1);
      const shimmer = this.add.image(x, y, 'fx_shimmer').setDepth(D.air).setAlpha(0.6).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      const slow = this.add.image(x, y, 'fx_slowRing').setDepth(D.floorFx + 2).setAlpha(0.8).setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setScale(scale + 0.2);
      let gun = null;
      if (ch.gun && ART.guns[ch.gun]) { const g = ART.guns[ch.gun]; gun = this.add.image(x, y, 'gun_' + ch.gun).setOrigin(g.grip.x / g.w, g.grip.y / g.h).setScale(scale * 1.15).setDepth(D.world + y + 1); }
      const name = txt(this, x, y - h - 20, e.boss ? (this.core.floor.endless ? 'THE COLLECTOR' : CS.BOSS_NAMES[(this.core.floorId - 1) % 6]) : '', 12, RED).setOrigin(0.5).setDepth(D.air + 2).setVisible(!!e.boss);
      const v = { body, shadow, hpBg, hp, shimmer, slow, gun, name, ch, h, hitT: 0, lastX: null, type };
      this.enemyViews.set(e.eid, v);
      if (e.boss) { this.banner(name.text, 'BOSS ON THE FLOOR', 1800); AUD.play('boss'); }
      return v;
    }
    killEnemyView(eid, v) {
      this.enemyViews.delete(eid);
      [v.hpBg, v.hp, v.shimmer, v.slow, v.name].forEach(o => o.destroy());
      // fall + fade (death) — leaks are removed by the leak handler instantly
      const dir = v.body.flipX ? 1 : -1;
      this.tweens.add({ targets: v.body, angle: 82 * dir, y: v.body.y + 6, alpha: 0, duration: 520, ease: 'Quad.easeIn', onComplete: () => v.body.destroy() });
      if (v.gun) this.tweens.add({ targets: v.gun, angle: 140 * dir, y: v.gun.y + 18, alpha: 0, duration: 420, onComplete: () => v.gun.destroy() });
      this.tweens.add({ targets: v.shadow, alpha: 0, duration: 500, onComplete: () => v.shadow.destroy() });
    }
    // ---- turrets
    syncTurrets() {
      const c = this.core, seen = new Set();
      for (const t of c.turrets) {
        seen.add(t.tid);
        let v = this.turretViews.get(t.tid);
        const x = SX(t.x), y = SY(t.y) + 22;
        if (!v) v = this.makeTurretView(t, x, y);
        // aim: core writes t.angle (sim atan2 to the last target) when it fires — same frame as the screen since K = 1
        if (t.angle != null) { v.aim = t.angle; v.faceLeft = Math.cos(t.angle) < 0; }
        v.body.setFlipX(!!v.faceLeft);
        // recoil decay
        v.kick *= 0.82;
        if (v.gun) {
          const a = v.ch.fist2 || v.ch.fist; const s = v.scale, gs = s * 1.15;
          const gx = (a.x - v.ch.frameW / 2) * s, gy = (v.ch.baseY - a.y) * s;
          // the gun is mirrored with a NEGATIVE x-scale (mirrors about the grip origin; flipX would mirror about the quad centre and slide the grip off the fist)
          let rel = v.aim == null ? 0 : (v.faceLeft ? v.aim - Math.PI : v.aim); rel = Math.atan2(Math.sin(rel), Math.cos(rel)); rel = Math.max(-0.7, Math.min(0.7, rel)); // clamp within the arm's reach
          const kx = -v.kick * 3;
          v.gun.setPosition(x + (gx + kx) * (v.faceLeft ? -1 : 1), y - gy - v.kick).setScale(v.faceLeft ? -gs : gs, gs).setRotation(rel).setDepth(D.world + y + 1);
        }
        v.body.setPosition(x - v.kick * 0.6 * (v.faceLeft ? -1 : 1), y);
        v.body.setDepth(D.world + y);
        v.tierT.setText(t.tier > 1 ? '★'.repeat(t.tier - 1) : '').setPosition(x, y - v.h - 4);
        v.gild.setVisible(!!t.gilded).setPosition(x, y - 4);
        v.aura.setVisible(!!t.auraDmg).setPosition(x, y - 4);
      }
      for (const [tid, v] of this.turretViews) if (!seen.has(tid)) { this.turretViews.delete(tid); [v.body, v.gun, v.shadow, v.tierT, v.gild, v.aura, v.pad].forEach(o => o && o.destroy()); }
    }
    makeTurretView(t, x, y) {
      const id = t.def, ch = ART.chars['op_' + id], scale = 0.62;
      const pad = this.add.ellipse(x, y - 2, 46, 16, 0x000000, 0.35).setDepth(D.shadow);
      const body = this.add.sprite(x, y, 'op_' + id + '_stand').setOrigin(0.5, ch.baseY / ch.frameH).setScale(scale).setDepth(D.world + y);
      body.play('op_' + id + '_stand');
      let gun = null;
      const gt = this.gunTypeFor(id);
      if (gt && ART.guns[gt]) { const g = ART.guns[gt]; gun = this.add.image(x, y, 'gun_' + gt).setOrigin(g.grip.x / g.w, g.grip.y / g.h).setScale(scale * 1.15).setDepth(D.world + y + 1); if (CS_CAST.OPERATIVES[id].holo || gt >= 11) { try { gun.postFX.addGlow(0xffd23f, 2, 0, false, 0.1, 8); } catch (e) {} } }
      const h = ch.baseY * scale;
      const tierT = txt(this, x, y - h - 4, '', 12, GOLD).setOrigin(0.5).setDepth(D.air);
      const gild = this.add.image(x, y - 4, 'fx_glow').setTint(0xe8c576).setBlendMode(Phaser.BlendModes.ADD).setScale(0.9).setAlpha(0.35).setDepth(D.floorFx + 1).setVisible(false);
      const aura = this.add.image(x, y - 4, 'fx_glow').setTint(0x7cf9a5).setBlendMode(Phaser.BlendModes.ADD).setScale(1.1).setAlpha(0.22).setDepth(D.floorFx + 1).setVisible(false);
      const v = { body, gun, shadow: pad, pad, tierT, gild, aura, ch, scale, h, kick: 0, aim: null, faceLeft: false, gunType: gt };
      this.turretViews.set(t.tid, v);
      // placement pop
      body.setScale(scale * 0.2); this.tweens.add({ targets: body, scaleX: scale, scaleY: scale, duration: 260, ease: 'Back.easeOut' });
      this.puff(x, y - 20, 0xe8c576);
      return v;
    }
    // ---- lobs (kegs in the air)
    syncLobs() {
      const c = this.core, seen = new Set();
      // core lobs are {x,y,tx,ty,tAir,dmg,splash,srcTid} with no id — key views by the object itself, remember the launch tAir
      for (const l of c.lobs || []) {
        seen.add(l);
        let v = this.lobViews.get(l);
        if (!v) { v = { s: this.add.image(0, 0, 'fx_keg').setDepth(D.air), sh: this.add.ellipse(0, 0, 14, 6, 0x000000, 0.3).setDepth(D.shadow), total: Math.max(0.05, l.tAir) }; this.lobViews.set(l, v); }
        const f = 1 - Math.max(0, Math.min(1, l.tAir / v.total)); const x = SX(l.x + (l.tx - l.x) * f), y = SY(l.y + (l.ty - l.y) * f); const arc = Math.sin(f * Math.PI) * 70 + (1 - f) * 30;
        v.s.setPosition(x, y - arc).setAngle(f * 540); v.sh.setPosition(x, y).setScale(Math.max(0.3, 1 - arc / 140));
      }
      for (const [id, v] of this.lobViews) if (!seen.has(id)) { this.lobViews.delete(id); v.s.destroy(); v.sh.destroy(); }
    }

    // ---------------------------------------------------------------- events → FX
    handleEvents(evs) {
      const c = this.core;
      for (const ev of evs) {
        switch (ev.t) {
          case 'shot': this.fxShot(ev); break;
          case 'chain': this.fxChain(ev); break;
          case 'lob': AUD.play('lob'); break;
          case 'splash': { const x = SX(ev.x), y = SY(ev.y); const R = SR(ev.radius || 72);
            // fireball: hot core flash → expanding shock ring → sparks + smoke → scorch that lingers on the floor
            const core = this.add.image(x, y - 6, 'fx_glow').setTint(0xffb347).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.air).setScale(0.5).setAlpha(1); this.fxLayer.add(core);
            this.tweens.add({ targets: core, scale: R / 40, alpha: 0, duration: 260, ease: 'Quad.easeOut', onComplete: () => core.destroy() });
            this.ringFx(x, y, 0xff9d3d, R / 20); this.sparks(x, y - 4, 0xffb347, 10); this.smoke(x, y - 8, 5);
            const scorch = this.add.image(x, y + 4, 'fx_bulletHole').setDepth(D.floorFx).setScale(R / 4, R / 6).setAlpha(0.42); this.tweens.add({ targets: scorch, alpha: 0, delay: 5000, duration: 3000, onComplete: () => scorch.destroy() });
            this.cameras.main.shake(140, 0.005); AUD.play('splash'); break; }
          case 'die': { const v = this.enemyViews.get(ev.eid); const x = v ? v.body.x : SX(ev.x), y = v ? v.body.y - v.h * 0.5 : SY(ev.y) - 20; this.sparks(x, y, 0xffd27f, 6); this.coinPop(x, y, ev.bounty); if (ev.boss) { this.ringFx(x, y, 0xffd23f, 3); this.cameras.main.shake(300, 0.008); AUD.play('boss_die'); } else AUD.play('die'); break; }
          case 'leak': { const v = this.enemyViews.get(ev.eid); if (v) { this.enemyViews.delete(ev.eid); [v.body, v.gun, v.shadow, v.hpBg, v.hp, v.shimmer, v.slow, v.name].forEach(o => o && o.destroy()); } this.cameras.main.shake(160, 0.006); this.cameras.main.flash(120, 255, 40, 40, false); this.toast('THEY MADE THE STAIRWELL  −' + (ev.leak || 1) + ' MARKER' + ((ev.leak || 1) > 1 ? 'S' : ''), 1200); AUD.play('leak'); break; }
          case 'wave_start': this.banner('WAVE ' + ev.wave, ev.count + ' COMING UP THE STAIRS', 1500); break;
          case 'wave_clear': { this.banner('FLOOR HELD', '+' + (ev.bonus || 0) + '⛁ WAVE BONUS' + (ev.early ? ' · EARLY CALL' : ''), 1400); AUD.play('coin'); AUD.cue('clear'); if (this.auto) this.time.delayedCall(1600, () => { if (this.auto && !this.finished && this.sys.isActive() && !this.core.waveActive && !this.core.over) this.sendWave(); }); break; }
          case 'interest': this.toast('+' + ev.amount + '⛁ INTEREST', 900); break;
          case 'mint': { const t = c.turrets.find(x => x.tid === ev.tid); if (t) { this.coinPop(SX(t.x), SY(t.y) - 30, ev.amount); AUD.play('mint'); } break; }
          case 'place': break;
          case 'upgrade': break;
          case 'sell': { const v = this.turretViews.get(ev.tid); if (v) this.puff(v.body.x, v.body.y - 20, 0x9aa7bd); break; }
          case 'cloak': { const v = this.enemyViews.get(ev.eid); if (v) this.puff(v.body.x, v.body.y - 20, 0x9fb4e0); break; }
          case 'reveal': { const v = this.enemyViews.get(ev.eid); if (v) { this.sparks(v.body.x, v.body.y - 20, 0x9ff3ff, 4); AUD.play('reveal'); } break; }
          case 'marked': case 'mark_hit': { const v = this.enemyViews.get(ev.eid); if (v) this.dmgText(v.body.x, v.body.y - v.h, 'MARKED', GOLD); break; }
          case 'dash': { const v = this.enemyViews.get(ev.eid); if (v) this.smoke(v.body.x, v.body.y, 2); break; }
          case 'win': this.finish(true); break;
          case 'lose': this.finish(false); break;
        }
      }
    }
    fxShot(ev) {
      const c = this.core;
      const tv = this.turretViews.get(ev.tid); if (!tv) return;
      const t = c.turrets.find(x => x.tid === ev.tid); if (!t) return;
      const def = CS.TURRETS[t.def];
      // core shot payload: {kind, tid, x, y, tx, ty, crit} — target point in sim space; find the victim by proximity
      const e = ev.tx != null ? this.enemyNear(ev.tx, ev.ty) : null;
      const tx = ev.tx != null ? SX(ev.tx) : tv.body.x + 40, ty = ev.ty != null ? SY(ev.ty) - 18 : tv.body.y - 30;
      const stats = CS.turretStats(c, t); const shown = Math.round(stats.dmg * (ev.crit ? (def.critMult || 2) : 1));
      // muzzle point: from the gun sprite (rotate the muzzle vector)
      let mx = tv.body.x + (tv.faceLeft ? -26 : 26), my = tv.body.y - 32;
      if (tv.gun && ART.guns[tv.gunType]) { const g = ART.guns[tv.gunType]; const mvx = (g.muzzle.x - g.grip.x) * tv.gun.scaleX, mvy = (g.muzzle.y - g.grip.y) * tv.gun.scaleY; const r = tv.gun.rotation; /* scaleX already carries the mirror sign */ mx = tv.gun.x + (Math.cos(r) * mvx - Math.sin(r) * mvy); my = tv.gun.y + (Math.sin(r) * mvx + Math.cos(r) * mvy); }
      tv.kick = def.id === 'sniper' ? 4 : def.id === 'shotgun' ? 3.2 : 1.6;
      const acc = ACCENT[def.id] || 0xffd27f;
      // muzzle flash (3 frames)
      const ang = Math.atan2(ty - my, tx - mx);
      const fl = this.add.image(mx, my, 'fx_muzzle0').setOrigin(0.05, 0.5).setRotation(ang).setTint(acc).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.air).setScale(def.id === 'shotgun' ? 1.5 : def.id === 'sniper' ? 1.4 : 1);
      this.fxLayer.add(fl);
      this.time.delayedCall(40, () => fl.setTexture('fx_muzzle1')); this.time.delayedCall(80, () => fl.setTexture('fx_muzzle2')); this.time.delayedCall(120, () => fl.destroy());
      const gl = this.add.image(mx, my, 'fx_glow').setTint(acc).setBlendMode(Phaser.BlendModes.ADD).setScale(0.6).setAlpha(0.7).setDepth(D.air); this.fxLayer.add(gl); this.tweens.add({ targets: gl, alpha: 0, scale: 1.1, duration: 140, onComplete: () => gl.destroy() });
      // tracer
      const dist = Math.hypot(tx - mx, ty - my);
      const tr = this.add.image(mx, my, 'fx_tracer').setOrigin(1, 0.5).setRotation(ang).setTint(acc).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.air).setScale(Math.max(0.5, Math.min(2.2, dist / 48)), 1); this.fxLayer.add(tr);
      this.tweens.add({ targets: tr, x: tx, y: ty, alpha: 0, duration: Math.min(140, 40 + dist * 0.25), onComplete: () => tr.destroy() });
      // shell casing
      const sh = this.add.image(mx - (tv.faceLeft ? -8 : 8), my, 'fx_shell').setDepth(D.air).setAngle(Math.random() * 90); this.tweens.add({ targets: sh, x: sh.x - (tv.faceLeft ? -18 : 18) - Math.random() * 10, y: sh.y + 34, angle: sh.angle + 220, alpha: 0, duration: 420, ease: 'Quad.easeIn', onComplete: () => sh.destroy() });
      // hit
      // hit: flash the victim, sparks + damage number (dmg numbers throttled per turret so SMG/gatling don't wallpaper the floor)
      const v = e ? this.enemyViews.get(e.eid) : null;
      if (v) v.hitT = 2;
      this.sparks(tx, ty, ev.crit ? 0xffd23f : acc, ev.crit ? 8 : def.id === 'shotgun' ? 6 : 3);
      const now = this.time.now; tv.lastNum = tv.lastNum || 0;
      if (ev.crit || now - tv.lastNum > (def.id === 'smg' || def.id === 'gatling' ? 260 : 90)) { tv.lastNum = now; this.dmgText(tx + (Math.random() * 16 - 8), ty - 12, (ev.crit ? '✦' : '') + shown, ev.crit ? GOLD : '#e6ecf5'); }
      if (ev.crit) { const cr = this.add.image(tx, ty, 'fx_crit').setBlendMode(Phaser.BlendModes.ADD).setDepth(D.air); this.fxLayer.add(cr); this.tweens.add({ targets: cr, scale: 1.8, alpha: 0, duration: 260, onComplete: () => cr.destroy() }); }
      // shotgun burst: pellet sparks fan across neighbours of the target
      if (def.kind === 'burst') { for (const ee of c.enemies) { if (e && ee.eid === e.eid) continue; const pp = CS.posAlong(c.parsed, ee.d); if (Math.hypot(pp.x - ev.tx, pp.y - ev.ty) <= (def.burstRadius || def.splash || 40)) { this.sparks(SX(pp.x), SY(pp.y) - 16, acc, 2); const vv = this.enemyViews.get(ee.eid); if (vv) vv.hitT = 2; } } }
      const sfx = SHOT_SFX[def.id]; if (sfx && (def.id !== 'smg' && def.id !== 'gatling' || Math.random() < 0.5)) AUD.play(sfx);
    }
    fxChain(ev) {
      const c = this.core;
      const tv = this.turretViews.get(ev.tid); if (!tv) return;
      let px = tv.body.x, py = tv.body.y - 34;
      // core chain payload: {tid, x, y, points:[{x,y}…]} in sim space
      const pts = (ev.points || []).map(p => { const e = this.enemyNear(p.x, p.y); const v = e ? this.enemyViews.get(e.eid) : null; if (v) v.hitT = 2; return { x: SX(p.x), y: SY(p.y) - 20 }; });
      for (const q of pts) {
        const d = Math.hypot(q.x - px, q.y - py), a = Math.atan2(q.y - py, q.x - px);
        const seg = this.add.image(px, py, 'fx_arc').setOrigin(0, 0.5).setRotation(a).setScale(Math.max(0.3, d / 64), 1 + Math.random() * 0.4).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.air).setAlpha(0.95); this.fxLayer.add(seg);
        this.tweens.add({ targets: seg, alpha: 0, duration: 160, onComplete: () => seg.destroy() });
        this.sparks(q.x, q.y, 0x9ff3ff, 3);
        const ring = this.add.image(q.x, q.y + 12, 'fx_slowRing').setBlendMode(Phaser.BlendModes.ADD).setDepth(D.floorFx + 2).setScale(0.6); this.tweens.add({ targets: ring, scale: 1.2, alpha: 0, duration: 380, onComplete: () => ring.destroy() });
        px = q.x; py = q.y;
      }
      const g0 = this.add.image(tv.body.x, tv.body.y - 34, 'fx_glow').setTint(0x9ff3ff).setBlendMode(Phaser.BlendModes.ADD).setScale(0.8).setAlpha(0.8).setDepth(D.air); this.fxLayer.add(g0); this.tweens.add({ targets: g0, alpha: 0, scale: 1.4, duration: 200, onComplete: () => g0.destroy() });
      AUD.play('tesla');
    }
    // nearest live enemy to a sim-space point (events carry positions, not victim ids)
    enemyNear(x, y, maxD) {
      const c = this.core; let best = null, bd = (maxD || 26) * (maxD || 26);
      for (const e of c.enemies) { if (e.hp <= 0) continue; const p = CS.posAlong(c.parsed, e.d); const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y); if (d < bd) { bd = d; best = e; } }
      return best;
    }
    sparks(x, y, tint, n) {
      for (let i = 0; i < (n || 4); i++) { const s = this.add.image(x, y, 'fx_spark').setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.air).setScale(0.6 + Math.random() * 0.6); this.fxLayer.add(s); const a = Math.random() * Math.PI * 2, d = 10 + Math.random() * 22; this.tweens.add({ targets: s, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d + 8, alpha: 0, scale: 0.1, duration: 220 + Math.random() * 200, onComplete: () => s.destroy() }); }
    }
    ringFx(x, y, tint, scale) { const r = this.add.image(x, y, 'fx_ring').setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.floorFx + 2).setScale(0.3).setAlpha(0.9); this.fxLayer.add(r); this.tweens.add({ targets: r, scale: scale || 1.6, alpha: 0, duration: 380, onComplete: () => r.destroy() }); }
    smoke(x, y, n) { for (let i = 0; i < (n || 2); i++) { const s = this.add.image(x + (Math.random() - 0.5) * 12, y, 'fx_smoke').setDepth(D.air).setAlpha(0.55).setScale(0.5 + Math.random() * 0.4); this.tweens.add({ targets: s, y: y - 24 - Math.random() * 16, x: s.x + (Math.random() - 0.5) * 20, alpha: 0, scale: s.scale + 0.8, duration: 700 + Math.random() * 300, onComplete: () => s.destroy() }); } }
    puff(x, y, tint) { const g = this.add.image(x, y, 'fx_glow').setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.air).setScale(0.6).setAlpha(0.8); this.fxLayer.add(g); this.tweens.add({ targets: g, scale: 1.6, alpha: 0, duration: 380, onComplete: () => g.destroy() }); this.sparks(x, y, tint, 5); }
    coinPop(x, y, amount) { const n = Math.min(5, 1 + Math.floor((amount || 8) / 10)); for (let i = 0; i < n; i++) { const c = this.add.image(x, y, 'fx_coin').setDepth(D.air).setScale(0.8); const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.4, d = 26 + Math.random() * 20; this.tweens.add({ targets: c, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, duration: 260, ease: 'Quad.easeOut', onComplete: () => this.tweens.add({ targets: c, y: c.y + 30, alpha: 0, duration: 260, ease: 'Quad.easeIn', onComplete: () => c.destroy() }) }); } if (amount) this.dmgText(x, y - 20, '+' + amount + '⛁', GOLD); }
    dmgText(x, y, s, color) { const t = mono(this, x, y, s, 11, color || INK).setOrigin(0.5).setDepth(D.air + 3).setStroke('#05070c', 3); t.die = this.time.now + 700; this.tweens.add({ targets: t, alpha: 0, delay: 350, duration: 350 }); this.dmgTexts.push(t); if (this.dmgTexts.length > 40) { const d = this.dmgTexts.shift(); d.destroy(); } }

    // ---------------------------------------------------------------- results
    finish(win) {
      const c = this.core;
      if (this.finished) return; this.finished = true;
      const st = win ? CS.stars(c) : 0, sc = CS.score(c);
      if (this.opts.mode === 'campaign' && win) setStars(c.floorId, this.opts.difficulty, st);
      if (this.opts.mode === 'endless') { const b = parseInt(LS.get('cs_pit_best') || '0', 10); if (c.wave > b) LS.set('cs_pit_best', String(c.wave)); }
      if (this.opts.mode === 'daily' && this.opts.contract) { const k = 'cs_daily_' + this.opts.contract.date; const b = parseInt(LS.get(k) || '0', 10); if (sc > b) LS.set(k, String(sc)); }
      AUD.setState({ scene: 'results', intensity: 0, active: false, boss: false, danger: false }); AUD.play(win ? 'win' : 'lose');
      const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.72).setDepth(D.overlay).setInteractive();
      const panel = this.add.nineslice(W / 2, H / 2, 'ui_panel', undefined, 560, 420, 14, 14, 14, 14).setDepth(D.overlay + 1);
      txt(this, W / 2, H / 2 - 160, win ? (c.floor.endless ? 'THE PIT TOOK YOU' : 'FLOOR HELD') : 'ACCOUNT CLOSED', 34, win ? GOLD : RED).setOrigin(0.5).setDepth(D.overlay + 2);
      mono(this, W / 2, H / 2 - 122, c.floor.name + ' · ' + c.diff.name + (c.doctrine.id !== 'none' ? ' · ' + c.doctrine.name : ''), 12, DIM).setOrigin(0.5).setDepth(D.overlay + 2);
      for (let s = 0; s < 3; s++) this.add.image(W / 2 - 50 + s * 50, H / 2 - 74, s < st ? 'ui_starOn' : 'ui_starOff').setDepth(D.overlay + 2).setScale(0.8);
      const lines = ['SCORE ' + sc, 'MARKERS KEPT  ' + c.markers + ' / ' + c.startMarkers, 'KILLS ' + c.stats.kills + ' · LEAKS ' + c.stats.leaks, 'EARNED ' + c.stats.earned + '⛁ · SPENT ' + c.stats.spent + '⛁', c.floor.endless ? 'WAVES SURVIVED ' + c.wave : ''];
      mono(this, W / 2, H / 2 + 6, lines.filter(Boolean).join('\n'), 13, INK, { align: 'center', lineSpacing: 6 }).setOrigin(0.5).setDepth(D.overlay + 2);
      const bx = W / 2;
      if (win && this.opts.mode === 'campaign' && c.floorId < 6) button(this, bx - 130, H / 2 + 150, 220, 40, 'NEXT FLOOR ▸', () => this.scene.start('Battle', Object.assign({}, this.opts, { floor: c.floorId + 1 })), { hot: true, depth: D.overlay + 2 });
      else button(this, bx - 130, H / 2 + 150, 220, 40, 'RUN IT BACK', () => this.scene.restart(this.opts), { hot: true, depth: D.overlay + 2 });
      button(this, bx + 130, H / 2 + 150, 220, 40, 'THE ELEVATOR', () => this.scene.start('Floors'), { depth: D.overlay + 2 });
    }
  }
  window.__CS_SCENES.Battle = Battle;

  // ---------------------------------------------------------------- game config
  const cfg = {
    type: Phaser.AUTO, parent: 'game', width: W, height: H, backgroundColor: '#05070c',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, roundPixels: false, pixelArt: false, powerPreference: 'high-performance' },
    scene: [window.__CS_SCENES.Boot, window.__CS_SCENES.Title, window.__CS_SCENES.Floors, Battle],
  };
  window.CS_GAME = new Phaser.Game(cfg);
  // ---------------------------------------------------------------- QA hooks
  window.qaPump = function (n) { const g = window.CS_GAME; for (let i = 0; i < (n || 1); i++) { g.loop.step(performance.now() + i * 16.7); } return true; };
  window.qaScene = () => { const act = window.CS_GAME.scene.getScenes(true); return act.find(s => s.scene.key === 'Battle') || act[act.length - 1]; };
  window.qaShot = function (name) { const cv = window.CS_GAME.canvas; window.CS_GAME.renderer.snapshot(img => { fetch('/shot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, dataURL: img.src }) }); }); return true; };
  window.qaBattle = function (opts) { const g = window.CS_GAME; for (const s of g.scene.getScenes(true)) g.scene.stop(s.scene.key); g.scene.start('Battle', Object.assign({ floor: 1, difficulty: 'operative', mode: 'campaign' }, opts || {})); return true; };
})();
