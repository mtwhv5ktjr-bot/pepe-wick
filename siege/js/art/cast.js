/* =========================================================================
   CONTINENTAL SIEGE — THE CAST. Who stands on the floor and how they look.
   Towers (core TURRETS ids) become Pepe operatives of the hotel; enemies become
   the High Table's hired help. Presentation only — stats live in core.js.
   pal = [SKIN, COAT, HAND]; look → drawCharacter options; gun → gunart type
   (the on-chain WICK ARSENAL body) the operative holds by default.
   ========================================================================= */
(function (global) {
  'use strict';
  const PEPE = '#4f9a3f';          // the face green (pepe-zero hero)
  const PEPE_HAND = '#5cae48';

  // ---- towers ----
  const OPERATIVES = {
    pistol:  { title: 'THE CONCIERGE',   line: 'Front desk. Service pistol. Never raises his voice.',
               pal: [PEPE, '#5a1620', PEPE_HAND], look: { shirt: '#f1e9dc', tie: '#c9a227', hat: 'pillbox', hatC: '#5a1620' }, grip: 'pistol', gun: 1 },
    smg:     { title: 'THE BELLHOP',     line: 'Carries your bags. And a Vector.',
               pal: [PEPE, '#7a1c2e', PEPE_HAND], look: { shirt: '#f1e9dc', hat: 'pillbox', hatC: '#7a1c2e', build: 0.92 }, grip: 'rifle', gun: 2 },
    shotgun: { title: 'THE DOORMAN',     line: 'Greatcoat, buckshot. Nobody without a reservation.',
               pal: [PEPE, '#141416', PEPE_HAND], look: { shirt: '#c9c9cf', hat: 'cap', build: 1.35, leg: '#141416' }, grip: 'rifle', gun: 3 },
    sniper:  { title: 'THE ADJUDICATOR', line: 'Watches from the mezzanine. Rules are rules.',
               pal: [PEPE, '#e6e6ea', PEPE_HAND], look: { shirt: '#111318', tie: '#111318', leg: '#d9d9de', shoe: '#2a2a30', hair: '#2a2016' }, grip: 'rifle', gun: 4 },
    keg:     { title: 'THE SOMMELIER',   line: 'Lobs the ’86. Nobody drinks the ’86.',
               pal: [PEPE, '#2b1a3a', PEPE_HAND], look: { shirt: '#f1e9dc', tie: '#7a1c2e', build: 1.05 }, grip: 'none', gun: null },
    tesla:   { title: 'THE OPERATOR',    line: 'Switchboard sparks. Every line is tapped.',
               pal: [PEPE, '#1c3a2f', PEPE_HAND], look: { shirt: '#dfe4ea', hat: 'beret', hatC: '#0e2b21', shadeFill: '#1a4a3a' }, grip: 'none', gun: null },
    mint:    { title: 'THE ACCOUNTANT',  line: 'Presses coins between waves. Doesn’t fight. Earns.',
               pal: [PEPE, '#3a2f14', PEPE_HAND], look: { shirt: '#f4ecd0', tie: '#7a5a10', hat: 'fedora', hatC: '#2a220e', hatBand: '#c9a227', build: 1.1 }, grip: 'none', gun: null },
    banner:  { title: 'THE MANAGER',     line: 'Winston’s desk. Every gun on the floor stands taller.',
               pal: [PEPE, '#1e2230', PEPE_HAND], look: { shirt: '#f1e9dc', tie: '#8f4034', hair: '#3a3a3f', hairBack: '#2a2a2f', build: 1.15 }, grip: 'none', gun: null },
    gatling: { title: 'BABA YAGA',       line: 'HOLDER ORDNANCE. The one you send to kill the boogeyman.',
               pal: [PEPE, '#0a0a0c', PEPE_HAND], look: { shirt: '#0c0e12', tie: '#0a0a0a', leg: '#0a0a0c', shadeFill: '#000' }, grip: 'rifle', gun: 15, holo: true },
  };

  // ---- enemies (High Table hired help) ----
  const SKINS = ['#e6c9a8', '#c99a6b', '#8a5a3c', '#f0dcc4', '#6b4a32'];
  const ENEMY_LOOKS = {
    goon:   { coats: ['#1a1c22', '#23252c', '#2c2a2a'], look: { shades: false, mask: true, shirt: '#8a8a92', tie: '#111' }, grip: 'pistol', gun: 1, cellH: 112 },
    runner: { coats: ['#2a3040', '#1e2a2a'], look: { shades: false, mask: '#3a1a1a', shirt: '#b0b0b8', build: 0.85, tie: '#8f4034' }, grip: 'pistol', gun: 2, cellH: 112 },
    heavy:  { coats: ['#2a2420', '#1f2530'], look: { shades: false, mask: true, shirt: '#6a6a72', build: 1.55, hat: 'cap', hatC: '#0e0e10' }, grip: 'rifle', gun: 5, cellH: 124, scale: 1.18 },
    shield: { coats: ['#22303c'], look: { shades: false, mask: true, shirt: '#7c8a9a', build: 1.25, shield: true, hat: 'cap', hatC: '#22303c' }, grip: 'pistol', gun: 1, cellH: 118, scale: 1.08 },
    medic:  { coats: ['#e8e8ec'], look: { shades: false, mask: '#8f2020', shirt: '#8f2020', leg: '#dcdce0', shoe: '#3a3a40', build: 0.95 }, grip: 'none', gun: null, cellH: 112 },
    ghost:  { coats: ['#0e0e14', '#141420'], look: { shades: true, shadeFill: '#050508', shirt: '#0e0e14', tie: '#0a0a0a', build: 0.9 }, grip: 'pistol', gun: 12, cellH: 112 },
    boss:   { coats: ['#5a1620', '#c9a227', '#7a1c2e', '#e6e6ea', '#101010', '#2b1a3a'], look: { shades: true, build: 1.45, shirt: '#f1e9dc', tie: '#111' }, grip: 'rifle', gun: 5, cellH: 136, scale: 1.35 },
  };
  const BOSS_LOOKS = [ // by boss index (core BOSS_NAMES order): MS. PERKINS, CASSIAN, ARES, ZERO, KILLA, THE DIRECTOR
    { coat: '#5a1620', look: { shades: true, build: 1.2, hair: '#5a3a1a', shirt: '#f1e9dc' }, gun: 12 },
    { coat: '#1a1c22', look: { shades: true, build: 1.5, hair: '#2a2a2f', shirt: '#f1e9dc', tie: '#7a1c2e' }, gun: 5 },
    { coat: '#0e0e14', look: { shades: true, shadeFill: '#000', build: 1.35, hair: '#111', shirt: '#0e0e14' }, gun: 4 },
    { coat: '#101010', look: { shades: false, mask: '#0a0a0a', build: 1.3, hair: '#0a0a0a', shirt: '#101010', tie: '#101010' }, gun: 3 },
    { coat: '#c9a227', look: { shades: true, build: 1.6, hair: '#1a1a1a', shirt: '#f1e9dc', tie: '#c9a227' }, gun: 15 },
    { coat: '#2b1a3a', look: { shades: false, mask: '#e6e6ea', build: 1.25, hair: '#e6e6ea', hairBack: '#d9d9de', shirt: '#e6e6ea' }, gun: 14 },
  ];

  global.CS_CAST = { OPERATIVES, ENEMY_LOOKS, BOSS_LOOKS, SKINS, PEPE, PEPE_HAND };
})(typeof window !== 'undefined' ? window : globalThis);
