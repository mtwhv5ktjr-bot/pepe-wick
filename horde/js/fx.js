/* PEPE WICK vs HORDE — effects. Gunfire is the whole feel of this game, so
   it gets the budget: travelling tracers with a hot core, a glowing halo and
   a bright head; star-shaped muzzle flashes with a real point light; ejected
   brass that bounces on the road; impact flashes, sparks, blood mist, road
   splats, shockwave rings, screen flash and camera shake. Every pool is
   instanced — no per-shot allocations. */
import * as THREE from 'three';

const ROAD = 3.2;
function softTex(size, inner) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(inner || 0.25, 'rgba(255,255,255,0.8)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}
function starTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 30); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.5, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  g.translate(64, 64);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + (i % 2 ? 0.3 : 0), len = i % 2 ? 60 : 44;
    const lg = g.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len); lg.addColorStop(0, 'rgba(255,255,255,0.95)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = lg; g.lineWidth = i % 2 ? 3 : 6; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * len, Math.sin(a) * len); g.stroke();
  }
  return new THREE.CanvasTexture(c);
}
function splatTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,1)';
  for (let i = 0; i < 14; i++) { const a = Math.random() * 6.283, d = Math.random() * 34, r = 8 + Math.random() * 22; g.beginPath(); g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r, 0, 6.283); g.fill(); }
  for (let i = 0; i < 24; i++) { const a = Math.random() * 6.283, d = 30 + Math.random() * 30; g.beginPath(); g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 1.5 + Math.random() * 4, 0, 6.283); g.fill(); }
  return new THREE.CanvasTexture(c);
}

class Pool {
  constructor(scene, geo, mat, n, order) {
    this.n = n; this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.renderOrder = order || 0;
    this.col = new Float32Array(n * 3); this.mesh.instanceColor = new THREE.InstancedBufferAttribute(this.col, 3); this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.items = [];
    scene.add(this.mesh);
    this._m = new THREE.Matrix4(); this._p = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3();
  }
  add(it) { if (this.items.length >= this.n) this.items.shift(); this.items.push(it); return it; }
  flush(camera, write, items) {
    let i = 0;
    const list = items || this.items;
    for (const it of list) {
      if (i >= this.n) break;
      const col = write(it, this._p, this._q, this._s, camera);
      if (col === false) continue;
      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
      const c = col || it;
      this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
      i++;
    }
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
  }
}

const TRACER_SPEED = 95;
const _dir = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _m = new THREE.Matrix4(), _zero = new THREE.Vector3(), _roll = new THREE.Quaternion(), _axis = new THREE.Vector3(0, 0, 1), _c = { r: 1, g: 1, b: 1 };

export class FX {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.soft = softTex(64, 0.2); this.star = starTex(); this.splat = splatTex();
    const add = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, map: this.soft });
    const addStar = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, map: this.star });
    const addFlat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const gore = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, map: this.soft, opacity: 0.9 });
    const decal = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, map: this.splat, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.9 });
    this.core = new Pool(scene, new THREE.BoxGeometry(1, 1, 1), addFlat, 220, 19);
    this.haloP = new Pool(scene, new THREE.BoxGeometry(1, 1, 1), addFlat, 220, 18);
    this.heads = new Pool(scene, new THREE.PlaneGeometry(1, 1), add, 220, 21);
    this.flashes = new Pool(scene, new THREE.PlaneGeometry(1, 1), addStar, 48, 22);
    this.glow = new Pool(scene, new THREE.PlaneGeometry(1, 1), add, 700, 20);
    this.gore = new Pool(scene, new THREE.PlaneGeometry(1, 1), gore, 400, 17);
    this.shells = new Pool(scene, new THREE.BoxGeometry(0.045, 0.045, 0.1), brass, 120, 3);
    this.shells.mesh.castShadow = false;
    this.decals = new Pool(scene, new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), decal, 90, 2);
    this.rings = new Pool(scene, new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2), addFlat, 24, 16);
    this.shakeAmt = 0; this.shakeV = new THREE.Vector3();
    this.flashLight = new THREE.PointLight(0xffe0a0, 0, 18, 1.6); this.flashLight.position.set(0, 1.2, -1); scene.add(this.flashLight);
    this.muzzleLight = new THREE.PointLight(0xffd090, 0, 9, 1.5); this.muzzleLight.position.set(0, 1.3, -1.2); scene.add(this.muzzleLight);
    this.heat = 0;
    this.weapon = null;
    this.rand = Math.random;
    this.onFlash = null;
    this.kick = 0;
  }
  setWeapon(w) { this.weapon = w; }
  shake(a) { this.shakeAmt = Math.min(1.2, this.shakeAmt + a); }
  tracerColor(style, crit) {
    if (crit) return [1.0, 0.85, 0.3];
    switch (style) {
      case 'holo': { const t = performance.now() * 0.004; return [0.6 + 0.4 * Math.sin(t), 0.6 + 0.4 * Math.sin(t + 2.1), 0.6 + 0.4 * Math.sin(t + 4.2)]; }
      case 'lance': return [0.45, 0.85, 1.0];
      case 'pellet': return [1.0, 0.62, 0.22];
      case 'arc': return [0.45, 1.0, 0.6];
      case 'auto': return [1.0, 0.88, 0.45];
      default: return [1.0, 0.93, 0.62];
    }
  }
  spark(x, y, z, n, col, spd, life, size, grav) {
    for (let i = 0; i < n; i++) {
      const a = this.rand() * 6.283, b = this.rand() * 3.14, v = spd * (0.4 + this.rand());
      this.glow.add({ x, y, z, vx: Math.cos(a) * Math.sin(b) * v, vy: Math.abs(Math.cos(b)) * v, vz: Math.sin(a) * Math.sin(b) * v, life, t: 0, size: size * (0.6 + this.rand() * 0.8), r: col[0], g: col[1], b: col[2], grav: grav == null ? 9 : grav });
    }
  }
  blood(x, y, z, n, col, spd) {
    for (let i = 0; i < n; i++) {
      const a = this.rand() * 6.283, v = spd * (0.3 + this.rand());
      this.gore.add({ x, y: y + this.rand() * 0.6, z, vx: Math.cos(a) * v, vy: 1.5 + this.rand() * 3, vz: Math.sin(a) * v + 1.5, life: 0.5 + this.rand() * 0.4, t: 0, size: 0.18 + this.rand() * 0.3, r: col[0], g: col[1], b: col[2], grav: 12 });
    }
  }
  puff(x, y, z, size, col, life) { this.gore.add({ x, y, z, vx: 0, vy: 0.5, vz: 0, life: life || 0.5, t: 0, size, r: col[0], g: col[1], b: col[2], grav: 0 }); }
  ring(x, z, col, size, life) { this.rings.add({ x, z, t: 0, life: life || 0.5, size, r: col[0], g: col[1], b: col[2] }); }
  decal(x, z, col, size) { this.decals.add({ x, z, rot: this.rand() * 6.283, size, r: col[0], g: col[1], b: col[2], t: 0 }); }
  flashAt(x, y, z, size, col, life) { this.flashes.add({ x, y, z, t: 0, life: life || 0.06, size, roll: this.rand() * 6.283, r: col[0], g: col[1], b: col[2] }); }
  // ---- gunfire ----
  shot(e, m) {
    const w = this.weapon || { tracer: 'pistol' };
    const style = e.rico ? 'holo' : (e.style || w.tracer);
    const c = this.tracerColor(style, e.crit);
    const tx = e.tx * ROAD, tz = -e.tz, ty = e.boss ? 1.6 : 0.95;
    const fromMuzzle = e.sz === 0 && m;
    const x0 = fromMuzzle ? m.x : e.sx * ROAD, y0 = fromMuzzle ? m.y : 0.95, z0 = fromMuzzle ? m.z : -e.sz;
    const len = Math.hypot(tx - x0, ty - y0, tz - z0);
    const lance = style === 'lance' || e.pierce;
    const tail = lance ? 4.5 : style === 'pellet' ? 1.2 : style === 'auto' ? 2.0 : 2.6;
    const w0 = lance ? 0.09 : style === 'pellet' ? 0.045 : style === 'auto' ? 0.055 : 0.07;
    const mk = (dx, dz, tailLen, width) => ({ x0, y0, z0, x1: tx + dx, y1: ty, z1: tz + dz, t: 0, len: Math.hypot(tx + dx - x0, ty - y0, tz + dz - z0), tail: tailLen, w: width, speed: TRACER_SPEED * (lance ? 1.3 : 1), r: c[0], g: c[1], b: c[2] });
    if (style === 'pellet' && fromMuzzle) {
      for (let i = 0; i < 5; i++) this.core.add(mk((this.rand() - 0.5) * 1.1, (this.rand() - 0.5) * 2.0, tail * (0.6 + this.rand() * 0.6), w0));
    } else this.core.add(mk(0, 0, tail, w0));
    if (fromMuzzle) {
      const big = style === 'pellet' ? 1.7 : lance ? 1.25 : style === 'auto' ? 0.8 : 1;
      const fc = [Math.min(1, c[0] + 0.25), Math.min(1, c[1] + 0.15), c[2]];
      _dir.set(tx - x0, ty - y0, tz - z0).normalize();
      this.flashAt(x0 + _dir.x * 0.22, y0 + 0.02, z0 + _dir.z * 0.22, 0.5 * big * (0.8 + this.rand() * 0.5), fc, 0.05);
      this.flashAt(x0 + _dir.x * 0.1, y0, z0 + _dir.z * 0.1, 0.22 * big, [1, 1, 1], 0.035);
      this.spark(x0 + _dir.x * 0.3, y0, z0 + _dir.z * 0.3, style === 'pellet' ? 6 : 2, fc, 5, 0.12, 0.08, 2);
      this.puff(x0 + _dir.x * 0.35, y0 + 0.05, z0 + _dir.z * 0.35, 0.3 * big, [0.35, 0.35, 0.38], 0.35);
      this.heat = Math.min(1, this.heat + (style === 'pellet' ? 0.6 : 0.3));
      this.muzzleLight.position.set(x0, y0 + 0.1, z0 - 0.4);
      this.muzzleLight.color.setRGB(fc[0], fc[1], fc[2]);
      if (e.i < 8) this.shells.add({ x: x0 + 0.1, y: y0, z: z0 + 0.15, vx: 1.6 + this.rand() * 1.2, vy: 2.2 + this.rand() * 1.5, vz: 0.6 + this.rand(), rx: this.rand() * 6, ry: this.rand() * 6, wx: 10 + this.rand() * 10, wy: 8 + this.rand() * 8, t: 0, life: 1.6, r: 1.0, g: 0.78, b: 0.3, big: style === 'pellet' });
      if (style === 'pellet') this.kick = Math.min(1, this.kick + 0.35);
      else if (lance) this.kick = Math.min(1, this.kick + 0.12);
    }
  }
  handle(events, sim, crowd) {
    for (const e of events) {
      switch (e.type) {
        case 'shot': { const m = (e.sz === 0 && crowd) ? crowd.fire(e.i, e.tx * ROAD, -e.tz) : null; this.shot(e, m); break; }
        case 'hit': {
          const col = e.plate ? [0.7, 0.85, 1.0] : e.crit ? [1.0, 0.8, 0.2] : [1.0, 0.62, 0.3];
          const y = e.boss ? 1.6 : 1.0;
          this.flashAt(e.x * ROAD, y, -e.z + 0.2, e.crit ? 0.9 : 0.45, col, 0.05);
          this.spark(e.x * ROAD, y, -e.z, e.crit ? 12 : 4, col, e.crit ? 4.5 : 2.5, 0.25, 0.12, 8);
          if (!e.plate) this.puff(e.x * ROAD, y + 0.1, -e.z + 0.15, 0.4, [0.28, 0.06, 0.08], 0.3);
          break;
        }
        case 'kill': {
          const gcol = [0.35, 0.05, 0.08];
          this.blood(e.x * ROAD, 0.5, -e.z, e.big ? 26 : 12, gcol, e.big ? 3 : 2);
          this.spark(e.x * ROAD, 1.0, -e.z, e.big ? 8 : 3, [0.6, 1.0, 0.5], 2, 0.3, 0.12, 6);
          this.decal(e.x * ROAD, -e.z, [0.25, 0.03, 0.05], e.big ? 2.6 : 1.4);
          if (e.big) this.shake(0.12);
          break;
        }
        case 'boom': {
          this.spark(e.x * ROAD, 0.8, -e.z, 50, [1.0, 0.6, 0.2], 7, 0.6, 0.5, 6);
          this.spark(e.x * ROAD, 0.8, -e.z, 20, [1.0, 0.95, 0.8], 3, 0.25, 1.2, 0);
          this.flashAt(e.x * ROAD, 1.2, -e.z, 5, [1, 0.8, 0.5], 0.12);
          this.ring(e.x * ROAD, -e.z, [1.0, 0.6, 0.25], 1 + e.r * 6, 0.45);
          this.decal(e.x * ROAD, -e.z, [0.05, 0.04, 0.04], 3.5);
          this.shake(0.35); this.flashLight.intensity = 60; this.flashLight.position.set(e.x * ROAD, 1.2, -e.z);
          if (this.onFlash) this.onFlash(0.25, 0.14, 0.05);
          break;
        }
        case 'gate': {
          const good = e.delta >= 0;
          const col = good ? [0.45, 1.0, 0.6] : [1.0, 0.25, 0.3];
          this.spark(sim.leaderX * ROAD, 1.2, -0.5, 30, col, 4, 0.6, 0.35, -2);
          this.ring(sim.leaderX * ROAD, -0.5, col, 2.2, 0.5);
          if (this.onFlash) this.onFlash(good ? 0.03 : 0.12, good ? 0.09 : 0.02, good ? 0.04 : 0.02);
          this.shake(good ? 0.05 : 0.2);
          break;
        }
        case 'barrel': { this.spark(e.x * ROAD, 1.0, -e.z, 30, [0.45, 1.0, 0.6], 5, 0.5, 0.3, 4); this.flashAt(e.x * ROAD, 1, -e.z, 1.2, [0.6, 1, 0.7], 0.08); this.ring(e.x * ROAD, -e.z, [0.45, 1.0, 0.6], 1.6, 0.4); break; }
        case 'contact': case 'cut': case 'burn': case 'crash': case 'maul': {
          const x = (e.x != null ? e.x : sim.leaderX) * ROAD;
          this.blood(x, 0.6, 0.2, 6, [0.4, 0.06, 0.08], 1.8);
          this.spark(x, 1.0, 0.1, 5, [1.0, 0.3, 0.3], 3, 0.3, 0.16, 6);
          this.shake(e.type === 'crash' || e.type === 'maul' ? 0.3 : 0.14);
          if (this.onFlash) this.onFlash(0.18, 0.02, 0.02);
          break;
        }
        case 'merge': {
          const col = e.rank === 2 ? [1.0, 0.85, 0.3] : [0.5, 1.0, 0.65];
          this.spark(sim.leaderX * ROAD, 1.5, 0.5, 70, col, 6, 0.9, 0.4, 2);
          this.ring(sim.leaderX * ROAD, 0.5, col, 5, 0.8); this.ring(sim.leaderX * ROAD, 0.5, [1, 1, 1], 2.5, 0.5);
          this.flashAt(sim.leaderX * ROAD, 1.5, 0.5, 6, col, 0.2);
          this.shake(0.45); if (this.onFlash) this.onFlash(0.3, 0.3, 0.2);
          break;
        }
        case 'break': { this.spark(sim.leaderX * ROAD, 1.2, 0.5, 30, [1.0, 0.3, 0.2], 5, 0.6, 0.3, 4); this.shake(0.3); break; }
        case 'acid': { this.spark(e.x * ROAD, 0.3, -e.z, 14, [0.5, 1.0, 0.2], 3, 0.5, 0.3, 6); break; }
        case 'lob': { this.spark(e.x * ROAD, 1.4, -e.z, 4, [0.6, 1.0, 0.3], 1.5, 0.3, 0.2, 2); break; }
        case 'vanish': case 'reappear': { const x = (e.x != null ? e.x : (sim.boss ? sim.boss.x : 0)) * ROAD, z = -(e.z != null ? e.z : (sim.boss ? sim.boss.z : 10)); this.puff(x, 0.9, z, 1.8, [0.5, 0.6, 0.7], 0.5); break; }
        case 'boss': { this.shake(0.6); if (this.onFlash) this.onFlash(0.2, 0.05, 0.05); break; }
        case 'bossphase': case 'enrage': { this.shake(0.5); if (this.onFlash) this.onFlash(0.3, 0.08, 0.08); break; }
        case 'bossatk': { this.shake(0.15); break; }
        case 'bossdead': { const x = sim.boss ? sim.boss.x * ROAD : 0; this.spark(x, 1.5, -20, 120, [1.0, 0.8, 0.3], 9, 1.4, 0.6, 2); this.ring(x, -20, [1.0, 0.8, 0.3], 9, 1.2); this.flashAt(x, 2, -20, 10, [1, 0.9, 0.6], 0.3); this.shake(1.0); if (this.onFlash) this.onFlash(0.6, 0.5, 0.3); break; }
        case 'coin': { this.spark(e.x * ROAD, 1.2, -e.z, 2, [1.0, 0.85, 0.3], 1.5, 0.5, 0.12, 2); break; }
        case 'medic': { this.spark(sim.leaderX * ROAD, 1.2, 0.8, 8, [0.5, 1.0, 0.65], 2, 0.5, 0.2, -2); break; }
        case 'car': { this.shake(0.08); break; }
      }
    }
  }
  update(dt, scroll, camera) {
    // tracers: a bright head races to the target, the tail follows
    for (const t of this.core.items) t.t += dt;
    this.core.items = this.core.items.filter(t => t.t * t.speed < t.len + t.tail);
    const tr = this.core.items;
    const writeTracer = (scaleW, dim) => (it, p, q, s) => {
      const d = it.t * it.speed;
      const head = Math.min(1, d / it.len), tl = Math.max(0, (d - it.tail) / it.len);
      if (head <= tl) return false;
      const mid = (head + tl) / 2;
      p.set(it.x0 + (it.x1 - it.x0) * mid, it.y0 + (it.y1 - it.y0) * mid, it.z0 + (it.z1 - it.z0) * mid);
      _dir.set(it.x1 - it.x0, it.y1 - it.y0, it.z1 - it.z0).normalize();
      _m.lookAt(_zero, _dir, _up); q.setFromRotationMatrix(_m);
      s.set(it.w * scaleW, it.w * scaleW, Math.max(0.1, it.len * (head - tl)));
      _c.r = it.r * dim; _c.g = it.g * dim; _c.b = it.b * dim; return _c;
    };
    this.core.flush(camera, writeTracer(1.2, 2.2), tr);
    this.haloP.flush(camera, writeTracer(3.6, 0.32), tr);
    this.heads.flush(camera, (it, p, q, s, cam) => {
      const d = it.t * it.speed; const head = Math.min(1, d / it.len);
      if (head >= 1) return false;
      p.set(it.x0 + (it.x1 - it.x0) * head, it.y0 + (it.y1 - it.y0) * head, it.z0 + (it.z1 - it.z0) * head);
      q.copy(cam.quaternion); const sz = 0.26 + it.w * 2; s.set(sz, sz, sz);
      _c.r = Math.min(1, it.r * 1.5); _c.g = Math.min(1, it.g * 1.5); _c.b = Math.min(1, it.b * 1.5); return _c;
    }, tr);
    // muzzle flashes
    for (const f of this.flashes.items) f.t += dt;
    this.flashes.items = this.flashes.items.filter(f => f.t < f.life);
    this.flashes.flush(camera, (it, p, q, s, cam) => {
      const f = it.t / it.life; p.set(it.x, it.y, it.z);
      _roll.setFromAxisAngle(_axis, it.roll); q.copy(cam.quaternion).multiply(_roll);
      const sz = it.size * (0.7 + f * 0.8); s.set(sz, sz, sz);
      const k = 1 - f * f; _c.r = it.r * k; _c.g = it.g * k; _c.b = it.b * k; return _c;
    });
    this.heat = Math.max(0, this.heat - dt * 7);
    this.muzzleLight.intensity = this.heat * 55;
    // glow particles
    for (const it of this.glow.items) { it.t += dt; it.vy -= it.grav * dt; it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt + scroll; if (it.y < 0.03) { it.y = 0.03; it.vy *= -0.3; } }
    this.glow.items = this.glow.items.filter(it => it.t < it.life);
    this.glow.flush(camera, (it, p, q, s, cam) => { const f = 1 - it.t / it.life; p.set(it.x, it.y, it.z); q.copy(cam.quaternion); const sz = it.size * (0.4 + f); s.set(sz, sz, sz); _c.r = it.r * f; _c.g = it.g * f; _c.b = it.b * f; return _c; });
    for (const it of this.gore.items) { it.t += dt; it.vy -= it.grav * dt; it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt + scroll; if (it.y < 0.05) { it.y = 0.05; it.vy = 0; it.vx *= 0.5; it.vz *= 0.5; } }
    this.gore.items = this.gore.items.filter(it => it.t < it.life);
    this.gore.flush(camera, (it, p, q, s, cam) => { const f = 1 - it.t / it.life; p.set(it.x, it.y, it.z); q.copy(cam.quaternion); const sz = it.size * (0.7 + 0.5 * (1 - f)); s.set(sz, sz, sz); _c.r = it.r * (0.3 + 0.7 * f); _c.g = it.g * (0.3 + 0.7 * f); _c.b = it.b * (0.3 + 0.7 * f); return _c; });
    // brass
    for (const it of this.shells.items) { it.t += dt; it.vy -= 11 * dt; it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt + scroll; it.rx += it.wx * dt; it.ry += it.wy * dt; if (it.y < 0.03) { it.y = 0.03; if (Math.abs(it.vy) > 0.6) { it.vy = -it.vy * 0.35; it.vx *= 0.6; it.vz *= 0.6; it.wx *= 0.5; } else { it.vy = 0; it.vx *= 0.9; it.wx = 0; it.wy = 0; } } }
    this.shells.items = this.shells.items.filter(it => it.t < it.life && it.z < 12);
    this.shells.flush(camera, (it, p, q, s) => { p.set(it.x, it.y, it.z); q.setFromEuler(new THREE.Euler(it.rx, it.ry, 0)); const k = it.big ? 1.6 : 1; s.set(k, k, k); return it; });
    for (const it of this.decals.items) { it.z += scroll; it.t += dt; }
    this.decals.items = this.decals.items.filter(it => it.z < 12);
    this.decals.flush(camera, (it, p, q, s) => { p.set(it.x, 0.015, it.z); q.setFromAxisAngle(_up, it.rot); const sz = it.size * Math.min(1, it.t * 8 + 0.3); s.set(sz, 1, sz); return it; });
    for (const it of this.rings.items) { it.t += dt; it.z += scroll; }
    this.rings.items = this.rings.items.filter(it => it.t < it.life);
    this.rings.flush(camera, (it, p, q, s) => { const f = it.t / it.life; p.set(it.x, 0.05, it.z); q.identity(); const sz = it.size * (0.2 + f); s.set(sz, 1, sz); const k = 1 - f; _c.r = it.r * k; _c.g = it.g * k; _c.b = it.b * k; return _c; });
    // shake + recoil kick
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.4);
    this.kick = Math.max(0, this.kick - dt * 6);
    const a = this.shakeAmt * this.shakeAmt * 0.35;
    this.shakeV.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a * 0.7 + this.kick * 0.08, this.kick * 0.12);
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 220);
  }
}
