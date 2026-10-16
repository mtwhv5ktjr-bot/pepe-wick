/* =========================================================================
   ARSENAL RANGE — the REAL WICK Arsenal roster.
   WICK_GUNS is copied from wick-arsenal/web/config.js (source of truth — the
   claims on the trading cards are promises people trade PLS against, so the
   range stats below trace to the cards' perk lines exactly).
   gunart.js (byte-identical to on-chain WickGunBodies) renders the art.
   ========================================================================= */
(function (global) {
  'use strict';

  // ---- names/rarities: 1:1 with wick-arsenal config.js ----
  const WICK_GUNS = {
    1:  { name: "Boogeyman P30",      cls: "Pistol",     rarity: "Common",   color: "#cfd6e0", holo: false, perk: "Balanced all-rounder" },
    2:  { name: "Continental Vector", cls: "SMG",        rarity: "Uncommon", color: "#7cf9a5", holo: false, perk: "Full-auto SMG: 13 rounds/sec" },
    3:  { name: "Kimber Breacher",    cls: "Shotgun",    rarity: "Uncommon", color: "#ff9d3d", holo: false, perk: "6-pellet blast" },
    4:  { name: "TTI Marksman",       cls: "Rifle",      rarity: "Rare",     color: "#7fd0ff", holo: false, perk: "Pierces 2 targets per shot · 34 dmg" },
    5:  { name: "Excommunicado",      cls: "Auto Rifle", rarity: "Epic",     color: "#b26bff", holo: false, perk: "Full-auto rifle: 9 rounds/sec, 15 dmg" },
    11: { name: "Gold Standard",      cls: "1/1 Platinum", rarity: "Platinum Holo", color: "#ffd23f", holo: true, perk: "Holo P30: +20% damage rapid pistol" },
    12: { name: "The Impossible",     cls: "1/1 Platinum", rarity: "Platinum Holo", color: "#8bd6ff", holo: true, perk: "Holo Vector: +20% damage full-auto" },
    13: { name: "High Table",         cls: "1/1 Platinum", rarity: "Platinum Holo", color: "#e6c3ff", holo: true, perk: "Holo Breacher: 6 pellets, +20% damage" },
    14: { name: "Tabula Rasa",        cls: "1/1 Platinum", rarity: "Platinum Holo", color: "#c8ffe0", holo: true, perk: "Holo Marksman: pierces 2, 41 dmg" },
    15: { name: "Baba Yaga",          cls: "1/1 Platinum", rarity: "Platinum Holo", color: "#ffe9a8", holo: true, perk: "Holo Excommunicado: 18 dmg full-auto" },
    16: { name: "Tangential Reaper",  cls: "1/1 Ultra Platinum", rarity: "Ultra Platinum Holo", color: "#7cf9a5", holo: true, perk: "Tri-arc: 3 rounds, every direction" },
  };
  global.WICK_GUNS = WICK_GUNS; // gunart.js card renderer reads this

  // ---- range ballistics per type — every number traces to the card's perk ----
  // pellets = pellets/shot, pierce = targets one round can pass through,
  // arc = simultaneous rounds in a horizontal fan (Reaper's tri-arc)
  const TYPE_STATS = {
    1:  { dmg: 34, rof: 4.5,  spread: 1.4, recoil: 1.5, mag: 15, reload: 1.1, auto: false, pellets: 1, pierce: 1, arc: 1, zoom: 1.0 },
    2:  { dmg: 11, rof: 13.0, spread: 2.8, recoil: 1.1, mag: 33, reload: 1.7, auto: true,  pellets: 1, pierce: 1, arc: 1, zoom: 1.0 },
    3:  { dmg: 14, rof: 1.3,  spread: 5.5, recoil: 3.2, mag: 7,  reload: 2.4, auto: false, pellets: 6, pierce: 1, arc: 1, zoom: 1.0 },
    4:  { dmg: 34, rof: 3.2,  spread: 0.8, recoil: 2.2, mag: 16, reload: 1.9, auto: false, pellets: 1, pierce: 2, arc: 1, zoom: 1.6 },
    5:  { dmg: 15, rof: 9.0,  spread: 2.2, recoil: 1.6, mag: 30, reload: 2.0, auto: true,  pellets: 1, pierce: 1, arc: 1, zoom: 1.1 },
    11: { dmg: 41, rof: 5.2,  spread: 1.3, recoil: 1.5, mag: 15, reload: 1.1, auto: false, pellets: 1, pierce: 1, arc: 1, zoom: 1.0 },
    12: { dmg: 13, rof: 13.0, spread: 2.6, recoil: 1.1, mag: 33, reload: 1.7, auto: true,  pellets: 1, pierce: 1, arc: 1, zoom: 1.0 },
    13: { dmg: 17, rof: 1.3,  spread: 5.2, recoil: 3.2, mag: 7,  reload: 2.4, auto: false, pellets: 6, pierce: 1, arc: 1, zoom: 1.0 },
    14: { dmg: 41, rof: 3.2,  spread: 0.7, recoil: 2.2, mag: 16, reload: 1.9, auto: false, pellets: 1, pierce: 2, arc: 1, zoom: 1.6 },
    15: { dmg: 18, rof: 9.0,  spread: 2.1, recoil: 1.6, mag: 30, reload: 2.0, auto: true,  pellets: 1, pierce: 1, arc: 1, zoom: 1.1 },
    16: { dmg: 30, rof: 8.0,  spread: 1.8, recoil: 1.8, mag: 27, reload: 1.8, auto: true,  pellets: 1, pierce: 1, arc: 3, zoom: 1.1 },
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // realGun(tokenId, gunType) — identity from chain, feel from the card,
  // ±6% handling jitter per token id so two P30s are siblings, not clones.
  function realGun(id, type) {
    const G = WICK_GUNS[type] || WICK_GUNS[1];
    const base = TYPE_STATS[type] || TYPE_STATS[1];
    const rng = mulberry32((id * 2654435761 ^ 0xA25EA1) >>> 0);
    const j = () => 0.94 + rng() * 0.12;
    // serial rule from the mint: token #1 is the Reaper (No 000), publics are id-1
    const serial = type === 16 ? 'No 000 / 100' : 'No ' + String(Math.max(0, id - 1)).padStart(3, '0') + ' / 100';
    return {
      id, type,
      name: G.name, cls: G.cls, rarity: G.rarity, holo: G.holo,
      color: G.color, perk: G.perk, serial,
      stats: {
        dmg: base.dmg,
        rof: +(base.rof * j()).toFixed(2),
        spread: +(base.spread * j()).toFixed(2),
        recoil: +(base.recoil * j()).toFixed(2),
        mag: base.mag,
        reload: +(base.reload * j()).toFixed(2),
        auto: base.auto, pellets: base.pellets, pierce: base.pierce, arc: base.arc, zoom: base.zoom,
      },
    };
  }

  // ---- WICK MODS: the free-mint attachments. Effects mirror pepe-zero's MODDEFS
  // exactly (same honesty rule as the cards) — 3 slots per gun, no duplicate
  // type on one gun, a mod token bolts to ONE gun. Long Barrel's bullet speed
  // has no meaning on a hitscan range, so only its +5% damage applies here. ----
  const WICK_MODS = {
    1: { name: "LASER SIGHT",     tag: "LASER",  rarity: "Common",   color: "#7fd0ff", fx: "spread ×0.35 — near-laser accuracy" },
    2: { name: "HOLLOW POINTS",   tag: "HP+",    rarity: "Common",   color: "#ff9d9d", fx: "+15% damage" },
    3: { name: "HAIR TRIGGER",    tag: "RPS+",   rarity: "Uncommon", color: "#ffd75e", fx: "+15% fire rate" },
    4: { name: "LONG BARREL",     tag: "BARREL", rarity: "Uncommon", color: "#c8ffe0", fx: "+30% bullet speed, +5% damage" },
    5: { name: "AP ROUNDS",       tag: "AP",     rarity: "Rare",     color: "#b26bff", fx: "+1 pierce" },
    6: { name: "DRAGON'S BREATH", tag: "DRAGON", rarity: "Epic",     color: "#ff6b3d", fx: "+1 projectile per shot" },
  };
  const MOD_SLOTS = 3;
  function applyMods(stats, modTypes) {
    const s = Object.assign({}, stats);
    const seen = new Set();
    for (const t of modTypes || []) {
      if (seen.has(t) || !WICK_MODS[t]) continue; // duplicates don't stack
      seen.add(t);
      if (seen.size > MOD_SLOTS) break;
      if (t === 1) s.spread = +(s.spread * 0.35).toFixed(3);
      if (t === 2) s.dmg = Math.round(s.dmg * 1.15);
      if (t === 3) s.rof = +(s.rof * 1.15).toFixed(2);
      if (t === 4) s.dmg = Math.round(s.dmg * 1.05);
      if (t === 5) s.pierce = (s.pierce || 1) + 1;
      if (t === 6) { if (s.arc > 1) s.arc += 1; else s.pellets = (s.pellets || 1) + 1; }
    }
    return s;
  }

  global.WICK_MODS = WICK_MODS;
  global.ARSENAL_ROSTER = { WICK_GUNS, WICK_MODS, MOD_SLOTS, TYPE_STATS, realGun, applyMods, mulberry32 };
})(typeof window !== 'undefined' ? window : globalThis);
