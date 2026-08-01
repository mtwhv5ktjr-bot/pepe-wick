// WickBillboards — self-serve ad slots. Run: node test-billboards.mjs
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const root = dirname(fileURLToPath(import.meta.url));
const reqHere = createRequire(import.meta.url);
const reqCash = createRequire("C:/Users/Bia/New folder/cashcat-printer/");
const ganache = reqHere("ganache");
const ethers = reqCash("ethers");

const A = n => JSON.parse(readFileSync(join(root, "out", n + ".json"), "utf8"));
const [BB, WickArt, RouterArt, RevertArt] = ["WickBillboards", "MockWICK", "MockRouter", "MockRouterRevert"].map(A);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };
const eq = (a, b, m) => ok(String(a) === String(b), m + " (got " + a + ", want " + b + ")");
async function reverts(p, m) { try { await p; fail++; console.error("  ✗ did NOT revert: " + m); } catch { pass++; } }

const server = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 6, defaultBalance: 100_000_000 }, miner: { blockGasLimit: 30_000_000 } });
const provider = new ethers.BrowserProvider(server);
const bal = async a => BigInt(await provider.send("eth_getBalance", [a, "latest"]));
const S = []; for (let i = 0; i < 6; i++) S.push(await provider.getSigner(i));
const [dep, treasury, adv1, adv2, adv3] = S;
const GL = { gasLimit: 2_000_000n };
const DEAD = "0x000000000000000000000000000000000000dEaD";
const M = ethers.parseEther("1000000");
const M10 = ethers.parseEther("10000000");

console.log("deploying mocks + WickBillboards (50% burn / 50% treasury)…");
const wick = await (await new ethers.ContractFactory(WickArt.abi, WickArt.bytecode, dep).deploy()).waitForDeployment();
const router = await (await new ethers.ContractFactory(RouterArt.abi, RouterArt.bytecode, dep).deploy(await wick.getAddress())).waitForDeployment();
await reverts(new ethers.ContractFactory(BB.abi, BB.bytecode, dep)
  .deploy(ethers.ZeroAddress, 5000, await router.getAddress(), await wick.getAddress(), await wick.getAddress()), "zero treasury refused");
const bb = await (await new ethers.ContractFactory(BB.abi, BB.bytecode, dep)
  .deploy(treasury.address, 5000, await router.getAddress(), await wick.getAddress(), await wick.getAddress())).waitForDeployment();
const bbAddr = await bb.getAddress();
const today = Number(await bb.todayId());

// ---- pricing enforced exactly ----
await reverts(bb.connect(adv1).buy(today, false, "WICK DEX", "swap it all", "dex.example", 0x7cf9a5, 0n, { value: M - 1n }), "underpay regular");
await reverts(bb.connect(adv1).buy(today, false, "WICK DEX", "swap it all", "dex.example", 0x7cf9a5, 0n, { value: M10 }), "overpay regular (wrong price)");
await reverts(bb.connect(adv1).buy(today, true, "WICK DEX", "swap it all", "dex.example", 0x7cf9a5, 0n, { value: M }), "exclusive at regular price");

// ---- regular buy: split lands in the SAME tx ----
const tBefore = await bal(treasury.address);
const dBefore = BigInt(await wick.balanceOf(DEAD));
const LOGO=0x00003C007E00FF00FF00FF007E003C00n;   // a blob, round-tripped below
 await (await bb.connect(adv1).buy(today, false, "WICK DEX", "swap it all", "dex.example", 0x7cf9a5, LOGO, { value: M, ...GL })).wait();
eq(((await bal(treasury.address)) - tBefore).toString(), ethers.parseEther("500000").toString(), "treasury got exactly 50%");
eq((BigInt(await wick.balanceOf(DEAD)) - dBefore).toString(), (ethers.parseEther("500000") * 1000n).toString(), "50% swapped+burned in-tx");
eq((await bal(bbAddr)).toString(), "0", "contract holds nothing");

// ---- content limits ----
await reverts(bb.connect(adv2).buy(today, false, "", "x", "y", 0, 0n, { value: M }), "empty name");
await reverts(bb.connect(adv2).buy(today, false, "123456789012345678901", "x", "y", 0, 0n, { value: M }), "name 21 chars");
await reverts(bb.connect(adv2).buy(today, false, "ok", "12345678901234567890123456789", "y", 0, 0n, { value: M }), "tag 29 chars");
await reverts(bb.connect(adv2).buy(today - 1, false, "ok", "x", "y", 0, 0n, { value: M }), "yesterday");
await reverts(bb.connect(adv2).buy(today + 61, false, "ok", "x", "y", 0, 0n, { value: M }), "61 days ahead");

// ---- exclusive rules ----
// today already has a regular ad → exclusive blocked
await reverts(bb.connect(adv2).buy(today, true, "TAKEOVER", "all mine", "big.example", 0xff0000, 0n, { value: M10 }), "exclusive on a day with rotation ads");
// tomorrow: exclusive works, then EVERYTHING else is blocked
const tmr = today + 1;
await (await bb.connect(adv2).buy(tmr, true, "TAKEOVER", "all mine", "big.example", 0xff0000, 0n, { value: M10, ...GL })).wait();
const [taken, exTaken] = await bb.daySlots(tmr);
ok(exTaken === true && Number(taken) === 1, "exclusive registered");
await reverts(bb.connect(adv3).buy(tmr, false, "late", "x", "y", 0, 0n, { value: M }), "regular after exclusive");
await reverts(bb.connect(adv3).buy(tmr, true, "late", "x", "y", 0, 0n, { value: M10 }), "second exclusive");

// ---- day cap: 8 regulars max ----
const d2 = today + 2;
for (let i = 0; i < 7; i++) await (await bb.connect(adv3).buy(d2, false, "AD " + i, "slot " + i, "u" + i, i * 999, 0n, { value: M, ...GL })).wait();
await (await bb.connect(adv1).buy(d2, false, "AD 7", "slot 7", "u7", 7, 0n, { value: M, ...GL })).wait();
await reverts(bb.connect(adv2).buy(d2, false, "AD 8", "ninth", "u8", 8, 0n, { value: M }), "9th regular blocked");
await reverts(bb.connect(adv2).buy(d2, true, "TAKEOVER", "x", "y", 0, 0n, { value: M10 }), "exclusive on a full day");
const [t2] = await bb.daySlots(d2); eq(t2, 8, "8/8 slots");

// ---- adsOf view + ban ----
const view = await bb.adsOf(d2);
eq(view.names.length, 8, "adsOf returns all 8");
eq(view.names[0], "AD 0", "content round-trips");
 eq((await bb.adsOf(today)).logos[0], LOGO, "16x16 logo round-trips on-chain");
 eq((await bb.adsOf(d2)).logos[0], 0n, "no logo = 0 (house Pepe stands there)");
await reverts(bb.connect(adv1).setBanned(0, true), "non-owner ban");
await (await bb.setBanned(0, true, GL)).wait();
ok((await bb.adsOf(today)).banneds[0] === true, "ban flag serves");
await (await bb.setBanned(0, false, GL)).wait();

// ---- burn fallback: dead router pools, crank reverts safely ----
const bad = await (await new ethers.ContractFactory(RevertArt.abi, RevertArt.bytecode, dep).deploy()).waitForDeployment();
const bb2 = await (await new ethers.ContractFactory(BB.abi, BB.bytecode, dep)
  .deploy(treasury.address, 5000, await bad.getAddress(), await wick.getAddress(), await wick.getAddress())).waitForDeployment();
const t3 = await bal(treasury.address);
await (await bb2.connect(adv1).buy(today, false, "RESILIENT", "x", "y", 0, 0n, { value: M, ...GL })).wait();
eq((await bb2.burnPending()).toString(), ethers.parseEther("500000").toString(), "failed burn pooled");
eq(((await bal(treasury.address)) - t3).toString(), ethers.parseEther("500000").toString(), "treasury still paid despite dead router");
await reverts(bb2.burnPool(0), "crank on dead router reverts (funds stay)");

// ---- 100% burn config also valid (if the user ever wants it) ----
const bb3 = await (await new ethers.ContractFactory(BB.abi, BB.bytecode, dep)
  .deploy(treasury.address, 10000, await router.getAddress(), await wick.getAddress(), await wick.getAddress())).waitForDeployment();
const d4 = await bal(treasury.address); const dead4 = BigInt(await wick.balanceOf(DEAD));
await (await bb3.connect(adv1).buy(today, false, "ALLBURN", "x", "y", 0, 0n, { value: M, ...GL })).wait();
eq(((await bal(treasury.address)) - d4).toString(), "0", "100%-burn config: treasury gets 0");
eq((BigInt(await wick.balanceOf(DEAD)) - dead4).toString(), (M * 1000n).toString(), "100%-burn config: full amount burned");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
