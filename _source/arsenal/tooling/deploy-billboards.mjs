// Deploy WICK BILLBOARDS — self-serve in-game ad slots (PulseChain).
// 1M PLS/day rotation · 10M PLS/day exclusive takeover · 50% burns $WICK, 50% treasury.
//
//   PRIVATE_KEY=0x... node deploy-billboards.mjs    (or double-click LAUNCH-BILLBOARDS.cmd)
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const root = dirname(fileURLToPath(import.meta.url));
const ethers = createRequire(import.meta.url)("ethers");

const PK = process.env.PRIVATE_KEY;
if (!PK) { console.error("Set PRIVATE_KEY (the owner wallet)."); process.exit(1); }
const BB = JSON.parse(readFileSync(join(root, "out", "WickBillboards.json"), "utf8"));
const RPC = (process.env.RPC_URL || "https://rpc.pulsechain.com").trim();
const ROUTER = process.env.BURN_ROUTER || "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02"; // PulseX
const WPLS   = process.env.WPLS       || "0xA1077a294dDE1B09bB078844df40758a5D0f9a27";
const WICK   = process.env.WICK_TOKEN || "0x8CDaf3d630Da9E1450832924D5701CC0500E9cfC";
const BURN_BPS = BigInt(process.env.BURN_BPS || "5000");   // half of every sale burns $WICK

const CHAIN = new ethers.Network("pulsechain", 369);
const provider = new ethers.JsonRpcProvider(RPC, CHAIN, { staticNetwork: CHAIN });
const wallet = new ethers.Wallet(PK, provider);
const TREASURY = (process.env.TREASURY || wallet.address).trim();   // ad revenue lands here

console.log("deployer :", wallet.address);
console.log("treasury :", TREASURY, TREASURY === wallet.address ? "(the deployer wallet — change later with setTreasury)" : "");
console.log("split    :", Number(BURN_BPS) / 100 + "% burns $WICK · " + (100 - Number(BURN_BPS) / 100) + "% to treasury");
const bal = await provider.getBalance(wallet.address);
console.log("balance  :", ethers.formatEther(bal), "PLS");
if (bal < ethers.parseEther("3")) { console.error("✗ not enough PLS for gas."); process.exit(1); }

// --- RUN-TWICE GUARD -------------------------------------------------------
// A second run deploys a fresh board with no ad history and overwrites the
// address in out/deployed.json, orphaning every ad already sold on the old one.
{
  let prior = null;
  try { prior = JSON.parse(readFileSync(join(root, "out", "deployed.json"), "utf8")); } catch {}
  if (prior && prior.billboards && process.env.REDEPLOY !== "1") {
    const code = await provider.getCode(prior.billboards);
    if (code && code !== "0x") {
      console.error(`✗ already deployed: WickBillboards ${prior.billboards} has live bytecode on chain 369.`);
      console.error("  Re-running orphans every ad sold on it. For a deliberate replacement:");
      console.error("     REDEPLOY=1 node deploy-billboards.mjs");
      process.exit(1);
    }
  }
}

console.log("\ndeploying WickBillboards…");
const bb = await (await new ethers.ContractFactory(BB.abi, BB.bytecode, wallet)
  .deploy(TREASURY, BURN_BPS, ROUTER, WPLS, WICK)).waitForDeployment();
const addr = await bb.getAddress();
console.log("✅ BILLBOARDS:", addr);
console.log("   today id  :", (await bb.todayId()).toString());
console.log("   regular   :", ethers.formatEther(await bb.PRICE_DAY()), "PLS / day (rotation, max 8/day)");
console.log("   exclusive :", ethers.formatEther(await bb.PRICE_EXCLUSIVE()), "PLS / day (the ONLY board that day)");

let dep = {};
try { dep = JSON.parse(readFileSync(join(root, "out", "deployed.json"), "utf8")); } catch {}
dep.billboards = addr;
writeFileSync(join(root, "out", "deployed.json"), JSON.stringify(dep, null, 2));
console.log("\nsaved to out/deployed.json");
console.log("\nNEXT: paste BILLBOARDS_ADDR = " + addr + " to Claude — he wires the");
console.log("purchase page, the game renderer, and the API, then redeploys.");
