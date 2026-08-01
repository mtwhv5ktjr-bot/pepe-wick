// Deploy WICK MODS — the FREE-mint attachment collection (PulseChain).
// HOLDERS ONLY: every WICK Arsenal gun grants 3 mod mints (tracked per gun,
// so a spent gun stays spent when sold). 300 supply · 6 real game modifiers.
//
//   PRIVATE_KEY=0x... node deploy-mods.mjs      (or double-click FREE-MINT-MODS.cmd)
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const root = dirname(fileURLToPath(import.meta.url));
const ethers = createRequire(import.meta.url)("ethers");

const PK = process.env.PRIVATE_KEY;
if (!PK) { console.error("Set PRIVATE_KEY (the owner wallet)."); process.exit(1); }
const Mods = JSON.parse(readFileSync(join(root, "out", "WickMods.json"), "utf8"));
const RPC = (process.env.RPC_URL || "https://rpc.pulsechain.com").trim();

const CHAIN = new ethers.Network("pulsechain", 369);
const provider = new ethers.JsonRpcProvider(RPC, CHAIN, { staticNetwork: CHAIN });
const wallet = new ethers.Wallet(PK, provider);

console.log("deployer :", wallet.address);
const bal = await provider.getBalance(wallet.address);
console.log("balance  :", ethers.formatEther(bal), "PLS");
if (bal < ethers.parseEther("5")) { console.error("✗ not enough PLS for gas."); process.exit(1); }

// the mint ticket: the LIVE WickGuns collection
let GUNS = process.env.GUNS_ADDR || "0x188848DdB42fA8Ca2EB05649c944e05dfA2158FD";
try { const d = JSON.parse(readFileSync(join(root, "out", "deployed.json"), "utf8")); if (d.guns) GUNS = d.guns; } catch {}
console.log("guns gate :", GUNS, "(3 free mod mints per gun)");

console.log("\ndeploying WickMods…");
const mods = await (await new ethers.ContractFactory(Mods.abi, Mods.bytecode, wallet)
  .deploy(GUNS)).waitForDeployment();
const addr = await mods.getAddress();
console.log("✅ WICK MODS:", addr);

console.log("opening the free mint…");
await (await mods.setMintOpen(true)).wait();

// sanity-read it back
console.log("   mintOpen  :", await mods.mintOpen());
console.log("   supply cap:", (await mods.MAX_SUPPLY()).toString());
console.log("   per gun   :", (await mods.MINTS_PER_GUN()).toString(), "free mints (gun-gated: no gun, no mint)");
console.log("   deployer allowance:", (await mods.allowanceOf(wallet.address)).toString(), "(3 × guns held)");
const pool = await mods.poolLeft();
console.log("   pool      :", [1,2,3,4,5,6].map(t=>Number(pool[t])).join("/"), "(laser/hollow/trigger/barrel/AP/dragon)");

// ---- the mods' own marketplace: 50% royalty, 100% of it buys & burns $WICK ----
const Mkt = JSON.parse(readFileSync(join(root, "out", "WickModsMarket.json"), "utf8"));
const ROUTER = process.env.BURN_ROUTER || "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02"; // PulseX
const WPLS   = process.env.WPLS       || "0xA1077a294dDE1B09bB078844df40758a5D0f9a27";
const WICK   = process.env.WICK_TOKEN || "0x8CDaf3d630Da9E1450832924D5701CC0500E9cfC";
console.log("\ndeploying WickModsMarket (50% burn royalty)…");
const mkt = await (await new ethers.ContractFactory(Mkt.abi, Mkt.bytecode, wallet)
  .deploy(addr, 5000, ROUTER, WPLS, WICK)).waitForDeployment();
const mktAddr = await mkt.getAddress();
console.log("✅ MODS MARKET:", mktAddr);
console.log("   feeBps    :", (await mkt.feeBps()).toString(), "(50% of every resale → $WICK burn, in-tx)");
console.log("   bound to  :", await mkt.nft());

// record them beside the other addresses
let dep = {};
try { dep = JSON.parse(readFileSync(join(root, "out", "deployed.json"), "utf8")); } catch {}
dep.mods = addr;
dep.modsMarket = mktAddr;
writeFileSync(join(root, "out", "deployed.json"), JSON.stringify(dep, null, 2));
console.log("\nsaved to out/deployed.json");
console.log("\nNEXT STEPS (paste BOTH addresses to Claude):");
console.log("  MODS_ADDR        = " + addr);
console.log("  MODS_MARKET_ADDR = " + mktAddr);
console.log("  Claude wires: web/config.js (mods + modsMarket), vercel env MODS_ADDR,");
console.log("  game MODS_ADDR constant — then redeploys both sites.");
