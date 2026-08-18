/* =========================================================================
   WICK LOADOUT — the one build you carry into every cabinet.
   The range is the gunsmith bench for the whole arcade: pick a gun, bolt on
   up to 3 WICK MODS, and the build travels.

   TWO transports, both written on every save:
   1. pepe-zero-native keys (pw_loadout / pw_carry / pw_modcfg). The range ships
      at games.wick.pics/range/ and PEPE WICK at games.wick.pics/play/ — same
      origin, so the game reads the build with ZERO changes to its gunsmith.
      Semantics mirror pepe-zero exactly: keyed by gun TYPE, 3 slots, no
      duplicate type on one gun, one physical mod token bolts to ONE gun.
   2. `wick_loadout` universal JSON + a `#wl=` URL fragment (base64url of the
      same JSON) for cross-origin cabinets (wick-shooter, kjp, …). Games verify
      ownership themselves — the fragment is a PREFERENCE, never a proof.
   Pure JS, no DOM: node-testable.
   ========================================================================= */
(function (global) {
  'use strict';
  const MOD_SLOTS = 3;
  const CARRY_MAX = 2;

  const store = {
    get(k) { try { return global.localStorage ? global.localStorage.getItem(k) : null; } catch (e) { return null; } },
    set(k, v) { try { if (global.localStorage) global.localStorage.setItem(k, v); } catch (e) {} },
  };

  // ---- pool + allocation (mirrors pepe-zero modAlloc, without the carry auto-fill) ----
  function modCounts(ownedMods) {
    const m = {};
    for (const x of ownedMods || []) { const t = x.type || x; if (t >= 1 && t <= 6) m[t] = (m[t] || 0) + 1; }
    return m;
  }
  // modCfg: { gunType: [modTypes] } — explicit builds. Returns { gunType: [types actually bolted] }.
  function allocate(modCfg, ownedMods, ownedGunTypes) {
    const pool = modCounts(ownedMods), out = {};
    const take = t => { if ((pool[t] || 0) > 0) { pool[t]--; return true; } return false; };
    for (const k of Object.keys(modCfg).sort()) {
      const gt = +k;
      if (!Array.isArray(modCfg[k]) || !ownedGunTypes.includes(gt)) continue; // a build for a gun that left the wallet must not eat mods
      const got = [];
      for (const t of modCfg[k]) {
        if (got.length >= MOD_SLOTS) break;
        if (got.includes(t)) continue;
        if (take(t)) got.push(t);
      }
      out[k] = got;
    }
    return out;
  }
  function modsFree(type, modCfg, ownedMods, ownedGunTypes) {
    const pool = modCounts(ownedMods), a = allocate(modCfg, ownedMods, ownedGunTypes);
    for (const k in a) for (const t of a[k]) if (t === type) pool[t] = (pool[t] || 0) - 1;
    return Math.max(0, pool[type] || 0);
  }

  // ---- state ----
  function read() {
    let modCfg = {}, carry = [], loadout = null;
    try { const c = JSON.parse(store.get('pw_modcfg') || '{}'); if (c && typeof c === 'object' && !Array.isArray(c)) modCfg = c; } catch (e) {}
    try { const c = JSON.parse(store.get('pw_carry') || 'null'); if (Array.isArray(c)) carry = c.slice(0, CARRY_MAX); } catch (e) {}
    const lo = store.get('pw_loadout');
    if (lo != null && lo !== '' && lo !== 'd') { const n = parseInt(lo, 10); if (!isNaN(n)) loadout = n; }
    return { modCfg, carry, loadout };
  }

  // Bolt `modType` onto `gunType` at slot `slot`; steals a copy from another gun
  // if every owned copy is bolted elsewhere. Returns { ok, stolenFrom }.
  function setSlot(state, gunType, slot, modType, ownedMods, ownedGunTypes) {
    const cfg = state.modCfg;
    const cur = (cfg[gunType] || []).slice(0, MOD_SLOTS);
    while (cur.length < MOD_SLOTS) cur.push(null);
    if (modType == null) { cur[slot] = null; cfg[gunType] = cur.filter(Boolean); return { ok: true }; }
    if (cur.some((t, i) => t === modType && i !== slot)) return { ok: false, err: 'already on this gun' };
    let stolenFrom = null;
    // is a copy free? if not, unbolt one from another gun
    const tmpCfg = Object.assign({}, cfg, { [gunType]: cur.filter((t, i) => t && i !== slot) });
    if (modsFree(modType, tmpCfg, ownedMods, ownedGunTypes) <= 0) {
      const alloc = allocate(tmpCfg, ownedMods, ownedGunTypes);
      for (const k of Object.keys(alloc)) {
        if (+k === +gunType || !alloc[k].includes(modType)) continue;
        cfg[k] = alloc[k].filter(x => x !== modType);
        stolenFrom = +k;
        break;
      }
      if (stolenFrom == null) return { ok: false, err: 'no copy owned' };
    }
    cur[slot] = modType;
    cfg[gunType] = cur.filter(Boolean);
    return { ok: true, stolenFrom };
  }

  // ---- write EVERYTHING ----
  function save(state, member, equipped) {
    const gunType = equipped ? equipped.type : null;
    // pepe-zero native
    store.set('pw_modcfg', JSON.stringify(state.modCfg));
    if (gunType != null) {
      let carry = (state.carry || []).filter(t => t !== gunType && member.gunTypes.includes(t));
      carry = [gunType].concat(carry).slice(0, CARRY_MAX);
      state.carry = carry;
      store.set('pw_carry', JSON.stringify(carry));
      store.set('pw_loadout', String(gunType));
      state.loadout = gunType;
    }
    // universal
    const alloc = allocate(state.modCfg, member.mods, member.gunTypes);
    const payload = {
      v: 1, at: Date.now(), addr: member.addr || null,
      gun: equipped ? { id: equipped.id, type: equipped.type, name: equipped.name } : null,
      mods: gunType != null ? (alloc[gunType] || []) : [],
      carry: state.carry || [],
      modcfg: state.modCfg,
    };
    store.set('wick_loadout', JSON.stringify(payload));
    return payload;
  }

  // ---- URL transport ----
  function b64url(s) {
    const b = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf8').toString('base64');
    return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64url(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return typeof atob === 'function' ? decodeURIComponent(escape(atob(s))) : Buffer.from(s, 'base64').toString('utf8');
  }
  function fragmentFor(payload) {
    const slim = { v: 1, g: payload.gun ? payload.gun.type : null, gid: payload.gun ? payload.gun.id : null, m: payload.mods, c: payload.carry, cfg: payload.modcfg };
    return '#wl=' + b64url(JSON.stringify(slim));
  }
  function launchURL(base, payload) {
    // keep any existing query, replace any existing fragment
    return base.replace(/#.*$/, '') + fragmentFor(payload);
  }
  // for the RECEIVING game: parse #wl= from a hash string
  function parseFragment(hash) {
    const m = /(?:^|[#&])wl=([A-Za-z0-9_-]+)/.exec(hash || '');
    if (!m) return null;
    try {
      const o = JSON.parse(unb64url(m[1]));
      if (!o || o.v !== 1) return null;
      return {
        gunType: typeof o.g === 'number' ? o.g : null,
        gunId: typeof o.gid === 'number' ? o.gid : null,
        mods: Array.isArray(o.m) ? o.m.filter(t => t >= 1 && t <= 6).slice(0, MOD_SLOTS) : [],
        carry: Array.isArray(o.c) ? o.c.slice(0, CARRY_MAX) : [],
        modcfg: o.cfg && typeof o.cfg === 'object' ? o.cfg : {},
      };
    } catch (e) { return null; }
  }

  // ---- the launch pad ----
  const CABINETS = [
    { key: 'pepewick', name: 'PEPE WICK', tag: 'SIDE-SCROLLER · 10 CONTRACTS', url: 'https://games.wick.pics/play/', carries: 'guns + mods', color: '#7cf9a5', live: true },
    { key: 'kjp', name: 'KJP — THE BLACK FILE', tag: 'TOP-DOWN STEALTH · 6 OPS', url: 'https://kjp-game.wick.pics', carries: 'KJP GEAR', color: '#ffd27c', live: true },
    { key: 'shooter', name: 'WICK SHOOTER', tag: 'BELT-SCROLLER · 10 LEVELS', url: 'https://wick-shooter.vercel.app', carries: 'guns', color: '#ff4d00', live: true },
    { key: 'siege', name: 'CONTINENTAL SIEGE', tag: 'TOWER DEFENSE · 6 FLOORS + THE PIT', url: 'https://games.wick.pics/siege/', carries: 'guns (≤ +10% DPS) + KJP GEAR', color: '#7cf9a5', live: true },
    { key: 'horde', name: 'PEPE WICK vs HORDE', tag: 'CROWD RUNNER', url: 'https://games.wick.pics/horde/', carries: '—', color: '#ff2a6d', live: false },
    { key: 'arsenal', name: 'WICK ARSENAL', tag: 'MINT · MARKET · MODS', url: 'https://mint.wick.pics', carries: 'buy / sell iron', color: '#e8c576', live: true },
  ];

  global.WICK_LOADOUT = { MOD_SLOTS, CARRY_MAX, CABINETS, read, save, setSlot, allocate, modsFree, modCounts, fragmentFor, launchURL, parseFragment, b64url, unb64url };
})(typeof window !== 'undefined' ? window : globalThis);
