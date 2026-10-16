/* PEPE WICK vs HORDE — the crowd. Every character on the road is an instance
   of a hand-built low-poly rig (the approved Pepe Wick: green frog head, the
   black mane, black suit, white shirt, iron up — and the zombified
   Wick-verse cast facing him). Limbs, recoil, aim and death falls are all
   driven IN THE VERTEX SHADER from per-instance attributes, so a 1,000-strong
   squad and a 70-head horde are a dozen draw calls. The Wick's gun is a real
   model of the WICK Arsenal class he carries, accent-lit in the card colour. */
import * as THREE from 'three';

const ROAD = 3.2; // world metres per road unit

// ---------- geometry kit ----------
function tagged(geo, color, part, glow, m) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (m) g.applyMatrix4(m);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3), pa = new Float32Array(n), gl = new Float32Array(n);
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; pa[i] = part; gl[i] = glow || 0; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aPart', new THREE.BufferAttribute(pa, 1));
  g.setAttribute('aGlow', new THREE.BufferAttribute(gl, 1));
  g.deleteAttribute('uv');
  return g;
}
function merge(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), pa = new Float32Array(n), gl = new Float32Array(n);
  let o = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3);
    pa.set(g.attributes.aPart.array, o); gl.set(g.attributes.aGlow.array, o);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('aPart', new THREE.BufferAttribute(pa, 1));
  out.setAttribute('aGlow', new THREE.BufferAttribute(gl, 1));
  out.computeBoundingSphere();
  return out;
}
const M = () => new THREE.Matrix4();
const T = (x, y, z) => M().makeTranslation(x, y, z);
const S = (x, y, z) => M().makeScale(x, y, z);
const RX = a => M().makeRotationX(a);
const RY = a => M().makeRotationY(a);
const RZ = a => M().makeRotationZ(a);
const mul = (...ms) => { const m = M(); for (const x of ms) m.multiply(x); return m; };
const sphere = (r, w, h) => new THREE.SphereGeometry(r, w || 14, h || 10);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const capsule = (r, l) => new THREE.CapsuleGeometry(r, l, 3, 10);
const cyl = (rt, rb, h) => new THREE.CylinderGeometry(rt, rb, h, 10);
const tube = (r, l) => new THREE.CylinderGeometry(r, r, l, 8).rotateX(Math.PI / 2); // along Z

// parts: 0 body, 1 left leg, 2 right leg, 3 left arm, 4 right arm (gun), 5 head
const PEPE_GREEN = 0x62a048, SUIT = 0x32323f, SHIRT = 0xe9edf2, HAIR = 0x111116, SKIN_Z = 0xffffff;
const GUN_DARK = 0x23262e, GUN_STEEL = 0x4a505c, WOOD = 0x5a3a22;

function legs(color, shoe) {
  const out = [];
  for (const side of [1, -1]) {
    const p = side > 0 ? 1 : 2;
    out.push(tagged(capsule(0.085, 0.40), color, p, 0, T(side * 0.12, 0.42, 0)));
    out.push(tagged(box(0.17, 0.08, 0.27), shoe, p, 0, T(side * 0.12, 0.04, -0.04)));
  }
  return out;
}
function torso(suit, shirt, opts) {
  const o = opts || {};
  const out = [tagged(box(0.46, 0.54, 0.27), suit, 0, 0, T(0, 1.06, 0))];
  out.push(tagged(box(0.44, 0.1, 0.3), suit, 0, 0, T(0, 1.32, 0)));            // shoulders
  if (shirt != null && o.collar !== false) out.push(tagged(box(0.3, 0.045, 0.3), shirt, 0, 0, T(0, 1.345, 0.0)));   // collar — reads from behind and above
  if (shirt != null) out.push(tagged(box(0.15, 0.42, 0.02), shirt, 0, 0, T(0, 1.08, -0.142)));
  if (o.tie) out.push(tagged(box(0.05, 0.3, 0.015), o.tie, 0, 0, T(0, 1.06, -0.152)));
  if (o.apron) out.push(tagged(box(0.34, 0.5, 0.02), o.apron, 0, 0, T(0, 0.95, -0.145)));
  return out;
}
function head(skin, opts) {
  const o = opts || {};
  const y = 1.62;
  const skinGlow = o.skinGlow || 0;
  const hr = o.eyeTop ? 0.31 : 0.27;   // Pepe gets the big stylised head
  const out = [tagged(sphere(hr), skin, 5, skinGlow, mul(T(0, y, 0), S(1.05, 0.9, 0.95)))];
  // Pepe's eyes bulge on TOP of the head (that is the design), so they read from behind and above
  const ey = o.eyeTop ? y + 0.22 : y + 0.09, ez = o.eyeTop ? -0.12 : -0.2, er = o.eyeTop ? 0.1 : 0.085;
  for (const side of [1, -1]) {
    out.push(tagged(sphere(er, 10, 8), o.eyeWhite || 0xffffff, 5, o.eyeGlow ? 1 : (o.eyeTop ? 0.06 : 0), T(side * 0.13, ey, ez)));
    out.push(tagged(sphere(er * 0.42, 8, 6), o.pupil || 0x0a0a0a, 5, 0, T(side * 0.12, ey + (o.eyeTop ? 0.01 : 0), ez - er * 0.85)));
    if (o.brow) out.push(tagged(box(0.12, 0.03, 0.04), o.brow, 5, 0, mul(T(side * 0.11, y + 0.17, -0.22), RZ(side * -0.3))));
  }
  out.push(tagged(box(0.26, 0.05, 0.06), o.lips || 0x9a4a52, 5, 0, T(0, y - 0.1, -0.245)));
  if (o.hair !== false) {
    const hc = o.hair || HAIR;
    if (o.eyeTop) {
      // Wick's mane, swept back: the green dome and the eyes stay clear, the hair hangs off the back and sides
      out.push(tagged(sphere(0.27, 14, 10), hc, 5, 0, mul(T(0, y - 0.02, 0.2), S(1.08, 1.0, 0.62))));
      for (const side of [1, -1]) out.push(tagged(box(0.08, 0.38, 0.2), hc, 5, 0, mul(T(side * 0.3, y - 0.1, 0.12), RZ(side * 0.12))));
      out.push(tagged(box(0.34, 0.32, 0.08), hc, 5, 0, T(0, y - 0.12, 0.31)));
    } else {
      out.push(tagged(sphere(0.275, 14, 10), hc, 5, 0, mul(T(0, y + 0.09, 0.05), S(1.04, 0.92, 0.92))));
      for (const side of [1, -1]) out.push(tagged(box(0.07, 0.3, 0.2), hc, 5, 0, mul(T(side * 0.265, y - 0.08, 0.05), RZ(side * 0.08))));
      out.push(tagged(box(0.26, 0.26, 0.08), hc, 5, 0, T(0, y - 0.08, 0.25)));
    }
  }
  out.push(tagged(cyl(0.09, 0.11, 0.16), skin, 5, skinGlow, T(0, y - 0.3, 0.02)));    // neck
  if (o.toque) out.push(tagged(cyl(0.2, 0.22, 0.3), 0xf2f2f2, 5, 0, T(0, y + 0.36, 0)));
  if (o.wrap) out.push(tagged(box(0.56, 0.08, 0.56), o.wrap, 5, 0, T(0, y + 0.05, 0)));
  if (o.crown) out.push(tagged(cyl(0.3, 0.26, 0.12), o.crown, 5, 1, T(0, y + 0.3, 0)));
  return out;
}

// ---- the iron: a model per WICK Arsenal class, in gun-local space (−Z = muzzle, +Y up, origin = grip) ----
function gunModel(kind, accent) {
  const g = [];
  const acc = accent == null ? 0x7cf9a5 : accent;
  if (kind === 'pistol') {
    g.push([box(0.05, 0.075, 0.27), GUN_DARK, T(0, 0.06, -0.12)]);
    g.push([box(0.045, 0.13, 0.065), GUN_DARK, mul(T(0, -0.04, 0.0), RX(0.2))]);
    g.push([tube(0.012, 0.08), GUN_STEEL, T(0, 0.075, -0.28)]);
    g.push([box(0.012, 0.012, 0.12), acc, T(0, 0.1, -0.16), 1]);
  } else if (kind === 'smg') {
    g.push([box(0.065, 0.095, 0.36), GUN_DARK, T(0, 0.05, -0.16)]);
    g.push([box(0.04, 0.17, 0.05), GUN_DARK, T(0, -0.07, -0.14)]);
    g.push([tube(0.016, 0.16), GUN_STEEL, T(0, 0.07, -0.42)]);
    g.push([box(0.03, 0.045, 0.16), GUN_DARK, T(0, 0.04, 0.1)]);
    g.push([box(0.012, 0.012, 0.22), acc, T(0.036, 0.09, -0.16), 1]);
  } else if (kind === 'shotgun') {
    for (const sx of [-0.024, 0.024]) g.push([tube(0.02, 0.58), GUN_STEEL, T(sx, 0.07, -0.34)]);
    g.push([box(0.07, 0.065, 0.16), WOOD, T(0, 0.04, -0.34)]);
    g.push([box(0.07, 0.09, 0.2), GUN_DARK, T(0, 0.045, -0.08)]);
    g.push([box(0.06, 0.08, 0.2), WOOD, mul(T(0, 0.0, 0.12), RX(-0.15))]);
    g.push([box(0.012, 0.012, 0.3), acc, T(0, 0.1, -0.3), 1]);
  } else if (kind === 'rifle') {
    g.push([box(0.06, 0.09, 0.42), GUN_DARK, T(0, 0.05, -0.2)]);
    g.push([tube(0.014, 0.34), GUN_STEEL, T(0, 0.075, -0.58)]);
    g.push([tube(0.026, 0.16), GUN_DARK, T(0, 0.135, -0.2)]);
    g.push([box(0.04, 0.14, 0.05), GUN_DARK, T(0, -0.05, -0.16)]);
    g.push([box(0.05, 0.075, 0.2), GUN_DARK, mul(T(0, 0.02, 0.12), RX(-0.1))]);
    g.push([box(0.012, 0.012, 0.3), acc, T(0.034, 0.08, -0.22), 1]);
  } else { // reaper — the tri-arc
    g.push([box(0.1, 0.12, 0.38), GUN_DARK, T(0, 0.05, -0.18)]);
    for (const [sx, ry] of [[0, 0], [-0.045, 0.22], [0.045, -0.22]]) g.push([tube(0.017, 0.3), GUN_STEEL, mul(T(sx, 0.07, -0.5), RY(ry))]);
    g.push([box(0.05, 0.16, 0.06), GUN_DARK, T(0, -0.07, -0.12)]);
    g.push([box(0.09, 0.02, 0.3), acc, T(0, 0.12, -0.2), 1]);
    g.push([box(0.02, 0.09, 0.3), acc, T(0, 0.05, -0.2), 1]);
  }
  return g;
}

function arms(skin, suit, pose, opts) {
  // pose: 'gun' (right arm forward with the iron, left hangs or supports) | 'reach' (both forward, zombie)
  const o = opts || {};
  const out = [];
  const twoHand = pose === 'gun' && o.gun && o.gun !== 'pistol';
  for (const side of [1, -1]) {
    const p = side > 0 ? 4 : 3;
    const fwd = pose === 'reach' || (pose === 'gun' && side > 0) || (twoHand && side < 0);
    const rot = fwd ? mul(RX(1.35), RZ(twoHand && side < 0 ? -0.55 : 0)) : RX(0);
    const base = mul(T(side * 0.3, 1.3, 0), rot);
    out.push(tagged(capsule(0.065, 0.36), suit, p, 0, mul(base, T(0, -0.22, 0))));
    out.push(tagged(sphere(0.075, 10, 8), skin, p, o.skinGlow || 0, mul(base, T(0, -0.46, 0))));
    if (pose === 'gun' && side > 0) {
      const frame = mul(base, T(0, -0.5, 0), RX(-1.35));   // level the gun: −Z = forward
      for (const [geo, col, m, glow] of gunModel(o.gun || 'pistol', o.accent)) out.push(tagged(geo, col, p, glow || 0, mul(frame, m)));
    }
    if (pose === 'reach' && side > 0 && o.prop) out.push(o.prop(base, p));
  }
  return out;
}

export function buildRig(kind, opts) {
  const o = opts || {};
  let parts = [];
  const Z = (eye) => ({ eyeWhite: eye || 0xff3030, eyeGlow: true, pupil: 0x200000, lips: 0x3a1a1a });
  switch (kind) {
    case 'pepe':
      parts = [...legs(SUIT, 0x0c0c10), ...torso(SUIT, SHIRT, { tie: 0x0a0a10 }), ...head(PEPE_GREEN, { lips: 0x9a4a52, eyeTop: true, skinGlow: 0.22 }), ...arms(PEPE_GREEN, SUIT, 'gun', { gun: o.gun, accent: o.accent, skinGlow: 0.22 })];
      break;
    case 'goon':
      parts = [...legs(0x1e1e22, 0x0c0c10), ...torso(0x1e1e22, 0xb8b8b0, { tie: 0x101014 }), ...head(SKIN_Z, Object.assign(Z(), { brow: 0x0a0a0a })), ...arms(SKIN_Z, 0x1e1e22, 'reach')];
      break;
    case 'runner':
      parts = [...legs(0x2a2a30, 0x0c0c10), ...torso(0x34343a, 0x8a8a80, {}), ...head(SKIN_Z, Object.assign(Z(), { hair: 0x1a1a1a })), ...arms(SKIN_Z, 0x34343a, 'reach')];
      break;
    case 'shield':
      parts = [...legs(0x262a30, 0x0c0c10), ...torso(0x262a30, null, {}), ...head(SKIN_Z, Object.assign(Z(), { hair: 0x14161a })),
        ...arms(SKIN_Z, 0x262a30, 'reach', { prop: (base, p) => tagged(box(0.62, 0.86, 0.05), 0x3a4656, p, 0, mul(base, T(0.1, -0.5, 0), RX(-1.35), T(0, 0.15, -0.1))) })];
      break;
    case 'spitter':
      parts = [...legs(0x3a2a34, 0x0c0c10), ...torso(0x3a2a34, 0xd8d0c8, { tie: 0x5a1a2a }), ...head(SKIN_Z, Object.assign(Z(0xc8ff40), { pupil: 0x102000, lips: 0x5a2a3a, hair: 0x2a2224 })),
        ...arms(SKIN_Z, 0x3a2a34, 'reach', { prop: (base, p) => tagged(cyl(0.05, 0.07, 0.3), 0x2a4a2a, p, 0, mul(base, T(0.02, -0.5, 0), RX(-1.0))) })];
      break;
    case 'exploder':
      parts = [...legs(0x2a2420, 0x0c0c10), ...torso(0x2a2420, null, {}), tagged(box(0.5, 0.4, 0.08), 0x4a3a2a, 0, 0, T(0, 1.05, -0.15)),
        tagged(box(0.1, 0.1, 0.05), 0xff3020, 0, 1, T(-0.14, 1.08, -0.2)), tagged(box(0.1, 0.1, 0.05), 0xff3020, 0, 1, T(0.14, 1.08, -0.2)), tagged(box(0.1, 0.1, 0.05), 0xff3020, 0, 1, T(0, 0.92, -0.2)),
        ...head(SKIN_Z, Object.assign(Z(), { hair: 0x1a1a1a })), ...arms(SKIN_Z, 0x2a2420, 'reach')];
      break;
    case 'ninja':
      parts = [...legs(0x1a2a2e, 0x0c0c10), ...torso(0x1a2a2e, null, {}), ...head(SKIN_Z, Object.assign(Z(0x40f0ff), { pupil: 0x002020, lips: 0x1a2a2e, hair: 0x101418, wrap: 0x1f6f7f })),
        ...arms(SKIN_Z, 0x1a2a2e, 'reach', { prop: (base, p) => tagged(box(0.03, 0.9, 0.06), 0xc8d8e8, p, 0, mul(base, T(0, -0.5, 0), RX(-1.35), T(0, 0.3, 0))) })];
      break;
    case 'chef':
      parts = [...legs(0x2a2a2a, 0x0c0c10), ...torso(0xe8e8e4, null, { apron: 0x9a2a2a }), ...head(SKIN_Z, Object.assign(Z(), { hair: false, toque: true })),
        ...arms(SKIN_Z, 0xe8e8e4, 'reach', { prop: (base, p) => tagged(box(0.02, 0.22, 0.26), 0xd0d8e0, p, 0, mul(base, T(0, -0.5, 0), RX(-1.35), T(0, 0.1, -0.1))) })];
      break;
    case 'judge':
      parts = [tagged(cyl(0.3, 0.46, 1.1), 0x2a1a3a, 0, 0, T(0, 0.75, 0)), ...torso(0x2a1a3a, null, {}), tagged(box(0.5, 0.06, 0.06), 0xe8c576, 0, 1, T(0, 1.26, -0.15)),
        ...head(SKIN_Z, Object.assign(Z(0xffd040), { pupil: 0x201000, lips: 0x3a2a3a, hair: 0x1a1220 })), ...arms(SKIN_Z, 0x2a1a3a, 'reach')];
      break;
    case 'bounty':
      parts = [...legs(0x2a2418, 0x0c0c10), ...torso(0x2a2418, null, {}), ...head(SKIN_Z, Object.assign(Z(0xffd040), { pupil: 0x201000, lips: 0x3a2a1a, hair: 0x1a1810 })), ...arms(SKIN_Z, 0x2a2418, 'reach')];
      for (let i = 0; i < 7; i++) parts.push(tagged(sphere(0.045, 8, 6), 0xffd23f, 0, 1, T(-0.2 + i * 0.065, 1.24 - Math.abs(i - 3) * 0.06, -0.16)));
      break;
    case 'brute':
      parts = [...legs(0x1a1a1e, 0x0c0c10), ...torso(0x1a1a1e, 0x9a9a92, {}), tagged(box(0.6, 0.16, 0.34), 0x1a1a1e, 0, 0, T(0, 1.36, 0)),
        ...head(SKIN_Z, Object.assign(Z(), { hair: 0x0e0e10 })), ...arms(SKIN_Z, 0x1a1a1e, 'reach')];
      break;
    case 'boss':
      parts = [...legs(0x1a1a1e, 0x0c0c10), ...torso(0x1a1a1e, 0xb0b0a8, { tie: 0x101014 }), tagged(box(0.64, 0.18, 0.36), 0x1a1a1e, 0, 0, T(0, 1.37, 0)),
        tagged(box(0.7, 1.1, 0.06), 0x101014, 0, 0, T(0, 0.85, 0.2)),
        ...head(SKIN_Z, { eyeWhite: 0xffffff, eyeGlow: true, pupil: 0x101010, lips: 0x3a1a1a, hair: 0x0a0a0c, crown: 0xffffff }), ...arms(SKIN_Z, 0x1a1a1e, 'reach')];
      break;
    case 'hound': {
      parts = [
        tagged(capsule(0.16, 0.5), SKIN_Z, 0, 0, mul(T(0, 0.45, 0), RX(Math.PI / 2))),
        tagged(sphere(0.15, 12, 8), SKIN_Z, 5, 0, T(0, 0.55, -0.42)),
        tagged(box(0.12, 0.1, 0.18), SKIN_Z, 5, 0, T(0, 0.5, -0.56)),
        tagged(sphere(0.03, 6, 5), 0xff3030, 5, 1, T(0.07, 0.6, -0.52)), tagged(sphere(0.03, 6, 5), 0xff3030, 5, 1, T(-0.07, 0.6, -0.52)),
        tagged(box(0.05, 0.1, 0.06), SKIN_Z, 5, 0, T(0.09, 0.68, -0.4)), tagged(box(0.05, 0.1, 0.06), SKIN_Z, 5, 0, T(-0.09, 0.68, -0.4)),
        tagged(box(0.04, 0.04, 0.3), SKIN_Z, 0, 0, mul(T(0, 0.52, 0.38), RX(-0.5))),
      ];
      for (const s of [1, -1]) {
        parts.push(tagged(capsule(0.05, 0.28), SKIN_Z, s > 0 ? 1 : 2, 0, T(s * 0.12, 0.2, -0.2)));
        parts.push(tagged(capsule(0.05, 0.28), SKIN_Z, s > 0 ? 2 : 1, 0, T(s * 0.12, 0.2, 0.2)));
      }
      break;
    }
  }
  const g = merge(parts);
  if (kind !== 'hound' && kind !== 'pepe' && kind !== 'boss') {
    const pos = g.attributes.position, pa = g.attributes.aPart;
    const lean = new THREE.Matrix4().makeRotationX(kind === 'judge' ? 0.08 : 0.28);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const p = pa.getX(i);
      if (p === 1 || p === 2) continue;
      v.fromBufferAttribute(pos, i); v.y -= 0.75; v.applyMatrix4(lean); v.y += 0.75; pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
  }
  g.scale(0.9, 0.9, 0.9);
  return g;
}
export function gunKindFor(weapon) {
  const t = weapon ? weapon.type : 1;
  if (t === 16) return 'reaper';
  if (t === 2 || t === 12) return 'smg';
  if (t === 3 || t === 13) return 'shotgun';
  if (t === 4 || t === 14 || t === 5 || t === 15) return 'rifle';
  return 'pistol';
}

// ---------- the animated instanced material ----------
const VERT_HEAD = `
attribute float aPart; attribute float aGlow;
attribute float iPhase; attribute float iGait; attribute float iFlash; attribute float iFire; attribute float iAim;
uniform float uTime;
varying float vGlow; varying float vFlash;
mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.0,0.0,0.0, 0.0,c,s, 0.0,-s,c); }
mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.0,-s, 0.0,1.0,0.0, s,0.0,c); }
float recoilOf(float t){ float rt = uTime - t; return rt >= 0.0 ? exp(-rt * 17.0) : 0.0; }
float partAngle(float part, float ph, float gait, float rec){
  float sw = sin(ph);
  float ampL = gait < 1.5 ? (gait < 0.5 ? 0.62 : 0.8) : (gait < 2.5 ? 0.42 : 0.0);
  if (gait > 3.5) ampL = 0.0;
  if (part == 1.0) return sw * ampL;
  if (part == 2.0) return -sw * ampL;
  if (part == 3.0) return (gait < 0.5 ? rec * 0.32 - sw * 0.1 : -sw * ampL * 0.55);
  if (part == 4.0) return (gait > 1.5 && gait < 2.5) ? sin(ph * 0.5 + 1.0) * 0.1 : (gait < 0.5 ? rec * 0.42 - sw * 0.05 : -sw * ampL * 0.4);
  return 0.0;
}
`;
const VERT_BODY = `
vec3 transformed = vec3(position);
{
  float spd = iGait < 0.5 ? 9.0 : (iGait < 1.5 ? 13.5 : (iGait < 2.5 ? 5.0 : 2.0));
  float ph = iGait > 3.5 ? iPhase : uTime * spd + iPhase;
  float rec = iGait < 0.5 ? recoilOf(iFire) : 0.0;
  float piv = (aPart == 1.0 || aPart == 2.0) ? 0.675 : 1.17;
  if (aPart >= 1.0 && aPart <= 4.0) { float a = partAngle(aPart, ph, iGait, rec); transformed.y -= piv; transformed = rotX(a) * transformed; transformed.y += piv; }
  if ((aPart == 3.0 || aPart == 4.0) && iGait < 0.5) { transformed = rotY(iAim) * transformed; }
  if (aPart != 1.0 && aPart != 2.0 && iGait < 3.5) transformed.y += abs(sin(ph)) * (iGait < 1.5 ? 0.045 : 0.02);
  if (iGait > 1.5 && iGait < 2.5) transformed.x += sin(ph * 0.5) * 0.05 * clamp(transformed.y / 1.6, 0.0, 1.0);
  if (iGait > 2.5 && iGait < 3.5) transformed.y += 0.7 + sin(uTime * 2.2 + iPhase) * 0.12;
  transformed.z += rec * 0.06;
}
vGlow = aGlow; vFlash = iFlash;`;
const VERT_NORMAL = `
vec3 objectNormal = vec3(normal);
{
  float spd = iGait < 0.5 ? 9.0 : (iGait < 1.5 ? 13.5 : (iGait < 2.5 ? 5.0 : 2.0));
  float ph = iGait > 3.5 ? iPhase : uTime * spd + iPhase;
  float rec = iGait < 0.5 ? recoilOf(iFire) : 0.0;
  if (aPart >= 1.0 && aPart <= 4.0) objectNormal = rotX(partAngle(aPart, ph, iGait, rec)) * objectNormal;
  if ((aPart == 3.0 || aPart == 4.0) && iGait < 0.5) objectNormal = rotY(iAim) * objectNormal;
}`;

export function makeCrowdMaterial(uTime, opts) {
  const mat = new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.62, metalness: 0.08 }, opts || {}));
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_HEAD)
      .replace('#include <begin_vertex>', VERT_BODY)
      .replace('#include <beginnormal_vertex>', VERT_NORMAL);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGlow; varying float vFlash;\n')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), vFlash * 0.85);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * vGlow * 3.0;');
  };
  mat.customProgramCacheKey = () => 'crowd';
  return mat;
}
function makeDepthMaterial(uTime) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_HEAD).replace('#include <begin_vertex>', VERT_BODY.replace('vGlow = aGlow; vFlash = iFlash;', ''));
  };
  m.customProgramCacheKey = () => 'crowddepth';
  return m;
}

class Batch {
  constructor(scene, geo, mat, depthMat, n) {
    this.n = n; this.scene = scene;
    const g = geo.clone();
    const mk = () => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n), 1); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.phase = mk(); this.gait = mk(); this.flash = mk(); this.fire = mk(); this.aim = mk();
    this.fire.array.fill(-100);
    g.setAttribute('iPhase', this.phase); g.setAttribute('iGait', this.gait); g.setAttribute('iFlash', this.flash); g.setAttribute('iFire', this.fire); g.setAttribute('iAim', this.aim);
    this.mesh = new THREE.InstancedMesh(g, mat, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.customDepthMaterial = depthMat;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.color = new Float32Array(n * 3).fill(1);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(this.color, 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    this.i = 0;
    this._m = new THREE.Matrix4(); this._p = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._e = new THREE.Euler();
  }
  begin() { this.i = 0; }
  put(x, y, z, ry, sx, sy, sz, phase, gait, flash, tint, lean, fire, aim) {
    if (this.i >= this.n) return -1;
    const i = this.i++;
    this._e.set(lean || 0, ry, 0); this._q.setFromEuler(this._e);
    this._p.set(x, y, z); this._s.set(sx, sy, sz);
    this._m.compose(this._p, this._q, this._s);
    this.mesh.setMatrixAt(i, this._m);
    this.phase.array[i] = phase; this.gait.array[i] = gait; this.flash.array[i] = flash; this.fire.array[i] = fire == null ? -100 : fire; this.aim.array[i] = aim || 0;
    if (tint) { this.color[i * 3] = tint.r; this.color[i * 3 + 1] = tint.g; this.color[i * 3 + 2] = tint.b; }
    else { this.color[i * 3] = this.color[i * 3 + 1] = this.color[i * 3 + 2] = 1; }
    return i;
  }
  end() {
    this.mesh.count = this.i;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.phase.needsUpdate = true; this.gait.needsUpdate = true; this.flash.needsUpdate = true; this.fire.needsUpdate = true; this.aim.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
  dispose() { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); }
}

const hash = i => { let x = Math.imul(i ^ 0x9E3779B9, 0x85EBCA6B); x ^= x >>> 13; x = Math.imul(x, 0xC2B2AE35); x ^= x >>> 16; return (x >>> 0) / 4294967296; };

export class Crowd {
  constructor(scene, foesDef, bossesDef) {
    this.scene = scene; this.FOES = foesDef; this.BOSSES = bossesDef;
    this.uTime = { value: 0 };
    this.mat = makeCrowdMaterial(this.uTime);
    this.depth = makeDepthMaterial(this.uTime);
    this.rigs = {};
    for (const k of ['goon', 'runner', 'shield', 'spitter', 'exploder', 'ninja', 'chef', 'judge', 'bounty', 'brute', 'boss', 'hound']) this.rigs[k] = buildRig(k);
    this.squad = null; this.setWeapon(null);
    this.batches = {};
    for (const k of ['goon', 'runner', 'shield', 'spitter', 'exploder', 'ninja', 'chef', 'judge', 'bounty', 'brute', 'hound']) this.batches[k] = new Batch(scene, this.rigs[k], this.mat, this.depth, 110);
    this.bossBatch = new Batch(scene, this.rigs.boss, this.mat, this.depth, 1);
    this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.05, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.halo.rotation.x = Math.PI / 2; this.halo.visible = false; scene.add(this.halo);
    // blob shadows: a soft dark disc under every character grounds it on the road regardless of the key light
    { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(0,0,0,0.75)'); r.addColorStop(0.55, 'rgba(0,0,0,0.45)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64);
      this.blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }), 320);
      this.blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.blobs.frustumCulled = false; this.blobs.renderOrder = 3; this.blobs.count = 0; scene.add(this.blobs);
      this._bm = new THREE.Matrix4(); this._bq = new THREE.Quaternion(); this._bp = new THREE.Vector3(); this._bs = new THREE.Vector3(); this.blobN = 0; }
    this.slots = [];      // smoothed squad positions
    this.fireAt = new Float32Array(64).fill(-100); this.aimAt = new Float32Array(64);
    this.corpses = [];
    this.tints = {};
    for (const k in foesDef) this.tints[k] = new THREE.Color(foesDef[k].tint).multiplyScalar(1.35);   // dead skin reads grey-green, never silhouette
    this.bossTint = new THREE.Color(1, 1, 1);
    this.leader = new THREE.Vector3();
    this.lastCount = -1;
    this.badge = this.makeBadge();
    scene.add(this.badge);
    this.roadMeters = ROAD;
  }
  setWeapon(weapon) {
    const kind = gunKindFor(weapon);
    const accent = weapon ? new THREE.Color(weapon.color || '#7cf9a5').getHex() : 0x7cf9a5;
    if (this.squad && this.squad.kind === kind && this.squad.accent === accent) return;
    if (this.squad) this.squad.dispose();
    const rig = buildRig('pepe', { gun: kind, accent });
    this.squad = new Batch(this.scene, rig, this.mat, this.depth, 64);
    this.squad.kind = kind; this.squad.accent = accent;
    this.twoHand = kind !== 'pistol';
  }
  // the sim's stream i fires: kick the arm, aim at the target, return the muzzle in world space
  fire(i, tx, tz) {
    const sl = this.slots[Math.min(i, this.slots.length - 1)];
    if (!sl) return { x: 0, y: 1.1, z: -0.5 };
    this.fireAt[i] = this.uTime.value;
    const aim = Math.max(-0.5, Math.min(0.5, Math.atan2(-(tx - sl.x), -(tz - sl.z)) * 0.8));
    this.aimAt[i] = -aim;
    const s = sl.s;
    const fx = sl.x + 0.27 * s * Math.cos(aim) - 0.72 * s * Math.sin(-aim), fz = sl.z - 0.72 * s * Math.cos(aim);
    return { x: fx, y: 1.17 * s, z: fz, s };
  }
  kill(e) {
    if (this.corpses.length > 40) this.corpses.shift();
    this.corpses.push({ type: e.foe, x: e.x * ROAD, z: -e.z, t: 0, ph: Math.random() * 6.28, dir: Math.random() < 0.5 ? 1 : -1 });
  }
  makeBadge() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
    sp.scale.set(2.2, 1.1, 1); sp.renderOrder = 50;
    sp.userData.canvas = c; sp.userData.tex = tex;
    return sp;
  }
  drawBadge(count, rank) {
    const c = this.badge.userData.canvas, g = c.getContext('2d');
    g.clearRect(0, 0, 256, 128);
    g.font = '700 74px "Black Ops One", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.strokeText(String(count), 128, 58);
    g.fillStyle = rank === 2 ? '#ffd23f' : rank === 1 ? '#7cf9a5' : '#ffffff'; g.fillText(String(count), 128, 58);
    if (rank) { g.font = '700 26px "Barlow Condensed", Arial'; g.fillStyle = rank === 2 ? '#ffd23f' : '#7cf9a5'; g.strokeText(rank === 2 ? 'TITAN WICK' : 'MEGA WICK', 128, 108); g.fillText(rank === 2 ? 'TITAN WICK' : 'MEGA WICK', 128, 108); }
    this.badge.userData.tex.needsUpdate = true;
  }
  layout(sim, tiers) {
    const units = [];
    for (let i = 0; i < tiers.titans; i++) units.push({ s: 3.0 });
    for (let i = 0; i < Math.min(tiers.megas, 12); i++) units.push({ s: 1.8 });
    const wicksVis = Math.min(tiers.wicks, units.length ? 20 : 28);
    for (let i = 0; i < wicksVis; i++) units.push({ s: 1 });
    if (!units.length) units.push({ s: 1 });
    const W = Math.max(0.8, sim.formW * ROAD * 2);
    const lx = sim.leaderX * ROAD;
    let z = 0, row = 0, idx = 0;
    while (idx < units.length) {
      const u = units[idx];
      const step = 0.56 * u.s;
      const perRow = Math.max(1, Math.floor(W / step));
      const n = Math.min(perRow, units.length - idx);
      for (let c = 0; c < n; c++) {
        const uu = units[idx];
        const j = hash(idx * 7 + 3);
        const jx = (hash(idx * 13 + 1) - 0.5) * 0.18, jz = (hash(idx * 17 + 5) - 0.5) * 0.18;
        uu.x = lx + (c - (n - 1) / 2) * step + jx * (row ? 1 : 0.3);
        uu.z = z + jz * (row ? 1 : 0);
        uu.ph = j * 6.283;
        idx++;
      }
      z += step * 0.95; row++;
    }
    return units;
  }
  blob(x, z, size) {
    if (this.blobN >= 320) return;
    this._bp.set(x, 0.02, z); this._bs.set(size, 1, size * 0.8); this._bm.compose(this._bp, this._bq, this._bs);
    this.blobs.setMatrixAt(this.blobN++, this._bm);
  }
  update(dt, sim, camera) {
    this.uTime.value += dt;
    const now = this.uTime.value;
    this.blobN = 0;
    const tiers = sim.tiers;
    const units = this.layout(sim, tiers);
    while (this.slots.length < units.length) this.slots.push({ x: units[this.slots.length].x, z: units[this.slots.length].z + 1.5, s: 1 });
    this.slots.length = units.length;
    const k = 1 - Math.exp(-dt * 9);
    this.squad.begin();
    for (let i = 0; i < units.length; i++) {
      const u = units[i], sl = this.slots[i];
      sl.x += (u.x - sl.x) * k; sl.z += (u.z - sl.z) * k; sl.s += (u.s - sl.s) * k * 0.6;
      this.aimAt[i] *= Math.exp(-dt * 3);
      this.squad.put(sl.x, 0, sl.z, 0, sl.s, sl.s, sl.s, u.ph, 0, 0, null, 0, this.fireAt[i], this.aimAt[i]);
      this.blob(sl.x, sl.z, 0.9 * sl.s);
      if (i === 0) this.leader.set(sl.x, 0, sl.z);
    }
    this.squad.end();
    if (sim.count !== this.lastCount) { this.lastCount = sim.count; this.drawBadge(sim.count, sim.tierRank); }
    const lead = this.slots[0] || { x: 0, z: 0, s: 1 };
    let cx = 0, cz = 0; for (const sl of this.slots) { cx += sl.x; cz += sl.z; } cx /= this.slots.length; cz /= this.slots.length;
    this.badge.position.set(cx, 2.2 * lead.s + 0.6, cz);
    this.badge.visible = sim.status !== 'dead';
    // foes
    for (const key in this.batches) this.batches[key].begin();
    for (const f of sim.foes) {
      if (f.gone > 0 || f.dead) continue;
      const b = this.batches[f.type]; if (!b) continue;
      const d = this.FOES[f.type];
      const s = d.scale;
      const gait = f.kind === 'float' ? 3 : (f.lunge || f.kind === 'run' || f.kind === 'hound') ? 1 : 2;
      const hit = f.flash > 0.08 ? 1 : 0;
      const y = f.state === 'dig' && f.kind !== 'float' ? -0.12 : 0;
      const face = Math.PI + Math.atan2(f.x - sim.leaderX, 4) * 0.6;
      // per-head variation: size ±8 %, skin tone ±12 %, so a pack never reads as clones
      const hv = hash(f.id * 31 + 7), hv2 = hash(f.id * 53 + 11);
      const sv = s * (0.92 + hv * 0.16);
      this._tv = this._tv || new THREE.Color();
      this._tv.copy(this.tints[f.type]).multiplyScalar(0.88 + hv2 * 0.24);
      b.put(f.x * ROAD, y, -f.z - hit * 0.12, face, sv * (f.type === 'brute' ? 1.25 : 1), sv, sv * (f.type === 'brute' ? 1.15 : 1), f.id * 1.37, gait, hit, this._tv, (f.lunge ? -0.25 : 0) + hit * 0.16);
      if (f.kind !== 'float') this.blob(f.x * ROAD, -f.z, 0.95 * sv);
    }
    // the fallen: topple, then sink into the road
    const scroll = sim.speed * dt;
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i]; c.t += dt; c.z += scroll;
      if (c.t > 2.2 || c.z > 10) { this.corpses.splice(i, 1); continue; }
      const b = this.batches[c.type]; if (!b) continue;
      const d = this.FOES[c.type];
      const fall = Math.min(1, c.t * 3.2);
      const lean = 1.45 * fall * fall;
      const sink = c.t > 1.2 ? (c.t - 1.2) * 0.8 : 0;
      b.put(c.x, -sink, c.z, Math.PI + c.dir * 0.3, d.scale, d.scale, d.scale, c.ph, 4, c.t < 0.08 ? 1 : 0, this.tints[c.type], lean);
    }
    for (const key in this.batches) this.batches[key].end();
    // boss
    const bs = sim.boss;
    this.bossBatch.begin();
    if (bs && bs.alive && !(bs.gone > 0)) {
      const def = bs.def;
      this.bossTint.setHex(def.tint);
      const hit = bs.flash > 0.1 ? 1 : 0;
      const lean = bs.rushing > 0 ? -0.45 : (bs.enraged ? -0.2 : 0) + hit * 0.08;
      this.bossBatch.put(bs.x * ROAD, 0, -bs.z, Math.PI, def.scale, def.scale, def.scale, 1.1, bs.rushing > 0 ? 1 : 2, hit, this.bossTint, lean);
      this.blob(bs.x * ROAD, -bs.z, 1.1 * def.scale);
      this.halo.visible = true;
      this.halo.position.set(bs.x * ROAD, 0.06, -bs.z);
      this.halo.scale.setScalar(def.scale * (1 + 0.08 * Math.sin(now * 6)));
      this.halo.material.color.setHex(def.accent);
      this.halo.material.opacity = bs.enraged ? 0.5 + 0.5 * Math.abs(Math.sin(now * 12)) : 0.7;
    } else this.halo.visible = false;
    this.bossBatch.end();
    this.blobs.count = this.blobN; this.blobs.instanceMatrix.needsUpdate = true;
  }
}
