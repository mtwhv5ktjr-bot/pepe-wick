/* =========================================================================
   ARSENAL RANGE — gunsmith. Deterministic parametric gun generator for
   WICK ARSENAL token ids 1..101. Pure JS, zero three.js — the 3D layer
   builds meshes FROM these specs; node tests verify determinism.
   NOTE: cosmetic mapping only — real tiers/art live on-chain in wick-arsenal.
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

  const MAX_ID = 101;
  const EXCOM_IDS = [7, 23, 51, 84, 101]; // holo-tier stand-ins (cosmetic)

  const ARCHETYPES = {
    pistol:  { w: 18, name: 'PISTOL',  dmg: 34, rof: 4.2,  spread: 1.6, recoil: 1.6, mag: 12, reload: 1.1, pellets: 1, auto: false, zoom: 1.0 },
    micro:   { w: 12, name: 'MICRO',   dmg: 16, rof: 11.5, spread: 3.4, recoil: 1.1, mag: 21, reload: 1.5, pellets: 1, auto: true,  zoom: 1.0 },
    smg:     { w: 16, name: 'SMG',     dmg: 21, rof: 9.0,  spread: 2.6, recoil: 1.2, mag: 30, reload: 1.7, pellets: 1, auto: true,  zoom: 1.05 },
    shotgun: { w: 13, name: 'SHOTGUN', dmg: 12, rof: 1.4,  spread: 5.5, recoil: 3.2, mag: 7,  reload: 2.4, pellets: 8, auto: false, zoom: 1.0 },
    rifle:   { w: 16, name: 'RIFLE',   dmg: 30, rof: 7.0,  spread: 1.9, recoil: 1.7, mag: 30, reload: 1.9, pellets: 1, auto: true,  zoom: 1.15 },
    dmr:     { w: 11, name: 'DMR',     dmg: 52, rof: 3.2,  spread: 1.0, recoil: 2.4, mag: 15, reload: 2.0, pellets: 1, auto: false, zoom: 1.5 },
    sniper:  { w: 8,  name: 'SNIPER',  dmg: 120, rof: 0.9, spread: 0.25, recoil: 4.5, mag: 5, reload: 2.8, pellets: 1, auto: false, zoom: 2.6 },
    lmg:     { w: 7,  name: 'LMG',     dmg: 24, rof: 8.5,  spread: 3.0, recoil: 2.0, mag: 75, reload: 3.6, pellets: 1, auto: true,  zoom: 1.05 },
  };

  const RARITIES = {
    common:  { name: 'SERVICE',       mult: 1.00, body: 0x3a4150, accent: 0x6b7688, glowHex: '#9aa7bd' },
    emerald: { name: 'EMERALD',       mult: 1.04, body: 0x1f3a2c, accent: 0x2fbf71, glowHex: '#7cfc9c' },
    violet:  { name: 'HIGH TABLE',    mult: 1.08, body: 0x2c2440, accent: 0x8a5cf5, glowHex: '#b79bff' },
    gold:    { name: 'GILDED',        mult: 1.12, body: 0x3a2f14, accent: 0xd4b24c, glowHex: '#ffd97a' },
    excom:   { name: 'EXCOMMUNICADO', mult: 1.18, body: 0x1c1622, accent: 0xff3b5c, glowHex: '#ff6b8a' },
  };

  const MAKERS = ['KOSTAS', 'TARASOV', 'D’ANTONIO', 'SOMMELIER', 'HIGH TABLE', 'CONTINENTAL', 'ADJUDICATOR', 'BOWERY', 'RUSKA ROMA', 'CASSIAN & CO'];
  const EPITHETS = ['WHISPER', 'MARKER', 'CANDLE', 'EXCOMM', 'BLOOD OATH', 'DESK CLERK', 'CONCIERGE', 'LAST SUPPER', 'OPEN TABLE', 'FINE PRINT', 'RECKONING', 'COIN PRESS', 'CURFEW', 'AFTER HOURS', 'CHECKOUT'];

  function pickWeighted(rng, table) {
    let total = 0; for (const k in table) total += table[k].w;
    let roll = rng() * total;
    for (const k in table) { roll -= table[k].w; if (roll <= 0) return k; }
    return Object.keys(table)[0];
  }

  function genGun(id) {
    if (typeof id !== 'number' || id < 1 || id > MAX_ID) throw new Error('bad gun id ' + id);
    const rng = mulberry32((id * 2654435761 ^ 0xA55A11) >>> 0);
    const archKey = pickWeighted(rng, ARCHETYPES);
    const arch = ARCHETYPES[archKey];
    let rarKey;
    if (EXCOM_IDS.includes(id)) rarKey = 'excom';
    else {
      const r = rng();
      rarKey = r < 0.55 ? 'common' : r < 0.80 ? 'emerald' : r < 0.94 ? 'violet' : 'gold';
    }
    const rar = RARITIES[rarKey];
    const j = () => 0.85 + rng() * 0.30; // ±15% jitter
    const stats = {
      dmg: Math.round(arch.dmg * j() * rar.mult),
      rof: +(arch.rof * j()).toFixed(2),
      spread: +(arch.spread * j() / rar.mult).toFixed(2),
      recoil: +(arch.recoil * j() / rar.mult).toFixed(2),
      mag: Math.max(4, Math.round(arch.mag * j())),
      reload: +(arch.reload * j()).toFixed(2),
      pellets: arch.pellets,
      auto: arch.auto,
      zoom: arch.zoom,
    };
    const visual = {
      barrelLen: +(0.28 + rng() * 0.22 + (archKey === 'sniper' || archKey === 'dmr' ? 0.24 : 0)).toFixed(3),
      bodyLen: +(0.26 + rng() * 0.14 + (archKey === 'lmg' ? 0.1 : 0)).toFixed(3),
      bodyH: +(0.075 + rng() * 0.035).toFixed(3),
      suppressor: rng() < (rarKey === 'excom' ? 0.8 : 0.35),
      scope: archKey === 'sniper' || archKey === 'dmr' ? true : rng() < 0.3,
      drum: archKey === 'lmg' ? true : rng() < 0.15,
      stock: archKey !== 'pistol' && archKey !== 'micro',
      rail: rng() < 0.5,
      grip: rng() < 0.45 && archKey !== 'pistol',
      body: rar.body, accent: rar.accent,
    };
    const maker = MAKERS[Math.floor(rng() * MAKERS.length)];
    const epithet = EPITHETS[Math.floor(rng() * EPITHETS.length)];
    const model = archKey.toUpperCase().slice(0, 3) + '-' + (10 + Math.floor(rng() * 90));
    return {
      id, archetype: archKey, archName: arch.name,
      rarity: rarKey, rarityName: rar.name, glowHex: rar.glowHex,
      name: maker + ' ' + model,
      epithet: '“' + epithet + '”',
      stats, visual,
    };
  }

  // fixed house guns for visitors with no NFTs
  const LOANERS = [
    { id: 'house9', archetype: 'pistol', archName: 'PISTOL', rarity: 'common', rarityName: 'HOUSE', glowHex: '#9aa7bd',
      name: 'HOUSE NINE', epithet: '“FRONT DESK”',
      stats: { dmg: 34, rof: 4.0, spread: 1.6, recoil: 1.5, mag: 15, reload: 1.1, pellets: 1, auto: false, zoom: 1.0 },
      visual: { barrelLen: 0.34, bodyLen: 0.3, bodyH: 0.085, suppressor: false, scope: false, drum: false, stock: false, rail: true, grip: false, body: 0x3a4150, accent: 0x6b7688 } },
    { id: 'houseSMG', archetype: 'smg', archName: 'SMG', rarity: 'common', rarityName: 'HOUSE', glowHex: '#9aa7bd',
      name: 'HOUSE ELEVEN', epithet: '“ROOM SERVICE”',
      stats: { dmg: 20, rof: 9.0, spread: 2.8, recoil: 1.2, mag: 30, reload: 1.7, pellets: 1, auto: true, zoom: 1.05 },
      visual: { barrelLen: 0.3, bodyLen: 0.34, bodyH: 0.09, suppressor: true, scope: false, drum: false, stock: true, rail: true, grip: true, body: 0x3a4150, accent: 0x6b7688 } },
    { id: 'house12', archetype: 'shotgun', archName: 'SHOTGUN', rarity: 'common', rarityName: 'HOUSE', glowHex: '#9aa7bd',
      name: 'HOUSE TWELVE', epithet: '“DO NOT DISTURB”',
      stats: { dmg: 12, rof: 1.3, spread: 5.5, recoil: 3.0, mag: 7, reload: 2.4, pellets: 8, auto: false, zoom: 1.0 },
      visual: { barrelLen: 0.42, bodyLen: 0.36, bodyH: 0.1, suppressor: false, scope: false, drum: false, stock: true, rail: false, grip: true, body: 0x3a4150, accent: 0x6b7688 } },
  ];

  // ---------- turret mods (CONTINENTAL SIEGE integration) ----------
  // Budget-neutral envelope: an NFT gun RESHAPES a tower, it does not outclass
  // the base game. Hard caps keep holders ≤ ~+10% net DPS; rarity pays in
  // flavor perks, not raw power. Non-holders stay fully viable (bot-tested).
  const MOD_CAPS = { statMin: 0.90, statMax: 1.12, dpsCap: 1.10 };
  function clampf(v, a, b) { return v < a ? a : v > b ? b : v; }
  function turretMods(spec) {
    const base = ARCHETYPES[spec.archetype];
    let dmgMult = spec.stats.dmg / base.dmg;
    let rofMult = spec.stats.rof / base.rof;
    if (spec.visual.suppressor) dmgMult += 0.04;
    dmgMult = clampf(dmgMult, MOD_CAPS.statMin, MOD_CAPS.statMax);
    rofMult = clampf(rofMult, MOD_CAPS.statMin, MOD_CAPS.statMax);
    const p = dmgMult * rofMult;
    if (p > MOD_CAPS.dpsCap) { const s = Math.sqrt(MOD_CAPS.dpsCap / p); dmgMult *= s; rofMult *= s; }
    let rangeMult = 1 + (spec.visual.scope ? 0.04 : 0) - (spec.visual.suppressor ? 0.04 : 0) + (spec.rarity === 'emerald' ? 0.06 : 0);
    rangeMult = clampf(rangeMult, 0.94, 1.12);
    return {
      dmgMult: +dmgMult.toFixed(4),
      rofMult: +rofMult.toFixed(4),
      rangeMult: +rangeMult.toFixed(4),
      refundBonus: spec.rarity === 'violet' ? 0.07 : 0,
      coinKill: spec.rarity === 'gold' ? 1 : 0,
      markChance: spec.rarity === 'excom' ? 0.05 : 0,
      gunName: spec.name + ' ' + spec.epithet,
      rarity: spec.rarity, rarityName: spec.rarityName, glowHex: spec.glowHex,
      accent: spec.visual.accent, srcId: spec.id,
    };
  }

  global.GUNSMITH = { genGun, LOANERS, MAX_ID, EXCOM_IDS, ARCHETYPES, RARITIES, mulberry32, turretMods, MOD_CAPS };
})(typeof window !== 'undefined' ? window : globalThis);
