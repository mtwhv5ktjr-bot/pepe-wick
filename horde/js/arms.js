/* =========================================================================
   PEPE WICK vs HORDE — arms. Turns a WICK Arsenal gun (+ WICK MODS) into the
   squad's weapon profile. Pure JS, node-tested.

   THE FAIRNESS LAW (the user's rule across every cabinet): a player with no
   NFT is fully viable; a holder feels the advantage without an easy mode.
   So: every gun keeps its SHAPE from the card (pellets, pierce, tri-arc,
   cadence) but its damage-per-second is NORMALISED into a narrow band around
   the house P30 — at most +15% for a standard gun, +20% for a holo 1/1.
   ========================================================================= */
(function (global) {
  'use strict';

  const R = global.ARSENAL_ROSTER;
  const EDGE_MAX = 0.15, HOLO_EDGE = 0.05;

  const LOANER = { id: 0, type: 1, name: 'HOUSE P30', cls: 'Pistol', rarity: 'House', holo: false, color: '#cfd6e0', perk: 'Issued by the desk. Returned on checkout.', loaner: true };

  function rawDps(s) {
    const pierceF = 1 + 0.45 * ((s.pierce || 1) - 1);
    return s.dmg * s.rof * (s.pellets || 1) * (s.arc || 1) * pierceF;
  }

  // gun: {id,type} from chain (or null → loaner); modTypes: [1..6] bolted to it
  function profile(gun, modTypes) {
    const g = gun && R.WICK_GUNS[gun.type] ? R.realGun(gun.id, gun.type) : null;
    const base = g ? g.stats : Object.assign({}, R.TYPE_STATS[1], { rof: 4.5 });
    const stats = R.applyMods(base, modTypes || []);
    const house = R.TYPE_STATS[1];
    const ratio = rawDps(stats) / rawDps(house);
    // compress the raw spread into the fairness band
    let edge = Math.max(-0.08, Math.min(EDGE_MAX, Math.log2(Math.max(0.2, ratio)) * 0.12));
    if (g && g.holo) edge = Math.min(EDGE_MAX + HOLO_EDGE, edge + HOLO_EDGE);
    const dpsMult = 1 + edge;
    const rof = Math.max(3.0, Math.min(13.0, stats.rof));
    const pellets = Math.max(1, Math.min(8, stats.pellets || 1));
    const pierce = Math.max(1, Math.min(4, stats.pierce || 1));
    const arc = Math.max(1, Math.min(3, stats.arc || 1));
    const mods = (modTypes || []).filter((t, i, a) => t >= 1 && t <= 6 && a.indexOf(t) === i).slice(0, 3);
    return {
      id: g ? g.id : 0, type: g ? g.type : 1,
      name: g ? g.name : LOANER.name, cls: g ? g.cls : LOANER.cls, rarity: g ? g.rarity : LOANER.rarity,
      holo: !!(g && g.holo), color: g ? g.color : LOANER.color, perk: g ? g.perk : LOANER.perk,
      serial: g ? g.serial : 'HOUSE', loaner: !g,
      rof, pellets, pierce, arc, spread: stats.spread, dpsMult, edge: +edge.toFixed(3),
      mods, laser: mods.includes(1), dragon: mods.includes(6), ap: mods.includes(5),
      // tracer style for the renderer
      tracer: g && g.holo ? 'holo' : arc > 1 ? 'arc' : pellets > 1 ? 'pellet' : pierce > 1 ? 'lance' : rof >= 9 ? 'auto' : 'pistol',
    };
  }

  // the full chain → profile resolve: owned guns, loadout preference, mods config
  function resolve(member, pref) {
    const guns = (member && member.guns) || [];
    if (!guns.length) return profile(null, []);
    let pick = null;
    if (pref && pref.gunId != null) pick = guns.find(x => x.id === pref.gunId) || null;
    if (!pick && pref && pref.gunType != null) pick = guns.find(x => x.type === pref.gunType) || null;
    if (!pick) pick = guns.slice().sort((a, b) => (R.WICK_GUNS[b.type] && R.WICK_GUNS[b.type].holo ? 1 : 0) - (R.WICK_GUNS[a.type] && R.WICK_GUNS[a.type].holo ? 1 : 0) || b.type - a.type)[0];
    const ownedTypes = guns.map(x => x.type);
    const cfg = (pref && pref.modcfg) || {};
    const alloc = global.WICK_LOADOUT ? global.WICK_LOADOUT.allocate(cfg, member.mods || [], ownedTypes) : {};
    let mods = alloc[pick.type] || [];
    if (!mods.length && pref && pref.mods && pref.mods.length && pref.gunType === pick.type) {
      // fragment preference without a modcfg: honour it only for mods the wallet holds
      const have = {};
      for (const m of member.mods || []) have[m.type] = (have[m.type] || 0) + 1;
      mods = pref.mods.filter(t => { if ((have[t] || 0) > 0) { have[t]--; return true; } return false; });
    }
    return profile(pick, mods);
  }

  global.HORDE_ARMS = { profile, resolve, rawDps, LOANER, EDGE_MAX, HOLO_EDGE };
})(typeof window !== 'undefined' ? window : globalThis);
