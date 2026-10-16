/* =========================================================================
   PEPE WICK vs HORDE — the ten roads.
   Pure data, no three.js. Every level is one road through the Wick-verse,
   with its own palette, weather, skyline, roadside set, horde roster,
   gimmick and boss. Node-tested (test/run-tests.mjs validates every entry).
   ========================================================================= */
(function (global) {
  'use strict';

  // ---- the horde (zombified Wick-verse) — sim roles ----
  // hp/spd/contact at level 1; the director scales them with distance.
  // r = half-width in road units (road half-width = 1.0 = ~3.2m).
  const FOES = {
    goon:     { name: 'CONTINENTAL GOON', hp: 12,  spd: 2.4, r: 0.10, contact: 1, pay: 2,  scale: 1.00, kind: 'walk',   tint: 0x6f7f6a },
    runner:   { name: 'COURIER',          hp: 7,   spd: 6.2, r: 0.08, contact: 1, pay: 3,  scale: 0.92, kind: 'run',    tint: 0x8a9a7a },
    brute:    { name: 'ENFORCER',         hp: 90,  spd: 1.6, r: 0.18, contact: 4, pay: 12, scale: 1.55, kind: 'walk',   tint: 0x5e6e62 },
    shield:   { name: 'HIGH TABLE SWAT',  hp: 40,  spd: 2.0, r: 0.12, contact: 2, pay: 8,  scale: 1.08, kind: 'walk',   tint: 0x3f4a55, plate: 0.3 },
    spitter:  { name: 'SOMMELIER',        hp: 26,  spd: 1.8, r: 0.11, contact: 1, pay: 7,  scale: 1.05, kind: 'dig',    tint: 0x7a5a6a, ranged: true },
    exploder: { name: 'BOMB VEST',        hp: 16,  spd: 5.0, r: 0.10, contact: 3, pay: 6,  scale: 1.00, kind: 'run',    tint: 0x8a6a4a, boom: 0.45 },
    ninja:    { name: 'SHINOBI',          hp: 30,  spd: 4.4, r: 0.09, contact: 2, pay: 10, scale: 1.00, kind: 'run',    tint: 0x2f4a4f, vanish: true },
    chef:     { name: 'CLEAVER CHEF',     hp: 24,  spd: 1.9, r: 0.11, contact: 1, pay: 7,  scale: 1.02, kind: 'dig',    tint: 0xa8a8a0, ranged: true, cleaver: true },
    judge:    { name: 'THE ADJUDICATOR',  hp: 60,  spd: 1.2, r: 0.12, contact: 2, pay: 20, scale: 1.15, kind: 'float',  tint: 0x4a3a5a, verdict: true },
    bounty:   { name: 'EXCOMMUNICADO',    hp: 70,  spd: 1.7, r: 0.15, contact: 3, pay: 30, scale: 1.30, kind: 'walk',   tint: 0x8a7a3a, plate: 0.45 },
    hound:    { name: 'KENNEL HOUND',     hp: 9,   spd: 7.5, r: 0.07, contact: 1, pay: 3,  scale: 0.70, kind: 'hound',  tint: 0x5a4a3a },
  };

  // ---- bosses — each level ends on one. ttk = seconds a 60-wick squad needs to
  // kill it (hp is derived from that at fight start, scaled gently by squad
  // size, so a boss is a test of nerve, never a formality). Phases at 66/33%. ----
  const BOSSES = {
    doorman:   { name: 'THE DOORMAN',     sub: 'the desk is closed.',            ttk: 20, r: 0.30, scale: 2.2, atk: 'charge',  tint: 0x3a3f4a, accent: 0xe8c576 },
    perkins:   { name: 'MS. PERKINS',     sub: 'she took the contract.',         ttk: 22, r: 0.18, scale: 1.4, atk: 'blade',   tint: 0x2a2a30, accent: 0xff5c5c },
    kirill:    { name: 'KIRILL',          sub: 'the red circle closes.',         ttk: 25, r: 0.32, scale: 2.3, atk: 'slam',    tint: 0x4a2a30, accent: 0xff2a6d },
    cassian:   { name: 'CASSIAN',         sub: 'a professional courtesy.',       ttk: 27, r: 0.22, scale: 1.6, atk: 'grenade', tint: 0x2f2f2a, accent: 0xff9d3d },
    sommelier: { name: 'THE SOMMELIER',   sub: 'something robust.',              ttk: 30, r: 0.24, scale: 1.7, atk: 'acid',    tint: 0x4a2a3a, accent: 0x9cff5c },
    elder:     { name: 'THE ELDER',       sub: 'the one above the table.',       ttk: 32, r: 0.26, scale: 1.8, atk: 'summon',  tint: 0x5a4a30, accent: 0xffd23f },
    zero:      { name: 'ZERO',            sub: 'we are the same.',               ttk: 34, r: 0.20, scale: 1.5, atk: 'vanish',  tint: 0x1f2a2f, accent: 0x7fd0ff },
    killa:     { name: 'KILLA',           sub: 'gold teeth. no manners.',        ttk: 37, r: 0.34, scale: 2.5, atk: 'slam',    tint: 0x3a3a3a, accent: 0xffd23f },
    tracker:   { name: 'THE TRACKER',     sub: 'the dogs are off the leash.',    ttk: 39, r: 0.22, scale: 1.6, atk: 'hounds',  tint: 0x3a3a2a, accent: 0xb26bff },
    marquis:   { name: 'THE MARQUIS',     sub: 'the high table sends its regards.', ttk: 44, r: 0.26, scale: 1.9, atk: 'marquis', tint: 0x2a2535, accent: 0xe6c3ff },
  };

  // ---- palettes: numbers are three.js hex colours ----
  // sky: [zenith, horizon, ground-haze]; sun: [colour, intensity, dir xyz]
  const L = [];
  function level(o) { L.push(o); return o; }

  level({ key: 'bowery', name: 'THE BOWERY', city: 'NEW YORK', sub: 'they came for the dog at midnight.',
    len: 700, grade: 0.0,
    pal: { sky: [0x05070f, 0x1a1030, 0x0a0a16], fog: 0x0b0a18, sun: [0x8aa0ff, 1.3, [-0.5, 0.8, -0.3]], amb: [0x202a44, 0x08080c, 0.55],
           neon: [0xff2a6d, 0x05d9e8], road: 0x1b1c22, verge: 0x121318, bld: 0x14161c, win: 0xffc58a, accent: 0xff2a6d },
    weather: 'rain', skyline: 'city', set: ['lamp', 'sign', 'wreck', 'barrier', 'dumpster', 'hydrant', 'steam'],
    roster: { goon: 7, runner: 3 }, wave: 0.85, gimmick: 'rain',
    boss: 'doorman', music: { bpm: 126, key: 0, mood: 'noir' } });

  level({ key: 'continental', name: 'CONTINENTAL ROW', city: 'NEW YORK', sub: 'no business on hotel grounds. they forgot.',
    len: 820, grade: 0.12,
    pal: { sky: [0x07060c, 0x2a1d10, 0x0c0a08], fog: 0x120e0a, sun: [0xffd9a0, 1.6, [-0.4, 0.7, -0.4]], amb: [0x3a2a18, 0x0a0806, 0.5],
           neon: [0xe8c576, 0xffb347], road: 0x1e1c1a, verge: 0x17140f, bld: 0x2a2118, win: 0xffe0b0, accent: 0xe8c576 },
    weather: 'embers', skyline: 'hotel', set: ['lamp', 'bollard', 'cart', 'planter', 'awning', 'wreck', 'gantry'],
    roster: { goon: 6, runner: 3, shield: 2 }, wave: 0.95, gimmick: 'barriers',
    boss: 'perkins', music: { bpm: 128, key: 2, mood: 'gilded' } });

  level({ key: 'redcircle', name: 'RED CIRCLE', city: 'NEW YORK', sub: 'the bathhouse never closes.',
    len: 880, grade: 0.3,
    pal: { sky: [0x0a0410, 0x3a0a2a, 0x100510], fog: 0x1a0818, sun: [0xff6ab0, 1.5, [0.5, 0.7, -0.3]], amb: [0x4a1040, 0x0a040a, 0.6],
           neon: [0xff2a6d, 0xff7aa8], road: 0x1a1218, verge: 0x12090f, bld: 0x1c0f18, win: 0xff5c9a, accent: 0xff2a6d },
    weather: 'steam', skyline: 'club', set: ['neon', 'lamp', 'velvet', 'wreck', 'steam', 'sign', 'dumpster'],
    roster: { runner: 6, goon: 4, chef: 2 }, wave: 1.0, gimmick: 'strobe',
    boss: 'kirill', music: { bpm: 132, key: 5, mood: 'club' } });

  level({ key: 'catacombs', name: 'THE CATACOMBS', city: 'ROME', sub: 'the dead were already here.',
    len: 900, grade: 0.25,
    pal: { sky: [0x080604, 0x2a1a0a, 0x0a0604], fog: 0x1a1008, sun: [0xffb070, 1.2, [0.2, 0.9, -0.2]], amb: [0x3a2a10, 0x0a0804, 0.45],
           neon: [0xff9d3d, 0xffd27c], road: 0x24201a, verge: 0x1a1510, bld: 0x3a3025, win: 0xffa050, accent: 0xff9d3d },
    weather: 'dust', skyline: 'tunnel', set: ['pillar', 'torch', 'bones', 'sarcophagus', 'rubble', 'candles'],
    roster: { goon: 5, exploder: 3, spitter: 2, shield: 2 }, wave: 1.0, gimmick: 'pillars',
    boss: 'cassian', music: { bpm: 124, key: 7, mood: 'choir' } });

  level({ key: 'souk', name: 'THE SOUK', city: 'CASABLANCA', sub: 'every stall sells the same thing: trouble.',
    len: 950, grade: 0.45,
    pal: { sky: [0x1a0a10, 0xff6a30, 0x4a1a10], fog: 0x3a1a10, sun: [0xffa040, 2.2, [0.7, 0.35, -0.5]], amb: [0x5a3020, 0x1a0a08, 0.5],
           neon: [0xffd23f, 0xff6a30], road: 0x3a2e24, verge: 0x4a3a28, bld: 0x6a4a30, win: 0xffd080, accent: 0xffd23f },
    weather: 'sand', skyline: 'souk', set: ['stall', 'lamp', 'awning', 'crates', 'arch', 'wreck', 'rugs'],
    roster: { runner: 4, chef: 3, spitter: 3, hound: 3 }, wave: 1.05, gimmick: 'stalls',
    boss: 'sommelier', music: { bpm: 130, key: 9, mood: 'desert' } });

  level({ key: 'desert', name: 'THE ELDER’S ROAD', city: 'THE DESERT', sub: 'walk until you can’t. then keep walking.',
    len: 1000, grade: 0.5,
    pal: { sky: [0x2a1a0a, 0xc47a3a, 0x5a3a1a], fog: 0x9a6a3a, sun: [0xffc080, 2.6, [0.8, 0.5, -0.3]], amb: [0x8a6a40, 0x3a2a10, 0.6],
           neon: [0xffd23f, 0xffffff], road: 0x6a5a40, verge: 0x9a7a4a, bld: 0x8a6a40, win: 0xffffff, accent: 0xffd23f },
    weather: 'sandstorm', skyline: 'dunes', set: ['dune', 'carcass', 'pylon', 'tent', 'wreck', 'bones'],
    roster: { brute: 3, bounty: 2, exploder: 3, runner: 4 }, wave: 1.1, gimmick: 'sandstorm',
    boss: 'elder', music: { bpm: 122, key: 4, mood: 'drone' } });

  level({ key: 'osaka', name: 'OSAKA CONTINENTAL', city: 'OSAKA', sub: 'the shinobi do not knock.',
    len: 1000, grade: 0.55,
    pal: { sky: [0x05080f, 0x1a2a4a, 0x0a0f1a], fog: 0x0e1626, sun: [0x8ad0ff, 1.5, [-0.5, 0.8, -0.2]], amb: [0x1a3050, 0x080a10, 0.6],
           neon: [0xff7ab8, 0x05d9e8], road: 0x1a1e26, verge: 0x121820, bld: 0x182030, win: 0x8af0ff, accent: 0xff7ab8 },
    weather: 'petals', skyline: 'osaka', set: ['glass', 'lantern', 'lamp', 'torii', 'wreck', 'neon', 'planter'],
    roster: { ninja: 4, shield: 3, runner: 4, goon: 3 }, wave: 1.1, gimmick: 'glass',
    boss: 'zero', music: { bpm: 134, key: 11, mood: 'koto' } });

  level({ key: 'berlin', name: 'BERLIN UNDERGROUND', city: 'BERLIN', sub: 'the club has one rule. kill.',
    len: 1050, grade: 0.75,
    pal: { sky: [0x04060a, 0x0e1a24, 0x060a0e], fog: 0x08121a, sun: [0x6ab0ff, 1.1, [0.3, 0.9, -0.3]], amb: [0x10202a, 0x04080a, 0.5],
           neon: [0x05d9e8, 0xffffff], road: 0x1a1f24, verge: 0x10151a, bld: 0x202830, win: 0x9ad0ff, accent: 0x05d9e8 },
    weather: 'rain', skyline: 'industrial', set: ['pylon', 'tank', 'conveyor', 'pipes', 'wreck', 'barrier', 'strobe'],
    roster: { brute: 3, shield: 3, judge: 1, exploder: 3, goon: 3 }, wave: 1.15, gimmick: 'conveyor',
    boss: 'killa', music: { bpm: 140, key: 1, mood: 'techno' } });

  level({ key: 'paris', name: 'ARC DE TRIOMPHE', city: 'PARIS', sub: 'twelve lanes. no signals. no mercy.',
    len: 1100, grade: 0.65,
    pal: { sky: [0x06070f, 0x2a2040, 0x0c0a14], fog: 0x14101e, sun: [0xffe0b0, 1.5, [-0.6, 0.7, -0.3]], amb: [0x2a2a44, 0x0a0a10, 0.55],
           neon: [0xffd27c, 0xff2a6d], road: 0x202026, verge: 0x18181e, bld: 0x2a2a30, win: 0xffe9a8, accent: 0xffd27c },
    weather: 'none', skyline: 'paris', set: ['lamp', 'arch', 'kiosk', 'tree', 'wreck', 'bollard', 'gantry'],
    roster: { hound: 5, runner: 4, bounty: 2, goon: 3, ninja: 2 }, wave: 1.2, gimmick: 'traffic',
    boss: 'tracker', music: { bpm: 136, key: 6, mood: 'strings' } });

  level({ key: 'sacrecoeur', name: 'SACRÉ-CŒUR', city: 'PARIS, DAWN', sub: 'two hundred and twenty-two steps. the table waits at the top.',
    len: 1200, grade: 1.0,
    pal: { sky: [0x1a2040, 0xff9a60, 0x6a4a60], fog: 0x9a7a90, sun: [0xffc090, 2.4, [0.6, 0.45, -0.5]], amb: [0x6a5a80, 0x2a2030, 0.6],
           neon: [0xffffff, 0xe6c3ff], road: 0x8a8070, verge: 0x6a6060, bld: 0xcabfb0, win: 0xffffff, accent: 0xe6c3ff },
    weather: 'none', skyline: 'basilica', set: ['lamp', 'balustrade', 'tree', 'statue', 'bollard', 'planter'],
    roster: { goon: 4, runner: 4, shield: 2, ninja: 2, brute: 2, bounty: 1, hound: 2 }, wave: 1.3, gimmick: 'stairs',
    boss: 'marquis', music: { bpm: 128, key: 3, mood: 'finale' } });

  // ---- endless modes ride on the last road ----
  const GAUNTLET = { key: 'gauntlet', name: 'THE GAUNTLET', city: 'EVERYWHERE', sub: 'no finish line. only a number.',
    len: 1e9, grade: 0.5, pal: L[0].pal, weather: 'rain', skyline: 'city', set: L[0].set,
    roster: { goon: 5, runner: 4, shield: 2, spitter: 2, exploder: 2, ninja: 2, brute: 1, bounty: 1, hound: 3 },
    wave: 1.1, gimmick: 'none', boss: 'doorman', bossEvery: 650, endless: true, music: { bpm: 132, key: 0, mood: 'noir' } };

  // the perk draft — pick 1 of 3 every DRAFT_EVERY metres. Stack cap per perk.
  const PERKS = {
    ricochet:   { name: 'RICOCHET',      desc: 'rounds skip to a second target',    max: 2 },
    doubletap:  { name: 'DOUBLE TAP',    desc: '+30% rate of fire',                 max: 3 },
    deadeye:    { name: 'DEADEYE',       desc: '12% of shots crit for 3×',    max: 3 },
    kevlar:     { name: 'KEVLAR',        desc: 'every contact costs one less wick', max: 2 },
    longarms:   { name: 'LONG ARMS',     desc: '+25% range · wider gate reach', max: 2 },
    adrenaline: { name: 'ADRENALINE',    desc: '+12% damage · +8% speed',      max: 3 },
    greed:      { name: 'GREED',         desc: '+40% $WICK from everything',        max: 3 },
    medic:      { name: 'MEDIC',         desc: 'a wick rejoins every 6 s',          max: 2 },
    highex:     { name: 'HIGH EXPLOSIVE', desc: 'kills splash nearby foes',         max: 2 },
    overcharge: { name: 'OVERCHARGE',    desc: 'streak ≥ 8 → +35% damage', max: 1 },
  };

  const CONST = {
    ROAD_HALF: 1.0,         // road units (x ∈ [-1,1])
    SPAWN_Z: 62,            // metres ahead of the squad line
    CONTACT_Z: 0.9,         // where a foe reaches the squad
    DRAFT_EVERY: 400,
    GATE_EVERY: 95,
    BARREL_EVERY: 140,
    SQUAD_CAP: 999,
    STREAMS_MAX: 12,
    MEGA_AT: 20, TITAN_AT: 400,
    BASE_DPS: 22,           // hp/s ONE wick deals with the house P30
    DPS_POW: 0.7,           // squad dps = BASE_DPS * count^DPS_POW — sub-linear, so size helps without steamrolling
    BOSS_ENRAGE: 75,
    SPEED: 9.5,             // metres/s road scroll
  };

  global.HORDE_LEVELS = { LEVELS: L, GAUNTLET, FOES, BOSSES, PERKS, CONST };
})(typeof window !== 'undefined' ? window : globalThis);
