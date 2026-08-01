// FULL LAUNCH REHEARSAL on a fork of LIVE PulseChain.
// Deploys the real artifacts against the REAL guns contract, REAL PulseX router,
// REAL $WICK token — then impersonates the user's ED55 wallet and runs the whole
// loop: gun-gated mint → gunless rejected → list → buy with a REAL 50% WICK burn.
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const root = dirname(fileURLToPath(import.meta.url));
const reqHere = createRequire(import.meta.url);
const ganache = reqHere("ganache");
const ethers = reqHere("ethers");

const GUNS = "0x188848DdB42fA8Ca2EB05649c944e05dfA2158FD";
const ROUTER = "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02";
const WPLS = "0xA1077a294dDE1B09bB078844df40758a5D0f9a27";
const WICK = "0x8CDaf3d630Da9E1450832924D5701CC0500E9cfC";
const ED55 = "0x11096314DAa8738dA6381264502b5228a98CED55";
const DEAD = "0x000000000000000000000000000000000000dEaD";
const A = n => JSON.parse(readFileSync(join(root, "out", n + ".json"), "utf8"));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.error("  ✗ " + m); } };
async function reverts(p, m) { try { await p; fail++; console.error("  ✗ did NOT revert: " + m); } catch { pass++; console.log("  ✓ " + m + " (reverted)"); } }

console.log("forking live PulseChain…");
const server = ganache.provider({
  logging: { quiet: true },
  fork: { url: "https://rpc-pulsechain.g4mm4.io" },
  chain: { chainId: 369 },
  wallet: { totalAccounts: 4, defaultBalance: 100_000_000, unlockedAccounts: [ED55] },
  miner: { blockGasLimit: 30_000_000 },
});
const provider = new ethers.BrowserProvider(server);
const dep = await provider.getSigner(0);
const buyer = await provider.getSigner(1);
const gunless = await provider.getSigner(2);
const ed55 = await provider.getSigner(ED55);
await (await dep.sendTransaction({ to: ED55, value: ethers.parseEther("1000") })).wait();  // gas for the impersonated wallet
const GL = { gasLimit: 8_000_000n };
const bal = async a => BigInt(await provider.send("eth_getBalance", [a, "latest"]));

// ---- 1. deploy exactly what LAUNCH-MODS.cmd deploys ----
console.log("\n[1] deploy WickMods against the REAL guns contract");
const Mods = A("WickMods"), Mkt = A("WickModsMarket");
const mods = await (await new ethers.ContractFactory(Mods.abi, Mods.bytecode, dep).deploy(GUNS, GL)).waitForDeployment();
await (await mods.setMintOpen(true, GL)).wait();
ok(await mods.mintOpen(), "mint open");
const mkt = await (await new ethers.ContractFactory(Mkt.abi, Mkt.bytecode, dep).deploy(await mods.getAddress(), 5000, ROUTER, WPLS, WICK, GL)).waitForDeployment();
ok((await mkt.feeBps()) === 5000n, "market feeBps 5000 (50%)");

// ---- 2. the gun gate against REAL on-chain holdings ----
console.log("\n[2] gun gate vs real holdings");
const allow = Number(await mods.allowanceOf(ED55));
ok(allow === 3, "ED55 (1 real gun, #37) allowance = 3 — got " + allow);
await reverts(mods.connect(gunless).mint(1), "gunless wallet blocked");
const tangent = "0xf7B5054c0B8b67E7b0f6454747d98452f736787D";
ok(Number(await mods.allowanceOf(tangent)) === 3, "tangent.pls (Reaper only) allowance = 3");

// ---- 3. ED55 mints its 3, hits the wall at 4 ----
console.log("\n[3] ED55 mints");
await (await mods.connect(ed55).mint(3, GL)).wait();
const [mIds, mTypes] = await mods.modsOfOwner(ED55);
ok(mIds.length === 3, "ED55 minted 3 mods");
ok([...mTypes].every(t => t >= 1n && t <= 6n), "types valid: " + [...mTypes].join(","));
await reverts(mods.connect(ed55).mint(1), "4th mint blocked (allowance spent)");
ok(Number(await mods.allowanceOf(ED55)) === 0, "allowance drained to 0");
// tokenURI renders on-chain
const uri = await mods.tokenURI(1);
const meta = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString());
ok(meta.image.startsWith("data:image/svg+xml;base64,"), "on-chain SVG renders: " + meta.name);

// ---- 4. the 50% burn against the REAL PulseX pool ----
console.log("\n[4] list + buy: 50% royalty swaps to REAL $WICK and burns");
const wick = new ethers.Contract(WICK, ["function balanceOf(address) view returns (uint256)"], provider);
const sellId = Number(mIds[0]);
await (await mods.connect(ed55).setApprovalForAll(await mkt.getAddress(), true, GL)).wait();
const PRICE = ethers.parseEther("100000");            // 100k PLS listing
await (await mkt.connect(ed55).list(sellId, PRICE, GL)).wait();
const sBefore = await bal(ED55);
const deadBefore = await wick.balanceOf(DEAD);
await (await mkt.connect(buyer).buy(sellId, { value: PRICE, ...GL })).wait();
ok((await mods.ownerOf(sellId)) === ethers.getAddress(ED55) ? false : true, "mod delivered to buyer");
ok((await bal(ED55)) - sBefore === ethers.parseEther("50000"), "seller received exactly 50%");
const burned = (await wick.balanceOf(DEAD)) - deadBefore;
ok(burned > 0n, "REAL $WICK burned via PulseX in the sale tx: " + ethers.formatEther(burned) + " WICK");
ok(await bal(await mkt.getAddress()) === 0n, "market contract holds 0 after the sale");

// ---- 5. verify-API shape: the exact call api/verify.js makes ----
console.log("\n[5] verify API contract shape");
const apiView = new ethers.Contract(await mods.getAddress(), ["function modsOfOwner(address) view returns (uint256[], uint8[])"], provider);
const [vIds, vTypes] = await apiView.modsOfOwner(ED55);
ok(vIds.length === 2 && vTypes.length === 2, "modsOfOwner ABI matches api/verify.js (2 left after sale)");
// and the game's raw eth_call fallback (selector 0x8d56809a)
const raw = await provider.send("eth_call", [{ to: await mods.getAddress(), data: "0x8d56809a" + ED55.slice(2).toLowerCase().padStart(64, "0") }, "latest"]);
ok(raw && raw !== "0x" && raw.length > 130, "rpcModsOf selector 0x8d56809a answers");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
