// WICK MODS — ganache test suite (gun-gated free mint). Run: node test-mods.mjs
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const root = dirname(fileURLToPath(import.meta.url));
const reqHere = createRequire(import.meta.url);
const ganache = reqHere("ganache");
const ethers = reqHere("ethers");

const ModsArt = JSON.parse(readFileSync(join(root, "out", "WickMods.json"), "utf8"));
const GunsArt = JSON.parse(readFileSync(join(root, "out", "MockGuns.json"), "utf8"));

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error("  ✗ " + msg); } };
const eq = (a, b, msg) => ok(String(a) === String(b), msg + " (got " + a + ", want " + b + ")");
async function reverts(p, msg) {
  try { await p; fail++; console.error("  ✗ did NOT revert: " + msg); }
  catch (e) { pass++; }
}

const server = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 12, defaultBalance: 1000 }, miner: { blockGasLimit: 30_000_000 } });
const provider = new ethers.BrowserProvider(server);
const signers = [];
for (let i = 0; i < 12; i++) signers.push(await provider.getSigner(i));
const [deployer, a, b, c, d] = signers;
const GL = { gasLimit: 8_000_000n };   // randomness-varied gas + big qty loops: never trust node-filled gas on ganache

console.log("deploying MockGuns + WickMods…");
const guns = await (await new ethers.ContractFactory(GunsArt.abi, GunsArt.bytecode, deployer).deploy()).waitForDeployment();
const gunsAddr = await guns.getAddress();
// constructor refuses a codeless guns address
await reverts(new ethers.ContractFactory(ModsArt.abi, ModsArt.bytecode, deployer).deploy(deployer.address), "codeless guns addr");
const mods = await (await new ethers.ContractFactory(ModsArt.abi, ModsArt.bytecode, deployer).deploy(gunsAddr)).waitForDeployment();
const addr = await mods.getAddress();

// hand out guns: a has 2, b has 1, c has NONE, d has 10
let gunId = 0;
const giveGuns = async (to, n) => { for (let i = 0; i < n; i++) await (await guns.give(to, ++gunId, GL)).wait(); return gunId; };
await giveGuns(a.address, 2);      // guns 1,2
await giveGuns(b.address, 1);      // gun 3
await giveGuns(d.address, 10);     // guns 4..13

// ---- closed mint + admin ----
await reverts(mods.connect(a).mint(1), "mint while closed");
await (await mods.setMintOpen(true, GL)).wait();
await reverts(mods.connect(a).setMintOpen(false), "non-owner admin");

// ---- THE GATE: no gun, no mint ----
await reverts(mods.connect(c).mint(1), "gunless wallet minting");
eq(await mods.allowanceOf(c.address), 0, "gunless allowance 0");

// ---- allowance math: 3 per gun ----
eq(await mods.allowanceOf(a.address), 6, "2 guns → 6 mints");
eq(await mods.allowanceOf(b.address), 3, "1 gun → 3 mints");
eq(await mods.allowanceOf(d.address), 30, "10 guns → 30 mints");

// a mints 4 (charges gun1 fully + gun2 once)
await (await mods.connect(a).mint(4, GL)).wait();
eq(await mods.balanceOf(a.address), 4, "a minted 4");
eq(await mods.allowanceOf(a.address), 2, "a has 2 left");
eq(await mods.gunMintsUsed(1), 3, "gun1 fully spent");
eq(await mods.gunMintsUsed(2), 1, "gun2 one used");
// overdraw
await reverts(mods.connect(a).mint(3), "a overdraws (2 left)");
await (await mods.connect(a).mint(2, GL)).wait();
eq(await mods.allowanceOf(a.address), 0, "a drained");
await reverts(mods.connect(a).mint(1), "a at zero allowance");

// qty bounds
await reverts(mods.connect(d).mint(0), "qty 0");
await reverts(mods.connect(d).mint(31), "qty 31 > per-tx cap");
// 10 guns → all 30 in ONE tx (the user's exact example)
await (await mods.connect(d).mint(30, GL)).wait();
eq(await mods.balanceOf(d.address), 30, "10 guns minted 30 in one tx");
eq(await mods.allowanceOf(d.address), 0, "d drained");

// free = not payable
await reverts(a.sendTransaction({ to: addr, data: mods.interface.encodeFunctionData("mint", [1]), value: 1n }), "mint with value");

// ---- THE ATTACK: cycling a spent gun through fresh wallets re-mints nothing ----
await (await guns.move(a.address, c.address, 1, GL)).wait();       // gun1 (fully spent) → c
eq(await mods.allowanceOf(c.address), 0, "spent gun carries 0 allowance");
await reverts(mods.connect(c).mint(1), "cycled spent gun mints nothing");
// but an UNSPENT gun sold to a new owner carries its remaining mints
await (await guns.give(c.address, ++gunId, GL)).wait();            // fresh gun 14 → c
eq(await mods.allowanceOf(c.address), 3, "fresh gun → 3 mints for new owner");
await (await mods.connect(c).mint(3, GL)).wait();
eq(await mods.balanceOf(c.address), 3, "c minted on the fresh gun");
// b: mint 1, sell the gun with 2 left — buyer gets the 2
await (await mods.connect(b).mint(1, GL)).wait();
await (await guns.move(b.address, c.address, 3, GL)).wait();       // gun3 (2 left) → c
eq(await mods.allowanceOf(b.address), 0, "b sold their only gun → 0");
await reverts(mods.connect(b).mint(1), "b gunless after selling");
eq(await mods.allowanceOf(c.address), 2, "buyer inherits the 2 unspent mints");

// ---- types + pool math ----
const [idsA, typesA] = await mods.modsOfOwner(a.address);
eq(idsA.length, 6, "a enumerates 6");
ok(typesA.every(t => Number(t) >= 1 && Number(t) <= 6), "types in 1..6");
const pool = await mods.poolLeft();
const drawnSoFar = Number(await mods.totalSupply());
eq(300 - [1,2,3,4,5,6].reduce((s,t)=>s+Number(pool[t]),0), drawnSoFar, "pool decremented exactly");

// ---- tokenURI ----
const uri = await mods.tokenURI(1);
ok(uri.startsWith("data:application/json;base64,"), "tokenURI data-uri");
const meta = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString());
ok(meta.image.startsWith("data:image/svg+xml;base64,"), "svg image");
const svg = Buffer.from(meta.image.split(",")[1], "base64").toString();
ok(svg.includes("WICK MODS") && svg.includes("No 1 / 300"), "svg brand + serial");
await reverts(mods.tokenURI(999), "tokenURI missing token");

// ---- mod transfers unaffected by the gun gate ----
const modId = Number(idsA[0]);
await (await mods.connect(a)["safeTransferFrom(address,address,uint256)"](a.address, b.address, modId, GL)).wait();
eq(await mods.ownerOf(modId), b.address, "mod transfer works (holding mods needs no gun)");
eq(await mods.modTypeOf(modId), Number(typesA[0]), "type stable across transfer");

// ---- mint-out sweep: fresh wallets each get guns, drain to 300 ----
console.log("sweeping the remaining supply…");
let minted = Number(await mods.totalSupply());
let si = 5;
while (minted < 300) {
  if (si >= signers.length) {
    const w = ethers.Wallet.createRandom().connect(provider);
    await (await deployer.sendTransaction({ to: w.address, value: ethers.parseEther("5") })).wait();
    signers.push(w);
  }
  const s = signers[si++];
  const take = Math.min(30, 300 - minted);
  await giveGuns(await s.getAddress(), Math.ceil(take / 3));
  await (await mods.connect(s).mint(take, GL)).wait();
  minted += take;
}
eq(await mods.totalSupply(), 300, "minted out at 300");
await reverts(mods.connect(d).mint(1), "over-mint blocked");
const endPool = await mods.poolLeft();
ok([1,2,3,4,5,6].every(t => Number(endPool[t]) === 0), "pool fully drained");
const counts = { 1:0,2:0,3:0,4:0,5:0,6:0 };
for (let id = 1; id <= 300; id++) counts[Number(await mods.modTypeOf(id))]++;
eq(counts[1], 90, "90 laser sights");
eq(counts[2], 80, "80 hollow points");
eq(counts[3], 60, "60 hair triggers");
eq(counts[4], 45, "45 long barrels");
eq(counts[5], 20, "20 AP rounds");
eq(counts[6], 5, "5 dragons breath");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
