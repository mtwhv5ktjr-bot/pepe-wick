/* =========================================================================
   PEPE WICK vs HORDE — the road-space simulation.
   Pure JS: no DOM, no three.js, deterministic under an injected RNG, so the
   whole game is node-testable. The renderer only draws what this says.

   Space: x ∈ [-1, 1] across the road (road half-width = 1), z = metres
   AHEAD of the squad line (the squad stands at z = 0; the world scrolls
   toward it). dist = metres travelled.
   ========================================================================= */
(function (global) {
  'use strict';
  const LV = global.HORDE_LEVELS;
  const { FOES, BOSSES, PERKS, CONST } = LV;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  function tiers(count) {
    const titans = Math.floor(count / CONST.TITAN_AT);
    const rem = count - titans * CONST.TITAN_AT;
    const megas = Math.floor(rem / CONST.MEGA_AT);
    return { titans, megas, wicks: rem - megas * CONST.MEGA_AT };
  }
  function tierRank(count) { const t = tiers(count); return t.titans ? 2 : t.megas ? 1 : 0; }

  function pickWeighted(rng, table) {
    let total = 0; for (const k in table) total += table[k];
    let roll = rng() * total;
    for (const k in table) { roll -= table[k]; if (roll <= 0) return k; }
    return Object.keys(table)[0];
  }

  // ---- create ----
  function create(opts) {
    const level = opts.level;
    const seed = (opts.seed == null ? 1337 : opts.seed) >>> 0;
    const s = {
      level, weapon: opts.weapon, mode: opts.mode || 'campaign', seed,
      rng: mulberry32(seed),
      t: 0, dist: 0, speed: CONST.SPEED, count: opts.startCount || 1,
      leaderX: 0, formW: 0.5,
      status: 'play',
      foes: [], gates: [], barrels: [], hazards: [], events: [],
      streams: [], nextGateAt: 45, nextBarrelAt: 110, nextDraftAt: CONST.DRAFT_EVERY, spawnT: 1.2, trafficT: 3,
      perks: Object.assign({}, opts.perks || {}), draft: null,
      coins: 0, kills: 0, streak: 0, streakT: 0, bestStreak: 0, peak: opts.startCount || 1,
      boss: null, bossT: 0, bossesDown: 0, nextBossAt: level.endless ? (level.bossEvery || 650) : level.len,
      verdictT: 0, medicT: 0, conveyorT: 0, hitstop: 0, slow: 1,
      ids: 1, lastBoss: null, lostTotal: 0,
    };
    for (let i = 0; i < CONST.STREAMS_MAX; i++) s.streams.push({ t: s.rng() * 0.3 });
    return s;
  }

  // ---- helpers ----
  const ev = (s, e) => s.events.push(e);
  function addCount(s, n, why) {
    const before = s.count;
    s.count = clamp(Math.round(n), 0, CONST.SQUAD_CAP);
    if (s.count > s.peak) s.peak = s.count;
    if (s.count < before) s.lostTotal += before - s.count;
    const rb = tierRank(before), ra = tierRank(s.count);
    if (ra > rb) ev(s, { type: 'merge', rank: ra });
    if (ra < rb) ev(s, { type: 'break', rank: ra });
    if (s.count <= 0 && s.status !== 'dead') { s.status = 'dead'; ev(s, { type: 'dead', why }); }
  }
  function pay(s, n, x, z) {
    const g = 1 + 0.4 * (s.perks.greed || 0);
    const amt = Math.round(n * g);
    s.coins += amt;
    ev(s, { type: 'coin', n: amt, x, z });
  }
  function hpMul(s) {
    const d = s.dist / 1000;
    return (1 + 1.4 * Math.pow(d, 1.6)) * (1 + (s.level.grade || 0) * 0.6) * (s.level.endless ? 1 + 0.25 * s.bossesDown : 1);
  }
  function contactCost(s, base) {
    const c = Math.round(base * (1 + s.dist / 900)) - (s.perks.kevlar || 0);
    return Math.max(0, c);
  }

  function spawnFoe(s, type, x, z, extra) {
    const d = FOES[type]; if (!d) throw new Error('unknown foe ' + type);
    const f = Object.assign({
      id: s.ids++, type, x, z, hp: d.hp * hpMul(s), maxhp: d.hp * hpMul(s), spd: d.spd * (s.level.gimmick === 'stairs' ? 1.25 : 1),
      r: d.r, kind: d.kind, state: 'move', t: 0, atkT: 1.2 + s.rng() * 0.8, plate: d.plate || 0, gone: 0, dug: 0, flash: 0, home: d.kind === 'run' || d.kind === 'hound' ? 0.55 : 0.22,
    }, extra || {});
    if (type === 'spitter' || type === 'chef') f.digAt = 20 + s.rng() * 8;
    if (type === 'judge') { f.digAt = 30; f.home = 0.1; }
    s.foes.push(f);
    ev(s, { type: 'spawn', foe: type, x, z });
    return f;
  }

  function spawnPack(s) {
    const roster = s.level.roster;
    const dScale = 1 + s.dist / 450;
    const n = 1 + Math.floor(s.rng() * Math.min(5, 1.2 * dScale));
    const type = pickWeighted(s.rng, roster);
    const cx = (s.rng() * 2 - 1) * 0.8;
    const z0 = CONST.SPAWN_Z + s.rng() * 6;
    const count = (type === 'brute' || type === 'bounty' || type === 'judge') ? 1 : n;
    for (let i = 0; i < count; i++) {
      const x = clamp(cx + (s.rng() - 0.5) * 0.5, -0.92, 0.92);
      spawnFoe(s, type, x, z0 + s.rng() * 3);
    }
  }

  function makeGate(s) {
    const d = s.dist;
    const N = Math.round(4 + d / 55 + s.rng() * (6 + d / 80));
    const good = s.rng() < 0.16 ? { op: 'x', n: 2 } : { op: '+', n: N };
    let bad;
    const r = s.rng();
    if (r < 0.2) bad = { op: '+', n: Math.max(1, Math.round(N * 0.45)) };          // both good — pick the better
    else if (r < 0.55) bad = { op: '-', n: Math.round(N * (0.6 + s.rng() * 0.6)) };
    else bad = { op: '/', n: 2 };
    const flip = s.rng() < 0.5;
    s.gates.push({ id: s.ids++, z: CONST.SPAWN_Z + 4, left: flip ? bad : good, right: flip ? good : bad, done: false });
  }
  function makeBarrel(s) {
    const n = Math.round(3 + s.dist / 90 + s.rng() * 5);
    s.barrels.push({ id: s.ids++, x: (s.rng() * 2 - 1) * 0.7, z: CONST.SPAWN_Z + 2, hp: 18 + n * 4, maxhp: 18 + n * 4, n, r: 0.14 });
  }
  function applyGate(s, g) {
    g.done = true;
    const side = s.leaderX < 0 ? g.left : g.right;
    const before = s.count;
    if (side.op === '+') addCount(s, s.count + side.n, 'gate');
    else if (side.op === 'x') addCount(s, s.count * side.n, 'gate');
    else if (side.op === '-') addCount(s, s.count - side.n, 'gate');
    else if (side.op === '/') addCount(s, Math.max(1, Math.floor(s.count / side.n)), 'gate');
    ev(s, { type: 'gate', side: s.leaderX < 0 ? 'left' : 'right', op: side.op, n: side.n, delta: s.count - before });
  }

  // ---- combat ----
  function squadStats(s) {
    const w = s.weapon;
    const p = s.perks;
    const streams = Math.max(1, Math.min(CONST.STREAMS_MAX, s.count));
    const rof = w.rof * (1 + 0.3 * (p.doubletap || 0));
    const over = (p.overcharge && s.streak >= 8) ? 1.35 : 1;
    const dmgMul = w.dpsMult * (1 + 0.12 * (p.adrenaline || 0)) * over;
    // total squad dps = BASE_DPS * count^DPS_POW * dmgMul (sub-linear: a bigger squad is stronger, never a steamroller), spread over the visible streams
    const perStreamDps = CONST.BASE_DPS * Math.pow(s.count, CONST.DPS_POW) * dmgMul / streams;
    const dmg = perStreamDps / (rof * w.pellets * w.arc);
    const range = (s.level.gimmick === 'sandstorm' ? 22 : 30) * (1 + 0.25 * (p.longarms || 0));
    return { streams, rof, dmg, range, pellets: w.pellets, pierce: w.pierce + (w.ap ? 0 : 0), arc: w.arc, crit: 0.12 * (p.deadeye || 0) };
  }

  function targetsNear(s, x, maxZ) {
    const out = [];
    for (const f of s.foes) if (!(f.gone > 0) && f.z > 0.4 && f.z < maxZ) out.push(f);
    if (s.boss && s.boss.alive && !(s.boss.gone > 0)) out.push(s.boss);
    return out;
  }
  function nearest(s, list, x, exclude) {
    let best = null, bd = 1e9;
    for (const f of list) {
      if (exclude && exclude.has(f)) continue;
      const d = f.z + 5 * Math.abs(f.x - x);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  function damage(s, f, dmg, crit, src) {
    if (f.isBoss) { bossHit(s, f, dmg, crit, src); return; }
    let m = 1;
    if (f.plate && (f.type === 'bounty' || f.hp > f.maxhp * 0.5)) m = f.plate;
    f.hp -= dmg * m;
    if (f.flash <= 0) f.flash = 0.12;   // blink, never a constant white-out under sustained fire
    ev(s, { type: 'hit', x: f.x, z: f.z, crit, big: f.r > 0.15, plate: m < 1 });
    if (f.hp <= 0) killFoe(s, f, src);
  }
  function killFoe(s, f, src) {
    if (f.dead) return;
    f.dead = true;
    const d = FOES[f.type];
    s.kills++;
    s.streak++; s.streakT = 1.5; if (s.streak > s.bestStreak) s.bestStreak = s.streak;
    if (s.streak === 8 || s.streak === 16 || s.streak === 28 || s.streak === 45) ev(s, { type: 'streak', n: s.streak });
    pay(s, d.pay, f.x, f.z);
    ev(s, { type: 'kill', foe: f.type, x: f.x, z: f.z, big: f.r > 0.15, src });
    if (d.boom) boom(s, f.x, f.z, d.boom, 40, src);
    if (s.perks.highex && !d.boom) splash(s, f.x, f.z, 0.3 + 0.1 * s.perks.highex, 10 * s.perks.highex);
    if (s.perks.ricochet && src !== 'rico') {
      const list = targetsNear(s, f.x, f.z + 6).filter(o => o !== f && Math.abs(o.x - f.x) < 0.5 && !o.dead);
      const o = nearest(s, list, f.x);
      if (o) { ev(s, { type: 'shot', sx: f.x, sz: f.z, tx: o.x, tz: o.z, rico: true }); damage(s, o, squadStats(s).dmg * 0.5 * (s.perks.ricochet), false, 'rico'); }
    }
  }
  function splash(s, x, z, r, dmg) {
    for (const f of s.foes) if (!f.dead && Math.abs(f.x - x) < r && Math.abs(f.z - z) < r * 5) { f.hp -= dmg; if (f.hp <= 0) killFoe(s, f, 'splash'); }
  }
  function boom(s, x, z, r, dmg) {
    ev(s, { type: 'boom', x, z, r });
    splash(s, x, z, r, dmg);
    if (z < 2.2 && Math.abs(x - s.leaderX) < s.formW / 2 + r) addCount(s, s.count - contactCost(s, 3), 'boom');
  }

  function fire(s, dt) {
    const st = squadStats(s);
    const w = s.weapon;
    for (let i = 0; i < st.streams; i++) {
      const stream = s.streams[i];
      stream.t -= dt;
      if (stream.t > 0) continue;
      stream.t += 1 / st.rof;
      const spread = Math.min(s.formW, 0.08 * st.streams);
      const sx = s.leaderX + (st.streams > 1 ? (i / (st.streams - 1) - 0.5) * spread : 0);
      const list = targetsNear(s, sx, st.range);
      const arcs = st.arc > 1 ? [-0.4, 0, 0.4] : [0];
      let fired = false;
      for (const ax of arcs) {
        const target = nearest(s, list, sx + ax);
        if (!target) {
          // no foe — a barrel in the lane?
          const b = s.barrels.find(b => !b.dead && b.z > 1 && b.z < 36 && Math.abs(b.x - (sx + ax)) < 0.3);
          if (b) {
            fired = true;
            ev(s, { type: 'shot', sx, sz: 0, tx: b.x, tz: b.z, i, style: w.tracer });
            b.hp -= st.dmg * st.pellets;
            if (b.hp <= 0) { b.dead = true; addCount(s, s.count + b.n, 'barrel'); pay(s, 3, b.x, b.z); ev(s, { type: 'barrel', x: b.x, z: b.z, n: b.n }); }
          }
          continue;
        }
        fired = true;
        const crit = s.rng() < st.crit;
        const mult = crit ? 3 : 1;
        ev(s, { type: 'shot', sx, sz: 0, tx: target.x, tz: target.z, i, style: w.tracer, crit });
        if (st.pellets > 1) {
          // pellets fan onto the target and its neighbours
          const near = list.filter(o => Math.abs(o.x - target.x) < 0.4 && Math.abs(o.z - target.z) < 5);
          for (let p = 0; p < st.pellets; p++) {
            const o = near.length ? near[Math.floor(s.rng() * near.length)] : target;
            if (!o.dead) damage(s, o, st.dmg * mult, crit, 'pellet');
          }
        } else {
          damage(s, target, st.dmg * mult, crit, 'shot');
          // pierce: carry on to foes behind in the lane
          let last = target, left = st.pierce - 1, ex = new Set([target]);
          while (left-- > 0) {
            const behind = list.filter(o => !ex.has(o) && !o.dead && o.z > last.z && Math.abs(o.x - last.x) < 0.22);
            const o = nearest(s, behind, last.x);
            if (!o) break;
            ex.add(o);
            ev(s, { type: 'shot', sx: last.x, sz: last.z, tx: o.x, tz: o.z, i, style: 'lance', pierce: true });
            damage(s, o, st.dmg * 0.6 * mult, crit, 'pierce');
            last = o;
          }
        }
      }
      if (!fired) stream.t = Math.min(stream.t, 0.02 + (i / st.streams) / st.rof); // idle streams stay ready, staggered so the opening is a rattle not a volley
    }
  }

  // ---- foes ----
  function stepFoes(s, dt) {
    const verdict = s.verdictT > 0 ? 1.4 : 1;
    const scroll = s.speed * dt;
    for (const f of s.foes) {
      if (f.dead) continue;
      f.t += dt;
      if (f.flash > 0) f.flash -= dt;
      f.z -= scroll;
      if (f.gone > 0) {
        f.gone -= dt;
        if (f.gone <= 0) { f.gone = 0; f.z = Math.max(2.5, f.z - 6); f.x = clamp(s.leaderX + (s.rng() - 0.5) * 0.4, -0.9, 0.9); f.lunge = true; ev(s, { type: 'reappear', x: f.x, z: f.z }); }
        continue;
      }
      if (f.kind === 'dig' || f.kind === 'float') {
        if (f.state === 'move' && f.z <= f.digAt) { f.state = 'dig'; f.dug = f.kind === 'float' ? 25 : 7; ev(s, { type: 'dig', x: f.x, z: f.z, foe: f.type }); }
        if (f.state === 'dig') {
          f.z += scroll;           // holds its ground relative to the squad
          f.dug -= dt;
          if (f.type === 'judge') s.verdictT = 0.2;
          f.atkT -= dt;
          if (f.atkT <= 0 && f.type !== 'judge') {
            f.atkT = 1.5 + s.rng() * 0.6;
            if (f.type === 'spitter') s.hazards.push({ kind: 'glob', x: f.x, z: f.z, tx: clamp(s.leaderX + (s.rng() - 0.5) * 0.5, -0.9, 0.9), tz: 1.0, t: 0, T: 1.1 });
            else s.hazards.push({ kind: 'cleaver', x: f.x, z: f.z, vz: -15, r: 0.1 });
            ev(s, { type: 'lob', x: f.x, z: f.z, foe: f.type });
          }
          if (f.dug <= 0) f.state = 'move';
          continue;
        }
      }
      const home = f.home * (f.lunge ? 2 : 1);
      f.x += clamp(s.leaderX - f.x, -1, 1) * home * dt;
      const spd = f.spd * verdict * (f.lunge ? 3.2 : 1) * (f.kind === 'run' && f.t < 0.6 ? 0.5 : 1);
      f.z -= spd * dt;
      if (f.type === 'ninja' && !f.vanished && f.z <= 18) { f.vanished = true; f.gone = 0.45; ev(s, { type: 'vanish', x: f.x, z: f.z }); continue; }
      if (f.z <= CONST.CONTACT_Z) {
        if (Math.abs(f.x - s.leaderX) <= s.formW / 2 + f.r + 0.06) {
          f.dead = true;
          const d = FOES[f.type];
          const cost = contactCost(s, d.contact);
          ev(s, { type: 'contact', x: f.x, foe: f.type, cost });
          if (d.boom) boom(s, f.x, 0.5, d.boom, 40, 'contact'); else addCount(s, s.count - cost, 'contact');
        } else if (f.z < -3) f.dead = true;
      }
    }
    s.foes = s.foes.filter(f => !f.dead);
  }

  function stepHazards(s, dt) {
    const scroll = s.speed * dt;
    const inForm = (x, r) => Math.abs(x - s.leaderX) <= s.formW / 2 + r;
    for (const h of s.hazards) {
      if (h.kind === 'glob') {
        h.t += dt; h.z -= scroll; h.tz -= scroll;
        if (h.t >= h.T) { h.kind = 'acid'; h.x = h.tx; h.z = Math.max(0.6, h.tz); h.r = 0.2; h.ttl = 4; h.tick = 0; ev(s, { type: 'acid', x: h.x, z: h.z }); }
      } else if (h.kind === 'acid' || h.kind === 'fire' || h.kind === 'quake') {
        h.z -= h.kind === 'quake' ? 0 : scroll; h.ttl -= dt;
        if (h.z > -0.5 && h.z < 1.6 && inForm(h.x, h.r)) { h.tick -= dt; if (h.tick <= 0) { h.tick = 0.5; addCount(s, s.count - contactCost(s, 1), h.kind); ev(s, { type: 'burn', x: h.x }); } }
        if (h.ttl <= 0 || h.z < -3) h.dead = true;
      } else if (h.kind === 'cleaver' || h.kind === 'blade') {
        h.z += (h.vz - s.speed) * dt;
        if (h.vx) h.x += h.vx * dt;
        if (h.z <= CONST.CONTACT_Z) {
          h.dead = true;
          if (inForm(h.x, h.r)) { addCount(s, s.count - contactCost(s, 2), h.kind); ev(s, { type: 'cut', x: h.x }); }
        }
      } else if (h.kind === 'block') {
        h.z -= scroll;
        if (h.z <= CONST.CONTACT_Z && !h.hit) { h.hit = true; if (inForm(h.x, h.r)) { addCount(s, s.count - contactCost(s, 2), 'block'); ev(s, { type: 'crash', x: h.x }); } }
        if (h.z < -4) h.dead = true;
      } else if (h.kind === 'car') {
        h.z -= scroll; h.x += h.vx * dt;
        if (h.z <= CONST.CONTACT_Z && h.z > -0.8 && !h.hit && inForm(h.x, h.r)) { h.hit = true; addCount(s, s.count - contactCost(s, 3), 'car'); ev(s, { type: 'crash', x: h.x }); }
        if (h.z < -4 || Math.abs(h.x) > 1.8) h.dead = true;
      }
    }
    s.hazards = s.hazards.filter(h => !h.dead);
  }

  function stepGimmick(s, dt) {
    const g = s.level.gimmick;
    if (g === 'traffic') {
      s.trafficT -= dt;
      if (s.trafficT <= 0) { s.trafficT = 2.6 + s.rng() * 2; const dir = s.rng() < 0.5 ? 1 : -1; s.hazards.push({ kind: 'car', x: -1.6 * dir, z: 10 + s.rng() * 14, vx: dir * (2.2 + s.rng()), r: 0.3 }); ev(s, { type: 'car', dir }); }
    } else if (g === 'barriers' || g === 'stalls' || g === 'pillars') {
      s.blockT = (s.blockT || 3) - dt;
      if (s.blockT <= 0) { s.blockT = 4 + s.rng() * 3; const x = g === 'pillars' ? (s.rng() < 0.5 ? -0.45 : 0.45) : (s.rng() * 2 - 1) * 0.75; s.hazards.push({ kind: 'block', x, z: CONST.SPAWN_Z, r: g === 'pillars' ? 0.2 : 0.26, what: g }); }
    } else if (g === 'conveyor') {
      s.conveyorT += dt;
      const dir = Math.sin(s.conveyorT * 0.35) > 0 ? 1 : -1;
      s.leaderX = clamp(s.leaderX + dir * 0.28 * dt, -0.85, 0.85);
    }
  }

  // ---- boss ----
  function startBoss(s) {
    const key = s.level.endless ? ['doorman', 'perkins', 'kirill', 'cassian', 'sommelier', 'elder', 'zero', 'killa', 'tracker', 'marquis'][s.bossesDown % 10] : s.level.boss;
    const def = BOSSES[key];
    const refDps = CONST.BASE_DPS * Math.pow(60, CONST.DPS_POW);
    const hp = def.ttk * refDps * Math.pow(Math.max(s.count, 10) / 60, 0.55) * (1 + (s.level.grade || 0) * 0.25) * (s.level.endless ? 1 + 0.3 * s.bossesDown : 1);
    s.boss = { isBoss: true, key, def, name: def.name, hp, maxhp: hp, x: 0, z: 26, r: def.r, phase: 0, t: 0, atkT: 2.5, alive: true, gone: 0, flash: 0, enraged: false, rushing: 0, parts: 0 };
    s.status = 'boss';
    s.bossT = 0;
    s.speed = CONST.SPEED * 0.35;
    ev(s, { type: 'boss', key, name: def.name, sub: def.sub });
  }
  function bossHit(s, b, dmg, crit) {
    let m = b.plateT > 0 ? 0.5 : 1;
    b.hp -= dmg * m; if (b.flash <= 0) b.flash = 0.14;
    ev(s, { type: 'hit', x: b.x, z: b.z, crit, boss: true, plate: m < 1 });
    const frac = b.hp / b.maxhp;
    if (b.phase === 0 && frac <= 0.66) bossPhase(s, b, 1);
    if (b.phase === 1 && frac <= 0.33) bossPhase(s, b, 2);
    if (b.hp <= 0) bossDead(s, b);
  }
  function bossPhase(s, b, p) {
    b.phase = p;
    ev(s, { type: 'bossphase', phase: p, key: b.key });
    const atk = b.def.atk;
    if (atk === 'slam' || atk === 'charge') b.plateT = 5;
    if (atk === 'summon' || atk === 'hounds' || atk === 'marquis') for (let i = 0; i < 4 + p * 2; i++) spawnFoe(s, atk === 'hounds' ? 'hound' : p === 2 ? 'brute' : 'goon', (s.rng() * 2 - 1) * 0.8, 30 + s.rng() * 8);
    if (atk === 'acid') for (let i = -1; i <= 1; i++) s.hazards.push({ kind: 'acid', x: i * 0.55, z: 3 + s.rng() * 3, r: 0.25, ttl: 6, tick: 0 });
    if (atk === 'marquis' && p === 1) ev(s, { type: 'caine' });
  }
  function bossDead(s, b) {
    b.alive = false; s.boss = null;
    s.bossesDown++;
    pay(s, 120 + 40 * s.bossesDown, b.x, b.z);
    for (let i = 0; i < 3; i++) s.barrels.push({ id: s.ids++, x: (i - 1) * 0.5, z: 14 + i * 2, hp: 30, maxhp: 30, n: 8 + Math.round(s.dist / 120), r: 0.14 });
    s.speed = CONST.SPEED;
    ev(s, { type: 'bossdead', key: b.key, name: b.name });
    if (s.level.endless) { s.status = 'play'; s.nextBossAt = s.dist + (s.level.bossEvery || 650); }
    else { s.status = 'clear'; ev(s, { type: 'clear', coins: s.coins, dist: Math.round(s.dist), kills: s.kills }); }
  }
  function stepBoss(s, dt) {
    const b = s.boss; if (!b || !b.alive) return;
    b.t += dt; s.bossT += dt;
    if (b.flash > 0) b.flash -= dt;
    if (b.plateT > 0) b.plateT -= dt;
    if (!b.enraged && s.bossT > CONST.BOSS_ENRAGE) { b.enraged = true; ev(s, { type: 'enrage', key: b.key }); }
    // positioning: holds ~z 22, enraged advances to the line and mauls
    const holdZ = b.enraged ? 4 : (b.def.atk === 'charge' || b.def.atk === 'slam' ? 16 : 22);
    if (b.rushing > 0) {
      b.rushing -= dt; b.z -= 24 * dt;
      if (b.z <= 2.2) { b.rushing = 0; if (Math.abs(b.x - s.leaderX) <= s.formW / 2 + b.r) { addCount(s, s.count - contactCost(s, 5), 'boss'); ev(s, { type: 'crash', x: b.x, boss: true }); } }
    } else {
      b.z += clamp(holdZ - b.z, -1, 1) * 6 * dt;
      b.x += clamp(s.leaderX * 0.7 - b.x, -1, 1) * (b.enraged ? 1.2 : 0.4) * dt;
    }
    if (b.gone > 0) { b.gone -= dt; if (b.gone <= 0) { b.gone = 0; b.z = 5; b.x = clamp(s.leaderX, -0.8, 0.8); b.rushing = 0.6; ev(s, { type: 'reappear', x: b.x, z: b.z, boss: true }); } return; }
    if (b.enraged) { b.maulT = (b.maulT || 0) - dt; if (b.maulT <= 0) { b.maulT = 1; addCount(s, s.count - contactCost(s, 4), 'maul'); ev(s, { type: 'maul' }); } }
    b.atkT -= dt;
    if (b.atkT > 0) return;
    const speedup = 1 - 0.18 * b.phase;
    b.atkT = (2.6 + s.rng() * 1.4) * speedup;
    const atk = b.def.atk;
    ev(s, { type: 'bossatk', atk, phase: b.phase });
    if (atk === 'charge') { b.rushing = 1.4; }
    else if (atk === 'blade') { for (let i = -1; i <= 1; i++) s.hazards.push({ kind: 'blade', x: clamp(s.leaderX + i * 0.3, -0.9, 0.9), z: b.z, vz: -16, r: 0.12 }); if (b.phase >= 1) b.gone = 0.5; }
    else if (atk === 'slam') { for (let i = 0; i < 3 + b.phase; i++) s.hazards.push({ kind: 'quake', x: (s.rng() * 2 - 1) * 0.8, z: 0.5, r: 0.22, ttl: 1.6, tick: 0 }); if (b.phase === 2 && s.rng() < 0.5) b.rushing = 1.2; }
    else if (atk === 'grenade') { for (let i = 0; i < 2 + b.phase; i++) s.hazards.push({ kind: 'glob', x: b.x, z: b.z, tx: clamp(s.leaderX + (s.rng() - 0.5) * 0.8, -0.9, 0.9), tz: 1.0, t: 0, T: 1.3, fire: true }); }
    else if (atk === 'acid') { s.hazards.push({ kind: 'glob', x: b.x, z: b.z, tx: s.leaderX, tz: 1.0, t: 0, T: 1.0 }); if (b.phase >= 1) spawnFoe(s, 'spitter', (s.rng() * 2 - 1) * 0.6, 30); }
    else if (atk === 'summon') { for (let i = 0; i < 3 + b.phase * 2; i++) spawnFoe(s, b.phase === 2 && i === 0 ? 'brute' : s.rng() < 0.4 ? 'runner' : 'goon', (s.rng() * 2 - 1) * 0.85, 34 + s.rng() * 6); }
    else if (atk === 'vanish') { b.gone = 0.6; ev(s, { type: 'vanish', boss: true }); }
    else if (atk === 'hounds') { for (let i = 0; i < 3 + b.phase; i++) spawnFoe(s, 'hound', (s.rng() * 2 - 1) * 0.85, 32 + s.rng() * 4); s.hazards.push({ kind: 'cleaver', x: b.x, z: b.z, vz: -18, r: 0.1, vx: clamp(s.leaderX - b.x, -1, 1) * 1.2 }); }
    else if (atk === 'marquis') {
      if (b.phase === 0) { for (let i = 0; i < 4; i++) spawnFoe(s, i % 2 ? 'shield' : 'goon', (s.rng() * 2 - 1) * 0.8, 32 + s.rng() * 4); }
      else if (b.phase === 1) { for (let i = -2; i <= 2; i++) s.hazards.push({ kind: 'blade', x: clamp(s.leaderX + i * 0.28, -0.95, 0.95), z: b.z, vz: -17, r: 0.11 }); }
      else { b.rushing = 1.3; for (let i = 0; i < 3; i++) spawnFoe(s, 'ninja', (s.rng() * 2 - 1) * 0.8, 28); }
    }
  }

  // ---- draft ----
  function offerDraft(s) {
    const pool = Object.keys(PERKS).filter(k => (s.perks[k] || 0) < PERKS[k].max);
    const cards = [];
    while (cards.length < 3 && pool.length) { const i = Math.floor(s.rng() * pool.length); cards.push(pool.splice(i, 1)[0]); }
    if (!cards.length) return;
    s.draft = { cards, prev: s.status };
    s.status = 'draft';
    ev(s, { type: 'draft', cards });
  }
  function choose(s, i) {
    if (s.status !== 'draft' || !s.draft) return false;
    const k = s.draft.cards[i]; if (!k) return false;
    s.perks[k] = (s.perks[k] || 0) + 1;
    s.status = s.draft.prev === 'boss' ? 'boss' : 'play';
    ev(s, { type: 'perk', key: k, stacks: s.perks[k] });
    s.draft = null;
    return true;
  }

  // ---- step ----
  function step(s, dt, input) {
    s.events = [];
    if (s.status === 'dead' || s.status === 'clear' || s.status === 'draft') return s.events;
    if (s.hitstop > 0) { s.hitstop -= dt; return s.events; }
    dt = Math.min(dt, 0.05);
    input = input || {};
    s.t += dt;
    const spdMul = 1 + 0.08 * (s.perks.adrenaline || 0);
    if (s.status === 'play') s.speed = CONST.SPEED * spdMul;
    s.dist += s.speed * dt;
    // steering
    if (typeof input.targetX === 'number') s.leaderX += clamp(input.targetX - s.leaderX, -1, 1) * 4.5 * dt;
    else if (input.steer) s.leaderX += clamp(input.steer, -1, 1) * 2.3 * dt;
    s.leaderX = clamp(s.leaderX, -0.85, 0.85);
    s.formW = 0.32 + 0.09 * Math.sqrt(Math.min(s.count, 200));
    // timers
    if (s.streakT > 0) { s.streakT -= dt; if (s.streakT <= 0) s.streak = 0; }
    if (s.verdictT > 0) s.verdictT -= dt;
    if (s.perks.medic) { s.medicT += dt; if (s.medicT >= 6 / s.perks.medic) { s.medicT = 0; addCount(s, s.count + 1, 'medic'); ev(s, { type: 'medic' }); } }
    // director
    if (s.status === 'play') {
      s.spawnT -= dt;
      const I = s.level.wave * (1 + s.dist / 900);
      if (s.spawnT <= 0 && s.foes.length < 70) { s.spawnT = clamp(1.5 / I, 0.28, 1.6); spawnPack(s); }
      if (s.dist >= s.nextGateAt) { s.nextGateAt += CONST.GATE_EVERY * (1 + s.dist / 2500); makeGate(s); }
      if (s.dist >= s.nextBarrelAt) { s.nextBarrelAt += CONST.BARREL_EVERY; makeBarrel(s); }
      stepGimmick(s, dt);
      if (s.dist >= s.nextBossAt) startBoss(s);
    }
    // scroll gates/barrels
    const scroll = s.speed * dt;
    for (const g of s.gates) { g.z -= scroll; if (!g.done && g.z <= CONST.CONTACT_Z) applyGate(s, g); }
    s.gates = s.gates.filter(g => g.z > -6);
    for (const b of s.barrels) b.z -= scroll;
    s.barrels = s.barrels.filter(b => !b.dead && b.z > -4);
    stepFoes(s, dt);
    stepHazards(s, dt);
    stepBoss(s, dt);
    if (s.status === 'dead') return s.events;
    fire(s, dt);
    if (s.status === 'play' && s.dist >= s.nextDraftAt) { s.nextDraftAt += CONST.DRAFT_EVERY; offerDraft(s); }
    return s.events;
  }

  function score(s) { return s.coins + Math.floor(s.dist) + s.kills * 2 + s.bossesDown * 500; }

  global.HORDE_SIM = { create, step, choose, tiers, tierRank, score, squadStats, mulberry32, spawnFoe, startBoss, offerDraft, FOES, BOSSES, PERKS, CONST };
})(typeof window !== 'undefined' ? window : globalThis);
