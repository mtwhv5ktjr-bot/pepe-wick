// STEP 3: deploy WICK MODS II and push the airdrop.
//
// Reads out/mods-air-plan.json (from snapshot-mods-air.mjs) and:
//   1. deploys WickModsAir with the cap set to EXACTLY the plan length
//   2. airdrops in batches, resuming safely if a batch fails
//   3. verifies every recipient balance on-chain afterwards
// Recipients do nothing and pay nothing.
//
//   PRIVATE_KEY=0x... node deploy-mods-air.mjs           (deploy + airdrop)
//   PRIVATE_KEY=0x... AIR_ADDR=0x… node deploy-mods-air.mjs   (resume an existing one)
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const root = dirname(fileURLToPath(import.meta.url));
const ethers = createRequire(import.meta.url)("ethers");

const PK = process.env.PRIVATE_KEY;
if (!PK) { console.error("Set PRIVATE_KEY (the owner wallet)."); process.exit(1); }

let plan;
try { plan = JSON.parse(readFileSync(join(root, "out", "mods-air-plan.json"), "utf8")); }
catch { console.error("No out/mods-air-plan.json — run: node snapshot-mods-air.mjs"); process.exit(1); }
if (!plan.to?.length || plan.to.length !== plan.types.length) { console.error("plan is malformed"); process.exit(1); }

const ART = JSON.parse(readFileSync(join(root, "out", "WickModsAir.json"), "utf8"));
const RPC = (process.env.RPC_URL || "https://rpc.pulsechain.com").trim();
const CHAIN = new ethers.Network("pulsechain", 369);
const provider = new ethers.JsonRpcProvider(RPC, CHAIN, { staticNetwork: CHAIN });
const wallet = new ethers.Wallet(PK, provider);

const N = plan.to.length;
const uniq = [...new Set(plan.to)];
console.log("deployer :", wallet.address);
console.log("plan     :", N, "mods →", uniq.length, "wallets  (snapshot block " + plan.block + ")");
if (plan.short) console.log("           " + plan.short + " entitlement(s) unfilled — v1 had no supply left");
const bal = await provider.getBalance(wallet.address);
console.log("balance  :", ethers.formatEther(bal), "PLS");
if (bal < ethers.parseEther("5")) { console.error("✗ not enough PLS for gas."); process.exit(1); }

let air, addr = (process.env.AIR_ADDR || "").trim();
if (addr) {
  air = new ethers.Contract(addr, ART.abi, wallet);
  console.log("\nresuming existing:", addr, "· already out:", (await air.totalSupply()).toString());
} else {
  console.log("\ndeploying WickModsAir (cap " + N + ")…");
  air = await (await new ethers.ContractFactory(ART.abi, ART.bytecode, wallet).deploy(N)).waitForDeployment();
  addr = await air.getAddress();
  console.log("✅ MODS AIR:", addr);
  let dep = {}; try { dep = JSON.parse(readFileSync(join(root, "out", "deployed.json"), "utf8")); } catch {}
  dep.modsAir = addr;
  writeFileSync(join(root, "out", "deployed.json"), JSON.stringify(dep, null, 2));
}

// resume-safe: whatever is already out has consumed the head of the plan in order
const done = Number(await air.totalSupply());
const BATCH = 40;
console.log("\nairdropping " + (N - done) + " of " + N + "…");
for (let i = done; i < N; i += BATCH) {
  const to = plan.to.slice(i, i + BATCH), ty = plan.types.slice(i, i + BATCH);
  const tx = await air.airdrop(to, ty);
  console.log("  batch " + (i + 1) + "-" + (i + to.length) + "  tx " + tx.hash);
  await tx.wait();
}
console.log("  total out:", (await air.totalSupply()).toString(), "/", (await air.MAX_SUPPLY()).toString());

// ---- verify every recipient actually holds what the plan promised ----
console.log("\nverifying…");
const want = {}; plan.to.forEach(a => want[a] = (want[a] || 0) + 1);
let bad = 0;
for (const [a, n] of Object.entries(want)) {
  const got = Number(await air.balanceOf(a));
  const okk = got === n;
  if (!okk) bad++;
  console.log("  " + (okk ? "✓" : "✗") + " " + a + "  " + got + "/" + n);
}
console.log(bad ? "\n✗ " + bad + " mismatch(es)" : "\n✅ every wallet holds exactly what was planned");
console.log("\nNEXT: paste MODS_AIR = " + addr + " to Claude — he wires the game + verify API,");
console.log("      then call seal() when you are happy (one-way: supply becomes final).");
