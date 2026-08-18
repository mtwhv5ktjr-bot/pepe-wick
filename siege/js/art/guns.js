/* =========================================================================
   CONTINENTAL SIEGE — gun compositing from the ON-CHAIN art.
   gunart.js (byte-identical to wick-arsenal's WickGunBodies) draws every WICK
   ARSENAL gun facing right in a 400×400 space with the grip near x≈120-200,
   y≈200-260 and the muzzle at the right edge. We rasterize each type once to a
   small texture with metadata: grip anchor (where the operative's fist goes)
   and muzzle point (where flashes/tracers start), both in texture pixels.
   ========================================================================= */
(function (global) {
  'use strict';
  // per-type grip + muzzle in gunart's 400-space (measured from the bodies)
  const META = {
    1:  { grip: [148, 232], muzzle: [340, 173], scale: 0.115 },   // P30
    2:  { grip: [208, 236], muzzle: [356, 169], scale: 0.115 },   // Vector
    3:  { grip: [162, 210], muzzle: [352, 160], scale: 0.115 },   // Breacher
    4:  { grip: [220, 226], muzzle: [367, 167], scale: 0.115 },   // Marksman
    5:  { grip: [156, 200], muzzle: [364, 176], scale: 0.115 },   // Excommunicado
    11: { grip: [148, 232], muzzle: [340, 173], scale: 0.115 },
    12: { grip: [148, 232], muzzle: [340, 173], scale: 0.115 },
    13: { grip: [220, 226], muzzle: [367, 167], scale: 0.115 },
    14: { grip: [220, 226], muzzle: [367, 167], scale: 0.115 },
    15: { grip: [148, 232], muzzle: [340, 173], scale: 0.115 },
    16: { grip: [200, 216], muzzle: [368, 156], scale: 0.115 },
  };
  const cache = new Map();
  /** rasterize gun type t → { canvas, grip:{x,y}, muzzle:{x,y}, w, h } (async — SVG decode) */
  function bakeGun(mk, t, opts) {
    opts = opts || {};
    const key = t + ':' + (opts.px || 0);
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    return new Promise((resolve) => {
      const svg = global.gunBodySVG(t);                 // viewBox 38 128 330 168
      const img = new Image();
      img.onload = () => {
        const px = opts.px || 46;                       // gun texture width in px (hand-scale on a 64px operative ≈ 46px long)
        const scale = px / 330;
        const w = Math.ceil(330 * scale), h = Math.ceil(168 * scale);
        const cv = mk(w, h), c = cv.getContext('2d');
        c.imageSmoothingQuality = 'high';
        c.drawImage(img, 0, 0, w, h);
        const m = META[t] || META[1];
        const out = { canvas: cv, w, h, scale, type: t,
          grip: { x: (m.grip[0] - 38) * scale, y: (m.grip[1] - 128) * scale },
          muzzle: { x: (m.muzzle[0] - 38) * scale, y: (m.muzzle[1] - 128) * scale } };
        cache.set(key, out); resolve(out);
      };
      img.onerror = () => resolve(null);
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    });
  }
  global.CS_GUNS = { bakeGun, META };
})(typeof window !== 'undefined' ? window : globalThis);
