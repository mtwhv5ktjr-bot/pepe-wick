// Deploy WickMarket v2 — adds TIER OFFERS ("I'll pay X for ANY Marksman", fillable
// by any holder of that tier). The NFT contract is untouched; only the trading venue
// changes. The old market keeps working forever so nobody's escrow or listing is stuck.
//
//   PRIVATE_KEY=0x... node deploy-market.mjs      (or double-click NEW-MARKET.cmd)
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const root = dirname(fileURLToPath(import.meta.url));
const ethers = createRequire("C:/Users/Bia/New folder/cashcat-printer/")("ethers");

const PK = process.env.PRIVATE_KEY;
if (!PK) { console.error("Set PRIVATE_KEY (the owner wallet)."); process.exit(1); }
const dep = JSON.parse(readFileSync(join(root, "out", "deployed.json"), "utf8"));
const Market = JSON.parse(readFileSync(join(root, "out", "WickMarket.json"), "utf8"));
const RPC = (process.env.RPC_URL || dep.rpc || "https://rpc.pulsechain.com").trim();

const FEE_BPS   = BigInt(process.env.FEE_BPS || "1500");                                   // 15%, all burned
const ROUTER    = process.env.BURN_ROUTER || "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02"; // PulseX
const WPLS      = process.env.WPLS       || "0xA1077a294dDE1B09bB078844df40758a5D0f9a27";
const WICK      = process.env.WICK_TOKEN || "0x8CDaf3d630Da9E1450832924D5701CC0500E9cfC";

const CHAIN = new ethers.Network("pulsechain", 369);
const provider = new ethers.JsonRpcProvider(RPC, CHAIN, { staticNetwork: CHAIN });
const wallet = new ethers.Wallet(PK, provider);

console.log("deployer :", wallet.address);
console.log("guns     :", dep.guns);
console.log("old mkt  :", dep.market, "(stays live so people can withdraw)");
console.log("royalty  :", FEE_BPS.toString(), "bps — 100% burned as $WICK\n");

const bal = await provider.getBalance(wallet.address);
if (bal < ethers.parseEther("5")) { console.error("✗ not enough PLS for gas."); process.exit(1); }

const market = await (await new ethers.ContractFactory(Market.abi, Market.bytecode, wallet)
  .deploy(dep.guns, FEE_BPS, ROUTER, WPLS, WICK)).waitForDeployment();
const addr = await market.getAddress();
console.log("✅ NEW MARKET:", addr);

// sanity-read it back
const chk = new ethers.Contract(addr, [
  "function feeBps() view returns (uint96)", "function nft() view returns (address)",
  "function burnRouter() view returns (address)", "function offersCount() view returns (uint256)",
], provider);
console.log("   feeBps      :", (await chk.feeBps()).toString());
console.log("   bound to nft:", await chk.nft());
console.log("   burn router :", await chk.burnRouter());
console.log("   offers      :", (await chk.offersCount()).toString());

// record + auto-patch the site config
dep.marketOld = dep.market;
dep.market = addr;
writeFileSync(join(root, "out", "deployed.json"), JSON.stringify(dep, null, 2));

const cfgPath = join(root, "web", "config.js");
let cfg = readFileSync(cfgPath, "utf8");
cfg = cfg.replace(/market:\s*"0x[0-9a-fA-F]{40}"/, `market: "${addr}"`);
if (!/marketOld/.test(cfg)) cfg = cfg.replace(/(market:\s*"0x[0-9a-fA-F]{40}",)/, `$1\n  marketOld: "${dep.marketOld}",`);
else cfg = cfg.replace(/marketOld:\s*"0x[0-9a-fA-F]{40}"/, `marketOld: "${dep.marketOld}"`);
writeFileSync(cfgPath, cfg);
console.log("\nout/deployed.json + web/config.js updated.");
console.log("Send Claude this address and he'll redeploy the site:", addr);
