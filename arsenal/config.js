// WICK Arsenal — front-end config. Fill in guns/market after you deploy.
window.WICK_CFG = {
  chain: {
    id: 369,
    hexId: "0x171",
    name: "PulseChain",
    rpc: "https://rpc.pulsechain.com",
    explorer: "https://scan.pulsechain.com",
    symbol: "PLS",
    decimals: 18,
  },
  // read-path RPC: the only public node that reliably serves batches + logs.
  // cfg.chain.rpc above stays the wallet-facing RPC (add-chain param etc.)
  rpcRead: "https://rpc-pulsechain.g4mm4.io",
  // ⬇⬇ paste from out/deployed.json after running deploy.mjs ⬇⬇
  guns:   "0x188848DdB42fA8Ca2EB05649c944e05dfA2158FD",
  market: "0x8F60741De2c49a46B8eFb6Cf89dDd3c08D1fb4e9",
  marketOld: "0x1457C17A7132fCbCb2034337368050563DeD91e3",
  mods:       "0x004E6610ff47c6A6510DA446257822B37D26CD73",   // WICK MODS free mint — paste after LAUNCH-MODS.cmd
  modsMarket: "0xDDb963D1bb874d4ac5697550F513568c657E977E",   // mods marketplace — 50% royalty, 100% burned as $WICK
  gear:       "0x0000000000000000000000000000000000000000",   // KJPGear — paste after tools/deploy-gear.mjs
  gearMarket: "0x0000000000000000000000000000000000000000",   // KJPGearMarket — 15% royalty, burned 50/50 KJP+WICK
  // LIVE on PulseChain. A non-zero address here is also what UNHIDES the
  // ADVERTISE tab (bbConfigured()) — set only after the production E2E passed.
  billboards: "0x84587C185CAcE68CC559e86936F61812609548DF",
};

// modType -> presentation for the free-mint attachments. Effects mirror the game's
// MODDEFS exactly — same honesty rule as the gun cards.
window.WICK_MODS = {
  1: { name: "LASER SIGHT",     rarity: "Common",   supply: 90, color: "#7fd0ff", fx: "spread ×0.35 — near-laser accuracy" },
  2: { name: "HOLLOW POINTS",   rarity: "Common",   supply: 80, color: "#ff9d9d", fx: "+15% damage" },
  3: { name: "HAIR TRIGGER",    rarity: "Uncommon", supply: 60, color: "#ffd75e", fx: "+15% fire rate" },
  4: { name: "LONG BARREL",     rarity: "Uncommon", supply: 45, color: "#c8ffe0", fx: "+30% bullet speed, +5% damage" },
  5: { name: "AP ROUNDS",       rarity: "Rare",     supply: 20, color: "#b26bff", fx: "+1 pierce" },
  6: { name: "DRAGON'S BREATH", rarity: "Epic",     supply: 5,  color: "#ff6b3d", fx: "+1 projectile per shot" },
};

// gunType id -> presentation. Balance stats live in the game; these are for display.
// Every perk below is a claim about PEPE WICK, and people trade real PLS against
// these cards — so every claim traces to a field in the game's GUNDEFS/specFor.
// (Holo 1/1s resolve to their base type at +20% damage; that's the whole holo perk.)
window.WICK_GUNS = {
  1:  { name: "Boogeyman P30",     cls: "Pistol",   rarity: "Common",        supply: 30, color: "#cfd6e0", holo: false, blurb: "The workhorse. Clean, fast, no drama. A pro's baseline.", perk: "Balanced all-rounder" },
  2:  { name: "Continental Vector",cls: "SMG",      rarity: "Uncommon",      supply: 25, color: "#7cf9a5", holo: false, blurb: "Spits lead. Low damage per round, but it never stops talking.", perk: "Full-auto SMG: 13 rounds/sec" },
  3:  { name: "Kimber Breacher",   cls: "Shotgun",  rarity: "Uncommon",      supply: 18, color: "#ff9d3d", holo: false, blurb: "Doorbuster. Devastating up close, useless at range.", perk: "6-pellet blast — every pellet shoves. Nothing pushes a crowd back harder." },
  4:  { name: "TTI Marksman",      cls: "Rifle",    rarity: "Rare",          supply: 15, color: "#7fd0ff", holo: false, blurb: "One clean line. Pierces a body, marks the next.", perk: "Pierces 2 enemies per shot · 34 dmg" },
  5:  { name: "Excommunicado",     cls: "Auto Rifle", rarity: "Epic",        supply: 7,  color: "#b26bff", holo: false, blurb: "Excommunicado. It never stops talking and it ends arguments.", perk: "Full-auto rifle: 9 rounds/sec, 15 dmg" },
  11: { name: "Gold Standard",     cls: "1/1 Platinum", rarity: "Platinum Holo", supply: 1, color: "#ffd23f", holo: true, blurb: "Every kill pays. The house always wins.", perk: "Holo P30: +20% damage rapid pistol" },
  12: { name: "The Impossible",    cls: "1/1 Platinum", rarity: "Platinum Holo", supply: 1, color: "#8bd6ff", holo: true, blurb: "The shot that shouldn't exist.", perk: "Holo Vector: +20% damage full-auto" },
  13: { name: "High Table",        cls: "1/1 Platinum", rarity: "Platinum Holo", supply: 1, color: "#e6c3ff", holo: true, blurb: "Rules are rules. The Table's word lands six ways at once.", perk: "Holo Breacher: 6 pellets, +20% damage" },
  14: { name: "Tabula Rasa",       cls: "1/1 Platinum", rarity: "Platinum Holo", supply: 1, color: "#c8ffe0", holo: true, blurb: "A clean slate, one line at a time.", perk: "Holo Marksman: pierces 2, 41 dmg" },
  15: { name: "Baba Yaga",         cls: "1/1 Platinum", rarity: "Platinum Holo", supply: 1, color: "#ffe9a8", holo: true, blurb: "The one you send to kill the Boogeyman.", perk: "Holo Excommunicado: 18 dmg full-auto" },
  16: { name: "Tangential Reaper", cls: "1/1 Ultra Platinum", rarity: "Ultra Platinum Holo", supply: 1, color: "#7cf9a5", holo: true, blurb: "Forged for tangent.pls. A green AR-15 that answers every question three ways. No 000/100 — never mintable.", perk: "Tri-arc: 3 rounds, every direction" },
};

/* KJP GEAR — the 100-piece cross-game FIELD ISSUE. Works in KJP and PEPE WICK.
   Mint burns 50% KJP + 50% WICK; resale royalty is 15%, burned the same way. */
window.WICK_GEAR = {
  1:{name:"SUPPRESSOR",    rarity:"Common",    pool:22, color:"#7cf9a5", fx:"silences every lethal gun you carry"},
  2:{name:"KEVLAR WEAVE",  rarity:"Common",    pool:20, color:"#7cf9a5", fx:"+1 heart, and the first hit of each op is absorbed"},
  3:{name:"TACTICAL BOOTS",rarity:"Uncommon",  pool:16, color:"#8fc7ff", fx:"+8% movement, running 25% quieter"},
  4:{name:"EXTENDED MAGS", rarity:"Uncommon",  pool:14, color:"#8fc7ff", fx:"+33% magazine on every firearm"},
  5:{name:"NIGHT OPTICS",  rarity:"Rare",      pool:12, color:"#c792ff", fx:"TAC-MAP never jams, even in COMBAT"},
  6:{name:"K9 TREATS",     rarity:"Rare",      pool:8,  color:"#c792ff", fx:"guard dogs take twice as long to place your scent"},
  7:{name:"SKELETON KEY",  rarity:"Epic",      pool:5,  color:"#ff9d5b", fx:"opens ANY locked door — no keycard needed"},
  8:{name:"GOLD BRIEFCASE",rarity:"Legendary", pool:3,  color:"#ffd27c", fx:"x1.25 score, and every exhibit pays double"}
};