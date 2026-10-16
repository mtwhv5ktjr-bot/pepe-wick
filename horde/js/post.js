/* PEPE WICK vs HORDE — post stack. HDR scene → threshold → 5-mip blur →
   bloom, then one grade pass: ACES tone map, lift/gain, saturation,
   vignette, chromatic aberration at the edges, animated grain, screen flash.
   Self-contained (no three/examples), MSAA on the HDR target. */
import * as THREE from 'three';

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const THRESH = `
uniform sampler2D tex; uniform float uThresh; uniform float uSoft; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tex, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float knee = uThresh * uSoft;
  float soft = clamp(l - uThresh + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float w = max(soft, l - uThresh) / max(l, 1e-4);
  gl_FragColor = vec4(c * w, 1.0);
}`;

const BLUR = `
uniform sampler2D tex; uniform vec2 uDir; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tex, vUv).rgb * 0.227027;
  c += texture2D(tex, vUv + uDir * 1.3846).rgb * 0.3162162;
  c += texture2D(tex, vUv - uDir * 1.3846).rgb * 0.3162162;
  c += texture2D(tex, vUv + uDir * 3.2308).rgb * 0.0702703;
  c += texture2D(tex, vUv - uDir * 3.2308).rgb * 0.0702703;
  gl_FragColor = vec4(c, 1.0);
}`;

const ADD = `
uniform sampler2D tex; uniform sampler2D tex2; uniform float uW; varying vec2 vUv;
void main(){ gl_FragColor = vec4(texture2D(tex, vUv).rgb + texture2D(tex2, vUv).rgb * uW, 1.0); }`;

const GRADE = `
uniform sampler2D tScene; uniform sampler2D tBloom;
uniform float uBloom, uExposure, uSat, uVig, uAberr, uGrain, uTime, uContrast;
uniform vec3 uLift, uGain, uFlash, uTint;
varying vec2 vUv;
vec3 aces(vec3 x){ const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
void main(){
  vec2 uv = vUv;
  vec2 d = uv - 0.5;
  float r2 = dot(d, d);
  // chromatic aberration grows toward the edges
  vec2 off = d * r2 * uAberr;
  vec3 col;
  col.r = texture2D(tScene, uv + off).r;
  col.g = texture2D(tScene, uv).g;
  col.b = texture2D(tScene, uv - off).b;
  vec3 bloom = texture2D(tBloom, uv).rgb;
  col += bloom * uBloom;
  col *= uExposure * uTint;
  col = aces(col);
  // lift / gain, contrast, saturation
  col = col * uGain + uLift * (1.0 - col);
  col = (col - 0.5) * uContrast + 0.5;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat);
  // vignette
  float v = smoothstep(0.9, 0.25, r2 * uVig);
  col *= mix(0.55, 1.0, v);
  // grain
  float g = hash(uv * vec2(1920.0, 1080.0) + fract(uTime * 7.0) * 100.0) - 0.5;
  col += g * uGrain;
  col += uFlash;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export class Post {
  constructor(renderer) {
    this.r = renderer;
    this.w = 2; this.h = 2;
    const q = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(q, null);
    this.scene = new THREE.Scene(); this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mk = (frag, uni) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms: uni, depthTest: false, depthWrite: false });
    this.mThresh = mk(THRESH, { tex: { value: null }, uThresh: { value: 0.82 }, uSoft: { value: 0.6 } });
    this.mBlur = mk(BLUR, { tex: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.mAdd = mk(ADD, { tex: { value: null }, tex2: { value: null }, uW: { value: 1 } });
    this.mGrade = mk(GRADE, {
      tScene: { value: null }, tBloom: { value: null },
      uBloom: { value: 0.9 }, uExposure: { value: 1.1 }, uSat: { value: 1.08 }, uVig: { value: 1.6 }, uAberr: { value: 0.012 }, uGrain: { value: 0.035 }, uTime: { value: 0 }, uContrast: { value: 1.06 },
      uLift: { value: new THREE.Vector3(0, 0, 0) }, uGain: { value: new THREE.Vector3(1, 1, 1) }, uFlash: { value: new THREE.Vector3() }, uTint: { value: new THREE.Vector3(1, 1, 1) },
    });
    this.flash = new THREE.Vector3();
    this.mips = [];
    this.enabled = true;
    this.quality = 1;
    this.resize(renderer.domElement.width, renderer.domElement.height);
  }
  resize(w, h) {
    w = Math.max(2, w | 0); h = Math.max(2, h | 0);
    if (w === this.w && h === this.h && this.rtScene) return;
    this.w = w; this.h = h;
    if (this.rtScene) { this.rtScene.dispose(); for (const m of this.mips) { m.a.dispose(); m.b.dispose(); } }
    this.rtScene = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: this.quality > 0.6 ? 4 : 0, depthBuffer: true });
    this.mips = [];
    let mw = w >> 1, mh = h >> 1;
    for (let i = 0; i < 5; i++) {
      mw = Math.max(1, mw); mh = Math.max(1, mh);
      const o = { type: THREE.HalfFloatType, depthBuffer: false };
      this.mips.push({ a: new THREE.WebGLRenderTarget(mw, mh, o), b: new THREE.WebGLRenderTarget(mw, mh, o), w: mw, h: mh });
      mw >>= 1; mh >>= 1;
    }
  }
  setGrade(g) {
    const u = this.mGrade.uniforms;
    if (g.bloom != null) u.uBloom.value = g.bloom;
    if (g.exposure != null) u.uExposure.value = g.exposure;
    if (g.sat != null) u.uSat.value = g.sat;
    if (g.vig != null) u.uVig.value = g.vig;
    if (g.aberr != null) u.uAberr.value = g.aberr;
    if (g.grain != null) u.uGrain.value = g.grain;
    if (g.contrast != null) u.uContrast.value = g.contrast;
    if (g.lift) u.uLift.value.set(g.lift[0], g.lift[1], g.lift[2]);
    if (g.gain) u.uGain.value.set(g.gain[0], g.gain[1], g.gain[2]);
    if (g.tint) u.uTint.value.set(g.tint[0], g.tint[1], g.tint[2]);
    if (g.thresh != null) this.mThresh.uniforms.uThresh.value = g.thresh;
  }
  addFlash(r, g, b) { this.flash.x += r; this.flash.y += g; this.flash.z += b; }
  pass(mat, target) {
    this.quad.material = mat;
    this.r.setRenderTarget(target);
    this.r.render(this.scene, this.cam);
  }
  render(scene, camera, dt) {
    const r = this.r;
    if (!this.enabled) { r.setRenderTarget(null); r.render(scene, camera); return; }
    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(scene, camera);
    // bloom chain
    const m0 = this.mips[0];
    this.mThresh.uniforms.tex.value = this.rtScene.texture;
    this.pass(this.mThresh, m0.a);
    let src = m0.a;
    for (let i = 0; i < this.mips.length; i++) {
      const m = this.mips[i];
      if (i > 0) { this.mBlur.uniforms.tex.value = src.texture; this.mBlur.uniforms.uDir.value.set(0, 0); this.pass(this.mBlur, m.a); src = m.a; }
      this.mBlur.uniforms.tex.value = src.texture; this.mBlur.uniforms.uDir.value.set(1 / m.w, 0); this.pass(this.mBlur, m.b);
      this.mBlur.uniforms.tex.value = m.b.texture; this.mBlur.uniforms.uDir.value.set(0, 1 / m.h); this.pass(this.mBlur, m.a);
      src = m.a;
    }
    // upsample-add from the smallest mip back to mip 0 (b buffers as accumulators)
    let acc = this.mips[this.mips.length - 1].a;
    for (let i = this.mips.length - 2; i >= 0; i--) {
      const m = this.mips[i];
      this.mAdd.uniforms.tex.value = m.a.texture; this.mAdd.uniforms.tex2.value = acc.texture; this.mAdd.uniforms.uW.value = 1.0;
      this.pass(this.mAdd, m.b);
      acc = m.b;
    }
    // grade to screen
    const u = this.mGrade.uniforms;
    u.tScene.value = this.rtScene.texture; u.tBloom.value = acc.texture;
    u.uTime.value += dt || 0.016;
    u.uFlash.value.copy(this.flash);
    this.flash.multiplyScalar(Math.max(0, 1 - (dt || 0.016) * 9));
    r.setRenderTarget(null);
    this.pass(this.mGrade, null);
  }
}
