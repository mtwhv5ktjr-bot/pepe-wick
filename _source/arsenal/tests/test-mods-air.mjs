// WickModsAir — the airdropped remainder. Run: node test-mods-air.mjs
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const root = dirname(fileURLToPath(import.meta.url));
const reqHere = createRequire(import.meta.url);
const ganache = reqHere("ganache");
const ethers = reqHere("ethers");

const A = n => JSON.parse(readFileSync(join(root, "out", n + ".json"), "utf8"));
const Air = A("WickModsAir");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };
const eq = (a, b, m) => ok(String(a) === String(b), m + " (got " + a + ", want " + b + ")");
// MUST await the receipt: with an explicit gasLimit ethers skips estimateGas, so
// the send resolves happily and the revert only shows up in the mined receipt.
async function reverts(p, m) {
  try { const tx = await p; if (tx && tx.wait) await tx.wait(); fail++; console.error("  ✗ did NOT revert: " + m); }
  catch { pass++; }
}

const server = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 6, defaultBalance: 10000 }, miner: { blockGasLimit: 30_000_000 } });
const provider = new ethers.BrowserProvider(server);
const S = []; for (let i = 0; i < 6; i++) S.push(await provider.getSigner(i));
const [dep, a1, a2, a3, stranger] = S;
const GL = { gasLimit: 12_000_000n };
const A1 = a1.address, A2 = a2.address, A3 = a3.address;

console.log("deploying WickModsAir (cap 45)…");
const F = new ethers.ContractFactory(Air.abi, Air.bytecode, dep);
await reverts(F.deploy(0), "cap 0 refused");
await reverts(F.deploy(1001), "cap > 1000 refused");
const air = await (await F.deploy(45)).waitForDeployment();
eq(await air.MAX_SUPPLY(), 45, "cap fixed at 45");
eq(await air.totalSupply(), 0, "starts empty");
eq(await air.name(), "WICK Mods II", "name");

// ---- there is NO public mint. That is the whole point of v1's problem. ----
ok(air.interface.fragments.every(f => f.name !== "mint"), "no mint() at all — airdrop is the only issue path");

// ---- only the owner can airdrop ----
await reverts(air.connect(stranger).airdrop([A1], [1]), "stranger cannot airdrop");

// ---- happy path: recipients do nothing, pay nothing ----
const before = await provider.getBalance(A1);
await (await air.airdrop([A1, A1, A2], [1, 5, 6], GL)).wait();
eq(await air.totalSupply(), 3, "3 minted");
eq(await air.balanceOf(A1), 2, "A1 got 2");
eq(await air.balanceOf(A2), 1, "A2 got 1");
eq(await provider.getBalance(A1), before, "recipient spent ZERO gas");
eq(await air.ownerOf(1), A1, "token 1 → A1");
eq(await air.modTypeOf(2), 5, "explicit type honoured (AP ROUNDS), not drawn");
eq(await air.modTypeOf(3), 6, "explicit type honoured (DRAGONS BREATH)");

// the game reads this shape
const [ids, types] = await air.modsOfOwner(A1);
eq(ids.length, 2, "modsOfOwner returns both");
eq(types[1], 5, "modsOfOwner types line up");

// ---- input validation: a bad list must not half-apply ----
await reverts(air.airdrop([A1, A2], [1], GL), "length mismatch refused");
await reverts(air.airdrop([], [], GL), "empty batch refused");
await reverts(air.airdrop([ethers.ZeroAddress], [1], GL), "zero address refused");
await reverts(air.airdrop([A1], [0], GL), "type 0 refused");
await reverts(air.airdrop([A1], [7], GL), "type 7 refused");
eq(await air.totalSupply(), 3, "no partial state after any rejected batch");

// ---- the cap is real ----
const many = Array.from({ length: 42 }, () => A3), t42 = Array.from({ length: 42 }, () => 1);
await (await air.airdrop(many, t42, GL)).wait();
eq(await air.totalSupply(), 45, "exactly at cap");
await reverts(air.airdrop([A1], [1], GL), "cannot exceed cap");
await reverts(air.airdrop(Array.from({length:101},()=>A1), Array.from({length:101},()=>1)), ">100 per tx refused");

// ---- seal() is one-way and kills further issuance ----
const air2 = await (await F.deploy(10)).waitForDeployment();
await (await air2.airdrop([A1], [2], GL)).wait();
await reverts(air2.connect(stranger).seal(), "stranger cannot seal");
await (await air2.seal(GL)).wait();
ok(await air2.sealed_() === true, "sealed");
await reverts(air2.airdrop([A1], [2], GL), "airdrop dead after seal");
eq(await air2.totalSupply(), 1, "supply frozen by seal");

// ---- transfers still work (holders can sell/gift) ----
await (await air.connect(a1).transferFrom(A1, A2, 1, GL)).wait();
eq(await air.ownerOf(1), A2, "transfer works");
eq(await air.balanceOf(A1), 1, "balance updated");
const [idsAfter] = await air.modsOfOwner(A1);
eq(idsAfter.length, 1, "owned index stays consistent after transfer");

// ---- art renders and is self-contained ----
const uri = await air.tokenURI(2);
ok(uri.startsWith("data:application/json;base64,"), "tokenURI is a data URI");
const meta = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString());
ok(meta.name.includes("AP ROUNDS"), "metadata names the type");
ok(meta.image.startsWith("data:image/svg+xml;base64,"), "art fully on-chain");
ok(meta.attributes.some(a => a.value === "Airdrop"), "flagged as the Airdrop series");
await reverts(air.tokenURI(999), "tokenURI on a non-token reverts");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
