/* =========================================================================
   CONTINENTAL SIEGE — core simulation (pure JS, zero Phaser)
   Deterministic, seedable, headless-runnable. Drives the Phaser layer,
   the node test suite AND the QA bot. Do not import rendering here.
   ========================================================================= */
(function (global) {
  'use strict';

  // ---------- RNG (mulberry32, house standard) ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const COLS = 20, ROWS = 12, CELL = 56;
  const BOARD_X = 0, BOARD_Y = 48;

  // ---------- FLOOR MAPS (ASCII, 20x12) ----------
  // S spawn, E exit, # path, . buildable, X prop (blocked), G gilded (+10% dmg)
  const FLOORS = [
    {
      id: 1, key: 'lobby', name: 'THE LOBBY', waves: 10, palette: 'brass',
      intro: 'Front of house. Keep it clean — no business on the floor.',
      map: [
        '....................',
        '..XX...........XX...',
        'S#############......',
        '.....XX......#......',
        '..G..........#..XX..',
        '.....G.......#......',
        '......########......',
        '......#....XX.......',
        '......#..G..........',
        '......#############E',
        '...XX...........G...',
        '....................',
      ],
    },
    {
      id: 2, key: 'mezzanine', name: 'THE MEZZANINE', waves: 10, palette: 'wine',
      intro: 'Balconies and blind corners. They come in from the stairwell.',
      map: [
        '....................',
        '.S###......####.....',
        '....#..XX..#..#..G..',
        '....#......#..#.....',
        '.G..#......#..#..XX.',
        '....########..#.....',
        '..XX..........#.....',
        '......G.......#.....',
        '..#############.....',
        '..#...........G.....',
        '..#############...XX',
        '..............#####E',
      ],
    },
    {
      id: 3, key: 'bar', name: 'THE SOMMELIER BAR', waves: 10, palette: 'emerald',
      intro: 'Tastings in the back. Medics move with the crews now.',
      map: [
        '....................',
        '....XX....G....XX...',
        '.######...#######...',
        '.#....#...#.....#...',
        'S#....#...#..G..#...',
        '......#...#.....#...',
        '..G...#...#..XX.#...',
        '......#...#.....#...',
        '..XX..#####.....#...',
        '................#...',
        '.......G........###E',
        '....................',
      ],
    },
    {
      id: 4, key: 'vault', name: 'THE VAULT', waves: 10, palette: 'gold',
      intro: 'Coin pressing floor. Shield crews escort the marks.',
      map: [
        'S###................',
        '...#....XX...G......',
        '...#................',
        '...#####...#######..',
        '.G.....#...#.....#..',
        '..XX...#...#..G..#..',
        '.......#...#.....#..',
        '.......#####..XX.#..',
        '.G...............#..',
        '....XX...G.......#..',
        '.................###',
        '...................E',
      ],
    },
    {
      id: 5, key: 'admin', name: 'ADMINISTRATION', waves: 10, palette: 'ash',
      intro: 'Accounts payable. Ghosts walk these halls — jam their optics.',
      map: [
        '..G.....XX..........',
        'S##################.',
        '.G....XX..........#.',
        '...##############.#.',
        '...#..G...XX....#.#.',
        '...#.#########E.#.#.',
        '...#.#..G.......#.#.',
        '...#.#....XX....#.#.',
        '...#.############.#.',
        '...#....G.........#.',
        '...################.',
        '............G.......',
      ],
    },
    {
      id: 6, key: 'rooftop', name: 'THE ROOFTOP', waves: 12, palette: 'neon',
      intro: 'Helipad at dawn. The Director is coming up the service lift.',
      map: [
        'S##################.',
        '..................#.',
        '.G..XX....G...XX..#.',
        '..................#.',
        '.##################.',
        '.#..................',
        '.#..XX...G....XX....',
        '.#..................',
        '.##################.',
        '..............G...#.',
        '..XX....XX........#.',
        '..................#E',
      ],
    },
    {
      id: 7, key: 'pit', name: 'THE PIT', waves: 999, palette: 'blood', endless: true,
      intro: 'Under the hotel. It does not end. It only gets faster.',
      map: [
        '....XX........G.....',
        '..G.............XX..',
        'S#################..',
        '.................#..',
        '..################..',
        '..#....G......XX....',
        '..################..',
        '....G...XX.......#..',
        '..################..',
        '..#.....XX....G.....',
        '..################..',
        '.................E..',
      ],
    },
  ];

  // Fix pit map: E must connect. Validate in parse; see tests.

  // ---------- MAP PARSING ----------
  function parseMap(map) {
    if (map.length !== ROWS) throw new Error('map rows ' + map.length);
    const grid = [];
    let S = null, E = null;
    for (let r = 0; r < ROWS; r++) {
      if (map[r].length !== COLS) throw new Error('map row ' + r + ' len ' + map[r].length);
      grid.push(map[r].split(''));
      for (let c = 0; c < COLS; c++) {
        const ch = map[r][c];
        if (ch === 'S') S = { c, r };
        if (ch === 'E') E = { c, r };
      }
    }
    if (!S || !E) throw new Error('map missing S or E');
    const isPath = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS && '#SE'.includes(grid[r][c]);
    // Walk from S to E, no branching allowed.
    const order = [S];
    const seen = new Set([S.c + ',' + S.r]);
    let cur = S, guard = 0;
    while (!(cur.c === E.c && cur.r === E.r)) {
      if (++guard > COLS * ROWS) throw new Error('path walk did not terminate');
      const nexts = [];
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const c = cur.c + dc, r = cur.r + dr;
        if (isPath(c, r) && !seen.has(c + ',' + r)) nexts.push({ c, r });
      }
      if (nexts.length !== 1) throw new Error('path branches/breaks at ' + cur.c + ',' + cur.r + ' (' + nexts.length + ')');
      cur = nexts[0];
      seen.add(cur.c + ',' + cur.r);
      order.push(cur);
    }
    // Every path char must be on the walked route (no orphan segments)
    let pathCount = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (isPath(c, r)) pathCount++;
    if (pathCount !== order.length) throw new Error('orphan path cells: ' + pathCount + ' vs ' + order.length);
    // Waypoints in px (cell centers)
    const wp = order.map(p => ({ x: BOARD_X + p.c * CELL + CELL / 2, y: BOARD_Y + p.r * CELL + CELL / 2 }));
    // Cumulative length
    const cum = [0];
    for (let i = 1; i < wp.length; i++) cum.push(cum[i - 1] + Math.hypot(wp[i].x - wp[i - 1].x, wp[i].y - wp[i - 1].y));
    return { grid, S, E, order, wp, cum, length: cum[cum.length - 1] };
  }

  function posAlong(parsed, d) {
    const { wp, cum } = parsed;
    if (d <= 0) return { x: wp[0].x, y: wp[0].y, a: angleAt(parsed, 0) };
    const L = cum[cum.length - 1];
    if (d >= L) return { x: wp[wp.length - 1].x, y: wp[wp.length - 1].y, a: 0 };
    let lo = 0, hi = cum.length - 1;
    while (lo < hi - 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
    const t = (d - cum[lo]) / (cum[hi] - cum[lo]);
    return {
      x: wp[lo].x + (wp[hi].x - wp[lo].x) * t,
      y: wp[lo].y + (wp[hi].y - wp[lo].y) * t,
      a: Math.atan2(wp[hi].y - wp[lo].y, wp[hi].x - wp[lo].x),
    };
  }
  function angleAt(parsed, i) {
    const { wp } = parsed;
    const j = Math.min(i + 1, wp.length - 1);
    return Math.atan2(wp[j].y - wp[i].y, wp[j].x - wp[i].x);
  }

  // ---------- TURRETS (KJP GEAR ordnance) ----------
  const TURRETS = {
    pistol: {
      id: 'pistol', name: 'SENTRY 9', desc: 'Reliable service pistol on a swivel. Cheap, honest work.',
      cost: 100, range: 150, rof: 1.8, dmg: 13, kind: 'hitscan', hotkey: '1',
    },
    smg: {
      id: 'smg', name: 'SMG NEST', desc: 'Hoses down runners and hounds. Short reach, no manners.',
      cost: 170, range: 118, rof: 6.0, dmg: 6, kind: 'hitscan', hotkey: '2',
    },
    shotgun: {
      id: 'shotgun', name: 'THE DOORMAN', desc: 'Buckshot burst. Hits everything crowding the primary mark.',
      cost: 230, range: 112, rof: 0.9, dmg: 9, kind: 'burst', burstRadius: 64, burstMax: 5, hotkey: '3',
    },
    sniper: {
      id: 'sniper', name: 'PENTHOUSE RIFLE', desc: 'Ignores armor. Sees the whole floor. Takes its time.',
      cost: 320, range: 400, rof: 0.45, dmg: 72, kind: 'hitscan', pierceArmor: true, critChance: 0.15, critMult: 2, hotkey: '4',
    },
    keg: {
      id: 'keg', name: 'KEG MORTAR', desc: 'Lobbed powder keg. Splash hits cloaked marks. Blind up close.',
      cost: 270, range: 265, minRange: 90, rof: 0.5, dmg: 34, kind: 'lob', splash: 72, lobTime: 0.5, hotkey: '5',
    },
    tesla: {
      id: 'tesla', name: 'JAMMER COIL', desc: 'Chain arc. Ignores armor, slows, and burns ghost cloaks.',
      cost: 250, range: 132, rof: 1.2, dmg: 11, kind: 'chain', chain: 4, chainRange: 70, slow: 0.35, slowDur: 1.2, pierceArmor: true, reveals: true, hotkey: '6',
    },
    mint: {
      id: 'mint', name: 'GOLD MINT', desc: 'Presses coins mid-wave. Does not fight. Earns.',
      cost: 150, range: 0, rof: 0, dmg: 0, kind: 'income', income: 12, incomeEvery: 3, hotkey: '7',
    },
    banner: {
      id: 'banner', name: 'WAR BANNER', desc: 'Rally aura. Neighboring ordnance hits harder, faster.',
      cost: 200, range: 0, rof: 0, dmg: 0, kind: 'aura', auraDmg: 0.20, auraRate: 0.10, hotkey: '8',
    },
    gatling: {
      id: 'gatling', name: 'GOLD GATLING', desc: 'HOLDER ORDNANCE. KJP GEAR on-chain — minted brass, minted lead.',
      cost: 400, range: 172, rof: 8.0, dmg: 8, kind: 'hitscan', hotkey: '9', holderOnly: true,
    },
  };
  const TIERS = 4; // T4 = THE HIGH TABLE: expensive, repeatable across every operative — the main coin sink
  function tierCost(def, tier) { // cost to go INTO tier (2, 3 or 4)
    return Math.round(def.cost * (tier === 2 ? 0.8 : tier === 3 ? 1.3 : 3.6));
  }
  // a marker (life) bought back from the house — 500⛁, +80% each time this floor
  function markerCost(st) { return Math.round((500 + 120 * (st.floorId - 1)) * Math.pow(1.8, st.markersBought || 0)); }
  function buyMarker(st) {
    if (st.over) return { ok: false, err: 'FLOOR CLOSED' };
    const cost = markerCost(st);
    if (st.coins < cost) return { ok: false, err: 'INSUFFICIENT COIN' };
    st.coins -= cost; st.stats.spent += cost; st.markers++; st.markersBought = (st.markersBought || 0) + 1;
    emit(st, { t: 'marker_bought', cost, markers: st.markers });
    return { ok: true, cost, markers: st.markers };
  }
  // DOUBLE OR NOTHING: pay to make the NEXT wave harder — more of them, tougher, but they pay double.
  // This is what turns a fat bank back into difficulty (and score) instead of a boring victory lap.
  // priced above a fresh bank on every floor (start coin = diff + 40/floor) so it is a LATE-game choice
  function wagerCost(st) { return Math.round(520 + 240 * st.wave + 140 * (st.floorId - 1)); }
  function wagerWave(st) {
    if (st.over || st.waveActive) return { ok: false, err: 'MID-WAVE' };
    if (st.wager) return { ok: false, err: 'ALREADY SIGNED' };
    const cost = wagerCost(st);
    if (st.coins < cost) return { ok: false, err: 'INSUFFICIENT COIN' };
    st.coins -= cost; st.stats.spent += cost; st.wager = true;
    emit(st, { t: 'wager', cost, wave: st.wave + 1 });
    return { ok: true, cost };
  }
  function tierMult(tier) {
    return { dmg: Math.pow(1.6, tier - 1), rof: Math.pow(1.15, tier - 1), range: Math.pow(1.12, tier - 1), income: Math.pow(1.7, tier - 1) };
  }

  // ---------- ENEMIES ----------
  const ENEMIES = {
    goon:   { id: 'goon',   name: 'GOON',      hp: 40,  spd: 62,  bounty: 8,  armor: 0, r: 15 },
    runner: { id: 'runner', name: 'RUNNER',    hp: 27,  spd: 108, bounty: 9,  armor: 0, r: 13 },
    heavy:  { id: 'heavy',  name: 'HEAVY',     hp: 155, spd: 38,  bounty: 18, armor: 3, r: 19 },
    shield: { id: 'shield', name: 'SHIELD',    hp: 95,  spd: 54,  bounty: 16, armor: 10, r: 17 },
    hound:  { id: 'hound',  name: 'HOUND',     hp: 15,  spd: 138, bounty: 5,  armor: 0, r: 11 },
    medic:  { id: 'medic',  name: 'MEDIC',     hp: 75,  spd: 50,  bounty: 20, armor: 0, r: 15, healRate: 12, healRadius: 92 },
    ghost:  { id: 'ghost',  name: 'GHOST',     hp: 62,  spd: 72,  bounty: 22, armor: 0, r: 15, cloak: { vis: 1.6, hid: 1.4 } },
    boss:   { id: 'boss',   name: 'BOSS',      hp: 900, spd: 30,  bounty: 150, armor: 5, r: 26, leak: 5, boss: true },
  };
  const BOSS_NAMES = ['MS. PERKINS', 'CASSIAN', 'ARES', 'ZERO', 'KILLA', 'THE DIRECTOR'];

  const DIFFS = {
    operative: { id: 'operative', name: 'OPERATIVE', hp: 1.0,  spd: 1.0,  coins: 320, bounty: 1.0 },
    ghost:     { id: 'ghost',     name: 'GHOST',     hp: 1.35, spd: 1.08, coins: 300, bounty: 1.05 },
    babayaga:  { id: 'babayaga',  name: 'BABA YAGA', hp: 1.8,  spd: 1.15, coins: 260, bounty: 1.1 },
  };

  // ---------- DOCTRINES (pre-run strategic pick — every option is a trade-off) ----------
  const DOCTRINES = {
    none:   { id: 'none',   name: 'HOUSE STANDARD',  desc: 'No amendments to the ledger.' },
    iron:   { id: 'iron',   name: 'IRON DISCIPLINE', dmg: 1.08, waveBonus: -20, desc: '+8% turret damage · −20⛁ wave bonus' },
    ledger: { id: 'ledger', name: 'THE LEDGER',      bounty: 1.10, rof: 0.95,   desc: '+10% bounties · −5% fire rate' },
    doors:  { id: 'doors',  name: 'CLOSED DOORS',    markers: 4, coins: -40,    desc: '+4 markers · −40⛁ opening budget' },
  };

  // ---------- WAVE COMPOSITION ----------
  // Every floor restarts the player economy, so every floor restarts gentle
  // and ramps steeper the higher you climb. I = intensity, drives counts.
  function waveIntensity(floorId, wave) { return wave * (1 + 0.22 * (floorId - 1)); }
  // hpLevel drives enemy hp/speed scaling — separate curve from counts.
  function hpLevel(st, wave) {
    return st.floor.endless ? wave * 1.35 : wave + 2.2 * (st.floorId - 1);
  }
  // Returns array of groups {type, n, gap, delay}
  function waveComp(floorId, wave, rng) {
    const F = floorId, W = wave;
    const I = waveIntensity(F, W);
    const groups = [];
    const g = (type, n, gap, delay) => groups.push({ type, n: Math.max(1, Math.round(n)), gap, delay: delay || 0 });
    if (F >= 7) { // endless: seeded soup that ramps from easy
      const pool = ['goon', 'runner', 'hound', 'heavy', 'shield', 'medic', 'ghost'];
      const kinds = 1 + Math.min(3, Math.floor(W / 5));
      for (let i = 0; i < kinds; i++) {
        const reach = Math.min(pool.length, 2 + Math.floor(W / 4));
        const t = pool[Math.floor(rng() * reach)];
        g(t, 3 + W * 0.7 + rng() * 3, Math.max(0.3, 0.95 - W * 0.02), i * 2.4);
      }
      if (W % 8 === 0) g('boss', 1 + Math.floor(W / 24), 2.0, 3);
      return groups;
    }
    const last = W === floorById(F).waves;
    if (last) { // boss wave: escort + boss
      g('goon', 5 + F * 2, 0.55);
      if (F >= 2) g('heavy', F - 1, 1.2, 2);
      if (F >= 3) g('medic', Math.ceil(F / 3), 1.8, 3);
      if (F >= 5) g('ghost', F - 4, 1.3, 4);
      g('boss', 1, 0, 6);
      if (F === 6) g('boss', 1, 0, 26); // The Director brings a shadow
      return groups;
    }
    // scripted ramp with per-floor type introductions
    g('goon', 4 + I * 1.1, Math.max(0.4, 0.9 - I * 0.02));
    if (W >= (F === 1 ? 3 : 2)) g('runner', 2 + I * 0.5, 0.55, 2.5);
    if (W >= (F === 1 ? 6 : 3)) g('hound', 3 + I * 0.4, 0.3, 4);
    if (F >= 2 && W >= 4) g('heavy', I * 0.22, 1.5, 5);
    if (F >= 3 && W >= 5) g('medic', Math.max(1, I * 0.12), 2.0, 6);
    if (F >= 4 && W >= 4) g('shield', Math.max(1, I * 0.15), 1.4, 7);
    if (F >= 5 && W >= 4) g('ghost', Math.max(1, I * 0.15), 1.3, 8);
    if (W % 4 === 0 && W > 0) g('runner', 4 + I * 0.4, 0.32, 9); // rush punctuation
    return groups;
  }
  function floorById(id) { return FLOORS.find(f => f.id === id); }

  // ---------- GAME STATE ----------
  function createGame(opts) {
    opts = opts || {};
    const floorId = opts.floor || 1;
    const floor = floorById(floorId);
    if (!floor) throw new Error('bad floor ' + floorId);
    const diff = DIFFS[opts.difficulty || 'operative'];
    if (!diff) throw new Error('bad difficulty');
    const doctrine = DOCTRINES[opts.doctrine || 'none'];
    if (!doctrine) throw new Error('bad doctrine');
    const parsed = parseMap(floor.map);
    const seed = (opts.seed == null ? 1337 : opts.seed) >>> 0;
    const st = {
      floorId, floor, diff, doctrine, parsed,
      gunMods: opts.gunMods || {}, // {turretDefId: mods from GUNSMITH.turretMods}
      mode: opts.mode || 'campaign', // campaign | endless | daily
      mutators: opts.mutators || {},
      rng: mulberry32(seed), seed,
      time: 0, wave: 0, waveActive: false,
      coins: diff.coins + 40 * (floorId - 1) + (doctrine.coins || 0) + (opts.bonusCoins || 0), // requisition budget grows per floor

      markers: 20 + (opts.bonusMarkers || 0),
      turrets: [], enemies: [], lobs: [],
      spawnQueue: [], nextEid: 1, nextTid: 1,
      over: false, victory: false,
      stats: { kills: 0, leaks: 0, earned: 0, spent: 0, waveTimes: [], startTime: 0 },
      events: [],
      holder: !!opts.holder, gearCount: opts.gearCount || 0,
    };
    if (st.gearCount > 0) st.markers += Math.min(10, st.gearCount); // +1 marker per gear piece, cap +10
    st.markers += doctrine.markers || 0;
    st.startMarkers = st.markers;
    st.markersBought = 0; st.wager = false; st.waveWager = false; // score/stars are LEAK-relative so extra markers never buy score
    return st;
  }

  function emit(st, ev) { st.events.push(ev); }
  function drainEvents(st) { const e = st.events; st.events = []; return e; }

  function cellAt(st, c, r) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return null;
    return st.parsed.grid[r][c];
  }
  function turretAt(st, c, r) { return st.turrets.find(t => t.c === c && t.r === r) || null; }

  function canPlace(st, defId, c, r) {
    const def = TURRETS[defId];
    if (!def) return { ok: false, err: 'NO SUCH ORDNANCE' };
    if (def.holderOnly && !st.holder) return { ok: false, err: 'HOLDERS ONLY — KJP GEAR' };
    if (st.mutators.banned === defId) return { ok: false, err: 'CONFISCATED TODAY' };
    const ch = cellAt(st, c, r);
    if (ch !== '.' && ch !== 'G') return { ok: false, err: 'NO FOOTING' };
    if (turretAt(st, c, r)) return { ok: false, err: 'OCCUPIED' };
    if (st.coins < def.cost) return { ok: false, err: 'INSUFFICIENT COIN' };
    return { ok: true };
  }

  function place(st, defId, c, r) {
    const chk = canPlace(st, defId, c, r);
    if (!chk.ok) return chk;
    const def = TURRETS[defId];
    st.coins -= def.cost;
    st.stats.spent += def.cost;
    const t = {
      tid: st.nextTid++, def: defId, c, r, tier: 1,
      x: BOARD_X + c * CELL + CELL / 2, y: BOARD_Y + r * CELL + CELL / 2,
      cool: 0, invested: def.cost, priority: 'first',
      gilded: cellAt(st, c, r) === 'G',
      incomeClock: 0, incomeTicks: 0, kills: 0, dealt: 0, angle: 0,
    };
    st.turrets.push(t);
    recalcAuras(st);
    emit(st, { t: 'place', tid: t.tid, def: defId, c, r });
    return { ok: true, turret: t };
  }

  function upgrade(st, tid) {
    const t = st.turrets.find(x => x.tid === tid);
    if (!t) return { ok: false, err: 'NO TURRET' };
    if (t.tier >= TIERS) return { ok: false, err: 'MAX TIER' };
    const cost = tierCost(TURRETS[t.def], t.tier + 1);
    if (st.coins < cost) return { ok: false, err: 'INSUFFICIENT COIN' };
    st.coins -= cost; st.stats.spent += cost; t.invested += cost; t.tier++;
    recalcAuras(st);
    emit(st, { t: 'upgrade', tid, tier: t.tier });
    return { ok: true };
  }

  function sell(st, tid) {
    const i = st.turrets.findIndex(x => x.tid === tid);
    if (i < 0) return { ok: false, err: 'NO TURRET' };
    const t = st.turrets[i];
    const mod = st.gunMods[t.def] || null;
    const refund = Math.round(t.invested * (0.7 + (mod ? mod.refundBonus : 0))); // HIGH TABLE resale terms
    st.coins += refund;
    st.turrets.splice(i, 1);
    recalcAuras(st);
    emit(st, { t: 'sell', tid, refund, c: t.c, r: t.r });
    return { ok: true, refund };
  }

  function cyclePriority(st, tid) {
    const t = st.turrets.find(x => x.tid === tid);
    if (!t) return { ok: false };
    t.priority = t.priority === 'first' ? 'strong' : t.priority === 'strong' ? 'last' : 'first';
    return { ok: true, priority: t.priority };
  }

  function recalcAuras(st) {
    for (const t of st.turrets) { t.auraDmg = 0; t.auraRate = 0; }
    for (const b of st.turrets) {
      if (TURRETS[b.def].kind !== 'aura') continue;
      const m = tierMult(b.tier);
      const aDmg = TURRETS[b.def].auraDmg * (1 + 0.75 * (b.tier - 1));
      const aRate = TURRETS[b.def].auraRate * (1 + 0.75 * (b.tier - 1));
      for (const t of st.turrets) {
        if (t === b) continue;
        if (Math.abs(t.c - b.c) <= 1 && Math.abs(t.r - b.r) <= 1) {
          t.auraDmg = Math.max(t.auraDmg, aDmg); // strongest banner only, no stacking
          t.auraRate = Math.max(t.auraRate, aRate);
        }
      }
    }
  }

  function turretStats(st, t) {
    const def = TURRETS[t.def];
    const m = tierMult(t.tier);
    const mod = st.gunMods[t.def] || null; // NFT gun reshape (capped envelope)
    const doc = st.doctrine || DOCTRINES.none;
    return {
      dmg: def.dmg * m.dmg * (1 + (t.auraDmg || 0)) * (t.gilded ? 1.1 : 1)
        * (mod ? mod.dmgMult : 1) * (doc.dmg || 1),
      rof: def.rof * m.rof * (1 + (t.auraRate || 0))
        * (mod ? mod.rofMult : 1) * (doc.rof || 1),
      range: def.range * m.range * (mod ? mod.rangeMult : 1),
      income: (def.income || 0) * m.income,
    };
  }

  // ---------- WAVES ----------
  function startWave(st) {
    if (st.over || st.waveActive) return { ok: false };
    st.wave++;
    st.waveWager = !!st.wager; st.wager = false; // the signed contract applies to THIS wave only
    st.waveActive = true;
    st.stats.startTime = st.time;
    for (const t of st.turrets) { t.incomeClock = 0; t.incomeTicks = 0; } // mint cap resets per wave
    // interest: 5% of bank, capped
    const interest = Math.min(50, Math.floor(st.coins * 0.05));
    if (interest > 0) { st.coins += interest; st.stats.earned += interest; emit(st, { t: 'interest', amount: interest }); }
    const comp = waveComp(st.floorId, st.wave, st.rng);
    const lvl = hpLevel(st, st.wave) + (st.waveWager ? 3 : 0); // a signed contract comes up the stairs angrier
    for (const grp of comp) {
      const count = st.waveWager ? Math.max(grp.n, Math.round(grp.n * 1.45)) : grp.n;
      for (let i = 0; i < count; i++) {
        st.spawnQueue.push({ at: st.time + grp.delay + i * grp.gap * (st.waveWager ? 0.8 : 1), type: grp.type, lvl });
      }
    }
    st.spawnQueue.sort((a, b) => a.at - b.at);
    emit(st, { t: 'wave_start', wave: st.wave, count: st.spawnQueue.length, wager: !!st.waveWager });
    return { ok: true, wave: st.wave };
  }

  function spawnEnemy(st, type, lvl) {
    const base = ENEMIES[type];
    const hpScale = (1 + 0.11 * (lvl - 1)) * st.diff.hp * (st.mutators.enemyHp || 1);
    const spdScale = Math.min(1.3, 1 + 0.005 * (lvl - 1)) * st.diff.spd * (st.mutators.enemySpeed || 1);
    let hp = base.hp * hpScale;
    if (base.boss) {
      hp = st.floor.endless
        ? base.hp * (0.5 + 0.1 * lvl) * st.diff.hp   // endless bosses scale with depth
        : base.hp * (1 + 0.65 * (st.floorId - 1)) * st.diff.hp; // campaign bosses scale per floor
    }
    const e = {
      eid: st.nextEid++, type, name: base.name,
      hp, maxHp: hp, spd: base.spd * spdScale, baseSpd: base.spd * spdScale,
      armor: base.armor, bounty: Math.round(base.bounty * st.diff.bounty * (st.mutators.bounty || 1) * (st.doctrine.bounty || 1) * (st.waveWager ? 2 : 1)),
      r: base.r, d: -st.rng() * 8, // slight stagger back from spawn
      slowT: 0, slowF: 1, cloaked: false, cloakT: base.cloak ? base.cloak.vis * (0.5 + st.rng() * 0.5) : 0,
      healRate: base.healRate || 0, healRadius: base.healRadius || 0,
      leak: base.leak || 1, boss: !!base.boss,
      dashT: 0,
    };
    if (e.boss && st.floorId === 6) e.director = true;
    st.enemies.push(e);
    emit(st, { t: 'spawn', eid: e.eid, type });
    return e;
  }

  // ---------- COMBAT ----------
  function targetable(e) { return !e.cloaked && e.hp > 0; }

  function pickTarget(st, t, range) {
    let best = null, bestKey = -Infinity;
    for (const e of st.enemies) {
      if (!targetable(e)) continue;
      const p = posAlong(st.parsed, e.d);
      const dist = Math.hypot(p.x - t.x, p.y - t.y);
      if (dist > range) continue;
      const def = TURRETS[t.def];
      if (def.minRange && dist < def.minRange) continue;
      let key;
      if (t.priority === 'strong') key = e.hp;
      else if (t.priority === 'last') key = -e.d;
      else key = e.d; // first = furthest along path
      if (e.boss) key += 1e6 * (t.priority === 'strong' ? 1 : 0);
      if (key > bestKey) { bestKey = key; best = e; }
    }
    return best;
  }

  function damage(st, e, amount, opts) {
    if (e.hp <= 0) return false; // corpses never re-pay bounty or re-emit 'die'
    opts = opts || {};
    let dmg = amount;
    if (e.marked) { dmg *= 1.25; e.marked = false; emit(st, { t: 'mark_hit', eid: e.eid }); } // EXCOM mark consumed
    if (!opts.pierceArmor && e.armor > 0) dmg = Math.max(1, dmg - e.armor);
    e.hp -= dmg;
    if (opts.srcT) opts.srcT.dealt += dmg;
    const mod = opts.srcT ? st.gunMods[opts.srcT.def] : (opts.mods || null);
    if (e.hp <= 0) {
      e.hp = 0;
      st.stats.kills++;
      if (opts.srcT) opts.srcT.kills++;
      let bounty = e.bounty + (mod && mod.coinKill ? mod.coinKill : 0); // GILDED: minted brass
      st.coins += bounty;
      st.stats.earned += bounty;
      const p = posAlong(st.parsed, e.d);
      emit(st, { t: 'die', eid: e.eid, type: e.type, x: p.x, y: p.y, bounty, boss: e.boss });
      return true;
    }
    // EXCOMMUNICADO: chance to mark a survivor — next hit from ANY turret +25%
    if (mod && mod.markChance && !e.marked && st.rng() < mod.markChance) {
      e.marked = true;
      emit(st, { t: 'marked', eid: e.eid });
    }
    return false;
  }

  function fireTurret(st, t, dt) {
    const def = TURRETS[t.def];
    const S = turretStats(st, t);
    if (def.kind === 'income') {
      if (st.waveActive) {
        t.incomeClock += dt;
        if (t.incomeClock >= def.incomeEvery) {
          t.incomeClock -= def.incomeEvery;
          // per-wave tick cap: mints pay honest-play amounts, stall-farming pays nothing
          if (++t.incomeTicks <= 3 + Math.ceil(st.wave / 2)) {
            const inc = Math.round(S.income);
            st.coins += inc; st.stats.earned += inc;
            emit(st, { t: 'mint', tid: t.tid, x: t.x, y: t.y, amount: inc });
          }
        }
      }
      return;
    }
    if (def.kind === 'aura') return;
    t.cool -= dt;
    if (t.cool > 0) return;
    const target = pickTarget(st, t, S.range);
    if (!target) return;
    t.cool = 1 / S.rof;
    const tp = posAlong(st.parsed, target.d);
    t.angle = Math.atan2(tp.y - t.y, tp.x - t.x);

    if (def.kind === 'hitscan') {
      let dmg = S.dmg;
      let crit = false;
      if (def.critChance && st.rng() < def.critChance) { dmg *= def.critMult; crit = true; }
      emit(st, { t: 'shot', kind: t.def, tid: t.tid, x: t.x, y: t.y, tx: tp.x, ty: tp.y, crit });
      damage(st, target, dmg, { pierceArmor: def.pierceArmor, srcT: t });
    } else if (def.kind === 'burst') {
      emit(st, { t: 'shot', kind: t.def, tid: t.tid, x: t.x, y: t.y, tx: tp.x, ty: tp.y });
      const victims = [target];
      for (const e of st.enemies) {
        if (victims.length >= def.burstMax) break;
        if (e === target || e.hp <= 0) continue; // burst pellets tag cloaked too (spray)
        const p = posAlong(st.parsed, e.d);
        if (Math.hypot(p.x - tp.x, p.y - tp.y) <= def.burstRadius) victims.push(e);
      }
      for (const v of victims) damage(st, v, S.dmg, { srcT: t });
    } else if (def.kind === 'chain') {
      const hits = [target];
      let from = target;
      for (let i = 1; i < def.chain; i++) {
        const fp = posAlong(st.parsed, from.d);
        let nxt = null, nd = Infinity;
        for (const e of st.enemies) {
          if (e.hp <= 0 || hits.includes(e)) continue;
          const p = posAlong(st.parsed, e.d);
          const dd = Math.hypot(p.x - fp.x, p.y - fp.y);
          if (dd <= def.chainRange && dd < nd) { nd = dd; nxt = e; }
        }
        if (!nxt) break;
        hits.push(nxt); from = nxt;
      }
      const pts = hits.map(e => { const p = posAlong(st.parsed, e.d); return { x: p.x, y: p.y }; });
      emit(st, { t: 'chain', tid: t.tid, x: t.x, y: t.y, points: pts });
      for (const e of hits) {
        e.slowT = Math.max(e.slowT, def.slowDur);
        e.slowF = 1 - def.slow;
        if (def.reveals && e.cloaked) { e.cloaked = false; e.cloakT = ENEMIES.ghost.cloak.vis; emit(st, { t: 'reveal', eid: e.eid }); }
        damage(st, e, S.dmg, { pierceArmor: true, srcT: t });
      }
    } else if (def.kind === 'lob') {
      st.lobs.push({ x: t.x, y: t.y, tx: tp.x, ty: tp.y, tAir: def.lobTime, dmg: S.dmg, splash: def.splash, srcTid: t.tid });
      emit(st, { t: 'lob', tid: t.tid, x: t.x, y: t.y, tx: tp.x, ty: tp.y, air: def.lobTime });
    }
  }

  // ---------- STEP ----------
  function step(st, dt) {
    if (st.over) return drainEvents(st);
    st.time += dt;

    // spawns
    while (st.spawnQueue.length && st.spawnQueue[0].at <= st.time) {
      const s = st.spawnQueue.shift();
      spawnEnemy(st, s.type, s.lvl);
    }

    // enemies
    for (const e of st.enemies) {
      if (e.hp <= 0) continue;
      // cloak cycle
      const base = ENEMIES[e.type];
      if (base.cloak) {
        e.cloakT -= dt;
        if (e.cloakT <= 0) {
          e.cloaked = !e.cloaked;
          e.cloakT = e.cloaked ? base.cloak.hid : base.cloak.vis;
          emit(st, { t: e.cloaked ? 'cloak' : 'reveal', eid: e.eid });
        }
      }
      // director dash bursts
      if (e.director) {
        e.dashT -= dt;
        if (e.dashT <= -5) { e.dashT = 0.8; emit(st, { t: 'dash', eid: e.eid }); }
      }
      // slow decay
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slowF = 1; }
      let spd = e.baseSpd * e.slowF;
      if (e.director && e.dashT > 0) spd *= 3;
      e.d += spd * dt;
      // medic heal
      if (e.healRate) {
        const mp = posAlong(st.parsed, e.d);
        for (const o of st.enemies) {
          if (o === e || o.hp <= 0 || o.hp >= o.maxHp) continue;
          const op = posAlong(st.parsed, o.d);
          if (Math.hypot(op.x - mp.x, op.y - mp.y) <= e.healRadius) {
            o.hp = Math.min(o.maxHp, o.hp + e.healRate * dt);
          }
        }
      }
      // leak
      if (e.d >= st.parsed.length) {
        e.hp = 0;
        st.markers -= e.leak;
        st.stats.leaks++;
        emit(st, { t: 'leak', eid: e.eid, type: e.type, leak: e.leak, markers: st.markers });
      }
    }
    st.enemies = st.enemies.filter(e => e.hp > 0);

    // turrets
    for (const t of st.turrets) fireTurret(st, t, dt);

    // lobs (keg shells in flight)
    for (const L of st.lobs) {
      L.tAir -= dt;
      if (L.tAir <= 0) {
        emit(st, { t: 'splash', x: L.tx, y: L.ty, radius: L.splash });
        const srcT = st.turrets.find(x => x.tid === L.srcTid);
        for (const e of st.enemies) {
          if (e.hp <= 0) continue; // killed earlier this same step
          const p = posAlong(st.parsed, e.d);
          const dd = Math.hypot(p.x - L.tx, p.y - L.ty);
          if (dd <= L.splash) {
            const fall = 1 - 0.5 * (dd / L.splash);
            damage(st, e, L.dmg * fall, { pierceArmor: false, srcT }); // splash hits cloaked (no targeting needed)
          }
        }
      }
    }
    st.lobs = st.lobs.filter(L => L.tAir > 0);
    st.enemies = st.enemies.filter(e => e.hp > 0);

    // defeat
    if (st.markers <= 0) {
      st.markers = 0; st.over = true; st.victory = false;
      emit(st, { t: 'lose', wave: st.wave });
      return drainEvents(st);
    }

    // wave clear
    if (st.waveActive && st.spawnQueue.length === 0 && st.enemies.length === 0) {
      st.waveActive = false;
      const bonus = Math.round(Math.max(20, 60 + 10 * st.wave + (st.doctrine.waveBonus || 0)) * (st.waveWager ? 2.5 : 1));
      st.coins += bonus; st.stats.earned += bonus;
      st.stats.waveTimes.push(st.time - st.stats.startTime);
      emit(st, { t: 'wave_clear', wave: st.wave, bonus, wager: !!st.waveWager });
      if (st.waveWager) { st.stats.wagersHeld = (st.stats.wagersHeld || 0) + 1; st.waveWager = false; }
      if (!st.floor.endless && st.wave >= st.floor.waves) {
        st.over = true; st.victory = true;
        emit(st, { t: 'win', floor: st.floorId, stars: stars(st) });
      }
    }
    return drainEvents(st);
  }

  function stars(st) {
    if (!st.victory) return 0;
    if (st.stats.leaks === 0) return 3;
    if (st.markers - (st.markersBought || 0) >= st.startMarkers - 6) return 2; // relative: gear/DOORS/bought markers never widen the band
    return 1;
  }

  function score(st) {
    // markers term is leak-relative (20 minus damage taken, floored at 0) so
    // holders/doctrines score identically on identical play — envelope holds
    const markerTerm = Math.max(0, 20 - (st.startMarkers - (st.markers - (st.markersBought || 0)))) * 150; // bought markers are NOT score
    const wagerTerm = (st.stats.wagersHeld || 0) * 500; // signed contracts held pay in score
    return st.stats.kills * 25 + markerTerm + wagerTerm + st.wave * 200 + (st.victory ? 1000 * st.floorId : 0);
  }

  // ---------- DAILY CONTRACT ----------
  function dailyContract(dateStr) {
    // dateStr 'YYYY-MM-DD' UTC
    const n = parseInt(dateStr.replace(/-/g, ''), 10);
    const rng = mulberry32(n ^ 0x51E6E);
    const floor = 1 + Math.floor(rng() * 6);
    const diffs = ['operative', 'ghost', 'ghost', 'babayaga'];
    const difficulty = diffs[Math.floor(rng() * diffs.length)];
    const bannable = ['pistol', 'smg', 'shotgun', 'sniper', 'keg', 'tesla', 'mint', 'banner'];
    const banned = bannable[Math.floor(rng() * bannable.length)];
    const spice = rng();
    const mutators = { banned };
    let clause = 'STANDARD TERMS';
    if (spice < 0.33) { mutators.enemySpeed = 1.15; clause = 'THEY COME FAST'; }
    else if (spice < 0.66) { mutators.enemyHp = 1.15; clause = 'THEY COME HARD'; }
    else { mutators.bounty = 1.3; clause = 'DOUBLE COIN CLAUSE'; }
    return { date: dateStr, floor, difficulty, mutators, banned, clause, seed: n };
  }

  // ---------- QA BOT (headless greedy player) ----------
  function coverageScore(parsed, c, r, rangePx) {
    const x = BOARD_X + c * CELL + CELL / 2, y = BOARD_Y + r * CELL + CELL / 2;
    let n = 0;
    for (const p of parsed.wp) if (Math.hypot(p.x - x, p.y - y) <= rangePx) n++;
    return n;
  }

  function botPlay(opts) {
    opts = opts || {};
    const st = createGame(opts);
    const banned = st.mutators.banned;
    const buyOrder = ['pistol', 'pistol', 'sniper', 'smg', 'tesla', 'keg', 'sniper', 'tesla', 'banner', 'smg', 'sniper', 'keg', 'tesla', 'sniper', 'smg', 'sniper']
      .filter(d => d !== banned);
    let buyIdx = 0;
    // precompute best cells by pistol-range coverage
    const spots = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const ch = st.parsed.grid[r][c];
      if (ch === '.' || ch === 'G') {
        spots.push({ c, r, cov: coverageScore(st.parsed, c, r, 150) + (ch === 'G' ? 2 : 0) });
      }
    }
    spots.sort((a, b) => b.cov - a.cov);
    let spotIdx = 0;
    const maxSteps = opts.maxSteps || 400000;
    let steps = 0;
    const dt = 0.05;
    while (!st.over && steps++ < maxSteps) {
      // shop between and during waves; spend the bank BEFORE calling a wave
      let acted = false;
      if (buyIdx < buyOrder.length) {
        const want = TURRETS[buyOrder[buyIdx]];
        if (st.coins >= want.cost) {
          while (spotIdx < spots.length && turretAt(st, spots[spotIdx].c, spots[spotIdx].r)) spotIdx++;
          if (spotIdx < spots.length) {
            const s = spots[spotIdx];
            const res = place(st, want.id, s.c, s.r);
            if (res.ok) { buyIdx++; acted = true; }
            else spotIdx++;
          } else buyIdx++; // no room
        }
      } else {
        // upgrade cheapest-to-upgrade attacking turret
        let best = null, bestCost = Infinity;
        for (const t of st.turrets) {
          if (t.tier >= TIERS) continue;
          const k = TURRETS[t.def].kind;
          if (k === 'income' || k === 'aura') continue;
          const cost = tierCost(TURRETS[t.def], t.tier + 1);
          if (cost < bestCost) { bestCost = cost; best = t; }
        }
        if (best && st.coins >= bestCost * 1.4) { upgrade(st, best.tid); acted = true; }
      }
      if (!st.waveActive && !st.over && !acted) {
        if (opts.stopAfterWave && st.wave >= opts.stopAfterWave) break;
        if (opts.trace) opts.trace.push({ wave: st.wave + 1, markers: st.markers, coins: st.coins, turrets: st.turrets.map(t => t.def + t.tier).join(',') });
        startWave(st);
      }
      step(st, dt);
      st.events = []; // headless: drop events
    }
    return {
      victory: st.victory, over: st.over, wave: st.wave, markers: st.markers,
      kills: st.stats.kills, leaks: st.stats.leaks, coins: st.coins,
      turrets: st.turrets.length, steps, score: score(st),
    };
  }

  // ---------- EXPORT ----------
  const CS = {
    COLS, ROWS, CELL, BOARD_X, BOARD_Y,
    FLOORS, TURRETS, ENEMIES, DIFFS, DOCTRINES, TIERS, BOSS_NAMES,
    mulberry32, parseMap, posAlong, waveComp,
    createGame, step, drainEvents, place, canPlace, upgrade, sell, cyclePriority, damage,
    buyMarker, markerCost, wagerWave, wagerCost,
    startWave, turretStats, tierCost, tierMult, turretAt, cellAt,
    stars, score, dailyContract, botPlay, coverageScore, floorById,
  };
  global.CS = CS;
})(typeof window !== 'undefined' ? window : globalThis);
