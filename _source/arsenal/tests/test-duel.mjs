// WickDuel — end-to-end tests on an in-process ganache chain.
//   node test-duel.mjs
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const root = dirname(fileURLToPath(import.meta.url));
const req = createRequire(import.meta.url);
const ganache = req("ganache");
const ethers = req("ethers");
const load = n => JSON.parse(readFileSync(join(root, "out", n + ".json"), "utf8"));
const Duel = load("WickDuel"), MWick = load("MockERC20"), MPair = load("MockPair"), MFoT = load("MockFoT"), MReenter = load("MockReenterToken");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL:", m); } };
async function reverts(fn, m, needle) {
  try { const tx = await fn(); if (tx && tx.wait) await tx.wait(); fail++; console.error("  FAIL (expected revert):", m); }
  catch (e) { const s = String(e && (e.shortMessage || e.message || e)) + " " + (() => { try { return JSON.stringify(e.info || e.error || ""); } catch { return ""; } })(); if (needle && !s.includes(needle)) { fail++; console.error("  FAIL (wrong revert):", m, "→", s.slice(0, 120)); } else pass++; }
}
const section = t => console.log("\n== " + t + " ==");

const provider = new ethers.BrowserProvider(ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 8, defaultBalance: 1000 } }));
const accts = await provider.send("eth_accounts", []);
const [owner, alice, bob, carol, treasury] = await Promise.all(accts.slice(0, 5).map(a => provider.getSigner(a)));
const A = await alice.getAddress(), B = await bob.getAddress(), C = await carol.getAddress(), T = await treasury.getAddress();
const referee = ethers.Wallet.createRandom();          // the duel server's key
const stranger = ethers.Wallet.createRandom();
const chainId = Number((await provider.getNetwork()).chainId);
const E = n => ethers.parseEther(String(n));
const rawNow = async () => parseInt((await provider.send("eth_getBlockByNumber", ["latest", false])).timestamp, 16);
const mine = async (secs) => { const t0 = await rawNow(); await provider.send("evm_increaseTime", [secs]); await provider.send("evm_mine", []); const t1 = await rawNow(); if (t1 - t0 < secs) console.error("  !! time travel failed:", t1 - t0, "of", secs); await new Promise(r => setTimeout(r, 320)); /* ethers v6 dedupes identical RPC payloads for ~250ms — a failed estimateGas from before the jump would be replayed */ };

// ---- deploy
const wick = await (await new ethers.ContractFactory(MWick.abi, MWick.bytecode, owner).deploy()).waitForDeployment();
const WICK = await wick.getAddress();
const WPLS = "0x000000000000000000000000000000000000A110", USD = "0x000000000000000000000000000000000000DA1E";
// WICK/WPLS: 1,000,000 WICK : 10,000 PLS  → 0.01 PLS per WICK ; WPLS/USD: 100,000 PLS : 5,000 USD → $0.05/PLS ⇒ WICK = $0.0005 ⇒ $20 = 40,000 WICK
const wickPair = await (await new ethers.ContractFactory(MPair.abi, MPair.bytecode, owner).deploy(WICK, WPLS, E(1_000_000), E(10_000))).waitForDeployment();
const usdPair = await (await new ethers.ContractFactory(MPair.abi, MPair.bytecode, owner).deploy(USD, WPLS, E(5_000), E(100_000))).waitForDeployment(); // reversed token order on purpose
const duel = await (await new ethers.ContractFactory(Duel.abi, Duel.bytecode, owner).deploy(WICK, T, referee.address, E(1000))).waitForDeployment();
const DUEL = await duel.getAddress();
const dA = duel.connect(alice), dB = duel.connect(bob), dC = duel.connect(carol);
const WICKPAIR = await wickPair.getAddress(), USDPAIR = await usdPair.getAddress();
for (const [s, who] of [[alice, A], [bob, B], [carol, C]]) { await (await wick.mint(who, E(1_000_000))).wait(); await (await wick.connect(s).approve(DUEL, ethers.MaxUint256)).wait(); }
const bal = async a => BigInt(await wick.balanceOf(a));
async function sign(id, winner, key) {
  const digest = ethers.solidityPackedKeccak256(["string", "uint256", "address", "uint256", "address"], ["WICKDUEL", chainId, DUEL, id, winner]);
  return (key || referee).signMessage(ethers.getBytes(digest));
}

section("PRICING / MIN STAKE");
{
  ok((await duel.minStake()) === E(1000), "fallback min stake before pricing set");
  await reverts(() => duel.setPricing(USDPAIR, WICKPAIR, WPLS), "swapped pairs rejected", "wickPair");
  await (await duel.setPricing(WICKPAIR, USDPAIR, WPLS)).wait();
  const ms = await duel.minStake();
  ok(ms === E(40_000), "min stake = $20 at spot (40,000 WICK) got " + ethers.formatEther(ms));
  ok((await duel.usdValue(E(40_000))) === E(20), "usdValue(40k WICK) = $20 (reversed token order handled)");
  await (await duel.setMinUsd(E(10))).wait();
  ok((await duel.minStake()) === E(20_000), "minUsd change flows through");
  await (await duel.setMinUsd(E(20))).wait();
  await reverts(() => dA.create(E(39_999), ethers.ZeroAddress, 0), "below $20 refused", "below min stake");
  await reverts(() => dA.create(E(1), ethers.ZeroAddress, 0), "dust refused", "below min stake");
}

section("HAPPY PATH — create / join / settle, 5% to treasury");
let id1;
{
  const a0 = await bal(A), b0 = await bal(B), t0 = await bal(T);
  const tx = await (await dA.create(E(50_000), ethers.ZeroAddress, 0)).wait();
  id1 = 1n;
  const m = await duel.getMatch(id1);
  ok(m.creator === A && m.stake === E(50_000) && Number(m.status) === 1, "created OPEN with stake");
  ok((await bal(A)) === a0 - E(50_000) && (await bal(DUEL)) === E(50_000), "creator stake escrowed");
  await reverts(() => dA.join(id1, E(50_000)), "creator can't join own match", "own match");
  await reverts(() => dB.join(id1, E(49_999)), "short stake refused", "short stake");
  await (await dB.join(id1, E(50_000))).wait();
  const m2 = await duel.getMatch(id1);
  ok(m2.joiner === B && Number(m2.status) === 2 && m2.joinedAt > 0n, "joined → ACTIVE");
  ok((await bal(DUEL)) === E(100_000), "pot escrowed");
  await reverts(() => dC.join(id1, E(50_000)), "third party can't join active", "not open");
  await reverts(() => dA.cancel(id1), "can't cancel once active", "not open");
  // settlement by referee: bob wins
  const sig = await sign(id1, B);
  await reverts(() => dA.settle(id1, A, sig), "signature bound to winner — alice can't reuse bob's sig", "not referee");
  await reverts(async () => dA.settle(id1, C, await sign(id1, C)), "referee cannot name a third party", "bad winner");
  await reverts(async () => dA.settle(id1, B, await sign(id1, B, stranger)), "stranger's signature refused", "not referee");
  await (await dC.settle(id1, B, sig)).wait();      // anyone may submit
  const m3 = await duel.getMatch(id1);
  ok(Number(m3.status) === 3 && m3.winner === B, "SETTLED, winner recorded");
  ok((await bal(B)) === b0 - E(50_000) + E(95_000), "winner receives 95% of pot");
  ok((await bal(T)) === t0 + E(5_000), "treasury receives 5%");
  ok((await bal(DUEL)) === 0n, "contract holds nothing after settle");
  ok(m3.payout === E(95_000) && m3.fee === E(5_000), "payout/fee recorded");
  await reverts(() => dC.settle(id1, B, sig), "replay refused", "not active");
}

section("DRAW — both refunded, no fee");
{
  const a0 = await bal(A), b0 = await bal(B), t0 = await bal(T);
  await (await dA.create(E(50_000), ethers.ZeroAddress, 0)).wait(); const id = 2n;
  await (await dB.join(id, E(50_000))).wait();
  await (await dA.settle(id, ethers.ZeroAddress, await sign(id, ethers.ZeroAddress))).wait();
  ok((await bal(A)) === a0 && (await bal(B)) === b0 && (await bal(T)) === t0, "draw refunds both exactly, house takes nothing");
  ok(Number((await duel.getMatch(id)).status) === 3, "draw is SETTLED");
}

section("PRIVATE CHALLENGE");
{
  await (await dA.create(E(50_000), C, 0)).wait(); const id = 3n;
  await reverts(() => dB.join(id, E(50_000)), "uninvited wallet refused", "private");
  await (await dC.join(id, E(50_000))).wait();
  ok((await duel.getMatch(id)).joiner === C, "invited opponent joins");
  await (await dA.settle(id, C, await sign(id, C))).wait();
  await reverts(() => dA.create(E(50_000), A, 0), "can't challenge yourself", "self");
}

section("CANCEL + EXPIRE escape hatches");
{
  const a0 = await bal(A);
  await (await dA.create(E(50_000), ethers.ZeroAddress, 0)).wait(); const id = 4n;
  await reverts(() => dB.cancel(id), "only creator cancels", "not creator");
  await (await dA.cancel(id)).wait();
  ok((await bal(A)) === a0 && Number((await duel.getMatch(id)).status) === 4, "cancel refunds creator, CANCELLED");
  await reverts(() => dB.join(id, E(50_000)), "can't join cancelled", "not open");
  // expire
  const b0 = await bal(B);
  await (await dA.create(E(50_000), ethers.ZeroAddress, 0)).wait(); const id2 = 5n;
  await (await dB.join(id2, E(50_000))).wait();
  await reverts(() => dC.expire(id2), "expire too early", "too early");
  await mine(48 * 3600 + 5);
  await (await dC.expire(id2)).wait();            // anyone
  ok((await bal(A)) === a0 && (await bal(B)) === b0, "expire refunds both in full");
  ok(Number((await duel.getMatch(id2)).status) === 5, "EXPIRED");
  await reverts(async () => dA.settle(id2, A, await sign(id2, A)), "no settle after expire", "not active");
  await reverts(() => dC.expire(id2), "no double expire", "not active");
}

section("PAUSE blocks entry, never exit");
{
  await (await dA.create(E(50_000), ethers.ZeroAddress, 0)).wait(); const idOpen = 6n;
  await (await dA.create(E(50_000), ethers.ZeroAddress, 0)).wait(); const idAct = 7n;
  await (await dB.join(idAct, E(50_000))).wait();
  await (await duel.setPaused(true)).wait();
  await reverts(() => dA.create(E(50_000), ethers.ZeroAddress, 0), "create paused", "paused");
  await reverts(() => dB.join(idOpen, E(50_000)), "join paused", "paused");
  await (await dA.cancel(idOpen)).wait();                                   // exit works
  await (await dA.settle(idAct, A, await sign(idAct, A))).wait();          // settle works
  await (await duel.setPaused(false)).wait();
}

section("ADMIN bounds + ownership");
{
  await reverts(() => dA.setFee(100), "non-owner can't set fee", "not owner");
  await reverts(() => duel.setFee(1001), "fee capped at 10%", "max 10%");
  await (await duel.setFee(1000)).wait(); ok((await duel.feeBps()) === 1000n, "fee 10% ok");
  await (await duel.setFee(500)).wait();
  await reverts(() => duel.setSettleWindow(3600), "settle window floor 6h", "window");
  await reverts(() => duel.setReferee(ethers.ZeroAddress), "referee zero refused", "zero");
  await reverts(() => duel.setTreasury(ethers.ZeroAddress), "treasury zero refused", "zero");
  // rotate referee: old sigs die
  await (await dA.create(E(50_000), ethers.ZeroAddress, 0)).wait(); const id = 8n;
  await (await dB.join(id, E(50_000))).wait();
  const oldSig = await sign(id, A);
  const ref2 = ethers.Wallet.createRandom();
  await (await duel.setReferee(ref2.address)).wait();
  await reverts(() => dA.settle(id, A, oldSig), "old referee sig refused after rotation", "not referee");
  await (await dA.settle(id, A, await sign(id, A, ref2))).wait();
  await (await duel.setReferee(referee.address)).wait();
  // pause is owner-only, ownership transfer
  await reverts(() => dA.setPaused(true), "non-owner can't pause", "not owner");
  await (await duel.transferOwnership(A)).wait();
  await reverts(() => duel.setFee(100), "old owner locked out", "not owner");
  await (await dA.transferOwnership(await owner.getAddress())).wait();
}

section("SIGNATURE hygiene");
{
  await (await dA.create(E(50_000), ethers.ZeroAddress, 0)).wait(); const id = 9n;
  await (await dB.join(id, E(50_000))).wait();
  const good = await sign(id, A);
  // high-s malleated twin
  const s = ethers.Signature.from(good);
  const N = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
  // ethers refuses to construct a non-canonical s, so build the malleated twin by hand: (r, N-s, flipped v)
  const highS = ethers.concat([s.r, ethers.toBeHex(N - BigInt(s.s), 32), ethers.toBeHex(s.v === 27 ? 28 : 27, 1)]);
  await reverts(() => dA.settle(id, A, highS), "malleated high-s refused", "sig s");
  await reverts(() => dA.settle(id, A, "0x1234"), "short sig refused", "sig len");
  // wrong chain / contract domain: sign for another contract address
  const wrongDomain = await referee.signMessage(ethers.getBytes(ethers.solidityPackedKeccak256(["string", "uint256", "address", "uint256", "address"], ["WICKDUEL", chainId, C, id, A])));
  await reverts(() => dA.settle(id, A, wrongDomain), "sig for another contract refused", "not referee");
  // sig for a different match id
  await reverts(async () => dA.settle(id, A, await sign(99n, A)), "sig for other match refused", "not referee");
  await (await dA.settle(id, A, good)).wait();
  ok(true, "then the good one settles");
}

section("FEE-ON-TRANSFER token — credited by delta, pot never short");
{
  const fot = await (await new ethers.ContractFactory(MFoT.abi, MFoT.bytecode, owner).deploy()).waitForDeployment();
  const FOT = await fot.getAddress();
  const d2 = await (await new ethers.ContractFactory(Duel.abi, Duel.bytecode, owner).deploy(FOT, T, referee.address, E(100))).waitForDeployment();
  const D2 = await d2.getAddress();
  for (const [s, who] of [[alice, A], [bob, B]]) { await (await fot.mint(who, E(10_000))).wait(); await (await fot.connect(s).approve(D2, ethers.MaxUint256)).wait(); }
  await (await d2.connect(alice).create(E(1000), ethers.ZeroAddress, 0)).wait();
  const m = await d2.getMatch(1);
  ok(m.stake === E(990), "creator credited the delta (990 after 1% burn), not the nominal 1000");
  // 999 nominal → 989.01 credited < 990 → short
  await reverts(() => d2.connect(bob).join(1, E(999)), "joiner crediting 989.01 < 990 is refused", "short stake");
  await (await d2.connect(bob).join(1, E(1000))).wait();
  const m2 = await d2.getMatch(1);
  ok(m2.stakeJoin === E(990), "joiner credited 990");
  const digest = ethers.solidityPackedKeccak256(["string", "uint256", "address", "uint256", "address"], ["WICKDUEL", chainId, D2, 1, A]);
  const t0 = BigInt(await fot.balanceOf(T)), a0 = BigInt(await fot.balanceOf(A));
  await (await d2.connect(alice).settle(1, A, await referee.signMessage(ethers.getBytes(digest)))).wait();
  // pot 1980 → fee 99 → payout 1881; the token burns 1% again on the way OUT — that's the token's business, the contract paid full amounts
  ok(BigInt(await fot.balanceOf(D2)) === 0n, "FoT escrow fully drained on settle (no dust stranded)");
  ok(BigInt(await fot.balanceOf(T)) - t0 === E(99) - E(99) / 100n, "treasury got the fee (minus the token's own burn)");
  ok(BigInt(await fot.balanceOf(A)) - a0 === E(1881) - E(1881) / 100n, "winner got the payout (minus the token's own burn)");
}

section("REENTRANCY — a malicious token can't double-dip");
{
  const evil = await (await new ethers.ContractFactory(MReenter.abi, MReenter.bytecode, owner).deploy()).waitForDeployment();
  const EVIL = await evil.getAddress();
  const d3 = await (await new ethers.ContractFactory(Duel.abi, Duel.bytecode, owner).deploy(EVIL, T, referee.address, E(100))).waitForDeployment();
  const D3 = await d3.getAddress();
  for (const [s, who] of [[alice, A], [bob, B]]) { await (await evil.mint(who, E(10_000))).wait(); await (await evil.connect(s).approve(D3, ethers.MaxUint256)).wait(); }
  await (await d3.connect(alice).create(E(1000), ethers.ZeroAddress, 0)).wait();
  // arm: during the cancel refund transfer, re-enter cancel(1) again
  const iface = new ethers.Interface(Duel.abi);
  await (await evil.arm(D3, iface.encodeFunctionData("cancel", [1]))).wait();
  await reverts(() => d3.connect(alice).cancel(1), "re-entrant cancel blocked (whole tx reverts)", "reenter blocked");
  await (await evil.arm(D3, "0x")).wait(); // disarm (empty payload call to D3 would revert → so disarm by setting armed false via a no-op arm then...)
  // simplest: deploy fresh token state — the armed flag flips false on first hook; re-arm with a harmless call to the token itself
  await (await evil.arm(EVIL, evil.interface.encodeFunctionData("balanceOf", [A]))).wait();
  await (await d3.connect(alice).cancel(1)).wait();
  ok(Number((await d3.getMatch(1)).status) === 4, "cancel works once the token behaves");
}

section("openMatches view");
{
  const before = (await duel.openMatches(0, 50)).map(Number);
  await (await dA.create(E(50_000), ethers.ZeroAddress, 0)).wait();
  await (await dB.create(E(60_000), ethers.ZeroAddress, 0)).wait();
  const ids = (await duel.openMatches(0, 50)).map(Number);
  ok(ids.length === before.length + 2 && ids[0] > ids[1], "openMatches lists newest first, only OPEN");
  const page = (await duel.openMatches(ids[0], 1)).map(Number);
  ok(page.length === 1 && page[0] === ids[0], "paged scan from a given id");
  await (await dA.cancel(ids[1])).wait();
  ok(!(await duel.openMatches(0, 50)).map(Number).includes(ids[1]), "cancelled leaves the open list");
}

section("RULES + MATCHMAKER (findMatches)");
{
  await reverts(() => dA.create(E(50_000), ethers.ZeroAddress, 2), "unknown rules refused", "rules");
  const beforeIds = (await duel.openMatches(0, 60)).map(Number);
  for (const id of beforeIds) { const m = await duel.getMatch(id); if (m.creator === A) await (await dA.cancel(id)).wait(); else if (m.creator === B) await (await dB.cancel(id)).wait(); }
  // A opens: HOUSE 50k (oldest), HOUSE 51k, BYO 50k, HOUSE 50k private→C ; B opens HOUSE 50k
  await (await dA.create(E(50_000), ethers.ZeroAddress, 0)).wait(); const h1 = Number(await duel.nextId()) - 1;
  await (await dA.create(E(51_000), ethers.ZeroAddress, 0)).wait(); const h2 = h1 + 1;
  await (await dA.create(E(50_000), ethers.ZeroAddress, 1)).wait(); const byo = h1 + 2;
  await (await dA.create(E(50_000), C, 0)).wait();                    const priv = h1 + 3;
  await (await dB.create(E(50_000), ethers.ZeroAddress, 0)).wait();  const hb = h1 + 4;
  ok(Number((await duel.getMatch(byo)).rules) === 1 && Number((await duel.getMatch(h1)).rules) === 0, "rules stored on the match");
  // C quick-matches HOUSE at 50k ±3%: gets A's h1 first (oldest), then A's h2 (51k inside band), then B's — never the BYO one, never the private one
  const found = (await duel.findMatches(0, E(48_500), E(51_500), C, 100, 10)).map(Number);
  ok(JSON.stringify(found) === JSON.stringify([h1, h2, hb]), "findMatches: HOUSE, in band, public, oldest first → " + JSON.stringify(found));
  // creator excluded from their own listings
  const forA = (await duel.findMatches(0, E(48_500), E(51_500), A, 100, 10)).map(Number);
  ok(JSON.stringify(forA) === JSON.stringify([hb]), "creator's own duels are not offered back to them");
  // BYO band only returns the BYO duel
  const b2 = (await duel.findMatches(1, E(48_500), E(51_500), C, 100, 10)).map(Number);
  ok(JSON.stringify(b2) === JSON.stringify([byo]), "rules are matched exactly (BYO ≠ HOUSE)");
  // tight band excludes 51k
  const tight = (await duel.findMatches(0, E(50_000), E(50_000), C, 100, 10)).map(Number);
  ok(JSON.stringify(tight) === JSON.stringify([h1, hb]), "stake band is inclusive and exact when tight");
  // count cap
  ok((await duel.findMatches(0, E(48_500), E(51_500), C, 100, 1)).length === 1, "count caps results");
  // scan window smaller than the set still works (only newest `scan` ids considered)
  const shallow = (await duel.findMatches(0, E(48_500), E(51_500), C, 2, 10)).map(Number);
  ok(shallow.every(id => id >= hb - 1), "scan window limits how far back we look");
  // joining the matchmaker's pick works and it drops out of the list
  await (await dC.join(h1, E(50_000))).wait();
  const after = (await duel.findMatches(0, E(48_500), E(51_500), C, 100, 10)).map(Number);
  ok(!after.includes(h1), "joined duel leaves the matchmaker list");
  ok(Number((await duel.getMatch(h1)).status) === 2, "quick-matched duel is ACTIVE");
  await (await dA.settle(h1, C, await sign(h1, C))).wait();
}

console.log(`\nWICKDUEL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
