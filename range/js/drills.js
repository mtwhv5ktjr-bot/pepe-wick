/* =========================================================================
   ARSENAL RANGE — drill logic. Pure JS state machines: target schedules,
   scoring, combos, medals. The three.js layer only raycasts and reports
   hits via registerShot(). Headless-runnable for node tests + QA bot.
   World coords: x right (-8..8), y up (0..4), z toward targets (negative).
   ========================================================================= */
(function (global) {
  'use strict';
  const mulberry32 = (typeof global.GUNSMITH !== 'undefined')
    ? global.GUNSMITH.mulberry32
    : function (a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

  // medal thresholds calibrated against the humanized bot ladder
  // (skill 0.55 ≈ bronze, 0.92 ≈ silver/gold-adjacent, 0.99 ≈ gold)
  const DRILLS = {
    qualifier:  { name: 'QUALIFIER',       desc: '20 boards, one at a time. Precision only.', medals: [1300, 2400, 3200] },
    rapid:      { name: 'RAPID RESPONSE',  desc: '60 seconds. Keep the combo alive.',          medals: [5000, 16000, 30000] },
    movers:     { name: 'MOVERS',          desc: 'Sliding boards. Lead your shots.',           medals: [5500, 15000, 28000] },
    skeet:      { name: 'SKEET NIGHT',     desc: '12 discs. Take them mid-air.',               medals: [1800, 2500, 3050] },
    nobusiness: { name: 'NO BUSINESS',     desc: 'Marks only. Three civilians and you are out.', medals: [3800, 8500, 14000] },
    hightable:  { name: 'HIGH TABLE TRIAL',desc: 'Every discipline. One score.',               medals: [7000, 16000, 25000] },
    overtime:   { name: 'OVERTIME',        desc: 'It does not end. Let three walk and the lights go out.', medals: [3000, 8000, 15000], endless: true },
  };

  // ---------- DAILY MARKSMAN (UTC-seeded contract, house tradition) ----------
  const MUTATORS = {
    snap:     { id: 'snap',     name: 'SNAP COUNT',    ttlMult: 0.7,   desc: 'Boards stay up 30% shorter' },
    onemag:   { id: 'onemag',   name: 'ONE MAGAZINE',  magLock: true,  desc: 'No reloads — every round counts' },
    house:    { id: 'house',    name: 'HOUSE RULES',   houseOnly: true, desc: 'House guns only tonight' },
    lowlight: { id: 'lowlight', name: 'LOW LIGHT',     dim: true,      desc: 'The house cuts the power' },
  };
  function dailyMarksman(dateStr) {
    // dateStr 'YYYY-MM-DD' UTC
    const n = parseInt(dateStr.replace(/-/g, ''), 10);
    const rng = mulberry32((n ^ 0x5EED5) >>> 0);
    const kinds = ['qualifier', 'rapid', 'movers', 'skeet', 'nobusiness'];
    const kind = kinds[Math.floor(rng() * kinds.length)];
    const mutKeys = Object.keys(MUTATORS);
    let mi = Math.floor(rng() * mutKeys.length);
    // SNAP acts through board ttl — movers/skeet have none, so step past it
    // deterministically (still a pure function of the date, all clients agree)
    if ((kind === 'movers' || kind === 'skeet') && mutKeys[mi] === 'snap') mi = (mi + 1) % mutKeys.length;
    const mutator = MUTATORS[mutKeys[mi]];
    return { date: dateStr, kind, mutator, seed: n };
  }

  let NEXT_TID = 1;

  function mkTarget(kind, pos, opts) {
    return Object.assign({
      tid: NEXT_TID++, kind, // ring | mark | civ | disc
      x: pos.x, y: pos.y, z: pos.z,
      vx: 0, vy: 0, vz: 0,
      born: 0, ttl: Infinity, alive: true, popT: 0, // popT: 0→1 raise animation driven by step
    }, opts || {});
  }

  function laneX(rng) { return -7 + rng() * 14; }

  function create(kind, seed, mods) {
    if (!DRILLS[kind]) throw new Error('bad drill ' + kind);
    mods = mods || {};
    const st = {
      kind, def: DRILLS[kind], seed: seed >>> 0,
      rng: mulberry32(seed >>> 0),
      t: 0, over: false,
      score: 0, combo: 0, maxCombo: 0, comboT: 0,
      hits: 0, misses: 0, shots: 0, civHits: 0, discsHit: 0,
      strikes: 0, disqualified: false, // 3 civilians = account closed
      spawnCd: 0, // pacing cooldown: throughput is bounded, not farmable
      ttlMult: mods.ttlMult || 1, // SNAP COUNT daily mutator
      livesLost: 0, // OVERTIME: expiries spend lives, whiffs only break combo
      targets: [], events: [],
      phase: 0, phaseT: 0, spawned: 0, pending: 0,
      duration: kind === 'rapid' ? 60 : kind === 'movers' ? 45 : kind === 'nobusiness' ? 45 : Infinity,
    };
    return st;
  }

  function emit(st, ev) { st.events.push(ev); }
  function drain(st) { const e = st.events; st.events = []; return e; }

  function aliveTargets(st) { return st.targets.filter(t => t.alive); }

  function spawnRing(st, opts) {
    const t = mkTarget('ring', { x: laneX(st.rng), y: 1.2 + st.rng() * 1.6, z: -9 - st.rng() * 9 }, opts);
    if (isFinite(t.ttl)) t.ttl *= st.ttlMult;
    t.born = st.t; st.targets.push(t); st.spawned++;
    emit(st, { t: 'spawn', target: t });
    return t;
  }
  function spawnMover(st) {
    const dir = st.rng() < 0.5 ? 1 : -1;
    const t = mkTarget('ring', { x: -9 * dir, y: 1.2 + st.rng() * 1.4, z: -10 - st.rng() * 6 });
    t.vx = dir * (2.2 + st.rng() * 2.6);
    t.mover = true;
    t.born = st.t; st.targets.push(t); st.spawned++;
    emit(st, { t: 'spawn', target: t });
    return t;
  }
  function spawnPop(st) {
    const civ = st.rng() < 0.3;
    const t = mkTarget(civ ? 'civ' : 'mark', { x: laneX(st.rng), y: 0.9 + st.rng() * 0.8, z: -8 - st.rng() * 8 }, { ttl: 2.6 * st.ttlMult });
    t.born = st.t; st.targets.push(t); st.spawned++;
    emit(st, { t: 'spawn', target: t });
    return t;
  }
  function launchDisc(st) {
    const dir = st.rng() < 0.5 ? 1 : -1;
    const t = mkTarget('disc', { x: -10 * dir, y: 0.5, z: -12 - st.rng() * 6 });
    t.vx = dir * (5 + st.rng() * 3);
    t.vy = 7.5 + st.rng() * 2.5;
    t.vz = (st.rng() - 0.5) * 2;
    t.disc = true; t.born = st.t;
    st.targets.push(t); st.spawned++;
    emit(st, { t: 'launch', target: t });
    return t;
  }

  // ---------- per-kind stepping ----------
  function step(st, dt) {
    if (st.over) return drain(st);
    st.t += dt;
    st.phaseT += dt;
    if (st.comboT > 0) { st.comboT -= dt; if (st.comboT <= 0 && st.combo > 0) { st.combo = 0; emit(st, { t: 'combo_break', reason: 'time' }); } }

    // physics + expiry
    for (const tg of st.targets) {
      if (!tg.alive) continue;
      tg.popT = Math.min(1, tg.popT + dt * 4);
      tg.x += tg.vx * dt; tg.y += tg.vy * dt; tg.z += tg.vz * dt;
      if (tg.disc) tg.vy -= 9.8 * dt;
      if (tg.disc && tg.y < -0.5) { tg.alive = false; st.misses++; emit(st, { t: 'expire', tid: tg.tid, kind: tg.kind }); if (st.kind === 'overtime') loseLife(st); }
      if (tg.mover && Math.abs(tg.x) > 9.5) { tg.alive = false; st.misses++; emit(st, { t: 'expire', tid: tg.tid, kind: tg.kind }); if (st.kind === 'overtime') loseLife(st); }
      if (isFinite(tg.ttl) && st.t - tg.born > tg.ttl) {
        tg.alive = false;
        if (tg.kind !== 'civ') { st.misses++; if (st.combo > 0) { st.combo = 0; emit(st, { t: 'combo_break', reason: 'expire' }); } }
        emit(st, { t: 'expire', tid: tg.tid, kind: tg.kind });
        if (st.kind === 'overtime' && tg.kind !== 'civ') loseLife(st);
      }
    }
    st.targets = st.targets.filter(tg => tg.alive || st.t - tg.born < 4);

    st.spawnCd -= dt;
    const canSpawn = st.spawnCd <= 0;
    const paced = (fn, cd) => { if (canSpawn) { fn(); st.spawnCd = cd; } };

    const K = st.kind;
    if (K === 'qualifier') {
      if (st.spawned < 20) {
        if (aliveTargets(st).length === 0) paced(() => spawnRing(st, { ttl: 2.4 }), 0.2);
      } else if (aliveTargets(st).length === 0) finish(st);
    } else if (K === 'rapid') {
      if (aliveTargets(st).length < 3 && st.t < st.duration) paced(() => spawnRing(st, { ttl: 3.0 }), 0.3);
      if (st.t >= st.duration) finish(st);
    } else if (K === 'movers') {
      if (aliveTargets(st).length < 2 && st.t < st.duration) paced(() => spawnMover(st), 0.4);
      if (st.t >= st.duration) finish(st);
    } else if (K === 'skeet') {
      if (st.spawned < 12 && aliveTargets(st).length === 0 && canSpawn) {
        launchDisc(st);
        if (st.spawned < 12 && st.rng() < 0.35) launchDisc(st); // doubles
        st.spawnCd = 0.8;
      }
      if (st.spawned >= 12 && aliveTargets(st).length === 0) finish(st);
    } else if (K === 'nobusiness') {
      if (aliveTargets(st).length < 3 && st.t < st.duration) paced(() => spawnPop(st), 0.45);
      if (st.t >= st.duration) finish(st);
    } else if (K === 'overtime') {
      // endless: boards stay up shorter and come faster the deeper you go
      // (no ttlMult here — spawnRing applies it, pre-multiplying would square it)
      const ttl = Math.max(1.1, 2.6 - st.spawned * 0.018);
      const maxAlive = st.spawned < 10 ? 1 : st.spawned < 25 ? 2 : 3;
      if (aliveTargets(st).length < maxAlive && !st.over) {
        paced(() => {
          if (st.spawned >= 15 && st.rng() < 0.3) { const m = spawnMover(st); m.vx *= 1 + st.spawned * 0.01; }
          else spawnRing(st, { ttl });
        }, Math.max(0.35, 0.7 - st.spawned * 0.005));
      }
      // finish comes from loseLife at 3 walked targets
    } else if (K === 'hightable') {
      stepHighTable(st);
    }
    return drain(st);
  }

  function stepHighTable(st) {
    // phases: 0 qualifier×15 → 1 rapid 20s → 2 movers×8 → 3 skeet×6 → 4 nobusiness 15s → end
    const P = st.phase;
    const canSpawn = st.spawnCd <= 0;
    const paced = (fn, cd) => { if (canSpawn) { fn(); st.spawnCd = cd; } };
    if (P === 0) {
      if (st.spawned < 15) { if (aliveTargets(st).length === 0) paced(() => spawnRing(st, { ttl: 2.2 }), 0.2); }
      else if (aliveTargets(st).length === 0) nextPhase(st, 'RAPID');
    } else if (P === 1) {
      if (aliveTargets(st).length < 3 && st.phaseT < 20) paced(() => spawnRing(st, { ttl: 2.8 }), 0.3);
      if (st.phaseT >= 20) { clearAlive(st); nextPhase(st, 'MOVERS'); }
    } else if (P === 2) {
      if (st.phaseSpawned == null) st.phaseSpawned = 0;
      if (st.phaseSpawned < 8) { if (aliveTargets(st).length === 0) paced(() => { spawnMover(st); st.phaseSpawned++; }, 0.4); }
      else if (aliveTargets(st).length === 0) { st.phaseSpawned = 0; nextPhase(st, 'SKEET'); }
    } else if (P === 3) {
      if (st.phaseSpawned < 6) { if (aliveTargets(st).length === 0) paced(() => { launchDisc(st); st.phaseSpawned++; }, 0.8); }
      else if (aliveTargets(st).length === 0) nextPhase(st, 'NO BUSINESS');
    } else if (P === 4) {
      if (aliveTargets(st).length < 3 && st.phaseT < 15) paced(() => spawnPop(st), 0.45);
      if (st.phaseT >= 15) finish(st);
    }
  }
  function nextPhase(st, label) {
    st.phase++; st.phaseT = 0;
    if (st.phase === 2 || st.phase === 3) st.phaseSpawned = 0;
    emit(st, { t: 'phase', phase: st.phase, label });
  }
  function clearAlive(st) { for (const tg of st.targets) if (tg.alive) { tg.alive = false; emit(st, { t: 'expire', tid: tg.tid, kind: tg.kind }); } }

  function loseLife(st) {
    st.livesLost++;
    emit(st, { t: 'life_lost', livesLeft: Math.max(0, 3 - st.livesLost) });
    if (st.livesLost >= 3) finish(st);
  }

  function finish(st) {
    if (st.over) return;
    st.over = true;
    st.accuracy = st.shots > 0 ? st.hits / st.shots : 0;
    st.medal = st.disqualified ? 'none' : medalFor(st.kind, st.score);
    emit(st, { t: 'end', score: st.score, medal: st.medal, accuracy: st.accuracy, maxCombo: st.maxCombo, dq: st.disqualified });
  }

  function medalFor(kind, score) {
    const m = DRILLS[kind].medals;
    return score >= m[2] ? 'gold' : score >= m[1] ? 'silver' : score >= m[0] ? 'bronze' : 'none';
  }

  // ---------- shooting ----------
  // renderer resolves the raycast, then calls:
  //   registerShot(st, target|null, { ring: 0..1 (0=bullseye edge 1) })
  function registerShot(st, target, info) {
    if (st.over) return { delta: 0 };
    st.shots++;
    if (!target || !target.alive) {
      if (st.combo > 0) { st.combo = 0; emit(st, { t: 'combo_break', reason: 'miss' }); }
      st.misses++;
      emit(st, { t: 'miss' });
      return { delta: 0, miss: true };
    }
    target.alive = false;
    let delta = 0, ring = null;
    if (target.kind === 'civ') {
      st.civHits++;
      st.strikes++;
      delta = -250;
      if (st.combo > 0) { st.combo = 0; emit(st, { t: 'combo_break', reason: 'civ' }); }
      emit(st, { t: 'civ_hit', tid: target.tid, delta, strikes: st.strikes });
      if (st.strikes >= 3) {
        st.disqualified = true;
        st.score = Math.max(0, st.score + delta);
        finish(st); // account closed — no medal, drill over
        return { delta, dq: true };
      }
    } else {
      st.hits++;
      st.combo++; st.comboT = 1.4;
      st.maxCombo = Math.max(st.maxCombo, st.combo);
      const mult = Math.min(3, 1 + (st.combo - 1) * 0.1);
      if (target.kind === 'disc') {
        st.discsHit++;
        const air = st.t - target.born;
        delta = Math.round((150 + Math.min(100, air * 40)) * mult);
      } else {
        const r = info && typeof info.ring === 'number' ? info.ring : 0.5;
        ring = r;
        const base = r < 0.18 ? 100 : r < 0.45 ? 50 : r < 0.75 ? 25 : 10;
        const moverBonus = target.mover ? 1.5 : 1;
        const markFlat = target.kind === 'mark' ? 100 : base;
        delta = Math.round((target.kind === 'mark' ? markFlat : base) * mult * moverBonus);
      }
      st.score += 0; // applied below (single point of truth)
      emit(st, { t: 'hit', tid: target.tid, kind: target.kind, delta, combo: st.combo, ring });
    }
    st.score = Math.max(0, st.score + delta);
    return { delta, combo: st.combo, ring };
  }

  // ---------- headless bot (node tests + QA) ----------
  function botRun(kind, seed, skill, mods) {
    // humanized: ONE aimed shot per cadence window — humans aim sequentially.
    // skill drives hit chance, ring tightness, reaction time and trigger discipline.
    skill = skill == null ? 0.92 : skill;
    NEXT_TID = 1;
    const st = create(kind, seed, mods);
    const rng = mulberry32((seed ^ 0xB07B07) >>> 0);
    let guard = 0;
    let nextShotAt = 0;
    const seenAt = {}, civHold = {};
    const cadence = 0.55 - skill * 0.25; // sharp ≈ 0.31s/shot, sloppy ≈ 0.41s/shot
    while (!st.over && guard++ < 200000) {
      step(st, 1 / 60);
      if (st.t >= nextShotAt) {
        // oldest target we have "seen" long enough to have aimed at
        let pick = null;
        for (const tg of aliveTargets(st)) {
          if (!(tg.tid in seenAt)) {
            seenAt[tg.tid] = st.t;
            // trigger discipline is decided ONCE per target, when it appears
            if (tg.kind === 'civ') civHold[tg.tid] = rng() < 0.85 + skill * 0.13;
            continue;
          }
          const reacted = st.t - seenAt[tg.tid] >= 0.30 - skill * 0.12 + (tg.disc || tg.mover ? 0.08 : 0);
          if (!reacted) continue;
          if (tg.kind === 'civ' && civHold[tg.tid]) continue;
          if (!pick || seenAt[tg.tid] < seenAt[pick.tid]) pick = tg;
        }
        if (pick) {
          nextShotAt = st.t + cadence + rng() * 0.1;
          if (rng() < skill) registerShot(st, pick, { ring: rng() * rng() * (1.35 - skill) });
          else registerShot(st, null, {});
        }
      }
      st.events = [];
    }
    return {
      over: st.over, score: st.score, medal: st.medal, hits: st.hits, misses: st.misses,
      shots: st.shots, accuracy: +(st.accuracy || 0).toFixed(3), maxCombo: st.maxCombo, civHits: st.civHits,
      spawned: st.spawned, discsHit: st.discsHit, t: +st.t.toFixed(1),
    };
  }

  function resetTids() { NEXT_TID = 1; }

  global.DRILLS_CORE = { DRILLS, MUTATORS, dailyMarksman, create, step, registerShot, medalFor, botRun, aliveTargets, drain, resetTids };
})(typeof window !== 'undefined' ? window : globalThis);
