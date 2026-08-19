// Deploy WickDuel — wager escrow for WICK SHOOTER duels (PulseChain).
//   PRIVATE_KEY=0x... REFEREE=0x... node deploy-duel.mjs      (or double-click LAUNCH-DUEL.cmd)
//
// Resolves the PulseX pairs for on-chain $ pricing (WICK/WPLS + WPLS/DAI via the
// V2 factory, falling back to V1), deploys, sets pricing, writes the address to
// out/deployed.json AND ../wick-shooter/duel-config.js, and prints the Vercel env
// line the referee needs (DUEL_ADDR).
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const root = dirname(fileURLToPath(import.meta.url));
const ethers = createRequire(import.meta.url)("ethers");

const PK = process.env.PRIVATE_KEY;
if (!PK) { console.error("Set PRIVATE_KEY (the owner wallet)."); process.exit(1); }
const REFEREE = (process.env.REFEREE || "").trim();
if (!/^0x[0-9a-fA-F]{40}$/.test(REFEREE)) { console.error("Set REFEREE (the referee wallet ADDRESS — its key lives in Vercel as DUEL_REFEREE_KEY)."); process.exit(1); }
const D = JSON.parse(readFileSync(join(root, "out", "WickDuel.json"), "utf8"));
const RPC = (process.env.RPC_URL || "https://rpc.pulsechain.com").trim();
const WICK = process.env.WICK_TOKEN || "0x8CDaf3d630Da9E1450832924D5701CC0500E9cfC";
const WPLS = process.env.WPLS || "0xA1077a294dDE1B09bB078844df40758a5D0f9a27";
const DAI  = process.env.DAI  || "0xefD766cCb38EaF1dfd701853BFCe31359239F305";   // DAI from Ethereum (PulseChain)
const FACTORIES = [process.env.PULSEX_FACTORY_V2 || "0x29eA7545DEf87022BAdc76323F373EA1e707C523", process.env.PULSEX_FACTORY_V1 || "0x1715a3E4A142d8b698131108995174F37aEBA10D"];
const MIN_WICK_FALLBACK = ethers.parseEther(process.env.MIN_WICK_FALLBACK || "50000");   // only used if pricing can't be set

const CHAIN = new ethers.Network("pulsechain", 369);
const provider = new ethers.JsonRpcProvider(RPC, CHAIN, { staticNetwork: CHAIN });
const wallet = new ethers.Wallet(PK, provider);
const TREASURY = (process.env.TREASURY || wallet.address).trim();

console.log("deployer :", wallet.address);
console.log("treasury :", TREASURY, TREASURY === wallet.address ? "(the deployer wallet — change later with setTreasury)" : "");
console.log("referee  :", REFEREE);
console.log("stake tok:", WICK, "($WICK)");
const bal = await provider.getBalance(wallet.address);
console.log("balance  :", ethers.formatEther(bal), "PLS");
if (bal < ethers.parseEther("3")) { console.error("✗ not enough PLS for gas."); process.exit(1); }

// run-twice guard
{
  let prior = null;
  try { prior = JSON.parse(readFileSync(join(root, "out", "deployed.json"), "utf8")); } catch {}
  if (prior && prior.duel && process.env.REDEPLOY !== "1") {
    const code = await provider.getCode(prior.duel);
    if (code && code !== "0x") {
      console.error(`✗ already deployed: WickDuel ${prior.duel} has live bytecode on chain 369.`);
      console.error("  Re-running orphans every open/active duel on it. For a deliberate replacement:  REDEPLOY=1 node deploy-duel.mjs");
      process.exit(1);
    }
  }
}

// resolve pricing pairs
const FACT_ABI = ["function getPair(address,address) view returns (address)"];
const PAIR_ABI = ["function getReserves() view returns (uint112,uint112,uint32)", "function token0() view returns (address)"];
async function findPair(a, b) {
  for (const f of FACTORIES) {
    try {
      const p = await new ethers.Contract(f, FACT_ABI, provider).getPair(a, b);
      if (p && !/^0x0{40}$/i.test(p)) {
        const [r0, r1] = await new ethers.Contract(p, PAIR_ABI, provider).getReserves();
        if (r0 > 0n && r1 > 0n) return { pair: p, factory: f, r0, r1 };
      }
    } catch {}
  }
  return null;
}
const wickPair = await findPair(WICK, WPLS);
const usdPair = await findPair(WPLS, DAI);
console.log("WICK/WPLS:", wickPair ? wickPair.pair + " (factory " + wickPair.factory.slice(0, 10) + "…)" : "NOT FOUND");
console.log("WPLS/DAI :", usdPair ? usdPair.pair + " (factory " + usdPair.factory.slice(0, 10) + "…)" : "NOT FOUND");

console.log("\ndeploying WickDuel…");
const duel = await (await new ethers.ContractFactory(D.abi, D.bytecode, wallet).deploy(WICK, TREASURY, REFEREE, MIN_WICK_FALLBACK)).waitForDeployment();
const addr = await duel.getAddress();
console.log("✅ WICKDUEL:", addr);

if (wickPair && usdPair) {
  console.log("setting pricing…");
  await (await duel.setPricing(wickPair.pair, usdPair.pair, WPLS)).wait();
  const ms = await duel.minStake();
  const usd = await duel.usdValue(ms);
  console.log("   min stake:", ethers.formatEther(ms), "WICK ≈ $" + Number(ethers.formatEther(usd)).toFixed(2), "(spot)");
} else {
  console.log("!! pricing not set — min stake falls back to", ethers.formatEther(MIN_WICK_FALLBACK), "WICK. Set later with setPricing(wickPair, usdPair, WPLS).");
}
console.log("   fee      :", Number(await duel.feeBps()) / 100 + "% → treasury");
console.log("   settle window:", Number(await duel.settleWindow()) / 3600, "h (then expire() refunds both)");

let dep = {};
try { dep = JSON.parse(readFileSync(join(root, "out", "deployed.json"), "utf8")); } catch {}
dep.duel = addr; dep.duelReferee = REFEREE; dep.duelDeployedAt = new Date().toISOString();
writeFileSync(join(root, "out", "deployed.json"), JSON.stringify(dep, null, 2));

// wire the game
const cfgPath = join(root, "..", "wick-shooter", "duel-config.js");
if (existsSync(cfgPath)) {
  let c = readFileSync(cfgPath, "utf8");
  c = c.replace(/contract:\s*"0x[0-9a-fA-F]{40}"/, 'contract: "' + addr + '"');
  writeFileSync(cfgPath, c);
  console.log("\n✅ wrote", cfgPath);
  console.log("   → redeploy the game:  cd ..\\wick-shooter && node build.mjs && npx vercel deploy --prod --yes");
}
console.log("\n✅ referee env — run in ..\\wick-arsenal:");
console.log("   echo " + addr + " | npx vercel env add DUEL_ADDR production");
console.log("   npx vercel deploy --prod --yes");
console.log("\nDone. Open the game → MODE ▸ ⚔ WAGER DUEL.");
