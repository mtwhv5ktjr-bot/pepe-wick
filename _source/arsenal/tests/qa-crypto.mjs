// Adversarial QA suite — security + edge cases beyond test.mjs.
// Run: node qa-crypto.mjs
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const root = dirname(fileURLToPath(import.meta.url));
const reqHere = createRequire(import.meta.url);
const reqCash = createRequire("C:/Users/Bia/New folder/cashcat-printer/");
const ganache = reqHere("ganache");
const ethers = reqCash("ethers");

const load = n => JSON.parse(readFileSync(join(root, "out", n + ".json"), "utf8"));
const Guns = load("WickGuns"), Market = load("WickMarket"), Art = load("WickGunArt"), Bodies = load("WickGunBodies");

let pass = 0, fail = 0; const bugs = [];
const ok = (c, m) => { if (c) pass++; else { fail++; bugs.push("FAIL: " + m); } };
async function reverts(fn, m) { try { const tx = await fn(); if (tx && tx.wait) await tx.wait(); fail++; bugs.push("NO-REVERT: " + m); } catch { pass++; } }

const provider = new ethers.BrowserProvider(ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 8, defaultBalance: 100000 } }));
const accts = await provider.send("eth_accounts", []);
const [owner, alice, bob, carol, dave] = await Promise.all(accts.slice(0, 5).map(a => provider.getSigner(a)));
const A = await alice.getAddress(), B = await bob.getAddress(), C = await carol.getAddress(), D = await dave.getAddress();
const price = ethers.parseEther("1");
const G = n => ({ gasLimit: 200000 * n });

async function fresh(feeBps = 250) {
  const ownerSeed = ethers.hexlify(ethers.randomBytes(32));
  const seedCommit = ethers.keccak256(ownerSeed);
  const bodies = await (await new ethers.ContractFactory(Bodies.abi, Bodies.bytecode, owner).deploy()).waitForDeployment();
  const art = await (await new ethers.ContractFactory(Art.abi, Art.bytecode, owner).deploy(await bodies.getAddress())).waitForDeployment();
  const guns = await (await new ethers.ContractFactory(Guns.abi, Guns.bytecode, owner).deploy(price, await art.getAddress(), seedCommit)).waitForDeployment();
  const market = await (await new ethers.ContractFactory(Market.abi, Market.bytecode, owner).deploy(await guns.getAddress(), feeBps)).waitForDeployment();
  return { guns, market, ownerSeed };
}

// ============ MINT edge cases ============
{
  const { guns } = await fresh();
  await (await guns.setMintOpen(true)).wait();
  await reverts(() => guns.connect(alice).mint(0, { value: 0 }), "mint qty 0 reverts");
  await reverts(() => guns.connect(alice).mint(6, { value: price * 6n, ...G(6) }), "mint qty 6 reverts (max 5)");
  await reverts(() => guns.connect(alice).mint(2, { value: price, ...G(2) }), "mint qty 2 with 1x pay reverts");
  // overpay succeeds (mint's require enforces payment; excess kept, recoverable via withdraw)
  await (await guns.connect(alice).mint(1, { value: price * 2n, ...G(1) })).wait();
  ok(await guns.ownerOf(6) === A, "overpaid mint succeeds (payment enforced by require)");
  // withdraw is owner-only and callable (value-move correctness proven by test.mjs fee-split)
  await reverts(() => guns.connect(alice).withdraw(A, { gasLimit: 80000 }), "withdraw only owner");
  await (await guns.withdraw(D)).wait(); ok(true, "owner withdraw executes");
}

// ============ REVEAL security ============
{
  const { guns, ownerSeed } = await fresh();
  await (await guns.setMintOpen(true)).wait();
  // owner can closeMint early to arm reveal; non-owner cannot
  await reverts(() => guns.connect(alice).closeMint({ gasLimit: 80000 }), "non-owner closeMint reverts");
  await (await guns.connect(alice).mint(2, { value: price * 2n, ...G(2) })).wait();
  await (await guns.closeMint()).wait();
  ok(Number(await guns.revealBlock()) > 0, "closeMint arms revealBlock without sellout");
  // must wait past revealBlock
  await reverts(() => guns.reveal(ownerSeed, { gasLimit: 300000 }), "reveal same block reverts");
  await provider.send("evm_mine", []); await provider.send("evm_mine", []);
  await (await guns.reveal(ownerSeed)).wait();
  ok(await guns.revealed(), "reveal after block works");
  await reverts(() => guns.reveal(ownerSeed, { gasLimit: 300000 }), "cannot reveal twice");
  // minted-but-partial: only ids 6,7 exist; their types are valid 1..5; unminted ids type 0
  const t6 = Number(await guns.gunTypeOf(6)), t7 = Number(await guns.gunTypeOf(7));
  ok(t6 >= 1 && t6 <= 5 && t7 >= 1 && t7 <= 5, "partial-mint revealed tokens have valid types");
  ok(Number(await guns.gunTypeOf(50)) >= 1, "unminted id still resolves a (deterministic) type via view");
}

// ============ REVEAL fairness: different seed => different assignment ============
{
  const r1 = {}, r2 = {};
  for (const [store, seedFixed] of [[r1, false], [r2, false]]) {
    const { guns, ownerSeed } = await fresh();
    await (await guns.setMintOpen(true)).wait();
    await (await guns.connect(alice).mint(5, { value: price * 5n, ...G(5) })).wait();
    await (await guns.closeMint()).wait();
    await provider.send("evm_mine", []); await provider.send("evm_mine", []);
    await (await guns.reveal(ownerSeed)).wait();
    for (let id = 6; id <= 10; id++) store[id] = Number(await guns.gunTypeOf(id));
  }
  const same = [6,7,8,9,10].every(id => r1[id] === r2[id]);
  ok(!same, "different seed/blockhash => different token assignments (not fixed/predictable)");
}

// ============ MARKETPLACE attacks ============
{
  const { guns, market } = await fresh();
  await (await guns.mintOneOfOne(A, 1)).wait();     // alice owns 1/1 #1
  await (await guns.mintOneOfOne(B, 2)).wait();     // bob owns 1/1 #2
  const mAddr = await market.getAddress();

  await reverts(() => market.connect(bob).list(1, price, { gasLimit: 120000 }), "cannot list a token you don't own");
  await reverts(() => market.connect(alice).list(1, 0, { gasLimit: 120000 }), "cannot list at price 0");
  await reverts(() => market.connect(alice).list(1, price, { gasLimit: 120000 }), "cannot list without approving market");

  await (await guns.connect(alice).approve(mAddr, 1)).wait();
  await (await market.connect(alice).list(1, price)).wait();
  // re-list updates price
  await (await market.connect(alice).list(1, price * 2n)).wait();
  ok((await market.getListing(1))[1] === price * 2n, "re-list updates price");
  await (await market.connect(alice).list(1, price)).wait(); // back to 1

  await reverts(() => market.connect(bob).buy(1, { value: price / 2n, ...G(1) }), "underpaid buy reverts");
  await reverts(() => market.connect(bob).cancel(1, { gasLimit: 80000 }), "non-seller cancel reverts");

  // OVERPAY REFUND: buyer overpays 3x, purchase succeeds, NFT moves, listing clears
  // (exact seller-proceeds + refund math is proven in test.mjs via the seller-side balance check)
  await (await market.connect(carol).buy(1, { value: price * 3n, ...G(1) })).wait();
  ok(await guns.ownerOf(1) === C, "overpaid buy succeeds, NFT transferred to buyer");
  ok((await market.getListing(1))[1] === 0n, "listing cleared after sale");

  // STALE LISTING: bob lists #2, transfers it away, buyer's purchase reverts
  await (await guns.connect(bob).approve(mAddr, 2)).wait();
  await (await market.connect(bob).list(2, price)).wait();
  await (await guns.connect(bob).transferFrom(B, D, 2)).wait();  // moved out from under the listing
  await reverts(() => market.connect(carol).buy(2, { value: price, ...G(1) }), "stale listing (seller no longer owns) reverts");

  // APPROVAL REVOKED after listing: buy should revert (transferFrom fails)
  await (await guns.connect(dave).approve(mAddr, 2)).wait();
  await (await market.connect(dave).list(2, price)).wait();
  await (await guns.connect(dave).approve(ethers.ZeroAddress, 2)).wait(); // revoke
  await reverts(() => market.connect(carol).buy(2, { value: price, ...G(1) }), "buy reverts if approval revoked post-listing");

  // fee bounds + owner controls
  await reverts(() => market.connect(alice).setFee(300, { gasLimit: 80000 }), "non-owner setFee reverts");
  await reverts(() => market.setFee(1001, { gasLimit: 80000 }), "fee > 10% reverts");
  await reverts(() => market.setOwner(ethers.ZeroAddress, { gasLimit: 80000 }), "setOwner zero reverts");
}

// ============ ERC-721 SAFETY ============
{
  const { guns } = await fresh();
  await (await guns.mintOneOfOne(A, 1)).wait();
  const gunsAddr = await guns.getAddress();
  await reverts(() => guns.ownerOf(99, { gasLimit: 60000 }), "ownerOf nonexistent reverts");
  await reverts(() => guns.balanceOf(ethers.ZeroAddress, { gasLimit: 60000 }), "balanceOf(0) reverts");
  await reverts(() => guns.connect(bob).transferFrom(A, B, 1, { gasLimit: 100000 }), "cannot transfer token you don't own/approve");
  // safeTransferFrom to a non-receiver contract (the guns contract itself) must revert
  await reverts(() => guns.connect(alice)["safeTransferFrom(address,address,uint256)"](A, gunsAddr, 1, { gasLimit: 150000 }), "safeTransfer to non-ERC721Receiver reverts");
  // approvalForAll flow
  await (await guns.connect(alice).setApprovalForAll(B, true)).wait();
  await (await guns.connect(bob).transferFrom(A, C, 1)).wait();
  ok(await guns.ownerOf(1) === C, "operator (approvedForAll) can transfer");
}

console.log((fail === 0 ? "✅ " : "❌ ") + pass + " passed, " + fail + " failed");
if (bugs.length) { console.log("--- findings ---"); bugs.forEach(b => console.log("  " + b)); }
process.exit(fail === 0 ? 0 : 1);
