// BILLBOARDS LAUNCH REHEARSAL on a fork of LIVE PulseChain.
// The unit suite proves the rules against a 1:1000 MockRouter. This proves the
// thing the mock can't: that 500,000 PLS actually routes through REAL PulseX
// liquidity into REAL $WICK and reaches 0x…dEaD, in the buy tx, at today's depth.
// Deploys exactly what deploy-billboards.mjs deploys, with the same arguments.
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const root = dirname(fileURLToPath(import.meta.url));
const reqHere = createRequire(import.meta.url);
const reqCash = createRequire("C:/Users/Bia/New folder/cashcat-printer/");
const ganache = reqHere("ganache");
const ethers = reqCash("ethers");

const ROUTER = "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02";   // PulseX v2
const WPLS   = "0xA1077a294dDE1B09bB078844df40758a5D0f9a27";
const WICK   = "0x8CDaf3d630Da9E1450832924D5701CC0500E9cfC";
const ED55   = "0x11096314DAa8738dA6381264502b5228a98CED55";
const DEAD   = "0x000000000000000000000000000000000000dEaD";
const A = n => JSON.parse(readFileSync(join(root, "out", n + ".json"), "utf8"));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.error("  ✗ " + m); } };
async function reverts(p, m) { try { await p; fail++; console.error("  ✗ did NOT revert: " + m); } catch { pass++; console.log("  ✓ " + m + " (reverted)"); } }

console.log("forking live PulseChain…");
const server = ganache.provider({
  logging: { quiet: true },
  fork: { url: "https://rpc-pulsechain.g4mm4.io" },
  chain: { chainId: 369 },
  wallet: { totalAccounts: 5, defaultBalance: 100_000_000, unlockedAccounts: [ED55] },
  miner: { blockGasLimit: 30_000_000 },
});
const provider = new ethers.BrowserProvider(server);
const dep = await provider.getSigner(0);
const treasury = await provider.getSigner(1);
const adv = await provider.getSigner(2);
const ed55 = await provider.getSigner(ED55);
const TREASURY = await treasury.getAddress();

const bal = a => provider.send("eth_getBalance", [a, "latest"]).then(BigInt);
const erc20 = new ethers.Contract(WICK, [
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
], provider);

console.log("live $WICK :", await erc20.symbol(), "· decimals", await erc20.decimals());
console.log("burn addr  :", ethers.formatUnits(await erc20.balanceOf(DEAD), 18), "WICK already burned\n");

// ---- deploy exactly as deploy-billboards.mjs does ----
const BB = A("WickBillboards");
const bb = await (await new ethers.ContractFactory(BB.abi, BB.bytecode, dep)
  .deploy(TREASURY, 5000n, ROUTER, WPLS, WICK)).waitForDeployment();
const bbAddr = await bb.getAddress();
console.log("deployed WickBillboards:", bbAddr);
const M = await bb.PRICE_DAY(), M10 = await bb.PRICE_EXCLUSIVE();
ok(M === ethers.parseEther("1000000"), "rotation price is 1,000,000 PLS/day");
ok(M10 === ethers.parseEther("10000000"), "exclusive price is 10,000,000 PLS/day");
const today = Number(await bb.todayId());

// ---- THE REAL TEST: a real buy, swapping real PLS into real WICK ----
const tBefore = await bal(TREASURY), dBefore = BigInt(await erc20.balanceOf(DEAD));
const LOGO = 0x00003C007E00FF00FF00FF007E003C00n;
const rc = await (await bb.connect(adv).buy(
  today, false, "WICK DEX", "swap it all", "dex.example", 0x7cf9a5, LOGO,
  { value: M, gasLimit: 900_000 })).wait();
const tGain = (await bal(TREASURY)) - tBefore;
const burned = BigInt(await erc20.balanceOf(DEAD)) - dBefore;
console.log("\n  gas used   :", rc.gasUsed.toString());
console.log("  treasury +:", ethers.formatEther(tGain), "PLS");
console.log("  BURNED    +:", ethers.formatUnits(burned, 18), "WICK  ← through live PulseX\n");
ok(tGain === ethers.parseEther("500000"), "treasury got exactly 50% (500,000 PLS)");
ok(burned > 0n, "50% actually swapped to REAL $WICK and burned in the buy tx");
ok((await bal(bbAddr)) === 0n, "contract holds nothing afterwards");
ok((await bb.burnPending()) === 0n, "nothing fell through to the burn pool");
ok(rc.gasUsed < 900_000n, "buy fits in a sane gas budget");

// ---- the ad serves back exactly as bought ----
const v = await bb.adsOf(today);
ok(v.names[0] === "WICK DEX", "name round-trips");
ok(v.urls[0] === "dex.example", "url round-trips");
ok(BigInt(v.logos[0]) === LOGO, "16x16 on-chain logo round-trips");
ok(v.exclusives[0] === false && v.banneds[0] === false, "flags correct");

// ---- exclusive takeover on a clean day, at real prices ----
const tmr = today + 1;
const d2 = BigInt(await erc20.balanceOf(DEAD));
await (await bb.connect(ed55).buy(tmr, true, "ED55 TAKEOVER", "the whole day", "wick.pics", 0xff4d00, 0n,
  { value: M10, gasLimit: 900_000 })).wait();
const burned2 = BigInt(await erc20.balanceOf(DEAD)) - d2;
console.log("\n  10M PLS takeover burned:", ethers.formatUnits(burned2, 18), "WICK");
ok(burned2 > 0n, "10,000,000 PLS exclusive also clears live liquidity");
ok(burned2 > burned, "a 10x spend burns more than the 1x (real curve, not a stub)");
const [taken, exTaken] = await bb.daySlots(tmr);
ok(exTaken === true && Number(taken) === 1, "exclusive registered and closed the day");
await reverts(bb.connect(adv).buy(tmr, false, "late", "x", "y", 0, 0n, { value: M }), "rotation blocked after a takeover");

// ---- moderation still reachable by the owner on a live-fork deployment ----
await (await bb.setBanned(0, true, { gasLimit: 200_000 })).wait();
ok((await bb.adsOf(today)).banneds[0] === true, "owner can ban a bought board");
await (await bb.setBanned(0, false, { gasLimit: 200_000 })).wait();
await reverts(bb.connect(adv).setBanned(0, true), "a buyer cannot ban");

// ---- treasury is movable after launch (it defaults to the deployer) ----
await (await bb.setTreasury(ED55, { gasLimit: 200_000 })).wait();
ok((await bb.treasury()).toLowerCase() === ED55.toLowerCase(), "treasury can be re-pointed post-launch");
await reverts(bb.connect(adv).setTreasury(await adv.getAddress()), "a buyer cannot steal the treasury");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
