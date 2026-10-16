/* PEPE WICK vs HORDE — the game. Glues the pure sim to the three.js world,
   crowd, effects, post stack, audio, HUD/overlays, wallet + loadout, saves,
   leaderboard, and the QA hooks (window.HQ). */
import * as THREE from 'three';
import { World } from './world.js';
import { Crowd } from './crowd.js';
import { FX } from './fx.js';
import { Post } from './post.js';
import { Audio } from './audio.js';

const LV = window.HORDE_LEVELS, SIM = window.HORDE_SIM, ARMS = window.HORDE_ARMS, WL = window.WICK_LOADOUT, NFT = window.AR_NFT, R = window.ARSENAL_ROSTER;
const { LEVELS, GAUNTLET, PERKS, CONST } = LV;
const ROAD = 3.2;
const LB_URL = 'https://wick-arsenal.vercel.app/api/leaderboard';
const $ = id => document.getElementById(id);
const store = { get: (k, d) => { try { const v = localStorage.getItem('wh_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem('wh_' + k, JSON.stringify(v)); } catch (e) {} } };
const fmt = n => Math.floor(n).toLocaleString('en-US');
const todayKey = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');

// ---------- renderer ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.3, 500);
const world = new World(scene, renderer);
const crowd = new Crowd(scene, LV.FOES, LV.BOSSES);
const fx = new FX(scene, camera);
const post = new Post(renderer);
const audio = new Audio();
fx.onFlash = (r, g, b) => post.addFlash(r, g, b);
let quality = store.get('quality2', 1);   // 'quality2': the first key was polluted by an auto-drop that fired under tool-driven frames
function applyQuality() {
  const q = quality;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q >= 1 ? 2 : 1.25) * (q >= 1 ? 1 : 0.8));
  world.sun.shadow.mapSize.set(q >= 1 ? 2048 : 1024, q >= 1 ? 2048 : 1024); if (world.sun.shadow.map) { world.sun.shadow.map.dispose(); world.sun.shadow.map = null; }
  post.quality = q;
  resize(true);
}
function resize(force) {
  const w = window.innerWidth || 1280, h = window.innerHeight || 720;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w / h < 0.8 ? 64 : w / h < 1.3 ? 54 : 46;
  camera.updateProjectionMatrix();
  const dpr = renderer.getPixelRatio();
  post.resize(w * dpr, h * dpr);
  if (force) post.resize(w * dpr, h * dpr);
}
window.addEventListener('resize', () => resize());

// ---------- state ----------
let mode = 'title';          // title | play | over
let sim = null, level = null, levelIdx = 0, runMode = 'campaign';
let runPerks = {}, carryCount = 1;
let member = null, weapon = ARMS.profile(null, []), pref = null;
let demo = null;
let timeScale = 1, slowT = 0, bossIntroT = 0, pauseOn = false;
let lastT = performance.now(), fpsAcc = 0, fpsN = 0, fps = 60, lowT = 0;
let input = { steer: 0, targetX: null, pointer: false };
let lbBusy = false;
const popups = [];
const unlocked = () => store.get('unlocked', 1);

// ---------- weapon / wallet ----------
function hashPref() { const p = WL.parseFragment(location.hash); if (p) return p; const r = WL.read(); if (r.loadout != null) return { gunType: r.loadout, gunId: null, mods: [], modcfg: r.modCfg }; return null; }
function setWeapon() {
  pref = hashPref();
  weapon = ARMS.resolve(member, pref);
  fx.setWeapon(weapon); crowd.setWeapon(weapon);
  renderLoadout();
}
function renderLoadout() {
  const img = $('gunCard');
  try { img.src = window.gunArtURI(weapon.type, weapon.id); } catch (e) {}
  $('gunName').textContent = weapon.name;
  $('gunClass').textContent = (weapon.loaner ? 'HOUSE ISSUE · ' : weapon.rarity.toUpperCase() + ' · ') + weapon.cls.toUpperCase();
  $('gunPerk').textContent = weapon.perk;
  const shape = [weapon.pellets > 1 ? weapon.pellets + ' PELLETS' : null, weapon.pierce > 1 ? 'PIERCE ' + weapon.pierce : null, weapon.arc > 1 ? 'TRI-ARC' : null, weapon.rof.toFixed(1) + '/s'].filter(Boolean).join(' · ');
  $('gunShape').textContent = shape;
  const mods = weapon.mods.map(t => R.WICK_MODS[t] ? R.WICK_MODS[t].tag : '').filter(Boolean);
  $('gunMods').textContent = mods.length ? 'MODS: ' + mods.join(' · ') : (member && member.guns.length ? 'NO MODS BOLTED — set a build at the RANGE' : '');
  $('gunEdge').textContent = weapon.loaner ? 'Squad firepower 100% — fully viable. Holders get up to +20%.' : 'Squad firepower ' + Math.round(weapon.dpsMult * 100) + '%' + (weapon.holo ? ' · HOLO' : '');
  $('loanerTag').classList.toggle('hidden', !weapon.loaner);
  $('walletBtn').textContent = member ? member.addr.slice(0, 6) + '…' + member.addr.slice(-4) + ' · ' + member.guns.length + ' GUN' + (member.guns.length === 1 ? '' : 'S') : 'CONNECT WALLET';
  $('gunPick').innerHTML = '';
  if (member && member.guns.length > 1) {
    for (const g of member.guns.slice(0, 12)) {
      const b = document.createElement('button'); b.className = 'chip' + (g.id === weapon.id ? ' on' : ''); b.textContent = '#' + g.id + ' ' + (R.WICK_GUNS[g.type] ? R.WICK_GUNS[g.type].name : 'GUN');
      b.onclick = () => { pref = Object.assign(pref || {}, { gunId: g.id, gunType: g.type }); weapon = ARMS.resolve(member, pref); fx.setWeapon(weapon); crowd.setWeapon(weapon); renderLoadout(); audio.ui(); };
      $('gunPick').appendChild(b);
    }
  }
}
async function connect() {
  $('walletBtn').textContent = 'CONNECTING…';
  const r = await NFT.connect();
  if (!r.ok) { $('walletBtn').textContent = r.err; setTimeout(renderLoadout, 1800); return; }
  member = { addr: r.addr, guns: r.guns, mods: r.mods, gunTypes: r.guns.map(g => g.type) };
  store.set('addr', r.addr);
  setWeapon();
}
async function silentReconnect() {
  const addr = store.get('addr', null); if (!addr || !window.ethereum) return;
  try {
    const accs = await window.ethereum.request({ method: 'eth_accounts' });
    if (accs && accs[0] && accs[0].toLowerCase() === addr.toLowerCase()) { const guns = await NFT.loadArsenal(addr); const mods = guns.length ? await NFT.loadMods(addr) : []; member = { addr, guns, mods, gunTypes: guns.map(g => g.type) }; setWeapon(); }
  } catch (e) {}
}

// ---------- title ----------
function buildTitle() {
  const grid = $('levels'); grid.innerHTML = '';
  const un = unlocked();
  LEVELS.forEach((l, i) => {
    const b = document.createElement('button'); b.className = 'lv' + (i < un ? '' : ' locked') + (i === levelIdx ? ' sel' : '');
    const best = store.get('best_' + l.key, 0);
    b.innerHTML = `<span class="n">${i + 1}</span><span class="t">${l.name}</span><span class="c">${l.city}</span><span class="b">${i < un ? (best ? '★ ' + fmt(best) : 'UNPLAYED') : 'LOCKED'}</span>`;
    b.style.setProperty('--lc', '#' + l.pal.accent.toString(16).padStart(6, '0'));
    b.onclick = () => { if (i >= un) return; levelIdx = i; runMode = 'campaign'; buildTitle(); audio.ui(); };
    grid.appendChild(b);
  });
  $('gauntletBtn').classList.toggle('sel', runMode === 'gauntlet');
  $('dailyBtn').classList.toggle('sel', runMode === 'daily');
  $('gauntletBest').textContent = store.get('gbest', 0) ? 'BEST ' + fmt(store.get('gbest', 0)) + ' m' : 'NO RECORD';
  const dk = todayKey(); const dd = store.get('daily_' + dk, null);
  $('dailyBest').textContent = dd ? 'TODAY ' + fmt(dd) + ' pts' : 'ONE ATTEMPT';
  $('bank').textContent = fmt(store.get('bank', 0));
  $('startBtn').textContent = runMode === 'campaign' ? 'ROAD ' + (levelIdx + 1) + ' — ' + LEVELS[levelIdx].name : runMode === 'gauntlet' ? 'ENTER THE GAUNTLET' : 'TODAY’S CONTRACT';
  $('startBtn').disabled = runMode === 'daily' && dd != null;
  $('sndBtn').textContent = audio.on ? 'SOUND ON' : 'SOUND OFF';
  $('fxBtn').textContent = quality >= 1 ? 'GRAPHICS: ULTRA' : 'GRAPHICS: LEAN';
}
function showTitle() {
  mode = 'title';
  for (const id of ['hud', 'draft', 'over', 'pause', 'bossintro', 'clear']) $(id).classList.add('hidden');
  $('title').classList.remove('hidden'); $('startRow').classList.remove('hidden');
  buildTitle();
  // attract: the first road, a 12-wick squad marching, no horde
  level = LEVELS[levelIdx];
  world.build(level);
  demo = SIM.create({ level, weapon, seed: 1, startCount: 12 });
  sim = null;
  applyGrade(level);
  audio.setMusic(level.music); audio.setIntensity(0.15);
}
function applyGrade(l) {
  const sun = new THREE.Color(l.pal.sun[0]);
  const warm = sun.r > sun.b;
  post.setGrade({
    bloom: l.key === 'desert' || l.key === 'sacrecoeur' ? 0.5 : 0.75, thresh: 0.9,
    exposure: l.key === 'desert' ? 0.95 : l.key === 'sacrecoeur' ? 1.0 : 1.15,
    sat: l.key === 'berlin' ? 0.92 : 1.1, contrast: 1.08, vig: l.key === 'desert' ? 1.2 : 1.7,
    aberr: 0.012, grain: 0.035,
    tint: [0.94 + sun.r * 0.08, 0.94 + sun.g * 0.08, 0.94 + sun.b * 0.08],
    lift: warm ? [0.012, 0.006, 0.0] : [0.0, 0.004, 0.014], gain: [1, 1, 1],
  });
}

// ---------- run ----------
function start() {
  audio.boot(); audio.start();
  if (runMode === 'campaign') { level = LEVELS[levelIdx]; }
  else if (runMode === 'gauntlet') level = GAUNTLET;
  else { const seed = +todayKey(); const lv = LEVELS[seed % LEVELS.length]; level = Object.assign({}, lv, { key: lv.key, daily: true }); }
  if (runMode !== 'campaign' || levelIdx === 0 || !sim) { runPerks = runMode === 'campaign' && levelIdx > 0 ? runPerks : {}; }
  const seed = runMode === 'daily' ? +todayKey() : (Math.random() * 1e9) >>> 0;
  sim = SIM.create({ level, weapon, seed, mode: runMode, perks: runPerks, startCount: runMode === 'campaign' ? carryCount : 1 });
  sim.tiers = SIM.tiers(sim.count); sim.tierRank = SIM.tierRank(sim.count);
  world.build(level); crowd.slots.length = 0; crowd.lastCount = -1;
  applyGrade(level);
  audio.setMusic(level.music);
  mode = 'play'; pauseOn = false; timeScale = 1; slowT = 0; bossIntroT = 0;
  $('title').classList.add('hidden'); $('startRow').classList.add('hidden'); $('over').classList.add('hidden'); $('clear').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('hLevel').textContent = (runMode === 'gauntlet' ? 'THE GAUNTLET' : runMode === 'daily' ? 'DAILY · ' + level.name : 'ROAD ' + (levelIdx + 1) + ' · ' + level.name);
  $('hWeapon').textContent = weapon.name.toUpperCase();
  $('hGoal').textContent = level.endless ? '' : fmt(level.len) + ' m';
  renderPerkChips();
  popup(level.name, '#ffffff', 0, 2.5, 'title'); popup(level.sub, '#cfd6e3', 0, 1.8, 'sub');
  input.targetX = null;
}
function endRun(dead) {
  mode = 'over';
  const score = SIM.score(sim);
  store.set('bank', store.get('bank', 0) + sim.coins);
  let title, line;
  if (runMode === 'gauntlet') { const best = store.get('gbest', 0); if (sim.dist > best) store.set('gbest', Math.floor(sim.dist)); title = 'THE GAUNTLET TOOK YOU'; line = fmt(sim.dist) + ' m' + (sim.dist > best ? ' · NEW RECORD' : ''); }
  else if (runMode === 'daily') { store.set('daily_' + todayKey(), score); title = 'CONTRACT CLOSED'; line = fmt(score) + ' pts · same road for everyone today'; }
  else { title = 'THE HORDE TOOK ' + level.name; line = 'the squad fell at ' + fmt(sim.dist) + ' m of ' + fmt(level.len); carryCount = 1; }
  $('overTitle').textContent = title; $('overLine').textContent = line;
  $('overStats').innerHTML = `<div><b>${fmt(score)}</b><span>SCORE</span></div><div><b>${fmt(sim.kills)}</b><span>KILLS</span></div><div><b>${fmt(sim.peak)}</b><span>PEAK SQUAD</span></div><div><b>${fmt(sim.coins)}</b><span>$WICK</span></div><div><b>${fmt(sim.bestStreak)}</b><span>STREAK</span></div><div><b>${fmt(sim.bossesDown)}</b><span>BOSSES</span></div>`;
  $('lbMsg').textContent = member && member.guns.length ? '' : 'holders only board — mint at mint.wick.pics';
  $('over').classList.remove('hidden');
  audio.dead();
}
function levelClear() {
  mode = 'over';
  const score = SIM.score(sim);
  store.set('bank', store.get('bank', 0) + sim.coins);
  const best = store.get('best_' + level.key, 0); if (score > best) store.set('best_' + level.key, score);
  if (levelIdx + 1 < LEVELS.length && unlocked() < levelIdx + 2) store.set('unlocked', levelIdx + 2);
  runPerks = Object.assign({}, sim.perks);
  carryCount = Math.max(1, Math.round(sim.count * 0.3));
  const last = levelIdx === LEVELS.length - 1;
  $('clearTitle').textContent = last ? 'THE TABLE IS CLEARED' : level.name + ' — CLEARED';
  $('clearLine').textContent = last ? 'ten roads. the high table sends no more regards.' : fmt(carryCount) + ' wicks march on · ' + Object.keys(sim.perks).length + ' perks carried';
  $('clearStats').innerHTML = `<div><b>${fmt(score)}</b><span>SCORE${score > best ? ' · NEW BEST' : ''}</span></div><div><b>${fmt(sim.kills)}</b><span>KILLS</span></div><div><b>${fmt(sim.peak)}</b><span>PEAK SQUAD</span></div><div><b>${fmt(sim.coins)}</b><span>$WICK</span></div>`;
  $('nextBtn').textContent = last ? 'BACK TO THE DESK' : 'NEXT ROAD — ' + LEVELS[levelIdx + 1].name;
  $('clear').classList.remove('hidden');
  audio.clear();
}
function nextRoad() {
  if (levelIdx + 1 >= LEVELS.length) { showTitle(); return; }
  levelIdx++; start();
}

// ---------- HUD ----------
function renderPerkChips() {
  const el = $('hPerks'); el.innerHTML = '';
  if (!sim) return;
  for (const k in sim.perks) { const d = document.createElement('span'); d.className = 'perk'; d.textContent = PERKS[k].name + (sim.perks[k] > 1 ? ' ×' + sim.perks[k] : ''); el.appendChild(d); }
}
let hudCache = {};
function hud() {
  const set = (id, v) => { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } };
  set('hDist', fmt(sim.dist) + ' m');
  set('hCoins', fmt(sim.coins));
  set('hSquad', fmt(sim.count));
  const sm = $('hStreakFill'); sm.style.width = Math.min(100, sim.streak * 2.2) + '%';
  $('hStreak').classList.toggle('hot', sim.streak >= 8);
  set('hStreakN', sim.streak >= 3 ? '×' + sim.streak : '');
  const b = sim.boss;
  if (b && b.alive) { $('hBoss').classList.remove('hidden'); $('hBossFill').style.width = Math.max(0, b.hp / b.maxhp * 100) + '%'; set('hBossName', b.name + (b.enraged ? ' — ENRAGED' : b.plateT > 0 ? ' — PLATES UP' : '')); $('hBossFill').classList.toggle('rage', !!b.enraged); }
  else $('hBoss').classList.add('hidden');
  const pr = level.endless ? 0 : Math.min(1, sim.dist / level.len); $('hProgFill').style.width = (pr * 100) + '%';
}
function popup(text, color, x, life, cls, worldPos) {
  const el = document.createElement('div'); el.className = 'pop ' + (cls || ''); el.textContent = text; el.style.color = color;
  $('popups').appendChild(el);
  popups.push({ el, t: 0, life: life || 1.1, x, world: worldPos || null, rise: cls === 'title' || cls === 'sub' ? 0 : 60 });
}
const _v = new THREE.Vector3();
function updatePopups(dt) {
  const W = window.innerWidth, H = window.innerHeight;
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i]; p.t += dt;
    let sx = W / 2, sy = H * 0.42;
    if (p.world) { _v.set(p.world.x, p.world.y, p.world.z + (p.world.scroll ? sim.speed * p.t : 0)).project(camera); sx = (_v.x + 1) / 2 * W; sy = (1 - _v.y) / 2 * H; }
    else if (p.el.classList.contains('title')) sy = H * 0.3; else if (p.el.classList.contains('sub')) sy = H * 0.3 + 60;
    const f = p.t / p.life;
    p.el.style.transform = `translate(${sx}px, ${sy - p.rise * f}px) translate(-50%,-50%) scale(${1 + (f < 0.15 ? (0.15 - f) * 3 : 0)})`;
    p.el.style.opacity = f < 0.7 ? 1 : 1 - (f - 0.7) / 0.3;
    if (p.t >= p.life) { p.el.remove(); popups.splice(i, 1); }
  }
}

// ---------- events ----------
function handleEvents(evs) {
  fx.handle(evs, sim, crowd);
  for (const e of evs) {
    switch (e.type) {
      case 'shot': if (e.sz === 0 && e.i === 0) audio.shot(e.style, weapon.holo); break;
      case 'hit': if (e.crit) audio.hit(true); break;
      case 'kill': audio.kill(e.big); crowd.kill(e); break;
      case 'gate': { const good = e.delta >= 0; audio.gate(good); popup((e.delta >= 0 ? '+' : '') + e.delta + (e.op === 'x' ? '  ×' + e.n : ''), good ? '#7cf9a5' : '#ff5c7a', 0, 1.2, 'big', { x: sim.leaderX * ROAD, y: 2.6, z: 0 }); break; }
      case 'barrel': popup('+' + e.n, '#7cf9a5', 0, 1.0, 'big', { x: e.x * ROAD, y: 1.8, z: -e.z, scroll: true }); audio.gate(true); break;
      case 'merge': { audio.merge(); popup(e.rank === 2 ? 'TITAN WICK' : 'MEGA WICK', e.rank === 2 ? '#ffd23f' : '#7cf9a5', 0, 1.6, 'huge'); slowT = 0.55; timeScale = 0.25; sim.hitstop = 0.08; break; }
      case 'break': audio.hurt(); popup(e.rank === 1 ? 'MEGA BROKEN' : 'TITAN BROKEN', '#ff5c7a', 0, 1.2, 'big'); break;
      case 'contact': case 'cut': case 'burn': case 'crash': case 'maul': if (e.cost == null || e.cost > 0) { audio.hurt(); if (e.cost >= 3 || e.type === 'crash' || e.type === 'maul') popup('-' + (e.cost != null ? e.cost : (e.type === 'maul' ? 4 : 2)), '#ff5c7a', 0, 0.8, '', { x: sim.leaderX * ROAD, y: 2.2, z: 0.5 }); } break;
      case 'boom': audio.boom(); break;
      case 'streak': popup(e.n >= 45 ? 'BABA YAGA' : e.n >= 28 ? 'MASSACRE' : e.n >= 16 ? 'RAMPAGE' : 'ON A ROLL', '#ffd23f', 0, 1.3, 'huge'); audio.merge(); break;
      case 'draft': $('draft').classList.remove('hidden'); renderDraft(e.cards); audio.draft(); break;
      case 'perk': renderPerkChips(); popup(PERKS[e.key].name, '#7cf9a5', 0, 1.2, 'big'); break;
      case 'boss': bossIntroT = 2.6; $('bossName').textContent = e.name; $('bossSub').textContent = e.sub; $('bossintro').classList.remove('hidden'); audio.roar(); break;
      case 'bossphase': popup(e.phase === 2 ? 'FINAL PHASE' : 'PHASE TWO', '#ff5c7a', 0, 1.2, 'big'); audio.roar(); break;
      case 'caine': popup('CAINE JOINS THE DUEL', '#e6c3ff', 0, 1.6, 'huge'); break;
      case 'enrage': popup('ENRAGED', '#ff2a4a', 0, 1.4, 'huge'); audio.roar(); break;
      case 'bossdead': { audio.clear(); popup(e.name + ' DOWN', '#ffd23f', 0, 1.8, 'huge'); slowT = 1.2; timeScale = 0.2; break; }
      case 'clear': setTimeout(levelClear, 1400); break;
      case 'dead': setTimeout(() => endRun(true), 900); break;
      case 'medic': popup('+1', '#7cf9a5', 0, 0.8, '', { x: sim.leaderX * ROAD, y: 2.0, z: 0.8 }); break;
      case 'vanish': if (e.boss) popup('HE’S GONE', '#7fd0ff', 0, 0.8, ''); break;
    }
  }
}
function renderDraft(cards) {
  const el = $('draftCards'); el.innerHTML = '';
  cards.forEach((k, i) => {
    const d = PERKS[k]; const st = sim.perks[k] || 0;
    const c = document.createElement('button'); c.className = 'card';
    c.innerHTML = `<span class="k">${i + 1}</span><b>${d.name}</b><i>${d.desc}</i><em>${'●'.repeat(st)}${'○'.repeat(d.max - st)}</em>`;
    c.onclick = () => pick(i);
    el.appendChild(c);
  });
}
function pick(i) { if (!sim || sim.status !== 'draft') return; if (SIM.choose(sim, i)) { $('draft').classList.add('hidden'); audio.ui(); } }

// ---------- input ----------
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Enter' || e.code === 'Space') { if (mode === 'title') { start(); e.preventDefault(); } else if (mode === 'over' && !$('clear').classList.contains('hidden')) nextRoad(); else if (mode === 'over') { start(); } }
  if (e.code === 'Escape' && mode === 'play') togglePause();
  if (mode === 'play' && sim && sim.status === 'draft') { if (e.code === 'Digit1') pick(0); if (e.code === 'Digit2') pick(1); if (e.code === 'Digit3') pick(2); }
  if (e.code === 'KeyM') { audio.on = !audio.on; audio.musicOn = audio.on; if (audio.ctx) audio.master.gain.value = audio.on ? 0.7 : 0; }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
const touch = $('touch');
function ptrX(e) { const w = window.innerWidth; return Math.max(-1, Math.min(1, ((e.clientX / w) - 0.5) * 2.4)); }
touch.addEventListener('pointerdown', e => { if (mode !== 'play') return; input.pointer = true; input.targetX = ptrX(e); touch.setPointerCapture(e.pointerId); audio.boot(); });
touch.addEventListener('pointermove', e => { if (!input.pointer) return; input.targetX = ptrX(e); });
const endPtr = e => { input.pointer = false; input.targetX = null; };
touch.addEventListener('pointerup', endPtr); touch.addEventListener('pointercancel', endPtr);
function togglePause() { pauseOn = !pauseOn; $('pause').classList.toggle('hidden', !pauseOn); if (pauseOn && audio.ctx) audio.ctx.suspend(); else if (audio.ctx) audio.ctx.resume(); }

// ---------- buttons ----------
$('startBtn').onclick = () => { audio.boot(); start(); };
$('walletBtn').onclick = connect;
$('gauntletBtn').onclick = () => { runMode = runMode === 'gauntlet' ? 'campaign' : 'gauntlet'; buildTitle(); audio.ui(); };
$('dailyBtn').onclick = () => { runMode = runMode === 'daily' ? 'campaign' : 'daily'; buildTitle(); audio.ui(); };
$('sndBtn').onclick = () => { audio.boot(); audio.on = !audio.on; audio.musicOn = audio.on; audio.master.gain.value = audio.on ? 0.7 : 0; buildTitle(); };
$('fxBtn').onclick = () => { quality = quality >= 1 ? 0.6 : 1; store.set('quality2', quality); applyQuality(); buildTitle(); };
$('retryBtn').onclick = () => { if (runMode === 'daily') { showTitle(); return; } start(); };
$('menuBtn').onclick = showTitle; $('menuBtn2').onclick = showTitle; $('pMenu').onclick = () => { togglePause(); showTitle(); };
$('nextBtn').onclick = nextRoad;
$('pResume').onclick = togglePause;
$('pSound').onclick = () => { audio.on = !audio.on; audio.musicOn = audio.on; if (audio.ctx) audio.master.gain.value = audio.on ? 0.7 : 0; $('pSound').textContent = audio.on ? 'SOUND ON' : 'SOUND OFF'; };
$('pFx').onclick = () => { quality = quality >= 1 ? 0.6 : 1; store.set('quality2', quality); applyQuality(); $('pFx').textContent = quality >= 1 ? 'GRAPHICS: ULTRA' : 'GRAPHICS: LEAN'; };
$('pauseBtn').onclick = togglePause;
$('shareBtn').onclick = () => {
  const s = SIM.score(sim);
  const text = runMode === 'gauntlet' ? `I survived ${fmt(sim.dist)} m of THE GAUNTLET in PEPE WICK vs HORDE with a peak squad of ${fmt(sim.peak)}. $WICK` : `${fmt(s)} pts on ${level.name} in PEPE WICK vs HORDE — peak squad ${fmt(sim.peak)}, ${fmt(sim.kills)} kills. $WICK`;
  window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(text + '\nhttps://games.wick.pics/horde/'), '_blank');
};
$('submitBtn').onclick = async () => {
  if (lbBusy || !sim) return;
  if (!member) { $('lbMsg').textContent = 'connect a wallet on the desk first'; return; }
  if (!member.guns.length) { $('lbMsg').textContent = 'holders only — mint a gun at mint.wick.pics'; return; }
  const s = Math.min(599000, SIM.score(sim)); if (s <= 0) return;
  const modeKey = runMode === 'gauntlet' ? 'horde-gauntlet' : runMode === 'daily' ? 'horde-daily' : 'horde';
  const lvNo = runMode === 'campaign' ? levelIdx + 1 : Math.max(1, Math.min(20, sim.bossesDown + 1));
  lbBusy = true; $('lbMsg').textContent = 'sign the score in your wallet…';
  try {
    const msg = 'WICK score\naddress:' + member.addr + '\nscore:' + s + '\nmode:' + modeKey + '\nts:' + Date.now();
    const sig = await window.ethereum.request({ method: 'personal_sign', params: [msg, member.addr] });
    $('lbMsg').textContent = 'submitting…';
    const name = store.get('name', '') || '';
    const r = await fetch(LB_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: member.addr, name, score: s, level: lvNo, mode: modeKey, message: msg, signature: sig }) });
    const j = await r.json();
    $('lbMsg').textContent = j.ok ? (j.unchanged ? 'already on the board at #' + j.rank : '✓ WORLD RANK #' + j.rank) : (j.error || 'submit failed');
  } catch (e) { $('lbMsg').textContent = /denied|reject|cancel/i.test(String(e && e.message)) ? 'cancelled' : 'submit failed — check connection & retry'; }
  lbBusy = false;
};

// ---------- loop ----------
const camPos = new THREE.Vector3(0, 9.2, 12.6), camLook = new THREE.Vector3(0, 0.4, -11);
let camX = 0, camBank = 0;
let pilotOn = false, godOn = false;
function pilot(s) {
  let target = 0;
  const g = s.gates.find(g => !g.done);
  if (g) { const val = side => side.op === 'x' ? s.count * (side.n - 1) : side.op === '+' ? side.n : side.op === '-' ? -side.n : -(s.count - Math.floor(s.count / side.n)); target = val(g.left) >= val(g.right) ? -0.45 : 0.45; }
  const near = s.foes.filter(f => f.z < 8 && !(f.gone > 0)).sort((a, b) => a.z - b.z)[0];
  if (near && Math.abs(near.x - s.leaderX) < 0.3 && s.count < 30) target = near.x > s.leaderX ? -0.8 : 0.8;
  const hz = s.hazards.find(h => (h.kind === 'acid' || h.kind === 'block' || h.kind === 'car') && h.z < 10 && Math.abs(h.x - s.leaderX) < 0.35);
  if (hz) target = hz.x > s.leaderX ? -0.8 : 0.8;
  if (s.status === 'draft') pick(0);
  return { targetX: target };
}
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  // adaptive quality: four straight seconds under 38 fps on a visible tab drops to LEAN for this session only (never persisted — the user's toggle is the only thing that saves)
  fpsAcc += dt; fpsN++; if (fpsAcc >= 1) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; if (fps < 38 && quality >= 1 && document.visibilityState === 'visible' && mode === 'play') { lowT++; if (lowT >= 4) { quality = 0.6; applyQuality(); lowT = 0; } } else lowT = 0; }
  if (pauseOn) return;
  tick(dt, now);
  post.render(scene, camera, dt);
  updatePopups(dt);
}
// one simulation + presentation step without rendering (the QA hooks drive this headless)
function tick(dt, now) {
  if (slowT > 0) { slowT -= dt; if (slowT <= 0) timeScale = 1; }
  const sdt = dt * timeScale;
  let active = null;
  if (mode === 'play' && sim) {
    let inp = {};
    if (pilotOn) inp = pilot(sim);
    else if (input.targetX != null) inp = { targetX: input.targetX };
    else { const st = (keys.ArrowLeft || keys.KeyA ? -1 : 0) + (keys.ArrowRight || keys.KeyD ? 1 : 0); inp = { steer: st }; }
    if (godOn && sim.count < 200) sim.count = 200;
    const evs = SIM.step(sim, sdt, inp);
    sim.tiers = SIM.tiers(sim.count); sim.tierRank = SIM.tierRank(sim.count);
    if (evs.length) handleEvents(evs);
    if (sim.status !== 'draft') hud();
    audio.setIntensity(Math.min(1, sim.count / 140 + (sim.boss ? 0.4 : 0) + (sim.streak >= 8 ? 0.2 : 0)));
    if (bossIntroT > 0) { bossIntroT -= dt; if (bossIntroT <= 0) $('bossintro').classList.add('hidden'); }
    active = sim;
  } else if (mode === 'title' && demo) {
    demo.spawnT = 1e9; demo.nextGateAt = 1e12; demo.nextBarrelAt = 1e12; demo.nextDraftAt = 1e12; demo.nextBossAt = 1e12;
    demo.leaderX = Math.sin(now * 0.0004) * 0.4;
    SIM.step(demo, sdt, {}); demo.tiers = SIM.tiers(demo.count); demo.tierRank = SIM.tierRank(demo.count);
    demo.speed = 4; demo.streams.forEach(s => s.t = 1); // no shooting on the desk
    active = demo;
  } else if (mode === 'over' && sim) { active = sim; sim.tiers = SIM.tiers(sim.count); sim.tierRank = SIM.tierRank(sim.count); }
  // world
  world.update(sdt, active, camera);
  if (active) crowd.update(sdt, active, camera);
  fx.update(sdt, active ? active.speed * sdt : 0, camera);
  // camera follows the leader, banks into steering, shakes
  const lx = active ? active.leaderX * ROAD : 0;
  camX += (lx * 0.55 - camX) * (1 - Math.exp(-dt * 4));
  camBank += ((lx * 0.55 - camX) * -0.04 - camBank) * (1 - Math.exp(-dt * 5));
  const bossPull = active && active.boss && active.boss.alive ? 1 : 0;
  camera.position.set(camX + fx.shakeV.x, camPos.y + fx.shakeV.y - bossPull * 0.6, camPos.z - bossPull * 1.2);
  camera.lookAt(camX * 1.3 + lx * 0.2, camLook.y + bossPull * 0.6, camLook.z - bossPull * 8);
  camera.rotation.z += camBank;
  world.sun.position.x = camX + world.level.pal.sun[2][0] * 40; world.sun.target.position.x = camX;
}

// ---------- QA hooks ----------
window.HQ = {
  start(i, m) { if (m) runMode = m; if (typeof i === 'number') levelIdx = i; audio.on = false; start(); },
  sim: () => sim, world, crowd, fx, post, camera, scene, renderer,
  step(sec) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { tick(1 / 60, performance.now()); post.flash.multiplyScalar(0.86); } for (const p of popups) { p.el.remove(); } popups.length = 0; return this.state(); },
  tick,
  render() { post.flash.set(0, 0, 0); post.render(scene, camera, 1 / 60); return this.state(); },
  state() { return sim ? { status: sim.status, dist: Math.round(sim.dist), count: sim.count, kills: sim.kills, coins: sim.coins, foes: sim.foes.length, boss: sim.boss ? { name: sim.boss.name, hp: Math.round(sim.boss.hp), phase: sim.boss.phase } : null, perks: sim.perks, fps: Math.round(fps), mode } : { mode, fps: Math.round(fps) }; },
  pilot(on) { pilotOn = !!on; }, god(on) { godOn = !!on; },
  setLeader(x) { if (sim) sim.leaderX = x; },
  shot() { return renderer.domElement.toDataURL('image/jpeg', 0.85); },
  fps: () => fps, weapon: () => weapon, member: () => member, setMember(m) { member = m; setWeapon(); },
  drawCalls: () => renderer.info.render.calls,
};

// ---------- boot ----------
applyQuality();
document.fonts && document.fonts.load('700 20px "Black Ops One"').catch(() => {});
setWeapon();
silentReconnect();
showTitle();
requestAnimationFrame(frame);
