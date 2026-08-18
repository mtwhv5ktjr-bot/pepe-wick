/* =========================================================================
   CONTINENTAL SIEGE — UI art (trading-card language of mint.wick.pics).

   The bakers live in js/art/fx.js, which defines BOTH window.CS_FX and
   window.CS_UI_ART (art/preview.html only loads fx.js). This file is a
   pointer so a <script src="js/art/uiart.js"> tag is harmless: it just
   confirms fx.js was loaded first.

     window.CS_UI_ART.bakeAll(mk) → Promise<{ key: { canvas, w, h } }>
     window.CS_UI_ART.NINE        = { left:14, top:14, right:14, bottom:14 }
       (nine-slice insets for frameGold + panel)

   Keys: frameGold 96×96 · card / cardSel / cardLocked 150×200 · panel 320×160 ·
         btn / btnHot 200×44 · hpBar 60×6 · hpFill / hpFillW 56×4 ·
         waveBanner 900×110 · starOn / starOff 32×32 · coinIcon / markerIcon 18×18 ·
         skull 20×20 · lockIcon 20×24
   ========================================================================= */
(function (global) {
  'use strict';
  if (!global.CS_UI_ART && typeof console !== 'undefined') console.warn('CS_UI_ART: load js/art/fx.js first — it defines CS_UI_ART.');
})(typeof window !== 'undefined' ? window : globalThis);
