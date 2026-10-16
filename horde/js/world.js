/* PEPE WICK vs HORDE — the world. One procedural kit builds ten roads:
   generated asphalt/cobble/stair/sand tiles with normal maps, a scrolling
   verge, instanced roadside sets (lamps, buildings with lit windows, wrecks,
   barriers, gantries, neon, pillars, torches, trees, pylons, dunes...),
   a far skyline per city, a shader sky with stars and a sun/moon, fog,
   shadowed sun + hemisphere + sliding neon lights, weather, and the live
   gate / barrel / hazard meshes driven by the sim. */
import * as THREE from 'three';

const ROAD = 3.2;         // world metres per road unit (road half-width)
const LOOP = 180;         // metres of road kept alive ahead (props recycle)
const AHEAD = -171, BEHIND = 9;   // the camera sits at z ≈ 12.6: nothing may recycle through it

// ---------- canvas textures ----------
function noiseCanvas(w, h, fn) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); const img = g.createImageData(w, h); const d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; const [r, gg, b] = fn(x, y); d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  return c;
}
// value noise
const P = new Uint8Array(512); { const p = []; for (let i = 0; i < 256; i++) p[i] = i; for (let i = 255; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) P[i] = p[i & 255]; }
function vnoise(x, y) {
  const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255, xf = x - Math.floor(x), yf = y - Math.floor(y);
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = P[P[xi] + yi] / 255, b = P[P[xi + 1] + yi] / 255, c = P[P[xi] + yi + 1] / 255, d = P[P[xi + 1] + yi + 1] / 255;
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function fbm(x, y, o) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < (o || 4); i++) { s += vnoise(x * f, y * f) * a; a *= 0.5; f *= 2; } return s; }
function tex(c, rx, ry, srgb) { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx || 1, ry || 1); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
function hexRGB(h) { return [(h >> 16) & 255, (h >> 8) & 255, h & 255]; }
function normalFromHeight(hc, strength) {
  const w = hc.width, h = hc.height, g = hc.getContext('2d'), src = g.getImageData(0, 0, w, h).data;
  const at = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  return noiseCanvas(w, h, (x, y) => {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    return [(-dx / l * 0.5 + 0.5) * 255, (-dy / l * 0.5 + 0.5) * 255, (1 / l * 0.5 + 0.5) * 255];
  });
}

function roadTextures(pal, kind) {
  const W = 512, H = 1024;
  const [br, bg, bb] = hexRGB(pal.road);
  // height
  const cracks = []; for (let i = 0; i < 9; i++) { let x = Math.random() * W, y = Math.random() * H; const seg = []; for (let k = 0; k < 40; k++) { seg.push([x, y]); x += (Math.random() - 0.5) * 18; y += 6 + Math.random() * 10; } cracks.push(seg); }
  const hc = document.createElement('canvas'); hc.width = W; hc.height = H; const hg = hc.getContext('2d');
  const himg = hg.createImageData(W, H); const hd = himg.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 0.5 + (fbm(x / 23, y / 23, 4) - 0.5) * 0.5 + (vnoise(x * 1.7, y * 1.7) - 0.5) * 0.25;
    if (kind === 'cobble') { const cx = (x / 42) % 1, cy = ((y + (Math.floor(x / 42) % 2) * 21) / 42) % 1; const e = Math.min(cx, 1 - cx, cy, 1 - cy); v = 0.35 + Math.min(e * 5, 1) * 0.4 + (vnoise(x / 9, y / 9) - 0.5) * 0.2; }
    if (kind === 'stairs') { const sy = (y / 64) % 1; v = 0.3 + (sy < 0.12 ? sy / 0.12 : 1) * 0.45 + (vnoise(x / 15, y / 15) - 0.5) * 0.12; }
    const i = (y * W + x) * 4; hd[i] = hd[i + 1] = hd[i + 2] = Math.max(0, Math.min(255, v * 255)); hd[i + 3] = 255;
  }
  hg.putImageData(himg, 0, 0);
  if (kind !== 'stairs') { hg.strokeStyle = 'rgba(0,0,0,0.9)'; hg.lineWidth = 2; for (const s of cracks) { hg.beginPath(); s.forEach(([x, y], i) => i ? hg.lineTo(x, y) : hg.moveTo(x, y)); hg.stroke(); } }
  // colour
  const cc = document.createElement('canvas'); cc.width = W; cc.height = H; const cg = cc.getContext('2d');
  const cimg = cg.createImageData(W, H); const cd = cimg.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4; const hv = hd[i] / 255;
    let m = 0.7 + hv * 0.6 + (fbm(x / 90, y / 90, 3) - 0.5) * 0.5;
    if (kind === 'sand') m += fbm(x / 40, y / 40, 3) * 0.6;
    cd[i] = br * m; cd[i + 1] = bg * m; cd[i + 2] = bb * m; cd[i + 3] = 255;
  }
  cg.putImageData(cimg, 0, 0);
  if (kind !== 'stairs') { cg.strokeStyle = 'rgba(0,0,0,0.55)'; cg.lineWidth = 2.5; for (const s of cracks) { cg.beginPath(); s.forEach(([x, y], i) => i ? cg.lineTo(x, y) : cg.moveTo(x, y)); cg.stroke(); } }
  // lane markings
  if (kind === 'asphalt' || kind === 'sand') {
    cg.fillStyle = kind === 'sand' ? 'rgba(255,240,200,0.35)' : 'rgba(235,235,225,0.55)';
    for (let y = 0; y < H; y += 128) { cg.fillRect(W / 2 - 4, y, 8, 70); }
    cg.fillStyle = kind === 'sand' ? 'rgba(255,240,200,0.3)' : 'rgba(240,220,120,0.5)';
    cg.fillRect(14, 0, 6, H); cg.fillRect(W - 20, 0, 6, H);
    // oil + puddles
    for (let i = 0; i < 6; i++) { const x = Math.random() * W, y = Math.random() * H, r = 20 + Math.random() * 50; const gr = cg.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); cg.fillStyle = gr; cg.fillRect(x - r, y - r, r * 2, r * 2); }
  }
  if (kind === 'stairs') { cg.fillStyle = 'rgba(255,255,255,0.18)'; for (let y = 0; y < H; y += 64) cg.fillRect(0, y, W, 3); }
  // rough: puddles are smooth
  const rc = noiseCanvas(256, 512, (x, y) => { const v = fbm(x / 40, y / 40, 3); const r = v > 0.58 ? 60 : 200; return [r, r, r]; });
  return { map: tex(cc, 1, 1, true), normalMap: tex(normalFromHeight(hc, 2.2), 1, 1, false), roughnessMap: tex(rc, 1, 1, false) };
}
function vergeTextures(pal) {
  const [br, bg, bb] = hexRGB(pal.verge);
  const hc = noiseCanvas(512, 512, (x, y) => { const v = 0.5 + (fbm(x / 30, y / 30, 5) - 0.5) * 0.8; const r = v * 255; return [r, r, r]; });
  const cc = noiseCanvas(512, 512, (x, y) => { const v = fbm(x / 30, y / 30, 5), s = vnoise(x * 2.3, y * 2.3); const m = 0.55 + v * 0.7 + (s > 0.85 ? 0.5 : 0); return [br * m, bg * m, bb * m]; });
  return { map: tex(cc, 1, 1, true), normalMap: tex(normalFromHeight(hc, 3), 1, 1, false) };
}
// A facade: style 'brick' (tenement: small windows with sills, ledges, a lit storefront),
// 'glass' (dense mullioned grid, cold light), 'stone' (tall arched windows, warm),
// 'concrete' (sparse, grimy). cols × rows = windows per texture tile; the material's
// repeat keeps window size constant across building sizes.
function facadeTextures(pal, style, cols, rows, storefront) {
  const W = 512, H = 1024;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  let [br, bg, bb] = hexRGB(pal.bld);
  if (style === 'glass') { br *= 0.7; bg *= 0.8; bb *= 1.1; }
  if (style === 'stone') { br = Math.min(255, br * 1.6 + 30); bg = Math.min(255, bg * 1.45 + 20); bb = Math.min(255, bb * 1.2 + 10); }
  if (style === 'concrete') { br = bg = bb = (br + bg + bb) / 3 * 1.3 + 20; }
  const n = noiseCanvas(W, H, (x, y) => {
    let v = 0.82 + fbm(x / 26, y / 26, 3) * 0.36;
    if (style === 'brick') { const row = Math.floor(y / 7), bx = (x + (row % 2) * 8) % 16; if (bx < 1 || y % 7 < 1) v *= 0.72; else v *= 0.95 + vnoise(x / 3, y / 3) * 0.1; }
    if (style === 'concrete') v *= 0.75 + fbm(x / 9, y / 90, 3) * 0.4;   // streaks
    return [br * v, bg * v, bb * v];
  });
  g.drawImage(n, 0, 0);
  const e = document.createElement('canvas'); e.width = W; e.height = H; const eg = e.getContext('2d');
  eg.fillStyle = '#000'; eg.fillRect(0, 0, W, H);
  const [wr, wg, wb] = hexRGB(pal.win);
  const lit = style === 'glass' ? 0.55 : style === 'concrete' ? 0.25 : 0.4;
  const groundH = storefront ? H * 0.11 : 0;
  const cw = W / cols, ch = (H - groundH) / rows;
  for (let r = 0; r < rows; r++) {
    if (style !== 'glass' && r % 4 === 0) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, r * ch - 2, W, 4); }   // ledge
    for (let k = 0; k < cols; k++) {
      const pad = style === 'glass' ? 0.08 : 0.28;
      const x = k * cw + cw * pad, y = r * ch + ch * (style === 'stone' ? 0.14 : 0.22), w = cw * (1 - pad * 2), h = ch * (style === 'stone' ? 0.66 : style === 'glass' ? 0.78 : 0.5);
      g.fillStyle = style === 'glass' ? 'rgba(18,26,40,0.95)' : 'rgba(8,10,16,0.92)';
      if (style === 'stone') { g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, y + h); g.closePath(); g.fill(); }
      else g.fillRect(x, y, w, h);
      if (style === 'brick') { g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x - 2, y + h, w + 4, 2); }          // sill
      if (style === 'glass') { g.fillStyle = 'rgba(160,190,220,0.25)'; g.fillRect(x, y, w, 1); g.fillRect(x, y, 1, h); } // mullion catch
      const on = Math.random() < lit;
      if (on) {
        const b = 0.45 + Math.random() * 0.65;
        eg.fillStyle = `rgb(${wr * b | 0},${wg * b | 0},${wb * b | 0})`;
        if (style === 'stone') { eg.beginPath(); eg.moveTo(x, y + h); eg.lineTo(x, y + w / 2); eg.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); eg.lineTo(x + w, y + h); eg.closePath(); eg.fill(); }
        else eg.fillRect(x, y, w, h);
        if (Math.random() < 0.35) { eg.fillStyle = 'rgba(0,0,0,0.65)'; eg.fillRect(x + w * (0.3 + Math.random() * 0.4), y, w * 0.18, h); }  // a figure / curtain
        if (Math.random() < 0.2) { eg.fillStyle = 'rgba(0,0,0,0.5)'; eg.fillRect(x, y + h * 0.5, w, h * 0.5); }   // blind half down
      }
    }
  }
  if (storefront) {
    const y0 = H - groundH;
    g.fillStyle = 'rgba(6,7,10,0.95)'; g.fillRect(0, y0, W, groundH);
    for (let k = 0; k < 4; k++) {
      const x = k * (W / 4) + 10, w = W / 4 - 20;
      g.fillStyle = 'rgba(14,16,22,1)'; g.fillRect(x, y0 + 10, w, groundH - 30);
      const b = 0.5 + Math.random() * 0.5; eg.fillStyle = `rgb(${wr * b | 0},${wg * b * 0.9 | 0},${wb * b * 0.7 | 0})`; eg.fillRect(x + 4, y0 + 14, w - 8, groundH - 38);
      if (Math.random() < 0.5) { eg.fillStyle = 'rgba(0,0,0,0.7)'; eg.fillRect(x + w * 0.45, y0 + 14, w * 0.1, groundH - 38); }
    }
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, y0 - 6, W, 8);   // awning shadow line
  }
  return { map: tex(c, 1, 1, true), emissiveMap: tex(e, 1, 1, true) };
}
function buildingMaterial(ft, repX, repY, roofColor) {
  const side = new THREE.MeshStandardMaterial({ map: ft.map.clone(), emissiveMap: ft.emissiveMap.clone(), emissive: 0xffffff, emissiveIntensity: 1.25, roughness: 0.85 });
  side.map.repeat.set(repX, repY); side.emissiveMap.repeat.set(repX, repY); side.map.needsUpdate = side.emissiveMap.needsUpdate = true;
  const roof = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.95 });
  return [side, side, roof, roof, side, side];   // +x, -x, +y (roof), -y, +z, -z
}
function textPlane(text, color, w, h, font, glow) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 128);
  g.font = font || '700 86px "Black Ops One", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (glow) { g.shadowColor = color; g.shadowBlur = 24; }
  g.fillStyle = color; g.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  return m;
}

// ---------- sky ----------
const SKY_VERT = `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const SKY_FRAG = `
uniform vec3 uZen, uHor, uGnd, uSunDir, uSunCol; uniform float uStars, uSunSize, uTime; varying vec3 vW;
float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
void main(){
  vec3 d = normalize(vW);
  float h = d.y;
  vec3 col = mix(uHor, uZen, smoothstep(0.0, 0.55, h));
  col = mix(uGnd, col, smoothstep(-0.08, 0.06, h));
  float s = max(0.0, dot(d, normalize(uSunDir)));
  col += uSunCol * (pow(s, 48.0 / uSunSize) * 1.6 + pow(s, 3.0) * 0.18);
  if (uStars > 0.0 && h > 0.02) { vec3 g = floor(d * 230.0); float st = step(0.996, hash(g)) * uStars; col += vec3(st) * (0.5 + 0.5 * sin(uTime * 2.0 + hash(g + 1.0) * 6.28)); }
  gl_FragColor = vec4(col, 1.0);
}`;

// ---------- props ----------
class Prop {
  constructor(scene, parts, items) {
    this.parts = parts.map(p => { const m = new THREE.InstancedMesh(p.geo, p.mat, items.length); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.castShadow = !!p.shadow; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); return { mesh: m, off: p.off || [0, 0, 0], place: p.place }; });
    this.items = items; this.scene = scene;
    this._m = new THREE.Matrix4(); this._p = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._e = new THREE.Euler();
    this.sync();
  }
  sync() {
    for (const part of this.parts) {
      for (let i = 0; i < this.items.length; i++) {
        const it = this.items[i];
        if (part.place) {
          // free-form part: place(it, p, s, e) fills position / scale / euler; return false to hide
          this._e.set(0, it.ry || 0, 0); this._s.set(1, 1, 1);
          if (part.place(it, this._p, this._s, this._e) === false) this._s.set(0, 0, 0);
          this._q.setFromEuler(this._e);
        } else {
          this._e.set(0, it.ry || 0, 0); this._q.setFromEuler(this._e);
          this._p.set(it.x + part.off[0] * it.s, (it.y || 0) + part.off[1] * it.s, it.z + part.off[2] * it.s); this._s.set(it.sx || it.s, it.sy || it.s, it.sz || it.s);
        }
        this._m.compose(this._p, this._q, this._s); part.mesh.setMatrixAt(i, this._m);
      }
      part.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  scroll(dz, respawn) {
    for (const it of this.items) { it.z += dz; if (it.z > BEHIND) { it.z -= LOOP; if (respawn) respawn(it); } }
    this.sync();
  }
  dispose() { for (const p of this.parts) { this.scene.remove(p.mesh); p.mesh.dispose(); } }
}

export class World {
  constructor(scene, renderer) {
    this.scene = scene; this.r = renderer;
    this.level = null; this.props = []; this.statics = []; this.lights = [];
    this.gateMeshes = new Map(); this.barrelMeshes = new Map(); this.hazardMeshes = new Map();
    this.time = 0;
    // sky
    this.skyMat = new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, uniforms: { uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGnd: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uStars: { value: 1 }, uSunSize: { value: 1 }, uTime: { value: 0 } } });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), this.skyMat); this.sky.frustumCulled = false; scene.add(this.sky);
    // lights
    this.sun = new THREE.DirectionalLight(0xffffff, 1.5); this.sun.castShadow = true;
    const sc = this.sun.shadow.camera; sc.left = -14; sc.right = 14; sc.top = 10; sc.bottom = -70; sc.near = 1; sc.far = 120;
    this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.bias = -0.0008; this.sun.shadow.normalBias = 0.03; this.sun.shadow.radius = 3;
    this.sun.target.position.set(0, 0, -20); scene.add(this.sun); scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0x8899bb, 0x111118, 0.6); scene.add(this.hemi);
    this.neonA = new THREE.PointLight(0xff2a6d, 40, 30, 1.8); this.neonB = new THREE.PointLight(0x05d9e8, 40, 30, 1.8); scene.add(this.neonA, this.neonB);
    this.lampLights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffd9a0, 42, 24, 1.7); scene.add(l); return l; });
    // the squad's key light: warm, from behind the camera, so the black suits read as shoulders not silhouettes
    this.fill = new THREE.PointLight(0xffe2c0, 34, 30, 1.3); this.fill.position.set(2, 6, 6); scene.add(this.fill);
    scene.fog = new THREE.Fog(0x000000, 25, 150);
    // road + verge
    this.roadGeo = new THREE.PlaneGeometry(ROAD * 2 + 0.6, LOOP + 40, 1, 1).rotateX(-Math.PI / 2);
    this.roadMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.0, normalScale: new THREE.Vector2(0.8, 0.8) });
    this.road = new THREE.Mesh(this.roadGeo, this.roadMat); this.road.receiveShadow = true; this.road.position.z = -LOOP / 2 + 20; scene.add(this.road);
    this.vergeGeo = new THREE.PlaneGeometry(90, LOOP + 40, 1, 1).rotateX(-Math.PI / 2);
    this.vergeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, normalScale: new THREE.Vector2(1, 1) });
    this.verge = new THREE.Mesh(this.vergeGeo, this.vergeMat); this.verge.receiveShadow = true; this.verge.position.set(0, -0.03, -LOOP / 2 + 20); scene.add(this.verge);
    // curbs
    this.curb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, LOOP + 40), new THREE.MeshStandardMaterial({ color: 0x55565a, roughness: 0.9 })); this.curb.position.set(ROAD + 0.45, 0.07, -LOOP / 2 + 20); this.curb.receiveShadow = true; this.curb.castShadow = true;
    this.curb2 = this.curb.clone(); this.curb2.position.x = -ROAD - 0.45; scene.add(this.curb, this.curb2);
    // shared geometries/materials
    this.G = {
      box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10), cone: new THREE.CylinderGeometry(0.02, 0.5, 1, 8), sph: new THREE.SphereGeometry(0.5, 12, 8), plane: new THREE.PlaneGeometry(1, 1),
    };
    this.M = {
      metal: new THREE.MeshStandardMaterial({ color: 0x5a5e66, roughness: 0.55, metalness: 0.7 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x1c1d22, roughness: 0.8, metalness: 0.2 }),
      concrete: new THREE.MeshStandardMaterial({ color: 0x8a8a86, roughness: 0.95 }),
      rust: new THREE.MeshStandardMaterial({ color: 0x6a3a22, roughness: 0.85, metalness: 0.3 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 0.9 }),
      stone: new THREE.MeshStandardMaterial({ color: 0x6a5a48, roughness: 0.95 }),
      white: new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.8 }),
      bone: new THREE.MeshStandardMaterial({ color: 0xcfc6b0, roughness: 0.9 }),
      bulb: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd9a0, emissiveIntensity: 3.5, roughness: 0.4 }),
      flame: new THREE.MeshBasicMaterial({ color: 0xff9a40, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      glass: new THREE.MeshStandardMaterial({ color: 0x9ad0ff, roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.55 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xe8c576, roughness: 0.3, metalness: 0.9 }),
      cloth: new THREE.MeshStandardMaterial({ color: 0x8a2a2a, roughness: 1 }),
      sand: new THREE.MeshStandardMaterial({ color: 0xb08a55, roughness: 1 }),
    };
    this.car = this.carGeo();
    this.carMats = [0x3a3a40, 0x5a2a2a, 0x2a3a5a, 0x5a5a3a, 0x202024].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.4 }));
    this.envDone = false;
  }
  carGeo() {
    const g = new THREE.BufferGeometry();
    const parts = [];
    const add = (geo, m) => { const x = geo.toNonIndexed(); x.applyMatrix4(m); parts.push(x); };
    add(new THREE.BoxGeometry(1.9, 0.55, 4.2), new THREE.Matrix4().makeTranslation(0, 0.55, 0));
    add(new THREE.BoxGeometry(1.6, 0.5, 2.0), new THREE.Matrix4().makeTranslation(0, 1.05, 0.1));
    for (const [x, z] of [[0.95, 1.4], [-0.95, 1.4], [0.95, -1.4], [-0.95, -1.4]]) add(new THREE.CylinderGeometry(0.34, 0.34, 0.25, 10).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(x, 0.34, z));
    let n = 0; for (const p of parts) n += p.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
    for (const p of parts) { pos.set(p.attributes.position.array, o * 3); nor.set(p.attributes.normal.array, o * 3); o += p.attributes.position.count; }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    return g;
  }
  buildEnv() {
    // a small procedural environment for reflections (wet road, metals, glass)
    const pm = new THREE.PMREMGenerator(this.r);
    const es = new THREE.Scene();
    const pal = this.level.pal;
    es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 16, 8), new THREE.MeshBasicMaterial({ color: pal.sky[1], side: THREE.BackSide })));
    const n1 = new THREE.Mesh(new THREE.PlaneGeometry(30, 8), new THREE.MeshBasicMaterial({ color: pal.neon[0] })); n1.position.set(-20, 8, -10); n1.lookAt(0, 2, 0); es.add(n1);
    const n2 = new THREE.Mesh(new THREE.PlaneGeometry(30, 8), new THREE.MeshBasicMaterial({ color: pal.neon[1] })); n2.position.set(20, 8, -10); n2.lookAt(0, 2, 0); es.add(n2);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: pal.sky[0] })); top.position.set(0, 30, 0); top.lookAt(0, 0, 0); es.add(top);
    const gnd = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshBasicMaterial({ color: pal.verge })); gnd.rotation.x = -Math.PI / 2; gnd.position.y = -5; es.add(gnd);
    if (this.scene.environment) this.scene.environment.dispose();
    this.scene.environment = pm.fromScene(es, 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pm.dispose();
  }
  clearLevel() {
    for (const p of this.props) p.dispose(); this.props = [];
    for (const s of this.statics) { this.scene.remove(s); if (s.geometry) s.geometry.dispose(); } this.statics = [];
    for (const [, m] of this.gateMeshes) this.scene.remove(m); this.gateMeshes.clear();
    for (const [, m] of this.barrelMeshes) this.scene.remove(m); this.barrelMeshes.clear();
    for (const [, m] of this.hazardMeshes) this.scene.remove(m); this.hazardMeshes.clear();
    if (this.weather) { this.scene.remove(this.weather); this.weather = null; }
  }
  build(level) {
    this.clearLevel();
    this.level = level;
    const pal = level.pal;
    const rng = () => Math.random();
    // sky + fog + lights
    // below the horizon the dome is the fog colour, so fogged-out geometry dissolves into it seamlessly
    this.skyMat.uniforms.uZen.value.setHex(pal.sky[0]); this.skyMat.uniforms.uHor.value.setHex(pal.sky[1]); this.skyMat.uniforms.uGnd.value.setHex(pal.fog);
    this.skyMat.uniforms.uSunDir.value.set(pal.sun[2][0], pal.sun[2][1], pal.sun[2][2]); this.skyMat.uniforms.uSunCol.value.setHex(pal.sun[0]).multiplyScalar(0.5);
    const night = pal.sun[1] < 1.7 && pal.sky[0] < 0x202040;
    const tunnel = level.skyline === 'tunnel';
    this.skyMat.uniforms.uStars.value = night && !tunnel ? 1 : 0; this.skyMat.uniforms.uSunSize.value = night ? 0.6 : 1.6;
    if (tunnel) { this.skyMat.uniforms.uZen.value.setHex(0x050302); this.skyMat.uniforms.uHor.value.setHex(0x1a1008); }
    this.scene.fog.color.setHex(pal.fog); this.scene.fog.near = level.weather === 'sandstorm' ? 8 : 26; this.scene.fog.far = level.weather === 'sandstorm' ? 70 : level.skyline === 'tunnel' ? 90 : 300;
    // contrast: a stronger key (moon or sun) that throws real shadows, a modest hemisphere, a warm fill from the camera side
    this.sun.color.setHex(pal.sun[0]); this.sun.intensity = pal.sun[1] * (night ? 2.0 : 1.15); this.sun.position.set(pal.sun[2][0] * 40, pal.sun[2][1] * 40, pal.sun[2][2] * 40 - 20);
    this.hemi.color.setHex(pal.amb[0]); this.hemi.groundColor.setHex(pal.amb[1]); this.hemi.intensity = pal.amb[2] * (tunnel ? 1.9 : 1.1);
    if (tunnel) { this.hemi.color.setHex(0x8a5a30); this.hemi.groundColor.setHex(0x2a1608); }
    this.fill.color.setHex(night ? 0xffe2c0 : 0xfff4e0); this.fill.intensity = night ? 26 : 9;
    this.neonA.color.setHex(pal.neon[0]); this.neonB.color.setHex(pal.neon[1]);
    this.neonA.intensity = this.neonB.intensity = night ? 45 : 12;
    // road surface
    const kind = level.gimmick === 'stairs' ? 'stairs' : (level.key === 'catacombs' || level.key === 'souk') ? 'cobble' : level.key === 'desert' ? 'sand' : 'asphalt';
    const rt = roadTextures(pal, kind);
    for (const k of ['map', 'normalMap', 'roughnessMap']) { if (this.roadMat[k]) this.roadMat[k].dispose(); this.roadMat[k] = rt[k]; }
    const tilesAlong = (LOOP + 40) / 14;
    rt.map.repeat.set(1, tilesAlong); rt.normalMap.repeat.set(1, tilesAlong); rt.roughnessMap.repeat.set(1, tilesAlong);
    this.roadMat.roughness = level.weather === 'rain' ? 0.35 : 0.8;
    this.roadMat.needsUpdate = true;
    const vt = vergeTextures(pal);
    for (const k of ['map', 'normalMap']) { if (this.vergeMat[k]) this.vergeMat[k].dispose(); this.vergeMat[k] = vt[k]; }
    vt.map.repeat.set(12, (LOOP + 40) / 8); vt.normalMap.repeat.set(12, (LOOP + 40) / 8);
    this.vergeMat.roughness = level.weather === 'rain' ? 0.6 : 1; this.vergeMat.needsUpdate = true;
    this.curb.visible = this.curb2.visible = !(level.key === 'desert' || level.key === 'catacombs');
    this.buildEnv();
    // sets
    const set = new Set(level.set);
    const side = () => rng() < 0.5 ? -1 : 1;
    const spread = (n, zmin, zmax) => { const out = []; for (let i = 0; i < n; i++) out.push(zmin + (zmax - zmin) * (i + rng() * 0.8) / n); return out; };
    const items = (n, fn) => spread(n, AHEAD, BEHIND).map((z, i) => Object.assign({ z, s: 1 }, fn(i, z)));
    const B = this.G.box, C = this.G.cyl, SPH = this.G.sph, M = this.M;
    if (['city', 'hotel', 'club', 'osaka', 'paris', 'industrial', 'souk'].includes(level.skyline)) this.buildCity(level, rng, side, items);
    if (set.has('lamp')) {
      this.props.push(new Prop(this.scene, [
        { geo: C, mat: M.metal, off: [0, 3.2, 0], shadow: true }, { geo: B, mat: M.metal, off: [0, 6.1, 0] }, { geo: B, mat: M.bulb, off: [0, 6.05, -1.5] },
      ], items(14, () => { const sd = side(); return { x: sd * (ROAD + 0.9), ry: sd > 0 ? Math.PI / 2 : -Math.PI / 2, s: 1, sx: 1, sy: 1, sz: 1 }; })));
      // fix per-part scaling: pole thin/tall, arm, head
      const lp = this.props[this.props.length - 1];
      lp.parts[0].mesh.geometry = new THREE.CylinderGeometry(0.07, 0.11, 6.4, 8); lp.parts[1].mesh.geometry = new THREE.BoxGeometry(0.12, 0.12, 2.2).translate(0, 0, -1.0); lp.parts[2].mesh.geometry = new THREE.BoxGeometry(0.5, 0.22, 0.9);
      lp.sync(); this.lampProp = lp;
    }
    if (set.has('wreck') || set.has('carcass')) {
      this.props.push(new Prop(this.scene, [{ geo: this.car, mat: this.carMats[Math.floor(rng() * 5)], shadow: true }], items(7, () => { const sd = side(); return { x: sd * (ROAD + 2.2 + rng() * 2.5), ry: rng() * 6.283, s: 1, y: 0 }; })));
      this.props.push(new Prop(this.scene, [{ geo: this.car, mat: this.carMats[(1 + Math.floor(rng() * 4)) % 5], shadow: true }], items(5, () => { const sd = side(); return { x: sd * (ROAD + 1.4), ry: (rng() - 0.5) * 0.6 + (sd > 0 ? 0 : Math.PI), s: 1, y: 0 }; })));
    }
    if (set.has('barrier') || set.has('rail') || set.has('balustrade') || set.has('velvet') || set.has('bollard')) {
      const geo = set.has('velvet') ? new THREE.CylinderGeometry(0.05, 0.05, 1, 6) : set.has('balustrade') ? new THREE.BoxGeometry(0.25, 1.0, 0.25) : set.has('bollard') ? new THREE.CylinderGeometry(0.14, 0.16, 0.9, 8) : new THREE.BoxGeometry(0.5, 0.8, 2.0);
      const mat = set.has('velvet') ? M.gold : set.has('balustrade') ? M.white : set.has('bollard') ? M.metal : M.concrete;
      const step = set.has('barrier') ? 2.1 : 3.5;
      const n = Math.floor(LOOP / step) * 2;
      const its = []; for (let i = 0; i < n; i++) { const sd = i % 2 ? 1 : -1; its.push({ x: sd * (ROAD + 0.95), z: AHEAD + Math.floor(i / 2) * step, y: set.has('bollard') ? 0.45 : set.has('balustrade') ? 0.5 : set.has('velvet') ? 0.5 : 0.4, s: 1, ry: 0 }); }
      this.props.push(new Prop(this.scene, [{ geo, mat, shadow: true }], its));
    }
    if (set.has('gantry') || set.has('arch') || set.has('torii')) {
      const col = set.has('torii') ? new THREE.MeshStandardMaterial({ color: 0xc0302a, roughness: 0.7 }) : set.has('arch') ? M.stone : M.metal;
      const h = set.has('torii') ? 7 : set.has('arch') ? 9 : 6.5;
      this.props.push(new Prop(this.scene, [
        { geo: B, mat: col, off: [-(ROAD + 1.2), h / 2, 0], shadow: true }, { geo: B, mat: col, off: [ROAD + 1.2, h / 2, 0], shadow: true }, { geo: B, mat: col, off: [0, h, 0], shadow: true },
      ], items(set.has('arch') ? 3 : 4, () => ({ x: 0, s: 1, ry: 0 }))));
      const gp = this.props[this.props.length - 1];
      gp.parts[0].mesh.geometry = gp.parts[1].mesh.geometry = new THREE.BoxGeometry(set.has('arch') ? 1.6 : 0.35, h, set.has('arch') ? 1.6 : 0.35);
      gp.parts[2].mesh.geometry = new THREE.BoxGeometry(ROAD * 2 + 3.2, set.has('torii') ? 0.5 : 0.7, set.has('arch') ? 1.6 : 0.5);
      gp.sync();
      if (set.has('gantry')) { const sign = textPlane(['EXIT 13 · THE BOWERY', 'CONTINENTAL →', 'NO BUSINESS', '$WICK ONLY', 'HIGH TABLE'][Math.floor(rng() * 5)], '#' + pal.accent.toString(16).padStart(6, '0'), 5.5, 1.4, '700 70px "Barlow Condensed", Arial', true); this.gantrySign = sign; sign.position.set(0, h - 1.2, 0); this.scene.add(sign); this.statics.push(sign); }
    }
    if (set.has('neon') || set.has('sign') || set.has('awning')) {
      const words = { bowery: ['BOWERY KING', 'PIGEONS', '$WICK', 'NO VACANCY'], continental: ['CONTINENTAL', 'CONCIERGE', 'ROOMS', 'NO BUSINESS'], redcircle: ['RED CIRCLE', 'BATHHOUSE', 'VIP', 'ОТКРЫТО'], osaka: ['大阪', 'CONTINENTAL', '刀', 'ネオン'], berlin: ['KILLA', 'CLUB', 'TECHNO', 'EXIT'], paris: ['ARC', 'CAFÉ', 'MÉTRO', '$WICK'], souk: ['SOUK', 'بازار', 'TEA', 'GOLD'], catacombs: ['MORS', 'ROMA', 'VIA', 'AVE'], desert: ['ELDER', 'WATER', 'LAST STOP', 'OASIS'], sacrecoeur: ['SACRÉ', 'CŒUR', 'DAWN', 'FIN'] }[level.key] || ['$WICK', 'WICK ARSENAL', 'HIGH TABLE', 'BABA YAGA'];
      for (let i = 0; i < 10; i++) {
        const sd = side(); const col = '#' + pal.neon[i % 2].toString(16).padStart(6, '0');
        const sign = textPlane(words[i % words.length], col, 7, 1.8, '700 86px "Black Ops One", Impact, sans-serif', true);
        sign.position.set(sd * (ROAD + 5.2), 4 + rng() * 6, AHEAD + i * (LOOP / 10) + rng() * 8); sign.rotation.y = sd > 0 ? -Math.PI / 2 : Math.PI / 2;
        sign.userData.scroll = true; this.scene.add(sign); this.statics.push(sign);
      }
    }
    if (set.has('pillar')) {
      this.props.push(new Prop(this.scene, [{ geo: new THREE.CylinderGeometry(0.45, 0.55, 7, 10), mat: M.stone, off: [0, 3.5, 0], shadow: true }, { geo: new THREE.BoxGeometry(1.4, 0.4, 1.4), mat: M.stone, off: [0, 7, 0] }], items(22, i => ({ x: (i % 2 ? 1 : -1) * (ROAD + 0.9), s: 1, ry: 0 }))));
    }
    if (set.has('torch') || set.has('candles') || set.has('lantern')) {
      this.props.push(new Prop(this.scene, [{ geo: new THREE.CylinderGeometry(0.05, 0.07, 1.6, 6), mat: M.wood, off: [0, 1.2, 0] }, { geo: SPH, mat: M.flame, off: [0, 2.15, 0] }], items(16, () => { const sd = side(); return { x: sd * (ROAD + 0.7), s: 1, sx: 1, sy: 1, sz: 1, ry: 0 }; })));
      const tp = this.props[this.props.length - 1]; tp.parts[1].mesh.geometry = new THREE.SphereGeometry(0.28, 8, 6); tp.sync(); this.torchProp = tp;
    }
    if (set.has('tree')) {
      this.props.push(new Prop(this.scene, [{ geo: new THREE.CylinderGeometry(0.12, 0.22, 3.2, 7), mat: M.wood, off: [0, 1.6, 0], shadow: true }, { geo: new THREE.SphereGeometry(1.6, 9, 7), mat: new THREE.MeshStandardMaterial({ color: 0x1e3a22, roughness: 1 }), off: [0, 4.0, 0], shadow: true }], items(12, () => { const sd = side(); return { x: sd * (ROAD + 2.2 + rng() * 3), s: 0.8 + rng() * 0.6, ry: 0 }; })));
    }
    if (set.has('pylon')) {
      this.props.push(new Prop(this.scene, [{ geo: new THREE.CylinderGeometry(0.25, 1.1, 18, 4), mat: M.rust, off: [0, 9, 0], shadow: true }, { geo: new THREE.BoxGeometry(6, 0.25, 0.25), mat: M.rust, off: [0, 14, 0] }, { geo: new THREE.BoxGeometry(4, 0.25, 0.25), mat: M.rust, off: [0, 16.5, 0] }], items(6, () => { const sd = side(); return { x: sd * (ROAD + 9 + rng() * 6), s: 1, ry: 0 }; })));
    }
    if (set.has('dune')) {
      this.props.push(new Prop(this.scene, [{ geo: SPH, mat: M.sand, shadow: false }], items(14, () => { const sd = side(); const w = 14 + rng() * 26; return { x: sd * (ROAD + 6 + rng() * 30), y: -w * 0.42, sx: w, sy: w * 0.5, sz: w * 1.4, s: 1, ry: 0 }; })));
    }
    if (set.has('tank') || set.has('pipes') || set.has('conveyor')) {
      this.props.push(new Prop(this.scene, [{ geo: new THREE.CylinderGeometry(2.4, 2.4, 6, 14), mat: M.metal, off: [0, 3, 0], shadow: true }, { geo: new THREE.CylinderGeometry(0.3, 0.3, 14, 8).rotateX(Math.PI / 2), mat: M.rust, off: [0, 5.5, 0] }], items(8, () => { const sd = side(); return { x: sd * (ROAD + 5 + rng() * 4), s: 1, ry: 0 }; })));
    }
    if (set.has('stall') || set.has('tent') || set.has('crates') || set.has('kiosk') || set.has('cart') || set.has('dumpster') || set.has('planter') || set.has('sarcophagus')) {
      const cloth = set.has('stall') || set.has('tent'); const mat = cloth ? new THREE.MeshStandardMaterial({ color: pal.accent, roughness: 1 }) : set.has('sarcophagus') ? M.stone : set.has('planter') ? M.concrete : M.rust;
      this.props.push(new Prop(this.scene, [{ geo: B, mat: cloth ? M.wood : mat, off: [0, 0.6, 0], shadow: true }, { geo: B, mat: mat, off: [0, cloth ? 2.3 : 0.6, 0], shadow: true }], items(14, () => { const sd = side(); return { x: sd * (ROAD + 1.3 + rng() * 2), s: 1, sx: 1.2 + rng() * 1.6, sy: cloth ? 1.2 : 0.8 + rng() * 1.0, sz: 1.2 + rng() * 1.6, ry: (rng() - 0.5) * 0.4 }; })));
      if (cloth) { const sp = this.props[this.props.length - 1]; sp.parts[1].mesh.geometry = new THREE.BoxGeometry(2.4, 0.12, 2.4); sp.parts[0].mesh.geometry = new THREE.BoxGeometry(1.6, 1.2, 1.6); sp.sync(); }
    }
    if (set.has('bones') || set.has('rubble') || set.has('drums')) {
      this.props.push(new Prop(this.scene, [{ geo: new THREE.DodecahedronGeometry(0.5, 0), mat: set.has('bones') ? M.bone : M.concrete, off: [0, 0.3, 0], shadow: true }], items(30, () => { const sd = side(); return { x: sd * (ROAD + 0.8 + rng() * 3.5), s: 0.4 + rng() * 0.9, ry: rng() * 6 }; })));
    }
    if (set.has('statue')) {
      this.props.push(new Prop(this.scene, [{ geo: B, mat: M.white, off: [0, 0.8, 0], shadow: true }, { geo: SPH, mat: M.white, off: [0, 2.4, 0], shadow: true }, { geo: B, mat: M.white, off: [0, 1.75, 0], shadow: true }], items(6, () => { const sd = side(); return { x: sd * (ROAD + 2.5), s: 1, ry: 0 }; })));
      const st = this.props[this.props.length - 1]; st.parts[0].mesh.geometry = new THREE.BoxGeometry(1.2, 1.6, 1.2); st.parts[1].mesh.geometry = new THREE.SphereGeometry(0.4, 10, 8); st.parts[2].mesh.geometry = new THREE.BoxGeometry(0.9, 0.9, 0.5); st.sync();
    }
    if (set.has('glass')) {
      this.props.push(new Prop(this.scene, [{ geo: B, mat: M.glass, off: [0, 2, 0] }], items(10, () => { const sd = side(); return { x: sd * (ROAD + 1.6), s: 1, sx: 0.1, sy: 4, sz: 6, ry: 0 }; })));
    }
    if (set.has('steam') || set.has('hydrant')) {
      this.props.push(new Prop(this.scene, [{ geo: new THREE.CylinderGeometry(0.16, 0.2, 0.9, 8), mat: new THREE.MeshStandardMaterial({ color: 0xa02a2a, roughness: 0.6, metalness: 0.4 }), off: [0, 0.45, 0], shadow: true }], items(8, () => { const sd = side(); return { x: sd * (ROAD + 0.75), s: 1, ry: 0 }; })));
    }
    // skyline
    this.buildSkyline(level, rng);
    // weather
    this.buildWeather(level);
    // tunnel: ceiling + walls scroll with props
    if (level.skyline === 'tunnel') {
      const wallMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1, map: vergeTextures({ verge: 0x6a5240 }).map });
      wallMat.map.repeat.set(8, 2);
      for (const sd of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(1, 9, LOOP + 40), wallMat); w.position.set(sd * (ROAD + 2.2), 4.5, -LOOP / 2 + 20); w.receiveShadow = true; this.scene.add(w); this.statics.push(w); }
      const ceil = new THREE.Mesh(new THREE.BoxGeometry(ROAD * 2 + 5.4, 1, LOOP + 40), wallMat); ceil.position.set(0, 9.5, -LOOP / 2 + 20); this.scene.add(ceil); this.statics.push(ceil);
    }
  }
  // ---------- the city blocks: facades by style, rooftops, fire escapes, storefronts, cables, manholes ----------
  buildCity(level, rng, side, items) {
    const pal = level.pal, kind = level.skyline, M = this.M, B = this.G.box;
    const styles = { city: ['brick', 'brick', 'stone', 'glass'], hotel: ['stone', 'stone', 'brick', 'glass'], club: ['brick', 'concrete', 'glass', 'brick'], osaka: ['glass', 'glass', 'concrete', 'brick'], paris: ['stone', 'stone', 'stone', 'brick'], industrial: ['concrete', 'concrete', 'brick', 'glass'], souk: ['stone', 'concrete', 'stone', 'stone'] }[kind] || ['brick', 'stone', 'glass', 'concrete'];
    const low = kind === 'souk';
    const roofCol = new THREE.Color(pal.bld).multiplyScalar(0.55).getHex();
    const texCache = {};
    const ft = st => texCache[st] || (texCache[st] = facadeTextures(pal, st, st === 'glass' ? 6 : st === 'stone' ? 3 : 4, st === 'glass' ? 14 : st === 'stone' ? 7 : 10, true));
    // near rank: one Prop per style so each keeps its own window scale; per-building rooftop furniture + escapes + storefront glow ride as free-form parts
    const near = [];
    styles.slice(0, 3).forEach((st, si) => {
      const mats = buildingMaterial(ft(st), 1, 1, roofCol);
      const glow = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: pal.win, emissiveIntensity: 1.8, roughness: 0.6 });
      const awn = new THREE.MeshStandardMaterial({ color: si === 0 ? pal.accent : si === 1 ? 0x2a2a30 : pal.neon[1], roughness: 1 });
      const list = items(low ? 10 : 9, () => {
        const w = st === 'glass' ? 9 + rng() * 6 : 6 + rng() * 6;
        const d = 7 + rng() * 8;
        const h = low ? 4 + rng() * 4 : st === 'glass' ? 18 + rng() * 26 : st === 'stone' ? 10 + rng() * 10 : 9 + rng() * 14;
        const sd = side();
        return { x: sd * (ROAD + 4.4 + w / 2 + rng() * 2.5), y: h / 2, sx: w, sy: h, sz: d, s: 1, ry: 0, sd, w, h, d, tower: rng() < (st === 'brick' ? 0.45 : 0.1), ac: rng() < 0.7, ant: rng() < 0.35, esc: st === 'brick' && rng() < 0.75, shop: rng() < 0.85 };
      });
      // texture repeat follows building size so windows stay the same size
      mats[0].map.repeat.set(1, 1);
      const parts = [{ geo: B, mat: mats, shadow: true }];
      // water tower: tank + cone + legs
      parts.push({ geo: new THREE.CylinderGeometry(1.1, 1.0, 2.2, 10), mat: M.wood, shadow: true, place: (it, p, s) => { if (!it.tower) return false; p.set(it.x + it.sd * 0.5, it.h + 2.9, it.z - it.d * 0.2); } });
      parts.push({ geo: new THREE.CylinderGeometry(0.05, 1.15, 0.8, 10), mat: M.dark, place: (it, p, s) => { if (!it.tower) return false; p.set(it.x + it.sd * 0.5, it.h + 4.4, it.z - it.d * 0.2); } });
      parts.push({ geo: new THREE.BoxGeometry(2.0, 1.8, 2.0), mat: M.rust, place: (it, p, s) => { if (!it.tower) return false; p.set(it.x + it.sd * 0.5, it.h + 0.9, it.z - it.d * 0.2); s.set(0.9, 1, 0.9); } });
      // AC units + antenna
      parts.push({ geo: new THREE.BoxGeometry(1.2, 0.9, 1.2), mat: M.metal, place: (it, p, s) => { if (!it.ac) return false; p.set(it.x - it.sd * it.w * 0.25, it.h + 0.45, it.z + it.d * 0.25); } });
      parts.push({ geo: new THREE.CylinderGeometry(0.04, 0.06, 4, 5), mat: M.dark, place: (it, p, s) => { if (!it.ant) return false; p.set(it.x + it.sd * it.w * 0.3, it.h + 2, it.z + it.d * 0.3); } });
      // roof parapet
      parts.push({ geo: new THREE.BoxGeometry(1, 0.5, 1), mat: M.concrete, place: (it, p, s) => { p.set(it.x, it.h + 0.2, it.z); s.set(it.w + 0.3, 1, it.d + 0.3); } });
      // fire escape on the road face: frame + three landings
      const face = it => it.x - it.sd * (it.w / 2 + 0.55);
      parts.push({ geo: new THREE.BoxGeometry(0.08, 1, 2.6), mat: M.dark, place: (it, p, s) => { if (!it.esc) return false; p.set(face(it) + it.sd * 0.5, it.h * 0.55, it.z); s.set(1, it.h * 0.75, 1); } });
      parts.push({ geo: new THREE.BoxGeometry(0.08, 1, 2.6), mat: M.dark, place: (it, p, s) => { if (!it.esc) return false; p.set(face(it) - it.sd * 0.5, it.h * 0.55, it.z); s.set(1, it.h * 0.75, 1); } });
      for (let k = 0; k < 3; k++) parts.push({ geo: new THREE.BoxGeometry(1.1, 0.08, 2.6), mat: M.metal, place: (it, p, s) => { if (!it.esc) return false; p.set(face(it), it.h * (0.3 + k * 0.2), it.z); } });
      // storefront: lit shop band + awning
      parts.push({ geo: new THREE.PlaneGeometry(1, 2.6), mat: glow, place: (it, p, s, e) => { if (!it.shop || low) return false; p.set(it.x - it.sd * (it.w / 2 + 0.03), 1.5, it.z); s.set(it.d * 0.8, 1, 1); e.set(0, it.sd > 0 ? -Math.PI / 2 : Math.PI / 2, 0); } });
      parts.push({ geo: new THREE.BoxGeometry(1.4, 0.12, 1), mat: awn, shadow: true, place: (it, p, s, e) => { if (!it.shop || low) return false; p.set(it.x - it.sd * (it.w / 2 + 0.7), 3.1, it.z); s.set(1, 1, it.d * 0.7); e.set(0, 0, it.sd * 0.25); } });
      const prop = new Prop(this.scene, parts, list);
      this.props.push(prop); near.push(prop);
    });
    // far rank: taller, no furniture
    {
      const st = styles[3]; const mats = buildingMaterial(ft(st), 2, 2, roofCol);
      this.props.push(new Prop(this.scene, [{ geo: B, mat: mats, shadow: false }], items(20, () => { const h = low ? 6 + rng() * 6 : 16 + rng() * 44; const w = 10 + rng() * 14; return { x: side() * (ROAD + 19 + rng() * 22), y: h / 2, sx: w, sy: h, sz: 12 + rng() * 14, s: 1, ry: 0 }; })));
    }
    // cables across the street (catenary in five segments) for the dense cities
    if (['city', 'club', 'osaka', 'paris'].includes(kind)) {
      const W = (ROAD + 5) * 2, segs = 5, parts = [];
      for (let k = 0; k < segs; k++) parts.push({ geo: new THREE.BoxGeometry(1, 0.035, 0.035), mat: M.dark, place: (it, p, s, e) => { const x0 = -W / 2 + (k / segs) * W, x1 = -W / 2 + ((k + 1) / segs) * W; const sag = x => 1.1 * (1 - Math.pow(x / (W / 2), 2)); const y0 = it.h - sag(x0), y1 = it.h - sag(x1); p.set((x0 + x1) / 2, (y0 + y1) / 2, it.z); s.set(Math.hypot(x1 - x0, y1 - y0), 1, 1); e.set(0, 0, Math.atan2(y1 - y0, x1 - x0)); } });
      this.props.push(new Prop(this.scene, parts, items(6, () => ({ x: 0, s: 1, ry: 0, h: 7.5 + rng() * 2.5 }))));
    }
    // manholes + drains in the lanes
    if (kind !== 'souk') this.props.push(new Prop(this.scene, [{ geo: new THREE.CylinderGeometry(0.42, 0.42, 0.03, 14), mat: new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.6, metalness: 0.7 }), place: (it, p, s) => { p.set(it.x, 0.015, it.z); } }], items(8, () => ({ x: (rng() < 0.5 ? -1 : 1) * (0.6 + rng() * 1.6), s: 1, ry: 0 }))));
  }
  buildSkyline(level, rng) {
    const pal = level.pal; const kind = level.skyline;
    const add = m => { this.scene.add(m); this.statics.push(m); return m; };
    if (['city', 'hotel', 'club', 'osaka', 'paris', 'industrial', 'souk'].includes(kind)) {
      const ft = facadeTextures(pal, kind === 'osaka' ? 'glass' : 'brick', 6, 16, false);
      const fm = new THREE.MeshStandardMaterial({ map: ft.map, emissiveMap: ft.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.9 });
      const n = 48; const im = new THREE.InstancedMesh(this.G.box, fm, n); im.frustumCulled = false;
      const m = new THREE.Matrix4();
      for (let i = 0; i < n; i++) {
        const x = (rng() * 2 - 1) * 160, z = -140 - rng() * 120 - Math.abs(x) * 0.3, h = (kind === 'souk' ? 8 : 25) + rng() * (kind === 'osaka' ? 110 : kind === 'souk' ? 10 : 80), w = 14 + rng() * 24;
        m.compose(new THREE.Vector3(x, h / 2 - 2, z), new THREE.Quaternion(), new THREE.Vector3(w, h, 14 + rng() * 20)); im.setMatrixAt(i, m);
      }
      add(im);
      if (kind === 'industrial') { for (let i = 0; i < 6; i++) { const st = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3.5, 60, 10), this.M.concrete); st.position.set((rng() * 2 - 1) * 120, 28, -160 - rng() * 60); add(st); } }
      if (kind === 'paris') { const arc = new THREE.Group(); const mat = this.M.white; const l = new THREE.Mesh(new THREE.BoxGeometry(14, 44, 14), mat); l.position.x = -16; const r = l.clone(); r.position.x = 16; const top = new THREE.Mesh(new THREE.BoxGeometry(46, 14, 14), mat); top.position.y = 22; arc.add(l, r, top); arc.position.set(0, 20, -220); add(arc); }
    }
    if (kind === 'basilica') {
      const g = new THREE.Group(); const mat = new THREE.MeshStandardMaterial({ color: 0xe8e2d8, roughness: 0.7 });
      const base = new THREE.Mesh(new THREE.BoxGeometry(60, 30, 30), mat); base.position.y = 15; g.add(base);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(16, 20, 12), mat); dome.position.y = 42; g.add(dome);
      for (const x of [-22, 22]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(5, 6, 44, 12), mat); t.position.set(x, 22, 0); g.add(t); const c = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 8), mat); c.position.set(x, 46, 0); g.add(c); }
      g.position.set(0, 10, -210); add(g);
      const hill = new THREE.Mesh(new THREE.SphereGeometry(120, 24, 12), new THREE.MeshStandardMaterial({ color: 0x3a3a46, roughness: 1 })); hill.position.set(0, -100, -230); hill.scale.set(2.2, 1, 1); add(hill);
    }
    if (kind === 'dunes') { for (let i = 0; i < 10; i++) { const d = new THREE.Mesh(this.G.sph, this.M.sand); const w = 60 + rng() * 120; d.position.set((rng() * 2 - 1) * 200, -w * 0.35, -150 - rng() * 150); d.scale.set(w, w * 0.45, w); add(d); } }
    // moon / sun disc is in the sky shader; the "mothership"-style far glow for club
  }
  buildWeather(level) {
    const w = level.weather; if (!w || w === 'none') return;
    const g = new THREE.Group();
    if (w === 'rain') {
      const n = 900; const pos = new Float32Array(n * 6); const vel = [];
      for (let i = 0; i < n; i++) { const x = (Math.random() * 2 - 1) * 16, y = Math.random() * 16, z = -60 + Math.random() * 70; pos.set([x, y, z, x + 0.05, y - 0.7, z], i * 6); vel.push(15 + Math.random() * 6); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x9ab0d0, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }));
      lines.frustumCulled = false; lines.userData = { kind: 'rain', vel }; g.add(lines);
    } else {
      const n = w === 'sandstorm' ? 1400 : w === 'sand' ? 500 : 400;
      const pos = new Float32Array(n * 3); const vel = [];
      for (let i = 0; i < n; i++) { pos.set([(Math.random() * 2 - 1) * 20, Math.random() * 12, -70 + Math.random() * 80], i * 3); vel.push([(Math.random() - 0.5) * 1.5, w === 'embers' ? 0.6 + Math.random() : -(0.3 + Math.random() * 0.8), 0]); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const col = { petals: 0xff9ac8, embers: 0xff8a30, sand: 0xd8b070, sandstorm: 0xc8a060, dust: 0xa08a70, steam: 0xe0e8f0 }[w] || 0xffffff;
      const size = w === 'steam' ? 1.2 : w === 'sandstorm' ? 0.5 : w === 'dust' ? 0.12 : 0.22;
      const c = document.createElement('canvas'); c.width = c.height = 32; const cg = c.getContext('2d'); const rg = cg.createRadialGradient(16, 16, 0, 16, 16, 16); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); cg.fillStyle = rg; cg.fillRect(0, 0, 32, 32);
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: col, size, map: new THREE.CanvasTexture(c), transparent: true, opacity: w === 'steam' ? 0.09 : w === 'dust' ? 0.5 : 0.8, depthWrite: false, blending: w === 'embers' ? THREE.AdditiveBlending : THREE.NormalBlending }));
      pts.frustumCulled = false; pts.userData = { kind: w, vel }; g.add(pts);
    }
    this.scene.add(g); this.weather = g;
  }
  // ---------- live objects from the sim ----------
  gateLabel(side) { return (side.op === 'x' ? '×' : side.op === '/' ? '÷' : side.op === '-' ? '−' : '+') + side.n; }
  syncGates(sim) {
    const seen = new Set();
    for (const g of sim.gates) {
      seen.add(g.id);
      let m = this.gateMeshes.get(g.id);
      if (!m) {
        m = new THREE.Group();
        for (const [sd, sideDef] of [[-1, g.left], [1, g.right]]) {
          const good = sideDef.op === '+' || sideDef.op === 'x';
          const col = good ? 0x3cff8a : 0xff3b5c;
          const panel = new THREE.Mesh(new THREE.PlaneGeometry(ROAD - 0.25, 2.6), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
          panel.position.set(sd * ROAD / 2, 1.5, 0); m.add(panel);
          const frame = new THREE.Mesh(new THREE.BoxGeometry(ROAD - 0.2, 2.7, 0.06), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }));
          frame.position.set(sd * ROAD / 2, 1.5, 0); m.add(frame);
          const bar = new THREE.Mesh(new THREE.BoxGeometry(ROAD - 0.2, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: col, toneMapped: false })); bar.position.set(sd * ROAD / 2, 2.85, 0); m.add(bar);
          const bar2 = bar.clone(); bar2.position.y = 0.12; m.add(bar2);
          const label = textPlane(this.gateLabel(sideDef), good ? '#9bffc4' : '#ff8fa3', 2.6, 0.8, '700 96px "Black Ops One", Impact, sans-serif', true); label.position.set(sd * ROAD / 2, 1.55, 0.06); m.add(label);
        }
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 8), this.M.metal); post.position.set(0, 1.5, 0); m.add(post);
        this.scene.add(m); this.gateMeshes.set(g.id, m);
      }
      m.position.z = -g.z; m.visible = !g.done;
    }
    for (const [id, m] of this.gateMeshes) if (!seen.has(id)) { this.scene.remove(m); this.gateMeshes.delete(id); }
  }
  syncBarrels(sim) {
    const seen = new Set();
    for (const b of sim.barrels) {
      seen.add(b.id);
      let m = this.barrelMeshes.get(b.id);
      if (!m) {
        m = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 14), new THREE.MeshStandardMaterial({ color: 0xa82a2a, roughness: 0.5, metalness: 0.5 })); body.position.y = 0.55; body.castShadow = true; m.add(body);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.16, 14), new THREE.MeshStandardMaterial({ color: 0xe8e8e0, roughness: 0.5 })); band.position.y = 0.55; m.add(band);
        const lab = textPlane('+' + b.n, '#ffffff', 1.3, 0.5, '700 100px "Black Ops One", Impact, sans-serif', true); lab.position.set(0, 1.45, 0); m.add(lab); m.userData.label = lab;
        this.scene.add(m); this.barrelMeshes.set(b.id, m);
      }
      m.position.set(b.x * ROAD, 0, -b.z);
      m.userData.label.lookAt(this.cam ? this.cam.position : new THREE.Vector3(0, 6, 10));
      m.children[0].material.emissive.setHex(b.hp < b.maxhp ? 0x331010 : 0x000000);
    }
    for (const [id, m] of this.barrelMeshes) if (!seen.has(id)) { this.scene.remove(m); this.barrelMeshes.delete(id); }
  }
  syncHazards(sim) {
    const seen = new Set();
    for (const h of sim.hazards) {
      seen.add(h);
      let m = this.hazardMeshes.get(h);
      const kind = h.kind;
      if (!m || m.userData.kind !== kind) {
        if (m) this.scene.remove(m);
        if (kind === 'acid' || kind === 'fire') { m = new THREE.Mesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: kind === 'acid' ? 0x4aff40 : 0xff7a20, emissive: kind === 'acid' ? 0x3aff30 : 0xff5a10, emissiveIntensity: 1.4, transparent: true, opacity: 0.85, roughness: 0.2 })); m.position.y = 0.03; }
        else if (kind === 'quake') { m = new THREE.Mesh(new THREE.RingGeometry(0.4, 1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })); m.position.y = 0.05; }
        else if (kind === 'glob') { m = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshStandardMaterial({ color: h.fire ? 0xff7a20 : 0x6aff40, emissive: h.fire ? 0xff4a10 : 0x3aff30, emissiveIntensity: 1.5, roughness: 0.3 })); }
        else if (kind === 'cleaver' || kind === 'blade') { m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.9), new THREE.MeshStandardMaterial({ color: kind === 'blade' ? 0xff5c5c : 0xd0d8e0, emissive: kind === 'blade' ? 0xff2030 : 0x202020, emissiveIntensity: 1, metalness: 0.8, roughness: 0.3 })); m.position.y = 1.0; }
        else if (kind === 'block') { m = new THREE.Mesh(h.what === 'pillars' ? new THREE.CylinderGeometry(0.5, 0.6, 3, 10) : new THREE.BoxGeometry(1.6, 1.0, 1.0), h.what === 'pillars' ? this.M.stone : h.what === 'stalls' ? new THREE.MeshStandardMaterial({ color: this.level.pal.accent, roughness: 1 }) : this.M.concrete); m.position.y = h.what === 'pillars' ? 1.5 : 0.5; m.castShadow = true; }
        else if (kind === 'car') { m = new THREE.Mesh(this.car, this.carMats[Math.floor(Math.random() * 5)]); m.castShadow = true; }
        else continue;
        m.userData.kind = kind; this.scene.add(m); this.hazardMeshes.set(h, m);
      }
      if (kind === 'glob') { const f = Math.min(1, h.t / h.T); const x = h.x + (h.tx - h.x) * f, z = h.z + (h.tz - h.z) * f; m.position.set(x * ROAD, 1.2 + Math.sin(f * Math.PI) * 4, -z); }
      else if (kind === 'acid' || kind === 'fire') { m.position.set(h.x * ROAD, 0.03, -h.z); const s = h.r * ROAD * (h.ttl < 0.6 ? h.ttl / 0.6 : 1); m.scale.set(s, 1, s); }
      else if (kind === 'quake') { m.position.set(h.x * ROAD, 0.05, -h.z); const s = h.r * ROAD * (2.2 - h.ttl / 1.6); m.scale.set(s, 1, s); }
      else if (kind === 'cleaver' || kind === 'blade') { m.position.set(h.x * ROAD, 1.0, -h.z); m.rotation.x += 0.4; }
      else if (kind === 'car') { m.position.set(h.x * ROAD, 0, -h.z); m.rotation.y = h.vx > 0 ? -Math.PI / 2 : Math.PI / 2; }
      else m.position.set(h.x * ROAD, m.position.y, -h.z);
    }
    for (const [h, m] of this.hazardMeshes) if (!seen.has(h)) { this.scene.remove(m); this.hazardMeshes.delete(h); }
  }
  update(dt, sim, camera) {
    this.cam = camera;
    this.time += dt;
    this.skyMat.uniforms.uTime.value = this.time;
    const scroll = sim ? sim.speed * dt : 0;
    const tileLen = 14;
    if (sim) {
      const off = (sim.dist / tileLen) % 1;
      this.roadMat.map.offset.y = -off; this.roadMat.normalMap.offset.y = -off; this.roadMat.roughnessMap.offset.y = -off;
      const voff = (sim.dist / 8) % 1; this.vergeMat.map.offset.y = -voff; this.vergeMat.normalMap.offset.y = -voff;
    }
    for (const p of this.props) p.scroll(scroll);
    for (const s of this.statics) if (s.userData.scroll) { s.position.z += scroll; if (s.position.z > BEHIND) s.position.z -= LOOP; }
    // neon lights slide along the road sides
    const t = this.time;
    this.fill.position.set((this.cam ? this.cam.position.x : 0) + 2.5, 6.5, 6.5);
    this.neonA.position.set(-ROAD - 3.5, 5, -((t * 9.5 * 1) % 60) + 10);
    this.neonB.position.set(ROAD + 3.5, 5, -(((t * 9.5) + 30) % 60) + 10);
    // lamp lights follow the 3 nearest lamps ahead
    if (this.lampProp) {
      const near = this.lampProp.items.filter(i => i.z < 6 && i.z > -70).sort((a, b) => b.z - a.z).slice(0, 3);
      this.lampLights.forEach((l, i) => { const it = near[i]; if (it) { l.visible = true; l.position.set(it.x + (it.x > 0 ? -1.4 : 1.4), 5.6, it.z); } else l.visible = false; });
    } else if (this.torchProp) {
      const near = this.torchProp.items.filter(i => i.z < 6 && i.z > -70).sort((a, b) => b.z - a.z).slice(0, 3);
      this.lampLights.forEach((l, i) => { const it = near[i]; if (it) { l.visible = true; l.color.setHex(0xff9a40); l.intensity = 90 + Math.random() * 24; l.distance = 30; l.position.set(it.x, 2.3, it.z); } else l.visible = false; });
    } else this.lampLights.forEach(l => l.visible = false);
    if (this.gantrySign) { /* the gantry sign rides the first gantry */ const gp = this.props.find(p => p.parts.length === 3 && p.items.length <= 4); if (gp) { const it = gp.items.slice().sort((a, b) => b.z - a.z).find(i => i.z < 0) || gp.items[0]; this.gantrySign.position.z = it.z + 0.3; } }
    // weather
    if (this.weather) {
      for (const obj of this.weather.children) {
        const pos = obj.geometry.attributes.position.array; const u = obj.userData;
        if (u.kind === 'rain') {
          for (let i = 0; i < u.vel.length; i++) { const o = i * 6; const dy = u.vel[i] * dt; pos[o + 1] -= dy; pos[o + 4] -= dy; pos[o + 2] += scroll; pos[o + 5] += scroll; if (pos[o + 1] < 0) { const ny = 14 + Math.random() * 4; pos[o + 1] = ny; pos[o + 4] = ny - 0.7; pos[o] = pos[o + 3] = (Math.random() * 2 - 1) * 16; pos[o + 2] = pos[o + 5] = -60 + Math.random() * 70; } }
        } else {
          const wind = u.kind === 'sandstorm' ? 9 : u.kind === 'sand' ? 3 : 0;
          for (let i = 0; i < u.vel.length; i++) { const o = i * 3; const v = u.vel[i]; pos[o] += (v[0] + wind) * dt; pos[o + 1] += v[1] * dt; pos[o + 2] += scroll * (u.kind === 'steam' ? 1 : 0.9); if (pos[o + 1] < 0 || pos[o + 1] > 14 || pos[o] > 22 || pos[o] < -22 || pos[o + 2] > 12) { pos[o] = (Math.random() * 2 - 1) * 20; pos[o + 1] = v[1] > 0 ? 0.2 : 12; pos[o + 2] = -70 + Math.random() * 80; if (wind) pos[o] = -22; } }
        }
        obj.geometry.attributes.position.needsUpdate = true;
      }
    }
    if (sim) { this.syncGates(sim); this.syncBarrels(sim); this.syncHazards(sim); }
  }
}
