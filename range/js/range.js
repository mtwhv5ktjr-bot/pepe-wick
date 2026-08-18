/* =========================================================================
   ARSENAL RANGE — S-tier presentation layer. MEMBERS ONLY.
   The guns ARE the NFTs: gunart.js (byte-identical to on-chain WickGunBodies)
   renders every weapon; roster.js carries the cards' printed stats; the gate
   admits only wallets holding WICK Arsenal guns. No iron → mint.wick.pics.
   All rules stay in drills.js; this file renders, raycasts, and gatekeeps.
   ========================================================================= */
import * as THREE from 'three';

const DR = window.DRILLS_CORE, AUD = window.AR_AUDIO, ROSTER = window.ARSENAL_ROSTER, WL = window.WICK_LOADOUT;
const $ = id => document.getElementById(id);

// ---------------------------------------------------------------- renderer
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
function viewSize() { return { w: innerWidth || 1280, h: innerHeight || 720 }; }
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(viewSize().w, viewSize().h);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070c);
scene.fog = new THREE.FogExp2(0x05070c, 0.02);

const BASE_FOV = 72;
const camera = new THREE.PerspectiveCamera(BASE_FOV, viewSize().w / viewSize().h, 0.05, 140);
camera.rotation.order = 'YXZ';
camera.position.set(0, 1.6, 0);
scene.add(camera);

addEventListener('resize', () => {
  const v = viewSize();
  camera.aspect = v.w / v.h;
  camera.updateProjectionMatrix();
  renderer.setSize(v.w, v.h);
});

// ---------------------------------------------------------------- env map
// PMREM from a tiny procedural light-box: warm brass above, emerald wall
// washes, cool floor bounce — this is what makes every metal in the hall live.
{
  const envScene = new THREE.Scene();
  const em = (c, i) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(i) });
  const box = new THREE.Mesh(new THREE.BoxGeometry(60, 30, 60), new THREE.MeshBasicMaterial({ color: 0x0a0e16, side: THREE.BackSide }));
  envScene.add(box);
  const strip = (c, i, w, h, x, y, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), em(c, i));
    m.position.set(x, y, z); m.rotation.y = ry || 0;
    envScene.add(m);
  };
  strip(0xffd9a0, 5, 40, 6, 0, 13, 0, 0); strip(0xffd9a0, 5, 40, 6, 0, 13, 0, Math.PI);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), em(0xfff2d8, 2.5));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = 14; envScene.add(ceil);
  strip(0x7cf9a5, 3.2, 8, 22, -29, 6, 0, Math.PI / 2);
  strip(0x7cf9a5, 3.2, 8, 22, 29, 6, 0, -Math.PI / 2);
  strip(0x7fd0ff, 1.6, 50, 8, 0, -12, 0, 0);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.06).texture;
  pmrem.dispose();
}

// ---------------------------------------------------------------- the hall
const hall = new THREE.Group();
scene.add(hall);
const HALL = { w: 24, d: 36, h: 5.4 };
{
  const mat = (c, r, m, opts) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: r, metalness: m }, opts || {}));

  // polished dark marble floor — the money surface, reflects every neon
  const floorTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 512;
    const x = cv.getContext('2d');
    x.fillStyle = '#0c0f16'; x.fillRect(0, 0, 512, 512);
    x.strokeStyle = 'rgba(180,200,230,0.05)';
    for (let i = 0; i < 26; i++) { // marble veins
      x.beginPath(); x.lineWidth = 1 + Math.random() * 1.5;
      let px = Math.random() * 512, py = Math.random() * 512;
      x.moveTo(px, py);
      for (let k = 0; k < 6; k++) { px += (Math.random() - 0.5) * 160; py += (Math.random() - 0.5) * 160; x.lineTo(px, py); }
      x.stroke();
    }
    x.strokeStyle = 'rgba(201,162,39,0.20)'; x.lineWidth = 3; // brass inlay grid
    for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * 128, 0); x.lineTo(i * 128, 512); x.stroke(); }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 8);
    return t;
  })();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALL.w, HALL.d + 6),
    mat(0xffffff, 0.16, 0.88, { map: floorTex, envMapIntensity: 1.25 }));
  floor.rotation.x = -Math.PI / 2; floor.position.z = -HALL.d / 2 + 3; hall.add(floor);

  // walls: dark panels with a brass chair-rail line
  const wallMat = mat(0x11151d, 0.8, 0.25, { envMapIntensity: 0.5 });
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(HALL.d + 6, HALL.h), wallMat);
    w.rotation.y = s * Math.PI / 2; w.position.set(-s * HALL.w / 2, HALL.h / 2, -HALL.d / 2 + 3); hall.add(w);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, HALL.d + 6), mat(0xc9a227, 0.35, 0.9, { envMapIntensity: 1.4 }));
    rail.position.set(-s * (HALL.w / 2 - 0.03), 1.1, -HALL.d / 2 + 3); hall.add(rail);
  }
  const back = new THREE.Mesh(new THREE.PlaneGeometry(HALL.w, HALL.h), mat(0x151b26, 0.9, 0.1));
  back.position.set(0, HALL.h / 2, -HALL.d + 3 - 0.0);
  back.position.z = -(HALL.d - 3); hall.add(back);
  const behind = new THREE.Mesh(new THREE.PlaneGeometry(HALL.w, HALL.h), mat(0x0b0e14, 0.9, 0.1));
  behind.rotation.y = Math.PI; behind.position.set(0, HALL.h / 2, 3); hall.add(behind);

  // coffered ceiling: dark slab + instanced beams both ways
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HALL.w, HALL.d + 6), mat(0x0a0d13, 0.9, 0.15));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, HALL.h, -HALL.d / 2 + 3); hall.add(ceil);
  const beamMat = mat(0x161b24, 0.7, 0.35);
  const beamsZ = new THREE.InstancedMesh(new THREE.BoxGeometry(HALL.w, 0.22, 0.3), beamMat, 12);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 12; i++) { m4.setPosition(0, HALL.h - 0.11, 2 - i * 3.2); beamsZ.setMatrixAt(i, m4); }
  hall.add(beamsZ);
  const beamsX = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.22, HALL.d + 6), beamMat, 7);
  for (let i = 0; i < 7; i++) { m4.setPosition(-9 + i * 3, HALL.h - 0.11, -HALL.d / 2 + 3); beamsX.setMatrixAt(i, m4); }
  hall.add(beamsX);

  // columns with brass caps down both walls
  const colGeo = new THREE.CylinderGeometry(0.26, 0.3, HALL.h, 14);
  const colMat = mat(0x1a2029, 0.55, 0.5, { envMapIntensity: 0.8 });
  const capGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.12, 14);
  const capMat = mat(0xc9a227, 0.3, 0.95, { envMapIntensity: 1.5 });
  const cols = new THREE.InstancedMesh(colGeo, colMat, 12);
  const caps = new THREE.InstancedMesh(capGeo, capMat, 24);
  let ci = 0, cpi = 0;
  for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) {
    const x = sx * (HALL.w / 2 - 0.32), z = 1 - i * 6.4;
    m4.setPosition(x, HALL.h / 2, z); cols.setMatrixAt(ci++, m4);
    m4.setPosition(x, 0.1, z); caps.setMatrixAt(cpi++, m4);
    m4.setPosition(x, HALL.h - 0.1, z); caps.setMatrixAt(cpi++, m4);
  }
  hall.add(cols, caps);

  // ceiling fixtures: brass ring + warm pool light + volumetric cone
  const coneMat = new THREE.MeshBasicMaterial({ color: 0xffe9c0, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (let i = 0; i < 5; i++) {
    const z = -2 - i * 6.4;
    const warm = i % 2 === 0;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 8, 20), capMat);
    ring.rotation.x = Math.PI / 2; ring.position.set(0, HALL.h - 0.16, z); hall.add(ring);
    const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.26, 16), new THREE.MeshBasicMaterial({ color: warm ? 0xffe2b0 : 0xbcf9d4 }));
    bulb.rotation.x = Math.PI / 2; bulb.position.set(0, HALL.h - 0.17, z); hall.add(bulb);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2.3, HALL.h - 0.3, 20, 1, true), coneMat);
    cone.position.set(0, (HALL.h - 0.3) / 2 + 0.1, z); hall.add(cone);
    const pl = new THREE.PointLight(warm ? 0xffd9a0 : 0x9df5c0, warm ? 8 : 5, 15);
    pl.position.set(0, HALL.h - 0.8, z); hall.add(pl);
  }
  // emerald wall washes
  for (const sx of [-1, 1]) {
    const wash = new THREE.PointLight(0x2fbf71, 3.5, 14);
    wash.position.set(sx * (HALL.w / 2 - 1), 2.6, -14); hall.add(wash);
  }
  hall.add(new THREE.HemisphereLight(0x2c3648, 0x0b0d12, 0.55));

  // firing desk: marble slab + brass front edge + shell tray
  const desk = new THREE.Mesh(new THREE.BoxGeometry(21, 1.06, 0.85), mat(0x141922, 0.35, 0.6, { envMapIntensity: 0.9 }));
  desk.position.set(0, 0.53, -1.2); hall.add(desk);
  const deskEdge = new THREE.Mesh(new THREE.BoxGeometry(21, 0.05, 0.07), capMat);
  deskEdge.position.set(0, 1.07, -0.82); hall.add(deskEdge);

  // glass lane dividers with brass frames + emerald edge glow
  for (const x of [-6.6, -2.2, 2.2, 6.6]) {
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.9),
      new THREE.MeshStandardMaterial({ color: 0x99ccee, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.13, envMapIntensity: 1.6, side: THREE.DoubleSide }));
    glass.rotation.y = Math.PI / 2; glass.position.set(x, 1.9, -2.1); hall.add(glass);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.1, 0.08), capMat);
    frame.position.set(x, 1.6, -0.64); hall.add(frame);
    const frame2 = frame.clone(); frame2.position.z = -3.56; hall.add(frame2);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 3.0),
      new THREE.MeshBasicMaterial({ color: 0x7cf9a5 }));
    glow.position.set(x, 2.86, -2.1); hall.add(glow);
  }

  // backstop: ribbed steel + berms
  const ribTex = (() => {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
    const x = cv.getContext('2d');
    x.fillStyle = '#141a24'; x.fillRect(0, 0, 256, 64);
    for (let i = 0; i < 256; i += 16) {
      const g = x.createLinearGradient(i, 0, i + 16, 0);
      g.addColorStop(0, '#1c2330'); g.addColorStop(0.5, '#10141d'); g.addColorStop(1, '#1c2330');
      x.fillStyle = g; x.fillRect(i, 0, 16, 64);
    }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 1);
    return t;
  })();
  const backstop = new THREE.Mesh(new THREE.PlaneGeometry(HALL.w, 3.4), mat(0xffffff, 0.6, 0.5, { map: ribTex }));
  backstop.position.set(0, 1.7, -(HALL.d - 3.05)); hall.add(backstop);
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.15, 1.5), mat(0x171d28, 0.85, 0.15));
    b.position.set(-8.8 + i * 4.4, 0.57, -(HALL.d - 4.2)); hall.add(b);
  }

  // the sign — WICK ARSENAL neon + additive bloom copy
  const sc = document.createElement('canvas'); sc.width = 1024; sc.height = 300;
  const sx = sc.getContext('2d');
  sx.clearRect(0, 0, 1024, 300);
  sx.font = "100px 'Black Ops One', Impact, sans-serif"; sx.fillStyle = '#2fbf71';
  sx.shadowColor = '#2fbf71'; sx.shadowBlur = 30; sx.textAlign = 'center';
  sx.fillText('WICK ARSENAL', 512, 128);
  sx.font = "34px 'Black Ops One', Impact, sans-serif"; sx.fillStyle = '#e8c576'; sx.shadowColor = '#e8c576'; sx.shadowBlur = 16;
  sx.fillText('· MEMBERS ONLY — PROVING GROUND ·', 512, 208);
  sx.font = '22px Consolas, monospace'; sx.fillStyle = '#7c8798'; sx.shadowBlur = 0;
  sx.fillText('101 MINTED · EVERY CARD IS LIVE-FIRE', 512, 258);
  const signTex = new THREE.CanvasTexture(sc);
  const signMat = new THREE.MeshBasicMaterial({ map: signTex, transparent: true });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(13, 3.8), signMat);
  sign.position.set(0, 3.4, -(HALL.d - 3.1)); hall.add(sign);
  const signGlow = new THREE.Mesh(new THREE.PlaneGeometry(13, 3.8),
    new THREE.MeshBasicMaterial({ map: signTex, transparent: true, blending: THREE.AdditiveBlending, opacity: 0.5, depthWrite: false }));
  signGlow.position.set(0, 3.4, -(HALL.d - 3.09)); signGlow.scale.setScalar(1.012); hall.add(signGlow);
  window.__signFlicker = signGlow; // subtle flicker in tick
}

// framed 1/1 trading cards on the walls (textures load after the gate opens)
const wallFrames = [];
{
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.3, metalness: 0.95, envMapIntensity: 1.4 });
  const types = [11, 12, 13, 14, 15, 16];
  types.forEach((t, i) => {
    const side = i < 3 ? -1 : 1;
    const z = -7 - (i % 3) * 8;
    const grp = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.66, 1.22), frameMat);
    grp.add(frame);
    const art = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 1.51),
      new THREE.MeshBasicMaterial({ color: 0x0b0e15 }));
    art.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    art.position.x = -side * 0.035;
    grp.add(art);
    grp.position.set(side * (HALL.w / 2 - 0.35), 2.5, z);
    hall.add(grp);
    const spot = new THREE.PointLight(0xffe2b0, 2.2, 4.5);
    spot.position.set(side * (HALL.w / 2 - 1.2), 3.4, z);
    hall.add(spot);
    wallFrames.push({ art, type: t });
  });
}
function dressWallFrames() {
  for (const f of wallFrames) {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = 400; cv.height = 560;
      cv.getContext('2d').drawImage(img, 0, 0, 400, 560);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      f.art.material.dispose();
      f.art.material = new THREE.MeshBasicMaterial({ map: tex });
    };
    img.src = window.gunArtURI(f.type, 0);
  }
}

// dust motes + slow smoke wisps
const dust = (() => {
  const n = 320, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 22;
    pos[i * 3 + 1] = Math.random() * 5;
    pos[i * 3 + 2] = -Math.random() * 33;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xaabbdd, size: 0.018, transparent: true, opacity: 0.5 }));
  scene.add(p);
  return p;
})();
const wisps = [];
{
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const x = cv.getContext('2d');
  const g = x.createRadialGradient(64, 64, 8, 64, 64, 62);
  g.addColorStop(0, 'rgba(200,215,235,0.16)'); g.addColorStop(1, 'rgba(200,215,235,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv);
  for (let i = 0; i < 4; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.5, depthWrite: false }));
    sp.scale.setScalar(4 + i);
    sp.position.set((Math.random() - 0.5) * 14, 1.5 + Math.random() * 2, -6 - i * 7);
    scene.add(sp); wisps.push(sp);
  }
}

const muzzleLight = new THREE.PointLight(0xffd27f, 0, 8);
scene.add(muzzleLight);

// ---------------------------------------------------------------- NFT guns
// texture cache: gunType -> {tex, silTex}
const gunTexCache = new Map();
async function gunTexture(type) {
  if (gunTexCache.has(type)) return gunTexCache.get(type);
  const img = new Image();
  img.src = window.gunBodyURI(type);
  await img.decode();
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 522;
  cv.getContext('2d').drawImage(img, 0, 0, 1024, 522);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
  const entry = { tex };
  gunTexCache.set(type, entry);
  return entry;
}
const holoMats = [];
function buildGunModel(spec, scale) {
  // the NFT's exact vector art on a layered slab: art front + dark core for
  // thickness + additive holo shimmer on the 1/1s
  const entry = gunTexCache.get(spec.type);
  const grp = new THREE.Group();
  if (!entry) return grp; // textures are preloaded at the gate; empty = QA misuse
  const W = 0.76 * (scale || 1), H = W * (522 / 1024);
  const geo = new THREE.PlaneGeometry(W, H);
  // ART on BOTH outer faces, dark core between — whichever side the camera is
  // on it sees the NFT's art first; the core only shows as edge thickness.
  const mk = (color, blend, opacity) => new THREE.MeshBasicMaterial(Object.assign(
    { map: entry.tex, transparent: true, alphaTest: 0.06, side: THREE.DoubleSide },
    color != null ? { color } : {},
    blend ? { blending: THREE.AdditiveBlending, opacity, depthWrite: false } : {}));
  const artA = new THREE.Mesh(geo, mk());
  artA.position.z = 0.018 * (scale || 1);
  const artB = new THREE.Mesh(geo, mk());
  artB.position.z = -0.018 * (scale || 1);
  const mid = new THREE.Mesh(geo, mk(0x14181f));
  grp.add(artB, mid, artA);
  if (spec.holo) {
    for (const zz of [0.021, -0.021]) {
      const shine = new THREE.Mesh(geo, mk(0xff8ae2, true, 0.22));
      shine.position.z = zz * (scale || 1);
      grp.add(shine);
      holoMats.push(shine.material);
    }
  }
  grp.userData.spec = spec;
  return grp;
}
function disposeGunModel(grp) {
  grp.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const i = holoMats.indexOf(o.material);
      if (i !== -1) holoMats.splice(i, 1);
      o.material.dispose(); // cached gun textures survive material disposal
    }
  });
}

// ---------------------------------------------------------------- state
const MODES = { GATE: 'gate', MENU: 'menu', COUNTDOWN: 'countdown', DRILL: 'drill', END: 'end', LOCKER: 'locker', INSPECT: 'inspect' };
let mode = MODES.GATE;
let member = null;           // { addr, guns: [{id,type}], mods: [{id,type}], gunTypes, specs: [realGun] }
let equipped = null;         // realGun spec — .stats already has the bolted mods applied, .base is the card
let loadoutState = null;     // WL.read() — modCfg / carry / loadout
let drill = null, drillKind = null, drillOpts = null, prevEquipped = null;
let ammo = 0, reloading = 0, fireCd = 0, firing = false, zooming = false;
let recoilP = 0, recoilY = 0, bobT = 0;
let viewmodel = null, inspectModel = null, inspectGun = null, inspectYaw = 0, inspectDist = 1.5, inspectLights = null;
const targetMeshes = new Map();

const HOUSE_P30 = Object.assign(ROSTER.realGun(0, 1), { name: 'House P30', serial: 'HOUSE PIECE', houseLoan: true });

function shortAddr(a) { return a ? a.slice(0, 6) + '…' + a.slice(-4) : ''; }

// bolted mods for a gun TYPE (pool-allocated, pepe-zero semantics)
function boltedMods(gunType) {
  if (!member || !loadoutState) return [];
  const alloc = WL.allocate(loadoutState.modCfg, member.mods, member.gunTypes);
  return alloc[gunType] || [];
}
function equipGun(spec, opts) {
  // the spec's stats become the CARD + BOLTED MODS; .base keeps the card
  const base = spec.base || spec.stats;
  const mods = spec.houseLoan ? [] : boltedMods(spec.type);
  equipped = Object.assign({}, spec, { base, stats: ROSTER.applyMods(base, mods), mods });
  if (viewmodel) { camera.remove(viewmodel); disposeGunModel(viewmodel); }
  viewmodel = buildGunModel(equipped, 1);
  viewmodel.position.set(0.27, -0.2, -0.52);
  viewmodel.rotation.y = Math.PI / 2 - 0.12; // art faces +X → muzzle downrange, slight inward cant
  camera.add(viewmodel);
  ammo = equipped.stats.mag;
  const modLine = mods.length ? '<br>' + mods.map(t => ROSTER.WICK_MODS[t].tag).join(' · ') : '';
  $('gunname').innerHTML = '<b>' + equipped.name.toUpperCase() + '</b> · ' + equipped.serial + ' · ' + equipped.rarity.toUpperCase() + '<br>' + equipped.perk + modLine;
  if (!spec.houseLoan) {
    localStorage.setItem('ar_equip', String(spec.id));
    if (member && loadoutState && !(opts && opts.silent)) WL.save(loadoutState, member, equipped);
  }
  updateAmmoHud();
  renderLoadoutBar();
}
function renderLoadoutBar() {
  const el = $('loadoutbar');
  if (!el || !equipped || !member) return;
  const chips = (equipped.mods || []).map(t => '<span class="chip" style="background:' + ROSTER.WICK_MODS[t].color + '">' + ROSTER.WICK_MODS[t].tag + '</span>').join('');
  el.innerHTML = '<b>YOUR BUILD</b> — ' + equipped.name.toUpperCase() + ' · ' + equipped.serial + chips +
    (equipped.mods && equipped.mods.length ? '' : ' <span style="color:var(--dim)">· no attachments bolted</span>') +
    '<br><span style="color:var(--dim)">saved to your loadout · PEPE WICK reads it directly · every other cabinet gets it in the DEPLOY link</span>';
}

// ---------------------------------------------------------------- gate flow
async function enterAsMember(res) {
  const guns = res.guns;
  member = {
    addr: res.addr || '0xQA', guns, mods: res.mods || [],
    gunTypes: [...new Set(guns.map(g => g.type))],
    specs: guns.map(g => ROSTER.realGun(g.id, g.type)),
  };
  loadoutState = WL.read();
  $('gate-status').textContent = 'RACKING YOUR IRON — ' + member.guns.length + ' PIECE' + (member.guns.length === 1 ? '' : 'S') + '…';
  const types = [...new Set(member.guns.map(g => g.type).concat([1]))]; // house P30 always renderable
  await Promise.all(types.map(t => gunTexture(t)));
  // equip priority: the shared loadout's gun type (set here or in PEPE WICK's gunsmith) → range's own saved token → first
  const savedId = parseInt(localStorage.getItem('ar_equip') || '0', 10);
  const saved = member.specs.find(s => s.id === savedId);
  const fromShared = loadoutState.loadout != null ? member.specs.find(s => s.type === loadoutState.loadout) : null;
  equipGun((saved && (!fromShared || saved.type === fromShared.type)) ? saved : (fromShared || member.specs[0]));
  $('gate').classList.add('hidden');
  $('buy').classList.add('hidden');
  $('menu').classList.remove('hidden');
  const mb = $('member');
  mb.style.display = 'block';
  mb.innerHTML = 'MEMBER · <b>' + shortAddr(member.addr) + '</b> · ARSENAL ×' + member.guns.length;
  mode = MODES.MENU;
  renderMenu();
  dressWallFrames();
  AUD.play('medal_silver');
}
function showBuyScreen(res) {
  $('gate').classList.add('hidden');
  $('buy').classList.remove('hidden');
  $('buy-addr').textContent = shortAddr(res.addr).toUpperCase() + ' HOLDS NO ARSENAL GUNS';
  mode = MODES.GATE;
  AUD.play('dq');
}
async function doConnect(fresh) {
  AUD.unlock(); AUD.play('ui');
  $('gate-status').textContent = 'CHECKING YOUR IRON AT THE DOOR…';
  const res = await window.AR_NFT.connect();
  if (!res.ok) {
    $('gate-status').innerHTML = res.err + ' — the arsenal is at <a class="buylink" href="https://mint.wick.pics" target="_blank" rel="noopener">mint.wick.pics ↗</a>';
    return res;
  }
  if (!res.guns || res.guns.length === 0) { showBuyScreen(res); return res; }
  await enterAsMember(res);
  return res;
}
$('btn-gate-connect').onclick = () => doConnect();
$('btn-buy-recheck').onclick = async () => {
  // clear the cache so a fresh purchase shows up immediately
  try { for (const k of Object.keys(localStorage)) if (k.startsWith('ar_arsenal_')) localStorage.removeItem(k); } catch (e) {}
  $('buy').classList.add('hidden');
  $('gate').classList.remove('hidden');
  doConnect(true);
};
$('btn-buy-switch').onclick = async () => {
  try { await window.ethereum.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] }); } catch (e) {}
  $('buy').classList.add('hidden');
  $('gate').classList.remove('hidden');
  doConnect(true);
};
// gate + buy card fans: the platinum showpieces
function dressFans() {
  for (const [elId, types] of [['gatefan', [11, 16, 15]], ['buyfan', [13, 16, 12]]]) {
    const el = $(elId);
    if (!el) continue;
    el.innerHTML = '';
    for (const t of types) {
      const img = document.createElement('img');
      img.src = window.gunArtURI(t, 0);
      el.appendChild(img);
    }
  }
}
dressFans();

// ---------------------------------------------------------------- targets
function ringTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#d9c9a8'; x.beginPath(); x.arc(128, 128, 126, 0, 7); x.fill();
  const rings = ['#1a1c22', '#d9c9a8', '#1a1c22', '#c33', '#1a1c22'];
  const radii = [110, 84, 58, 34, 14];
  for (let i = 0; i < rings.length; i++) { x.fillStyle = rings[i]; x.beginPath(); x.arc(128, 128, radii[i], 0, 7); x.fill(); }
  return new THREE.CanvasTexture(c);
}
function silhouetteTexture(civ) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = civ ? '#f2efe6' : '#c9a678';
  x.fillRect(0, 0, 128, 256);
  x.strokeStyle = '#3a3428'; x.lineWidth = 5; x.strokeRect(3, 3, 122, 250);
  x.fillStyle = civ ? '#4a6a8a' : '#23262e';
  x.beginPath(); x.arc(64, 52, 25, 0, 7); x.fill();
  x.fillRect(28, 80, 72, 130);
  if (civ) {
    x.fillRect(8, 26, 17, 76); x.fillRect(103, 26, 17, 76);
    x.font = 'bold 22px monospace'; x.fillStyle = '#b8412f'; x.textAlign = 'center';
    x.fillText('CIVILIAN', 64, 238);
  } else {
    x.fillRect(92, 100, 36, 15);
    x.fillStyle = '#c33'; x.fillRect(50, 104, 28, 28);
    x.fillStyle = '#f5e9d0'; x.font = 'bold 16px monospace'; x.textAlign = 'center';
    x.fillText('MARK', 64, 240);
  }
  return new THREE.CanvasTexture(c);
}
const RING_TEX = ringTexture(), MARK_TEX = silhouetteTexture(false), CIV_TEX = silhouetteTexture(true);
const standMat = new THREE.MeshStandardMaterial({ color: 0x3a2f14, roughness: 0.4, metalness: 0.8, envMapIntensity: 1.2 });

function addTargetMesh(t) {
  // ONLY the scoring surface carries the tid — stands are scenery
  const grp = new THREE.Group();
  if (t.kind === 'disc') {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 18),
      new THREE.MeshStandardMaterial({ color: 0xff7a2f, roughness: 0.4, metalness: 0.3, emissive: 0xff7a2f, emissiveIntensity: 0.55 }));
    disc.userData.tid = t.tid;
    grp.add(disc);
  } else if (t.kind === 'ring') {
    const board = new THREE.Mesh(new THREE.CircleGeometry(0.7, 28),
      new THREE.MeshStandardMaterial({ map: RING_TEX, roughness: 0.8, emissive: 0xffffff, emissiveMap: RING_TEX, emissiveIntensity: 0.3 }));
    board.userData.tid = t.tid;
    grp.add(board);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.4, 0.06), standMat);
    stand.position.y = -1.2; stand.userData.isStand = true; grp.add(stand);
  } else {
    const tex = t.kind === 'civ' ? CIV_TEX : MARK_TEX;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.9),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.28 }));
    board.userData.tid = t.tid;
    grp.add(board);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.4, 0.06), standMat);
    stand.position.y = -1.1; stand.userData.isStand = true; grp.add(stand);
  }
  grp.userData.tid = t.tid;
  grp.userData.kind = t.kind;
  scene.add(grp);
  targetMeshes.set(t.tid, grp);
}
function syncTargets() {
  if (!drill) return;
  for (const t of drill.targets) {
    const m = targetMeshes.get(t.tid);
    if (!m) continue;
    if (!t.alive) { removeTargetMesh(t.tid, t.kind); continue; }
    const rise = t.kind === 'disc' ? 0 : (1 - t.popT) * -1.2;
    m.position.set(t.x, t.y + rise, t.z);
    if (t.kind === 'disc') { m.rotation.x += 0.12; m.rotation.z += 0.07; }
  }
}
const fallingMeshes = [];
function removeTargetMesh(tid, kind) {
  const m = targetMeshes.get(tid);
  if (!m) return;
  targetMeshes.delete(tid);
  fallingMeshes.push({ m, t: 0 }); // tick-driven fall (rAF stalls in hidden panes)
}
function stepFalling(dt) {
  for (let i = fallingMeshes.length - 1; i >= 0; i--) {
    const f = fallingMeshes[i];
    f.t += dt;
    const k = f.t / 0.24;
    if (k >= 1) { scene.remove(f.m); disposeTree(f.m); fallingMeshes.splice(i, 1); continue; }
    f.m.rotation.x = -k * 1.4;
    f.m.position.y -= 1.2 * dt;
  }
}
function clearTargetMeshes() {
  for (const [, m] of targetMeshes) { scene.remove(m); disposeTree(m); }
  targetMeshes.clear();
}

// ---------------------------------------------------------------- fx pools
const tracers = [], holes = [], shells = [], sparks = [], smokes = [];
const holeGeo = new THREE.CircleGeometry(0.02, 8);
const holeMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a, side: THREE.DoubleSide });
const shellGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.02, 6);
const shellMat = new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.9, roughness: 0.3 });
const smokeTex = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const x = cv.getContext('2d');
  const g = x.createRadialGradient(32, 32, 4, 32, 32, 30);
  g.addColorStop(0, 'rgba(220,220,230,0.5)'); g.addColorStop(1, 'rgba(220,220,230,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
})();
function disposeTree(root) {
  root.traverse(o => {
    if (o.geometry && o.geometry !== holeGeo && o.geometry !== shellGeo) o.geometry.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      if (m === holeMat || m === shellMat || m === standMat) continue;
      const i = holoMats.indexOf(m);
      if (i !== -1) holoMats.splice(i, 1);
      m.dispose();
    }
  });
}
function addTracer(from, to, color) {
  const g = new THREE.BufferGeometry().setFromPoints([from, to]);
  const m = new THREE.LineBasicMaterial({ color: color || 0xffd27f, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending });
  const line = new THREE.Line(g, m);
  scene.add(line);
  tracers.push({ line, ttl: 0.08 });
}
function addHole(point, normal) {
  const h = new THREE.Mesh(holeGeo, holeMat);
  h.position.copy(point).addScaledVector(normal, 0.01);
  h.lookAt(point.clone().add(normal));
  scene.add(h);
  holes.push(h);
  if (holes.length > 70) scene.remove(holes.shift());
}
function addShell() {
  if (!viewmodel) return;
  const s = new THREE.Mesh(shellGeo, shellMat);
  const p = new THREE.Vector3(0.32, -0.14, -0.55).applyMatrix4(camera.matrixWorld);
  s.position.copy(p);
  s.userData.v = new THREE.Vector3(0.9 + Math.random() * 0.5, 1.6, -0.2).applyQuaternion(camera.quaternion);
  s.userData.ttl = 1.2;
  scene.add(s);
  shells.push(s);
  if (shells.length > 24) scene.remove(shells.shift());
}
function addSparks(point, color) {
  const n = 8, pos = new Float32Array(n * 3), vel = [];
  for (let i = 0; i < n; i++) {
    pos[i * 3] = point.x; pos[i * 3 + 1] = point.y; pos[i * 3 + 2] = point.z;
    vel.push(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: color || 0xffd27f, size: 0.035, transparent: true, opacity: 1, blending: THREE.AdditiveBlending }));
  p.userData = { vel, ttl: 0.45 };
  scene.add(p);
  sparks.push(p);
}
function addMuzzleSmoke() {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0.5, depthWrite: false }));
  const p = new THREE.Vector3(0.27, -0.13, -1.0).applyMatrix4(camera.matrixWorld);
  sp.position.copy(p);
  sp.scale.setScalar(0.12);
  sp.userData.ttl = 0.7;
  scene.add(sp);
  smokes.push(sp);
  if (smokes.length > 10) { const s = smokes.shift(); scene.remove(s); s.material.dispose(); }
}
function stepFx(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i]; t.ttl -= dt;
    t.line.material.opacity = Math.max(0, t.ttl / 0.08);
    if (t.ttl <= 0) { scene.remove(t.line); t.line.geometry.dispose(); t.line.material.dispose(); tracers.splice(i, 1); }
  }
  for (let i = shells.length - 1; i >= 0; i--) {
    const s = shells[i];
    s.userData.ttl -= dt;
    s.userData.v.y -= 9.8 * dt;
    s.position.addScaledVector(s.userData.v, dt);
    s.rotation.x += 10 * dt; s.rotation.z += 8 * dt;
    if (s.position.y < 0.02 && s.userData.v.y < 0) s.userData.v.y *= -0.35;
    if (s.userData.ttl <= 0) { scene.remove(s); shells.splice(i, 1); }
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const p = sparks[i];
    p.userData.ttl -= dt;
    const pos = p.geometry.attributes.position;
    for (let j = 0; j < p.userData.vel.length; j++) {
      const v = p.userData.vel[j];
      v.y -= 6 * dt;
      pos.array[j * 3] += v.x * dt; pos.array[j * 3 + 1] += v.y * dt; pos.array[j * 3 + 2] += v.z * dt;
    }
    pos.needsUpdate = true;
    p.material.opacity = Math.max(0, p.userData.ttl / 0.45);
    if (p.userData.ttl <= 0) { scene.remove(p); p.geometry.dispose(); p.material.dispose(); sparks.splice(i, 1); }
  }
  for (let i = smokes.length - 1; i >= 0; i--) {
    const s = smokes[i];
    s.userData.ttl -= dt;
    s.position.y += dt * 0.25;
    s.scale.multiplyScalar(1 + dt * 1.6);
    s.material.opacity = Math.max(0, s.userData.ttl / 0.7) * 0.5;
    if (s.userData.ttl <= 0) { scene.remove(s); s.material.dispose(); smokes.splice(i, 1); }
  }
  if (muzzleLight.intensity > 0) muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 90);
}

// ---------------------------------------------------------------- aiming
// Two-stage aim: raw input drives a TARGET (aimYaw/aimPitch); the camera's
// yaw/pitch chase it with a frame-rate-independent exponential lerp. Raw
// pointer-lock deltas are stepped and spiky (OS acceleration, event batching,
// the occasional 1000px glitch on lock acquire) — the lerp turns that into a
// continuous sweep without the mush of a moving-average filter.
let yaw = 0, pitch = 0;          // what the camera shows
let aimYaw = 0, aimPitch = 0;    // where the hand is
const PITCH_LIM = 1.25;
const BASE_SENS = 0.0021;        // rad / px at sensitivity 1.0
const AIM = {
  sens: (() => { const v = parseFloat(localStorage.getItem('ar_sens') || '1'); return isNaN(v) ? 1 : Math.max(0.3, Math.min(2.5, v)); })(),
  smooth: (() => { const v = parseFloat(localStorage.getItem('ar_smooth') || '0.5'); return isNaN(v) ? 0.5 : Math.max(0, Math.min(1, v)); })(),
};
// smoothing 0 → snap; 0.5 → 32/s (τ≈31ms, 99% inside ~140ms); 1 → 12/s (τ≈83ms)
function aimRate() { return AIM.smooth <= 0 ? Infinity : 52 - 40 * AIM.smooth; }
function setAim(y, p) { // hard set BOTH stages — menus, resets, QA
  aimYaw = yaw = y;
  aimPitch = pitch = Math.max(-PITCH_LIM, Math.min(PITCH_LIM, p));
}
function nudgeAim(dx, dy, sens) {
  aimYaw -= dx * sens;
  aimPitch -= dy * sens;
  aimPitch = Math.max(-PITCH_LIM, Math.min(PITCH_LIM, aimPitch));
}
function stepAim(dt) {
  const k = aimRate();
  if (!isFinite(k)) { yaw = aimYaw; pitch = aimPitch; return; }
  const a = 1 - Math.exp(-k * dt);
  yaw += (aimYaw - yaw) * a;
  pitch += (aimPitch - pitch) * a;
  // snap the last hair so a still hand is a still crosshair, not an asymptote
  if (Math.abs(aimYaw - yaw) < 1e-5) yaw = aimYaw;
  if (Math.abs(aimPitch - pitch) < 1e-5) pitch = aimPitch;
}
function applyAim() {
  camera.rotation.y = yaw;
  camera.rotation.x = pitch + recoilP;
  camera.rotation.z = 0;
}
let lastPointerType = 'mouse';
window.addEventListener('pointerdown', e => { if (e.pointerType) lastPointerType = e.pointerType; }, true);
function tryPointerLock() {
  // unadjustedMovement: raw HID deltas, no OS pointer acceleration — the single
  // biggest "why does my aim feel uneven" fix. Falls back where unsupported.
  try {
    let p = null;
    try { p = canvas.requestPointerLock({ unadjustedMovement: true }); } catch (e) { p = null; }
    if (p && p.catch) {
      p.catch(() => { try { const q = canvas.requestPointerLock(); if (q && q.catch) q.catch(() => {}); } catch (e) {} });
    } else if (!p && !document.pointerLockElement) {
      const q = canvas.requestPointerLock && canvas.requestPointerLock();
      if (q && q.catch) q.catch(() => {});
    }
  } catch (e) {}
}
canvas.addEventListener('click', () => {
  AUD.unlock();
  if (mode === MODES.DRILL && !document.pointerLockElement && lastPointerType === 'mouse') tryPointerLock();
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
let inspectVel = 0;
document.addEventListener('mousemove', e => {
  if (mode === MODES.DRILL && document.pointerLockElement === canvas) {
    const dx = e.movementX || 0, dy = e.movementY || 0;
    if (Math.abs(dx) > 400 || Math.abs(dy) > 400) return; // lock-acquire glitch, not a hand
    const sens = BASE_SENS * AIM.sens * (zooming ? 0.55 : 1);
    nudgeAim(dx, dy, sens);
  } else if (mode === MODES.INSPECT && dragging) {
    const dx = e.movementX || 0;
    inspectVel = dx * 0.008;       // fling — the turntable keeps the momentum
    inspectYaw += inspectVel;
  }
});
let dragging = false, lastTouch = null;
canvas.addEventListener('mousedown', e => {
  if (mode === MODES.DRILL && document.pointerLockElement === canvas) {
    if (e.button === 2) { zooming = true; return; }
    firing = true; fire();
  }
  if (mode === MODES.INSPECT) dragging = true;
});
document.addEventListener('mouseup', e => {
  if (e.button === 2) zooming = false;
  else { firing = false; dragging = false; }
});
canvas.addEventListener('wheel', e => {
  if (mode === MODES.INSPECT) inspectDist = Math.max(0.8, Math.min(3.0, inspectDist + e.deltaY * 0.0012));
});
document.addEventListener('keydown', e => {
  if (e.code === 'KeyR' && mode === MODES.DRILL) startReload();
  if (e.code === 'Escape' && !document.pointerLockElement && (mode === MODES.DRILL || mode === MODES.COUNTDOWN)) quitDrill();
});
// touch — aim tracked BY TOUCH IDENTIFIER (FIRE finger must not freeze aim)
if ('ontouchstart' in window) document.body.classList.add('touch');
let aimTouchId = null;
canvas.addEventListener('touchstart', e => {
  if (aimTouchId !== null) return;
  const t = e.changedTouches[0];
  aimTouchId = t.identifier;
  lastTouch = { x: t.clientX, y: t.clientY };
}, { passive: true });
canvas.addEventListener('touchmove', e => {
  for (const t of e.changedTouches) {
    if (t.identifier !== aimTouchId || !lastTouch) continue;
    if (mode === MODES.DRILL) {
      nudgeAim(t.clientX - lastTouch.x, t.clientY - lastTouch.y, 0.004 * AIM.sens);
    } else if (mode === MODES.INSPECT) {
      inspectVel = (t.clientX - lastTouch.x) * 0.01;
      inspectYaw += inspectVel;
    }
    lastTouch = { x: t.clientX, y: t.clientY };
  }
}, { passive: true });
const endAimTouch = e => {
  for (const t of e.changedTouches) {
    if (t.identifier === aimTouchId) { aimTouchId = null; lastTouch = null; }
  }
};
canvas.addEventListener('touchend', endAimTouch, { passive: true });
canvas.addEventListener('touchcancel', endAimTouch, { passive: true });
$('firebtn').addEventListener('touchstart', e => { e.preventDefault(); AUD.unlock(); firing = true; fire(); }, { passive: false });
$('firebtn').addEventListener('touchend', () => { firing = false; });

// ---------------------------------------------------------------- firing
const raycaster = new THREE.Raycaster();
const SHOT_SOUND = { 1: 'pistol', 2: 'smg', 3: 'shotgun', 4: 'dmr', 5: 'rifle', 11: 'pistol', 12: 'smg', 13: 'shotgun', 14: 'dmr', 15: 'rifle', 16: 'rifle' };
function startReload() {
  if (drillOpts && drillOpts.magLock) return; // ONE MAGAZINE
  if (reloading > 0 || !equipped || ammo === equipped.stats.mag) return;
  reloading = equipped.stats.reload;
  AUD.play('reload');
}
function updateAmmoHud() {
  if (!equipped) return;
  $('ammo').innerHTML = (reloading > 0 ? '··' : ammo) + ' <small>/ ' + equipped.stats.mag + '</small>';
}
function castRound(dirBase, muzzleWorld, accent) {
  // one ROUND: applies pierce, returns best scoring result of the round
  const st = equipped.stats;
  const hits = (() => {
    raycaster.set(camera.position, dirBase);
    return raycaster.intersectObjects([...targetMeshes.values()], true);
  })();
  let scored = null, pierceLeft = st.pierce, endPoint = null;
  const hitTids = new Set();
  for (const h of hits) {
    const tid = h.object.userData.tid;
    if (!tid) { endPoint = h.point; addHole(h.point, h.face ? h.face.normal.clone() : new THREE.Vector3(0, 0, 1)); addSparks(h.point, 0x8b6b40); break; }
    if (hitTids.has(tid)) continue;
    hitTids.add(tid);
    const target = drill.targets.find(t => t.tid === tid && t.alive);
    if (!target) continue;
    const center = new THREE.Vector3(target.x, target.y, target.z);
    const ring = Math.min(1, h.point.distanceTo(center) / 0.7);
    const res = DR.registerShot(drill, target, { ring });
    addSparks(h.point, target.kind === 'civ' ? 0xff5c5c : 0xffd27f);
    endPoint = h.point;
    if (!scored || (res.delta || 0) > (scored.delta || 0)) scored = res;
    if (--pierceLeft <= 0) break;
  }
  if (!endPoint) {
    const wallT = (-(HALL.d - 3.1) - camera.position.z) / dirBase.z;
    endPoint = wallT > 0 ? camera.position.clone().addScaledVector(dirBase, wallT) : camera.position.clone().addScaledVector(dirBase, 30);
    addHole(endPoint, new THREE.Vector3(0, 0, 1));
    addSparks(endPoint, 0x8b6b40);
  }
  addTracer(muzzleWorld, endPoint, accent);
  return scored;
}
function fire() {
  if (mode !== MODES.DRILL || !drill || drill.over || !equipped) return;
  if (fireCd > 0 || reloading > 0) return;
  if (ammo <= 0) { AUD.play('dry'); startReload(); return; }
  ammo--;
  const st = equipped.stats;
  fireCd = 1 / st.rof;
  AUD.shot(SHOT_SOUND[equipped.type] || 'pistol', false);
  recoilP += st.recoil * 0.011;
  recoilY += (Math.random() - 0.5) * st.recoil * 0.004;
  muzzleLight.intensity = 10;
  muzzleLight.position.copy(new THREE.Vector3(0.27, -0.12, -1.05).applyMatrix4(camera.matrixWorld));
  addShell();
  addMuzzleSmoke();
  if (viewmodel) viewmodel.position.z = -0.46;
  const accent = new THREE.Color(equipped.color).getHex();
  const muzzleWorld = new THREE.Vector3(0.36, -0.13, -1.15).applyMatrix4(camera.matrixWorld);
  const spreadRad = (st.spread * Math.PI / 180) * (st.pellets > 1 ? 1.4 : 1) * (zooming ? 0.45 : 1);
  // rounds this trigger pull: pellets (shotgun) or arc fan (Reaper) or 1
  const rounds = [];
  if (st.arc > 1) {
    for (let i = 0; i < st.arc; i++) rounds.push({ yawOff: (i - (st.arc - 1) / 2) * (4 * Math.PI / 180), rand: 1 });
  } else for (let i = 0; i < st.pellets; i++) rounds.push({ yawOff: 0, rand: 1 });
  let best = null, any = false;
  for (const r of rounds) {
    const ox = (Math.random() - 0.5) * spreadRad + r.yawOff;
    const oy = (Math.random() - 0.5) * spreadRad;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), ox);
    dir.applyAxisAngle(new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion), oy);
    const res = castRound(dir.normalize(), muzzleWorld, accent);
    if (res) { any = true; if (!best || (res.delta || 0) > (best.delta || 0)) best = res; }
  }
  if (!any) DR.registerShot(drill, null, {}); // whole trigger pull whiffed
  if (best && !best.miss) hitFeedback(best);
  updateAmmoHud();
  if (ammo <= 0) startReload();
}
function hitFeedback(res) {
  const ch = $('crosshair');
  ch.classList.add('hitmark');
  setTimeout(() => ch.classList.remove('hitmark'), 90);
  if (res.dq) return;
  if (res.delta < 0) { AUD.play('civAlarm'); flashBanner('CIVILIAN — STRIKE ' + drill.strikes + '/3', 'var(--red)'); }
  else if (res.ring !== null && res.ring < 0.18) AUD.play('bullseye');
  else AUD.play('ding');
}
function flashBanner(msg, color) {
  const b = $('banner');
  b.textContent = msg;
  b.style.color = color || 'var(--gold)';
  b.style.opacity = 1;
  clearTimeout(b._t);
  b._t = setTimeout(() => { b.style.opacity = 0; }, 1100);
}
function feedLine(msg, cls) {
  const f = $('feed');
  const d = document.createElement('div');
  d.textContent = msg;
  if (cls) d.className = cls;
  f.appendChild(d);
  while (f.children.length > 5) f.removeChild(f.firstChild);
  setTimeout(() => { if (d.parentNode) d.style.opacity = 0.35; }, 1800);
}

// ---------------------------------------------------------------- drill flow
let countIv = null;
function startDrill(kind, opts) {
  DR.resetTids();
  drillKind = kind;
  drillOpts = opts || null;
  if (opts && opts.houseOnly && equipped && !equipped.houseLoan) { prevEquipped = equipped; equipGun(HOUSE_P30); }
  renderer.toneMappingExposure = opts && opts.dim ? 0.72 : 1.25;
  drill = DR.create(kind, opts && opts.seed != null ? opts.seed : (Date.now() % 1000000) >>> 0, opts && opts.mods);
  clearTargetMeshes();
  ammo = equipped.stats.mag; reloading = 0; fireCd = 0; zooming = false;
  setAim(0, 0); recoilP = 0; recoilY = 0;
  $('menu').classList.add('hidden');
  $('end').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('drillname').textContent = opts && opts.label ? opts.label : DR.DRILLS[kind].name;
  $('strikes').textContent = (kind === 'nobusiness' || kind === 'hightable') ? 'STRIKES 0/3'
    : kind === 'overtime' ? 'LIVES 3/3' : '';
  updateAmmoHud();
  mode = MODES.COUNTDOWN;
  let n = 3;
  $('countdown').classList.remove('hidden');
  $('countnum').textContent = n;
  AUD.play('countdown');
  if (countIv) clearInterval(countIv);
  countIv = setInterval(() => {
    n--;
    if (n > 0) { $('countnum').textContent = n; AUD.play('countdown'); }
    else {
      clearInterval(countIv); countIv = null;
      $('countdown').classList.add('hidden');
      AUD.play('go');
      mode = MODES.DRILL;
      if (lastPointerType === 'mouse') tryPointerLock();
    }
  }, 700);
}
function quitDrill() {
  if (mode !== MODES.DRILL && mode !== MODES.COUNTDOWN) return;
  if (countIv) { clearInterval(countIv); countIv = null; }
  drill = null; drillOpts = null; firing = false; reloading = 0; zooming = false;
  renderer.toneMappingExposure = 1.25;
  if (prevEquipped) { equipGun(prevEquipped); prevEquipped = null; }
  clearTargetMeshes();
  mode = MODES.MENU;
  $('hud').classList.add('hidden');
  $('countdown').classList.add('hidden');
  $('end').classList.add('hidden');
  $('menu').classList.remove('hidden');
  renderMenu();
}
function handleDrillEvents(evs) {
  for (const ev of evs) {
    switch (ev.t) {
      case 'spawn': addTargetMesh(ev.target); AUD.play('thock'); break;
      case 'launch': addTargetMesh(ev.target); AUD.play('launch'); break;
      case 'expire': removeTargetMesh(ev.tid, ev.kind); break;
      case 'hit': {
        removeTargetMesh(ev.tid, ev.kind);
        if (ev.kind === 'disc') AUD.play('discPop');
        feedLine('+' + ev.delta + (ev.combo > 1 ? '  ×' + Math.min(3, 1 + (ev.combo - 1) * 0.1).toFixed(1) : ''), ev.ring !== null && ev.ring < 0.18 ? 'gold' : 'good');
        break;
      }
      case 'civ_hit': removeTargetMesh(ev.tid, 'civ'); feedLine('CIVILIAN ' + ev.delta, 'bad'); $('strikes').textContent = 'STRIKES ' + ev.strikes + '/3'; break;
      case 'combo_break': if (ev.reason !== 'civ') feedLine('combo broken', 'bad'); break;
      case 'phase': flashBanner('PHASE — ' + ev.label); AUD.play('phase'); clearTargetMeshes(); break;
      case 'life_lost': {
        $('strikes').textContent = 'LIVES ' + ev.livesLeft + '/3';
        if (ev.livesLeft > 0) { flashBanner('ONE WALKED — ' + ev.livesLeft + ' LEFT', 'var(--red)'); AUD.play('civAlarm'); }
        break;
      }
      case 'end': endDrill(ev); break;
    }
  }
}
function todayUTC() {
  const d = new Date();
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}
function endDrill(ev) {
  mode = MODES.END;
  firing = false; zooming = false;
  document.exitPointerLock && document.exitPointerLock();
  renderer.toneMappingExposure = 1.25;
  if (prevEquipped) { equipGun(prevEquipped); prevEquipped = null; }
  const kind = drillKind;
  const daily = drillOpts && drillOpts.daily;
  if (daily) {
    const dk = 'ar_daily_' + drillOpts.daily;
    const prev = parseInt(localStorage.getItem(dk) || '0', 10);
    if (ev.score > prev) localStorage.setItem(dk, String(ev.score));
  }
  const bestKey = 'ar_best_' + kind, medalKey = 'ar_medal_' + kind;
  const prevBest = parseInt(localStorage.getItem(bestKey) || '0', 10);
  const newBest = ev.score > prevBest;
  if (newBest) localStorage.setItem(bestKey, String(ev.score));
  const RANK = { none: 0, bronze: 1, silver: 2, gold: 3 };
  const prevMedal = localStorage.getItem(medalKey) || 'none';
  if (RANK[ev.medal] > RANK[prevMedal]) localStorage.setItem(medalKey, ev.medal);
  $('hud').classList.add('hidden');
  $('end').classList.remove('hidden');
  $('endtitle').textContent = ev.dq ? 'ACCOUNT CLOSED'
    : daily ? 'DAILY MARKSMAN — ' + DR.DRILLS[kind].name
    : kind === 'overtime' ? 'LIGHTS OUT — ' + drill.spawned + ' BOARDS'
    : DR.DRILLS[kind].name + ' COMPLETE';
  $('endtitle').className = ev.dq ? 'dq' : '';
  $('endmedal').innerHTML = ev.dq ? '<span class="dq">DISQUALIFIED — THREE CIVILIANS</span>'
    : ev.medal === 'none' ? '<span style="color:var(--dim)">NO MEDAL</span>'
    : '<span class="medal ' + ev.medal + '"></span>' + ev.medal.toUpperCase();
  $('endscore').textContent = ev.score;
  $('endstats').innerHTML =
    'ACCURACY ' + Math.round(ev.accuracy * 100) + '% · MAX COMBO ×' + Math.min(3, 1 + Math.max(0, ev.maxCombo - 1) * 0.1).toFixed(1) +
    '<br>' + equipped.name.toUpperCase() + ' · ' + equipped.serial +
    (newBest ? '<br><b style="color:var(--gold)">NEW PERSONAL BEST</b>' : prevBest ? '<br>BEST ' + Math.max(prevBest, ev.score) : '');
  AUD.play(ev.dq ? 'dq' : 'medal_' + ev.medal);
  renderMenu();
}

// ---------------------------------------------------------------- menus
function medalDot(kind) {
  const m = localStorage.getItem('ar_medal_' + kind) || 'none';
  return '<span class="medal ' + m + '"></span>';
}
function renderMenu() {
  const list = $('drilllist');
  list.innerHTML = '';
  {
    const ct = DR.dailyMarksman(todayUTC());
    const best = parseInt(localStorage.getItem('ar_daily_' + ct.date) || '0', 10);
    const el = document.createElement('div');
    el.className = 'drill';
    el.style.gridColumn = '1 / -1';
    el.style.borderColor = 'var(--gold)';
    el.innerHTML = '<b style="color:var(--gold)">☀ DAILY MARKSMAN — ' + DR.DRILLS[ct.kind].name + ' + ' + ct.mutator.name + '</b>' +
      '<span>' + ct.mutator.desc + ' · same contract for every member until midnight UTC</span>' +
      '<div class="best">' + (best ? 'TODAY’S BEST ' + best : 'UNATTEMPTED TODAY') + '</div>';
    el.onclick = () => {
      AUD.unlock(); AUD.play('ui');
      startDrill(ct.kind, {
        seed: ct.seed, daily: ct.date,
        mods: ct.mutator.ttlMult ? { ttlMult: ct.mutator.ttlMult } : null,
        magLock: !!ct.mutator.magLock, houseOnly: !!ct.mutator.houseOnly, dim: !!ct.mutator.dim,
        label: 'DAILY — ' + DR.DRILLS[ct.kind].name + ' + ' + ct.mutator.name,
      });
    };
    list.appendChild(el);
  }
  for (const kind in DR.DRILLS) {
    const d = DR.DRILLS[kind];
    const best = parseInt(localStorage.getItem('ar_best_' + kind) || '0', 10);
    const el = document.createElement('div');
    el.className = 'drill';
    el.innerHTML = '<b>' + medalDot(kind) + d.name + '</b><span>' + d.desc + '</span>' +
      '<div class="best">' + (best ? 'BEST ' + best : 'UNATTEMPTED') + ' · GOLD AT ' + d.medals[2] + '</div>';
    el.onclick = () => { AUD.unlock(); AUD.play('ui'); startDrill(kind); };
    list.appendChild(el);
  }
}
function renderLocker() {
  const list = $('lockerlist');
  list.innerHTML = '';
  if (!member) return;
  const alloc = WL.allocate(loadoutState.modCfg, member.mods, member.gunTypes);
  for (const spec of member.specs) {
    const el = document.createElement('div');
    el.className = 'card' + (equipped && equipped.id === spec.id ? ' equipped' : '');
    const img = document.createElement('img');
    img.src = window.gunArtURI(spec.type, spec.id);
    img.alt = spec.name + ' ' + spec.serial;
    el.appendChild(img);
    // GUNSMITH: 3 slots per gun (keyed by gun TYPE — the build is per line, as in PEPE WICK)
    const bolted = alloc[spec.type] || [];
    const slots = document.createElement('div');
    slots.className = 'slots';
    for (let i = 0; i < WL.MOD_SLOTS; i++) {
      const t = bolted[i];
      const s = document.createElement('div');
      s.className = 'slot' + (t ? ' filled' : '');
      if (t) { s.style.background = ROSTER.WICK_MODS[t].color; s.style.borderColor = ROSTER.WICK_MODS[t].color; s.textContent = ROSTER.WICK_MODS[t].tag; s.title = ROSTER.WICK_MODS[t].name + ' — ' + ROSTER.WICK_MODS[t].fx; }
      else { s.textContent = '+ MOD'; s.title = 'bolt on a WICK MOD'; }
      s.onclick = e => { e.stopPropagation(); AUD.play('ui'); openModPick(spec, i); };
      slots.appendChild(s);
    }
    el.appendChild(slots);
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.innerHTML = '<button class="primary" data-a="equip">EQUIP</button><button data-a="inspect">INSPECT</button>';
    el.appendChild(actions);
    actions.querySelector('[data-a=equip]').onclick = e => { e.stopPropagation(); AUD.play('ui'); equipGun(spec); renderLocker(); };
    actions.querySelector('[data-a=inspect]').onclick = e => { e.stopPropagation(); AUD.play('ui'); openInspect(spec); };
    list.appendChild(el);
  }
  // owned mods summary
  const counts = WL.modCounts(member.mods);
  const parts = Object.keys(counts).map(t => ROSTER.WICK_MODS[t].name + ' ×' + counts[t]);
  $('modsowned').innerHTML = parts.length
    ? '<b style="color:var(--gold)">WICK MODS IN THE SAFE:</b> ' + parts.join(' · ') + '<br>3 slots per gun · a mod bolts to ONE gun · duplicates on the same gun don’t stack · same rules as PEPE WICK’s gunsmith'
    : '<b style="color:var(--gold)">NO WICK MODS IN THE SAFE</b> — attachments are free-mint at the arsenal. Bolt LASER / HP+ / RPS+ / BARREL / AP / DRAGON onto your iron and the build follows you into every cabinet.';
}
let modPickCtx = null; // { spec, slot }
function openModPick(spec, slot) {
  modPickCtx = { spec, slot };
  $('modpick-title').textContent = 'BOLT ON — ' + spec.name.toUpperCase() + ' · SLOT ' + (slot + 1);
  const list = $('modlist');
  list.innerHTML = '';
  const counts = WL.modCounts(member.mods);
  const bolted = boltedMods(spec.type);
  const types = Object.keys(ROSTER.WICK_MODS).map(Number);
  let anyOwned = false;
  for (const t of types) {
    const M = ROSTER.WICK_MODS[t];
    const owned = counts[t] || 0;
    const free = WL.modsFree(t, loadoutState.modCfg, member.mods, member.gunTypes);
    const onThisGun = bolted.includes(t) && bolted[slot] !== t;
    const el = document.createElement('div');
    el.className = 'modopt' + (owned === 0 || onThisGun ? ' none' : '');
    el.style.borderLeft = '4px solid ' + M.color;
    el.innerHTML = '<span class="cnt">' + (owned ? (free ? free + ' FREE' : 'ALL BOLTED') : 'NOT OWNED') + '</span><b>' + M.name + '</b><span>' + M.fx + '</span>' +
      (onThisGun ? '<span style="color:var(--red)">already on this gun</span>' : '');
    if (owned && !onThisGun) {
      anyOwned = true;
      el.onclick = () => {
        const r = WL.setSlot(loadoutState, spec.type, slot, t, member.mods, member.gunTypes);
        if (!r.ok) { AUD.play('dry'); return; }
        AUD.play('reload');
        if (r.stolenFrom != null) {
          const from = ROSTER.WICK_GUNS[r.stolenFrom] ? ROSTER.WICK_GUNS[r.stolenFrom].name : 'another gun';
          $('modpick-sub').textContent = '⇄ ' + M.tag + ' MOVED OFF ' + from.toUpperCase();
        }
        afterModChange();
        setTimeout(() => $('modpick').classList.add('hidden'), r.stolenFrom != null ? 700 : 0);
      };
    }
    list.appendChild(el);
  }
  $('modpick-sub').textContent = anyOwned ? 'PICK AN ATTACHMENT FOR THIS SLOT' : 'NO WICK MODS OWNED — FREE-MINT THEM AT THE ARSENAL';
  $('modpick').classList.remove('hidden');
}
function afterModChange() {
  // re-equip so the live stats + HUD carry the new build, then persist everything
  if (equipped && !equipped.houseLoan) equipGun(equipped);
  else WL.save(loadoutState, member, equipped);
  renderLocker();
}
$('btn-modpick-back').onclick = () => { AUD.play('ui'); $('modpick').classList.add('hidden'); };
$('btn-modpick-clear').onclick = () => {
  if (!modPickCtx) return;
  WL.setSlot(loadoutState, modPickCtx.spec.type, modPickCtx.slot, null, member.mods, member.gunTypes);
  AUD.play('ui');
  afterModChange();
  $('modpick').classList.add('hidden');
};

// ---------------------------------------------------------------- launch pad
function renderDeploy() {
  const payload = WL.save(loadoutState, member, equipped);
  const mods = (payload.mods || []).map(t => '<span class="chip" style="background:' + ROSTER.WICK_MODS[t].color + '; color:#05070c; padding:1px 8px; border-radius:10px; font-size:10px; font-weight:bold; margin-left:4px;">' + ROSTER.WICK_MODS[t].tag + '</span>').join('');
  $('deploybuild').innerHTML = '<b style="color:var(--gold); letter-spacing:1px;">CARRYING</b> — ' + equipped.name.toUpperCase() + ' · ' + equipped.serial + mods +
    (payload.carry && payload.carry.length > 1 ? ' <span style="color:var(--dim)">· sidearm ' + (ROSTER.WICK_GUNS[payload.carry[1]] || {}).name + '</span>' : '');
  const pad = $('padlist');
  pad.innerHTML = '';
  for (const c of WL.CABINETS) {
    const a = document.createElement('a');
    a.className = 'cab' + (c.live ? '' : ' soon');
    a.style.setProperty('--cc', c.color);
    a.href = c.live && c.key !== 'arsenal' ? WL.launchURL(c.url, payload) : c.url;
    a.target = '_blank'; a.rel = 'noopener';
    a.innerHTML = '<span class="go">' + (c.live ? '↗' : '⏳') + '</span><b>' + c.name + '</b><div class="tag">' + c.tag + '</div>' +
      '<div class="carries">' + (c.live ? 'carries: ' + c.carries : 'powering up') + '</div>';
    a.onclick = () => { AUD.play('go'); };
    pad.appendChild(a);
  }
}
function openDeploy() { AUD.unlock(); AUD.play('ui'); renderDeploy(); $('deploy').classList.remove('hidden'); }
$('btn-deploy').onclick = openDeploy;
$('btn-locker-deploy').onclick = openDeploy;
$('btn-deploy-back').onclick = () => { AUD.play('ui'); $('deploy').classList.add('hidden'); };
let pedestal = null;
function openInspect(spec) {
  mode = MODES.INSPECT;
  inspectGun = spec;
  $('locker').classList.add('hidden');
  $('inspect-hud').classList.remove('hidden');
  $('inspect-name').textContent = spec.name.toUpperCase() + ' · ' + spec.serial;
  if (inspectModel) { scene.remove(inspectModel); disposeGunModel(inspectModel); }
  inspectModel = buildGunModel(spec, 2.6);
  inspectModel.position.set(0, 1.65, -3.4);
  scene.add(inspectModel);
  if (!pedestal) {
    pedestal = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.68, 1.05, 28),
      new THREE.MeshStandardMaterial({ color: 0x141922, roughness: 0.3, metalness: 0.7, envMapIntensity: 1.1 }));
    base.position.y = 0.52;
    const trim = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.035, 8, 28),
      new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.3, metalness: 0.95, envMapIntensity: 1.5 }));
    trim.rotation.x = Math.PI / 2; trim.position.y = 1.05;
    pedestal.add(base, trim);
    pedestal.position.set(0, 0, -3.4);
  }
  scene.add(pedestal);
  if (!inspectLights) {
    inspectLights = new THREE.Group();
    const keyL = new THREE.PointLight(0xfff2e0, 12, 10); keyL.position.set(1.5, 2.8, -2.1); inspectLights.add(keyL);
    const rimL = new THREE.PointLight(0x7fd0ff, 6, 10); rimL.position.set(-1.7, 1.2, -4.8); inspectLights.add(rimL);
  }
  scene.add(inspectLights);
  inspectYaw = 0.5; inspectDist = 1.5;
}
function closeInspect(backToLocker) {
  if (inspectModel) { scene.remove(inspectModel); disposeGunModel(inspectModel); inspectModel = null; }
  if (pedestal) scene.remove(pedestal);
  if (inspectLights) scene.remove(inspectLights);
  $('inspect-hud').classList.add('hidden');
  if (backToLocker) { mode = MODES.LOCKER; $('locker').classList.remove('hidden'); }
}

$('btn-locker').onclick = () => { AUD.unlock(); AUD.play('ui'); mode = MODES.LOCKER; $('menu').classList.add('hidden'); $('locker').classList.remove('hidden'); renderLocker(); };
$('btn-locker-back').onclick = () => { AUD.play('ui'); mode = MODES.MENU; $('locker').classList.add('hidden'); $('menu').classList.remove('hidden'); };
$('btn-inspect-back').onclick = () => { AUD.play('ui'); closeInspect(true); };
$('btn-inspect-equip').onclick = () => { AUD.play('ui'); if (inspectGun) equipGun(inspectGun); closeInspect(true); renderLocker(); };
$('btn-help').onclick = () => { AUD.unlock(); AUD.play('ui'); syncAimCtl(); $('help').classList.remove('hidden'); };
$('btn-help-back').onclick = () => { AUD.play('ui'); $('help').classList.add('hidden'); };
// aim controls (RANGE RULES) — live + persisted
function syncAimCtl() {
  $('sens').value = AIM.sens; $('sensv').textContent = AIM.sens.toFixed(2) + '×';
  $('smooth').value = AIM.smooth; $('smoothv').textContent = Math.round(AIM.smooth * 100) + '%';
}
$('sens').oninput = e => { AIM.sens = parseFloat(e.target.value); localStorage.setItem('ar_sens', String(AIM.sens)); syncAimCtl(); };
$('smooth').oninput = e => { AIM.smooth = parseFloat(e.target.value); localStorage.setItem('ar_smooth', String(AIM.smooth)); syncAimCtl(); };
syncAimCtl();
$('btn-retry').onclick = () => { AUD.play('ui'); startDrill(drillKind, drillOpts); };
$('btn-endmenu').onclick = () => { AUD.play('ui'); mode = MODES.MENU; $('end').classList.add('hidden'); $('menu').classList.remove('hidden'); clearTargetMeshes(); };
$('btn-mute').onclick = () => { AUD.unlock(); const m = AUD.toggleMute(); $('btn-mute').textContent = m ? '♪ OFF' : '♪'; };
$('btn-card').onclick = () => shareCard();

function shareCard() {
  if (!drill) return;
  const cv = document.createElement('canvas');
  cv.width = 900; cv.height = 470;
  const x = cv.getContext('2d');
  x.fillStyle = '#05070c'; x.fillRect(0, 0, 900, 470);
  x.strokeStyle = '#c9a227'; x.lineWidth = 3; x.strokeRect(14, 14, 872, 442);
  x.font = "bold 44px 'Black Ops One', Impact, monospace"; x.fillStyle = '#e8c576';
  x.fillText('ARSENAL RANGE', 40, 78);
  x.font = '18px Consolas, monospace'; x.fillStyle = '#9aa7bd';
  x.fillText(DR.DRILLS[drillKind].name + ' · ' + equipped.name.toUpperCase() + ' · ' + equipped.serial, 40, 112);
  const medal = drill.medal || 'none';
  x.font = "bold 30px 'Black Ops One', Impact, monospace";
  x.fillStyle = drill.disqualified ? '#ff5c5c' : { gold: '#ffd700', silver: '#cfd6e4', bronze: '#cd7f32', none: '#71809c' }[medal];
  x.fillText(drill.disqualified ? 'DISQUALIFIED' : medal === 'none' ? 'NO MEDAL' : medal.toUpperCase() + ' MEDAL', 40, 168);
  x.font = "bold 92px 'Black Ops One', Impact, monospace"; x.fillStyle = '#fff';
  x.fillText(String(drill.score), 40, 300);
  x.font = '16px Consolas, monospace'; x.fillStyle = '#9aa7bd'; x.fillText('SCORE', 42, 326);
  x.font = '19px Consolas, monospace'; x.fillStyle = '#c8d2e4';
  x.fillText('HITS ' + drill.hits + '   ACC ' + Math.round((drill.accuracy || 0) * 100) + '%   MAX COMBO ' + drill.maxCombo, 40, 380);
  x.font = '15px Consolas, monospace'; x.fillStyle = '#71809c';
  x.fillText(new Date().toISOString().slice(0, 10) + ' · WICK ARSENAL PROVING GROUND · MEMBERS ONLY', 40, 432);
  cv.toBlob(b => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = 'arsenal-range-card.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
}

// ---------------------------------------------------------------- main loop
let lastT = performance.now();
function tick(dtOverride) {
  const now = performance.now();
  let dt = dtOverride != null ? dtOverride : Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  if (mode === MODES.DRILL && drill && !drill.over) {
    const evs = DR.step(drill, dt);
    handleDrillEvents(evs);
    if (firing && equipped && equipped.stats.auto) fire();
    fireCd -= dt;
    if (reloading > 0) {
      reloading -= dt;
      if (reloading <= 0) { reloading = 0; ammo = equipped.stats.mag; }
      updateAmmoHud();
    }
    $('score').textContent = drill.score;
    $('combo').textContent = drill.combo > 1 ? '×' + Math.min(3, 1 + (drill.combo - 1) * 0.1).toFixed(1) : '';
    const left = isFinite(drill.duration) ? Math.max(0, drill.duration - drill.t) : null;
    $('timer').textContent = drillKind === 'hightable' ? 'PHASE ' + (drill.phase + 1) + '/5'
      : drillKind === 'overtime' ? 'BOARDS ' + drill.spawned
      : left !== null ? left.toFixed(1) + 's' : (drill.spawned + '/' + (drillKind === 'qualifier' ? 20 : 12));
    bobT += dt * 3;
  }
  // ADS zoom lerp
  const targetFov = (mode === MODES.DRILL && zooming && equipped) ? BASE_FOV / equipped.stats.zoom : BASE_FOV;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
  }
  // recoil: exponential recovery (a linear ramp reads as a mechanical hinge),
  // horizontal kick lands on the aim TARGET so the smoothing carries it, not fights it
  recoilP *= Math.exp(-dt * 7);
  if (recoilP < 1e-4) recoilP = 0;
  recoilY *= Math.max(0, 1 - dt * 8);
  aimYaw += recoilY * dt * 8;
  stepAim(dt);
  applyAim();
  if (viewmodel) {
    viewmodel.visible = (mode === MODES.DRILL || mode === MODES.COUNTDOWN);
    viewmodel.position.z += (-0.52 - viewmodel.position.z) * Math.min(1, dt * 9);
    const zoomShift = zooming ? -0.1 : 0;
    viewmodel.position.x += (0.27 + zoomShift - viewmodel.position.x) * Math.min(1, dt * 8);
    viewmodel.position.y = -0.2 + Math.sin(bobT) * 0.004;
    viewmodel.rotation.x = reloading > 0 ? 0.55 : recoilP * 2.2;
  }
  if (mode === MODES.GATE || mode === MODES.MENU || mode === MODES.LOCKER || mode === MODES.END) {
    setAim(Math.sin(now / 11000) * 0.3, -0.02 + Math.sin(now / 7000) * 0.015);
    applyAim();
  }
  if (mode === MODES.INSPECT && inspectModel) {
    if (!dragging) {
      // fling inertia bleeds off, then the slow showroom turn takes over
      inspectVel *= Math.exp(-dt * 3.2);
      if (Math.abs(inspectVel) < 0.0004) inspectVel = 0;
      inspectYaw += inspectVel + dt * 0.5 * (1 - Math.min(1, Math.abs(inspectVel) / 0.02));
    }
    inspectModel.rotation.y = inspectYaw;
    camera.position.set(0, 1.62, -3.4 + inspectDist);
    setAim(0, -0.04); applyAim();
  } else {
    camera.position.set(0, 1.6, 0);
  }
  syncTargets();
  stepFalling(dt);
  stepFx(dt);
  const dp = dust.geometry.attributes.position;
  for (let i = 0; i < dp.count; i++) {
    dp.array[i * 3 + 1] += dt * 0.03;
    if (dp.array[i * 3 + 1] > 5) dp.array[i * 3 + 1] = 0;
  }
  dp.needsUpdate = true;
  for (let i = 0; i < wisps.length; i++) {
    wisps[i].position.x += Math.sin(now / 5000 + i * 2) * dt * 0.12;
  }
  if (window.__signFlicker) window.__signFlicker.material.opacity = 0.42 + Math.sin(now / 90) * 0.04 + Math.sin(now / 700) * 0.06;
  // holo shimmer hue cycle
  const hue = (now / 25) % 360;
  for (const m of holoMats) m.color.setHSL(hue / 360, 0.85, 0.62);

  renderer.render(scene, camera);
}
renderer.setAnimationLoop(() => tick());
if (AUD.isMuted()) $('btn-mute').textContent = '♪ OFF';

// ================================================================ QA
window.qaPump = function (n) { for (let i = 0; i < (n || 1); i++) tick(1 / 60); return true; };
window.qaShot = function (name) {
  tick(1 / 60);
  const dataURL = canvas.toDataURL('image/png');
  return fetch('/shot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, dataURL }) }).then(r => r.json());
};
window.qaAim = function (x, y, z) {
  const dir = new THREE.Vector3(x - camera.position.x, y - camera.position.y, z - camera.position.z).normalize();
  setAim(Math.atan2(-dir.x, -dir.z), Math.asin(Math.max(-1, Math.min(1, dir.y))));
  recoilP = 0; recoilY = 0;
  applyAim();
  camera.updateMatrixWorld();
  return { yaw, pitch };
};
// QA: feed raw pointer deltas through the REAL nudge path, read the smoothed result per frame
window.qaMouse = function (dx, dy) { nudgeAim(dx, dy, BASE_SENS * AIM.sens * (zooming ? 0.55 : 1)); return { aimYaw, aimPitch, yaw, pitch }; };
window.qaAimState = function () { return { aimYaw, aimPitch, yaw, pitch, recoilP, smooth: AIM.smooth, sens: AIM.sens, rate: aimRate() }; };
window.qaSetAim = function (o) { if (o.smooth != null) AIM.smooth = o.smooth; if (o.sens != null) AIM.sens = o.sens; return window.qaAimState(); };
window.qaFire = function () { fireCd = 0; reloading = 0; if (ammo <= 0 && equipped) ammo = equipped.stats.mag; fire(); return { ammo, score: drill ? drill.score : null }; };
window.qaStartDrill = function (kind) { startDrill(kind); $('countdown').classList.add('hidden'); if (countIv) { clearInterval(countIv); countIv = null; } mode = MODES.DRILL; return true; };
window.qaMem = function () { return { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }; };
window.qaDrillState = function () {
  return drill ? {
    score: drill.score, hits: drill.hits, misses: drill.misses, shots: drill.shots,
    combo: drill.combo, strikes: drill.strikes, over: drill.over,
    targets: drill.targets.filter(t => t.alive).map(t => ({ tid: t.tid, x: t.x, y: t.y, z: t.z, kind: t.kind, popT: t.popT })),
  } : null;
};
// QA: enter as a member with a synthetic arsenal — {addr, guns:[{id,type}]}
window.qaApplyWallet = async function (res) {
  await enterAsMember({ addr: res.addr || '0xQA', guns: res.guns || [{ id: 2, type: 1 }], mods: res.mods || [] });
  return member.specs.map(s => s.id + ':' + s.type + ':' + s.name);
};
window.qaLoadout = function () {
  return {
    equipped: equipped ? { id: equipped.id, type: equipped.type, mods: equipped.mods, stats: equipped.stats, base: equipped.base } : null,
    pw_loadout: localStorage.getItem('pw_loadout'), pw_carry: localStorage.getItem('pw_carry'), pw_modcfg: localStorage.getItem('pw_modcfg'),
    wick_loadout: localStorage.getItem('wick_loadout'),
    padLinks: [...document.querySelectorAll('#padlist a')].map(a => a.href),
  };
};
window.qaBolt = function (gunType, slot, modType) { return WL.setSlot(loadoutState, gunType, slot, modType, member.mods, member.gunTypes); };
window.qaAfterMod = afterModChange;
window.qaEquip = async function (id, type) {
  await gunTexture(type || 1);
  equipGun(ROSTER.realGun(id || 0, type || 1));
  return equipped.name;
};
window.qaGateState = function () {
  return {
    mode,
    gateVisible: !$('gate').classList.contains('hidden'),
    buyVisible: !$('buy').classList.contains('hidden'),
    menuVisible: !$('menu').classList.contains('hidden'),
    member: member ? { addr: member.addr, count: member.guns.length } : null,
  };
};
window.qaDrill = async function (kind, maxShots) {
  window.qaStartDrill(kind);
  maxShots = maxShots || 40;
  let shots = 0, guard = 0;
  while (!drill.over && shots < maxShots && guard++ < 3000) {
    window.qaPump(4);
    const alive = drill.targets.filter(t => t.alive && t.kind !== 'civ' && t.popT > 0.6);
    if (!alive.length) continue;
    const t = alive[0];
    window.qaAim(t.x, t.y, t.z);
    window.qaPump(1);
    window.qaFire();
    shots++;
  }
  const out = { kind, shots, hits: drill.hits, score: drill.score, over: drill.over, accuracy: drill.hits / Math.max(1, drill.shots) };
  console.log('[QADRILL]', JSON.stringify(out));
  return out;
};
window.runAudit = async function () {
  const out = { pass: [], fail: [], info: {} };
  const okc = (c, n) => (c ? out.pass : out.fail).push(n);
  okc(!!renderer.getContext(), 'webgl context');
  out.info.three = THREE.REVISION;
  tick(1 / 60);
  out.info.drawCalls = renderer.info.render.calls;
  out.info.triangles = renderer.info.render.triangles;
  okc(renderer.info.render.calls < 500, 'draw calls < 500 (' + renderer.info.render.calls + ')');
  okc(renderer.info.render.triangles < 400000, 'triangles < 400k (' + renderer.info.render.triangles + ')');
  // every roster type has art + stats and textures rasterize
  try {
    const types = Object.keys(ROSTER.WICK_GUNS).map(Number);
    okc(types.length === 11, 'roster has 11 gun types');
    okc(types.every(t => typeof window.gunBodySVG(t) === 'string' && window.gunBodySVG(t).length > 500), 'gun art renders for all types');
    await Promise.all(types.slice(0, 3).map(t => gunTexture(t)));
    okc(gunTexCache.size >= 3, 'gun textures rasterize');
  } catch (e) { okc(false, 'gun art/texture threw: ' + e.message); }
  const ids = ['crosshair', 'topbar', 'ammo', 'feed', 'banner', 'menu', 'locker', 'end', 'drilllist', 'gate', 'buy'];
  okc(ids.every(i => !!$(i)), 'all HUD/menu/gate elements present');
  okc(!!$('btn-buy') && $('btn-buy').href.includes('mint.wick.pics'), 'buy CTA points at the arsenal');
  const tb = $('topbar').getBoundingClientRect(), am = $('ammo').getBoundingClientRect();
  const overlap = tb.left < am.right && tb.right > am.left && tb.top < am.bottom && tb.bottom > am.top;
  okc(!overlap, 'topbar and ammo do not overlap');
  okc((window.__consoleErrors || []).length === 0, 'zero console errors (' + (window.__consoleErrors || []).length + ')');
  try { localStorage.setItem('ar_a', '1'); localStorage.removeItem('ar_a'); okc(true, 'localStorage RW'); } catch (e) { okc(false, 'localStorage RW'); }
  const bot = DR.botRun('qualifier', 42, 0.9);
  okc(bot.over && bot.score > 0, 'headless drill bot ok (' + bot.score + ')');
  // the gate is CLOSED by default
  okc(mode === MODES.GATE ? !$('gate').classList.contains('hidden') || !$('buy').classList.contains('hidden') : true, 'gate visible when no member');
  out.ok = out.fail.length === 0;
  console.log('[AUDIT]', JSON.stringify(out, null, 2));
  return out;
};
if (new URLSearchParams(location.search).get('audit') === '1') setTimeout(() => window.runAudit(), 1200);
