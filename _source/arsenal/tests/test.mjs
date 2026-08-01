// End-to-end contract tests on an in-process ganache chain.
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const root = dirname(fileURLToPath(import.meta.url));
const reqHere = createRequire(import.meta.url);
const ganache = reqHere("ganache");
const ethers = reqHere("ethers");

const load = n => JSON.parse(readFileSync(join(root, "out", n + ".json"), "utf8"));
const Guns = load("WickGuns"), Market = load("WickMarket"), Art = load("WickGunArt"), Bodies = load("WickGunBodies");
const MWick = load("MockWICK"), MRouter = load("MockRouter"), MRouterRev = load("MockRouterRevert");
const DEAD = "0x000000000000000000000000000000000000dEaD";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error("  FAIL:", m); } };
async function reverts(fn, m) { try { const tx = await fn(); if (tx && typeof tx.wait === "function") await tx.wait(); fail++; console.error("  FAIL (expected revert):", m); } catch { pass++; } }

const provider = new ethers.BrowserProvider(ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 6, defaultBalance: 100000 } }));
const accts = await provider.send("eth_accounts", []);
const [owner, alice, bob, carol] = await Promise.all(accts.slice(0, 4).map(a => provider.getSigner(a)));
const A = await alice.getAddress(), B = await bob.getAddress(), C = await carol.getAddress();

const price = ethers.parseEther("1");
// ethers v6 caches the "latest" block tag for ~250ms, so a balance read right after a
// tx can resolve against the PRE-tx block (delta reads as 0). Always go raw for deltas.
const bal = async a => BigInt(await provider.send("eth_getBalance", [a, "latest"]));

// ---- deploy (blind mint: commit the seed hash up-front) ----
const ownerSeed = ethers.hexlify(ethers.randomBytes(32));
const seedCommit = ethers.keccak256(ownerSeed);
const bodies = await (await new ethers.ContractFactory(Bodies.abi, Bodies.bytecode, owner).deploy()).waitForDeployment();
const art = await (await new ethers.ContractFactory(Art.abi, Art.bytecode, owner).deploy(await bodies.getAddress())).waitForDeployment();
const mwick = await (await new ethers.ContractFactory(MWick.abi, MWick.bytecode, owner).deploy()).waitForDeployment();
const mrouter = await (await new ethers.ContractFactory(MRouter.abi, MRouter.bytecode, owner).deploy(await mwick.getAddress())).waitForDeployment();
const WPLS_DUMMY = await mwick.getAddress();   // path[0]; mocks ignore the path, must merely be nonzero
const guns = await (await new ethers.ContractFactory(Guns.abi, Guns.bytecode, owner).deploy(
  price, await art.getAddress(), seedCommit, await mrouter.getAddress(), WPLS_DUMMY, await mwick.getAddress())).waitForDeployment();
const market = await (await new ethers.ContractFactory(Market.abi, Market.bytecode, owner).deploy(
  await guns.getAddress(), 1500, await mrouter.getAddress(), WPLS_DUMMY, await mwick.getAddress())).waitForDeployment();
console.log("deployed bodies + art + guns + market (blind mint, auto-burn route)");

// ---- burn-route constructor guard ----
const artAddr0 = await art.getAddress(), mwickAddr0 = await mwick.getAddress();
await reverts(() => new ethers.ContractFactory(Guns.abi, Guns.bytecode, owner).deploy(
  price, artAddr0, seedCommit, A, WPLS_DUMMY, mwickAddr0),
  "codeless router (EOA) rejected by constructor");

// ---- mint gating ----
await reverts(() => guns.connect(alice).mint(1, { value: price }), "mint while closed");
await (await guns.setMintOpen(true)).wait();
await reverts(() => guns.connect(alice).mint(1, { value: 0 }), "mint underpaid");

// ---- TANGENTIAL REAPER: the ONLY reserved token (#1, type 16) ----
await (await guns.mintTangent(A)).wait();
ok(await guns.ownerOf(1) === A, "#1 TANGENTIAL REAPER minted to recipient");
ok(Number(await guns.gunTypeOf(1)) === 16, "reserved token is gunType 16");
await reverts(() => guns.mintTangent(B), "the Reaper cannot exist twice");
await reverts(() => guns.connect(alice).mintTangent(A), "only owner mints the Reaper");
ok(Number(await guns.oooMinted()) === 1, "exactly ONE reserved token — the five platinum holos are in the pool");
{ const tm = JSON.parse(Buffer.from((await guns.tokenURI(1)).split(",")[1], "base64").toString());
  ok(tm.name === "Tangential Reaper #1", "Reaper metadata name (" + tm.name + ")");
  const tsvg = Buffer.from(tm.image.split(",")[1], "base64").toString();
  ok(tsvg.includes(">TANGENTIAL REAPER<"), "TANGENTIAL REAPER on the card");
  ok(tsvg.includes("FORGED FOR TANGENT.PLS"), "tangent.pls dedication on the card");
  ok(tsvg.includes("#7cf9a5") && tsvg.includes("#123522"), "card is green (pepe-green accents + green AR furniture)");
  ok(tsvg.includes("<animate"), "card is animated holo");
  ok(tsvg.includes("ULTRA PLATINUM HOLO"), "rarity reads ULTRA PLATINUM HOLO");
  ok(tsvg.includes("No 000 / 100"), "serial reads No 000 / 100");
  ok(/Ultra Platinum Holo/.test(JSON.stringify(tm.attributes)), "metadata rarity Ultra Platinum Holo");
  writeFileSync(join(root, "out", "tangent-card.svg"), tsvg); }

// ---- public mint: BLIND (sealed cases, no types yet) ----
const G = n => ({ gasLimit: 180000 * n + 160000 });   // headroom for the in-mint buy&burn swap
await (await guns.connect(alice).mint(3, { value: price * 3n, ...G(3) })).wait();
ok(Number(await guns.publicMinted()) === 3, "publicMinted == 3");

// ---- 100% AUTOMATIC BUY & BURN ----
ok((await mwick.balanceOf(DEAD)) === price * 3n * 1000n, "auto-burn: mint PLS swapped to WICK at the dead address");
ok((await provider.getBalance(await guns.getAddress())) === 0n, "auto-burn: zero PLS pools in the contract");
ok(typeof guns.withdraw === "undefined", "withdraw() no longer exists — burn is the only exit");
await reverts(() => guns.connect(alice).burnPool(0, { gasLimit: 200000 }), "burnPool with empty pool reverts");
// direct sends pool up and anyone can crank them into a burn
await (await alice.sendTransaction({ to: await guns.getAddress(), value: price })).wait();
{ const before = await mwick.balanceOf(DEAD);
  await (await guns.connect(carol).burnPool(0, { gasLimit: 250000 })).wait();
  ok((await mwick.balanceOf(DEAD)) - before === price * 1000n, "burnPool: anyone cranks pooled PLS into a burn");
  ok((await provider.getBalance(await guns.getAddress())) === 0n, "burnPool: pool drained to zero"); }
// a broken router must never block minting — PLS pools instead
{ const mrev = await (await new ethers.ContractFactory(MRouterRev.abi, MRouterRev.bytecode, owner).deploy()).waitForDeployment();
  const seed2 = ethers.hexlify(ethers.randomBytes(32));
  const guns2 = await (await new ethers.ContractFactory(Guns.abi, Guns.bytecode, owner).deploy(
    price, await art.getAddress(), ethers.keccak256(seed2), await mrev.getAddress(), WPLS_DUMMY, await mwick.getAddress())).waitForDeployment();
  await (await guns2.setMintOpen(true)).wait();
  await (await guns2.connect(bob).mint(1, { value: price, ...G(1) })).wait();
  ok(Number(await guns2.publicMinted()) === 1, "router failure: mint still succeeds");
  ok((await provider.getBalance(await guns2.getAddress())) === price, "router failure: PLS pools for a later burnPool");
  await reverts(() => guns2.connect(bob).burnPool(0, { gasLimit: 200000 }), "burnPool reverts while router is down"); }
ok(Number(await guns.gunTypeOf(2)) === 0, "public token is SEALED before reveal (type 0)");
{ const sealed = JSON.parse(Buffer.from((await guns.tokenURI(2)).split(",")[1], "base64").toString());
  ok(sealed.name === "Sealed Arsenal Case #2", "sealed metadata name (" + sealed.name + ")");
  const bsvg = Buffer.from(sealed.image.split(",")[1], "base64").toString();
  ok(bsvg.includes("SEALED CASE"), "sealed card-back art renders"); }
await reverts(() => guns.reveal(ownerSeed, { gasLimit: 300000 }), "reveal before mint closes reverts");

// mint the remaining 97 to prove the supply cap
for (let i = 0; i < 19; i++) await (await guns.connect(bob).mint(5, { value: price * 5n, ...G(5) })).wait();
await (await guns.connect(bob).mint(2, { value: price * 2n, ...G(2) })).wait();
ok(Number(await guns.publicMinted()) === 100, "publicMinted == 100 (sold out)");
ok(Number(await guns.totalSupply()) === 101, "totalSupply == 101");
await reverts(() => guns.connect(alice).mint(1, { value: price }), "public mint past 100 reverts");
ok(Number(await guns.revealBlock()) > 0, "revealBlock armed at sellout");

// ---- REVEAL: wrong seed rejected, right seed assigns the exact tier pool ----
await (await guns.connect(alice).transferFrom(A, A, 2).catch(()=>null), null); // advance a block
await (await guns.setMintPrice(price)).wait(); // dummy tx to pass revealBlock
await reverts(() => guns.reveal(ethers.keccak256("0x1234"), { gasLimit: 300000 }), "wrong seed reverts");
await reverts(() => guns.connect(alice).reveal(ownerSeed, { gasLimit: 300000 }), "only owner reveals");
await (await guns.reveal(ownerSeed)).wait();
ok(await guns.revealed() === true, "revealed");
const dist = {};
for (let id = 2; id <= 101; id++) { const t = Number(await guns.gunTypeOf(id)); dist[t] = (dist[t] || 0) + 1; }
ok(dist[1] === 30 && dist[2] === 25 && dist[3] === 18 && dist[4] === 15 && dist[5] === 7,
   "post-reveal tier supply exactly 30/25/18/15/7 (got " + JSON.stringify(dist) + ")");
ok(dist[11] === 1 && dist[12] === 1 && dist[13] === 1 && dist[14] === 1 && dist[15] === 1,
   "all FIVE platinum holos landed in the public pool, one each");
ok(!dist[0], "no sealed tokens remain after reveal");

// ---- metadata ----
const uri1 = await guns.tokenURI(1);
ok(uri1.startsWith("data:application/json;base64,"), "tokenURI is on-chain data URI");
const meta = JSON.parse(Buffer.from(uri1.split(",")[1], "base64").toString());
ok(meta.name === "Tangential Reaper #1", "reserved-token name correct (" + meta.name + ")");
ok(/Ultra Platinum Holo/.test(JSON.stringify(meta.attributes)), "reserved-token rarity Ultra Platinum Holo");
const svg = Buffer.from(meta.image.split(",")[1], "base64").toString();
ok(svg.includes("<animate"), "1/1 SVG is animated (holographic)");
ok(svg.includes("values='0;-0.7;0'"), "1/1 has the animated rainbow foil");
const t7 = Number(await guns.gunTypeOf(7));
const svg7 = Buffer.from(JSON.parse(Buffer.from((await guns.tokenURI(7)).split(",")[1], "base64").toString()).image.split(",")[1], "base64").toString();
ok(svg7.includes("</svg>") && svg7.includes("WICK ARSENAL"), "revealed public token renders a full card");
ok(t7 >= 4 || !svg7.includes("id='foil'"), "common/uncommon card has no foil gradient (foil is rare+ only)");

// ---- gunsOfOwner ----
const [ids, types] = await guns.gunsOfOwner(A);
ok(ids.length === Number(await guns.balanceOf(A)), "gunsOfOwner length == balance");
ok(ids.map(Number).includes(1), "alice's guns include 1/1 #1");

// ---- transfer + enumeration ----
const balBefore = Number(await guns.balanceOf(A));
await (await guns.connect(alice).transferFrom(A, B, 1)).wait();
ok(await guns.ownerOf(1) === B, "token 1 transferred to bob");
ok(Number(await guns.balanceOf(A)) === balBefore - 1, "alice balance decremented");
const [bIds] = await guns.gunsOfOwner(B);
ok(bIds.map(Number).includes(1), "bob's enumeration now includes 1");

// ---- marketplace ----
await reverts(() => market.connect(bob).list(1, price, { gasLimit: 120000 }), "list without approval reverts");
await (await guns.connect(bob).approve(await market.getAddress(), 1)).wait();
await (await market.connect(bob).list(1, price)).wait();
const [seller, lp] = await market.getListing(1);
ok(seller === B && lp === price, "listing recorded");

const sellerBefore = await bal(B);
const deadBeforeSale = await mwick.balanceOf(DEAD);
await (await market.connect(carol).buy(1, { value: price + ethers.parseEther("0.5"), gasLimit: 400000 })).wait(); // overpay to test refund
ok(await guns.ownerOf(1) === C, "carol bought token 1");
const sellerAfter = await bal(B);
const fee = price * 1500n / 10000n;
ok(sellerAfter - sellerBefore === price - fee, "seller got price minus the 15% royalty");
ok((await mwick.balanceOf(DEAD)) - deadBeforeSale === fee * 1000n, "the 15% royalty was swapped to WICK and BURNED in the sale tx");
ok((await market.burnPending()) === 0n, "no royalty pooled — it burned inline");
const [, gone] = await market.getListing(1);
ok(gone === 0n, "listing cleared after sale");
await reverts(() => market.connect(alice).buy(1, { value: price, gasLimit: 120000 }), "buy unlisted reverts");

// cancel path
await (await guns.connect(carol).approve(await market.getAddress(), 1)).wait();
await (await market.connect(carol).list(1, price)).wait();
await reverts(() => market.connect(alice).cancel(1, { gasLimit: 120000 }), "non-seller cannot cancel");
await (await market.connect(carol).cancel(1)).wait();
const [, cp] = await market.getListing(1);
ok(cp === 0n, "listing cancelled");

// ---- OFFERS POOL ----
// bob escrows a token-specific offer on carol's #1; alice escrows a COLLECTION offer (tokenId 0 = anything)
const off = ethers.parseEther("2");
await (await market.connect(bob).makeOffer(1, 0, { value: off })).wait();          // offer 0: token #1
await (await market.connect(alice).makeOffer(0, 0, { value: off * 2n })).wait();   // offer 1: any gun
ok(Number(await market.offersCount()) === 2, "two offers escrowed");
ok((await bal(await market.getAddress())) === off * 3n, "escrow held by the contract");
// wrong token / non-owner rejections
await reverts(() => market.connect(carol).acceptOffer(0, 2, { gasLimit: 300000 }), "specific offer rejects a different token");
await reverts(() => market.connect(alice).acceptOffer(0, 1, { gasLimit: 300000 }), "only the token owner can accept");
// carol accepts bob's specific offer on #1 (already approved above)
{ const cBefore = await bal(C), deadB = await mwick.balanceOf(DEAD);
  const rc = await (await market.connect(carol).acceptOffer(0, 1, { gasLimit: 400000 })).wait();
  const gas = rc.gasUsed * rc.gasPrice;
  ok(await guns.ownerOf(1) === B, "accept: token #1 delivered to the bidder");
  const feeO = off * 1500n / 10000n;
  ok((await bal(C)) - cBefore + gas === off - feeO, "accept: seller received 85%");
  ok((await mwick.balanceOf(DEAD)) - deadB === feeO * 1000n, "accept: the 15% royalty burned"); }
await reverts(() => market.connect(carol).acceptOffer(0, 1, { gasLimit: 300000 }), "closed offer cannot be re-accepted");
// collection offer: ANY holder sells in — bob accepts with the #1 he just bought
{ await (await guns.connect(bob).approve(await market.getAddress(), 1)).wait();
  await (await market.connect(bob).acceptOffer(1, 1, { gasLimit: 400000 })).wait();
  ok(await guns.ownerOf(1) === A, "collection offer: any-token accept delivered to bidder"); }
// cancel + refund
{ await (await market.connect(carol).makeOffer(0, 0, { value: off })).wait();      // offer 2
  const cB = await bal(C);
  const rc = await (await market.connect(carol).cancelOffer(2, { gasLimit: 200000 })).wait();
  const gas = rc.gasUsed * rc.gasPrice;
  ok((await bal(C)) - cB + gas === off, "cancelled offer refunded in full");
  await reverts(() => market.connect(carol).cancelOffer(2, { gasLimit: 200000 }), "cannot double-cancel"); }
ok((await bal(await market.getAddress())) === 0n, "all escrow settled — market holds zero PLS");
await reverts(() => market.connect(alice).burnPool(0, { gasLimit: 200000 }), "burnPool with nothing pending reverts");
// broken-router market: royalty pools instead of burning, escrow stays untouchable
{ const mrev2 = await (await new ethers.ContractFactory(MRouterRev.abi, MRouterRev.bytecode, owner).deploy()).waitForDeployment();
  const market2 = await (await new ethers.ContractFactory(Market.abi, Market.bytecode, owner).deploy(
    await guns.getAddress(), 1500, await mrev2.getAddress(), WPLS_DUMMY, await mwick.getAddress())).waitForDeployment();
  await (await guns.connect(alice).approve(await market2.getAddress(), 1)).wait();
  await (await market2.connect(alice).list(1, price)).wait();
  await (await market2.connect(bob).makeOffer(0, 0, { value: off })).wait();       // escrow alongside the failed burn
  await (await market2.connect(carol).buy(1, { value: price, gasLimit: 400000 })).wait();
  ok((await market2.burnPending()) === price * 1500n / 10000n, "failed royalty burn pools in burnPending");
  await reverts(() => market2.connect(bob).burnPool(0, { gasLimit: 200000 }), "burnPool reverts while router is down");
  const bB = await bal(B);
  const rc = await (await market2.connect(bob).cancelOffer(0, { gasLimit: 200000 })).wait();
  const gas = rc.gasUsed * rc.gasPrice;
  ok((await bal(B)) - bB + gas === off, "escrow refunds in full even with a stuck burn pool");
  await (await guns.connect(carol).transferFrom(C, A, 1)).wait(); }             // hand #1 back to alice for cleanliness

/* ============================================================================
   EARLY REVEAL WHILE THE MINT IS STILL SELLING  (the live production sequence)
   Proves: close -> reveal -> reopen leaves the mint fully working, and every
   gun minted AFTER the reveal gets its type instantly. Run on a fresh contract
   so it can't disturb the assertions above.
   ============================================================================ */
{
  const seedE = ethers.hexlify(ethers.randomBytes(32));
  const gunsE = await (await new ethers.ContractFactory(Guns.abi, Guns.bytecode, owner).deploy(
    price, await art.getAddress(), ethers.keccak256(seedE),
    await mrouter.getAddress(), WPLS_DUMMY, await mwick.getAddress())).waitForDeployment();
  await (await gunsE.mintTangent(A)).wait();
  await (await gunsE.setMintOpen(true)).wait();

  // --- partway through the sale (like the real 42/100) ---
  await (await gunsE.connect(alice).mint(5, { value: price * 5n, ...G(5) })).wait();
  await (await gunsE.connect(bob).mint(5, { value: price * 5n, ...G(5) })).wait();
  ok(Number(await gunsE.publicMinted()) === 10, "early-reveal: 10/100 sold before revealing");
  ok(Number(await gunsE.gunTypeOf(2)) === 0, "early-reveal: cases are SEALED (type 0) pre-reveal — the problem we're fixing");

  // --- the exact sequence reveal.mjs performs ---
  const wasOpen = await gunsE.mintOpen();
  await (await gunsE.closeMint()).wait();
  ok((await gunsE.mintOpen()) === false, "early-reveal: closeMint() shuts the mint");
  await reverts(() => gunsE.connect(carol).mint(1, { value: price, ...G(1) }), "early-reveal: nobody can mint while it's closed");
  await (await gunsE.setMintPrice(price)).wait();                    // advance a block past revealBlock
  await (await gunsE.reveal(seedE)).wait();
  ok((await gunsE.revealed()) === true, "early-reveal: reveal succeeds mid-sale");
  if (wasOpen) await (await gunsE.setMintOpen(true)).wait();
  ok((await gunsE.mintOpen()) === true, "early-reveal: mint REOPENS after reveal");

  // --- existing holders now have real guns ---
  const t2 = Number(await gunsE.gunTypeOf(2));
  ok(t2 >= 1, "early-reveal: already-minted case #2 now has a real gun type (" + t2 + ")");

  // --- THE THING THE USER ASKED ABOUT: can people still mint the rest? ---
  await (await gunsE.connect(carol).mint(5, { value: price * 5n, ...G(5) })).wait();
  ok(Number(await gunsE.publicMinted()) === 15, "early-reveal: ✅ PEOPLE CAN STILL MINT after the reveal");
  const tNew = Number(await gunsE.gunTypeOf(15));
  ok(tNew >= 1, "early-reveal: a gun minted AFTER reveal is readable instantly (" + tNew + ") — no waiting");
  ok((await mwick.balanceOf(DEAD)) > 0n, "early-reveal: buy&burn still fires on post-reveal mints");

  // --- and the sale can still run all the way to the end ---
  for (let i = 0; i < 17; i++) await (await gunsE.connect(bob).mint(5, { value: price * 5n, ...G(5) })).wait();
  ok(Number(await gunsE.publicMinted()) === 100, "early-reveal: sale runs to a full 100/100 sellout after an early reveal");
  await reverts(() => gunsE.connect(alice).mint(1, { value: price, ...G(1) }), "early-reveal: sold out still blocks further mints");
  ok(Number(await gunsE.totalSupply()) === 101, "early-reveal: final supply 101");

  // --- supply integrity survived the early reveal ---
  const distE = {};
  for (let id = 2; id <= 101; id++) { const t = Number(await gunsE.gunTypeOf(id)); distE[t] = (distE[t] || 0) + 1; }
  ok(distE[1] === 30 && distE[2] === 25 && distE[3] === 18 && distE[4] === 15 && distE[5] === 7,
     "early-reveal: tier supply still exactly 30/25/18/15/7 (" + JSON.stringify(distE) + ")");
  ok(distE[11] === 1 && distE[12] === 1 && distE[13] === 1 && distE[14] === 1 && distE[15] === 1,
     "early-reveal: all five platinum holos still in the pool, one each");
  await reverts(() => gunsE.reveal(seedE, { gasLimit: 300000 }), "early-reveal: cannot reveal twice");
}

/* ============================================================================
   TIER OFFERS — "I'll pay X for ANY Marksman", fillable by any holder of one.
   ============================================================================ */
{
  // find two tokens of the same tier held by different people, plus one of another tier
  const owned = {};
  for (let id = 2; id <= 101; id++) {
    const t = Number(await guns.gunTypeOf(id));
    (owned[t] = owned[t] || []).push({ id, o: await guns.ownerOf(id) });
  }
  const tier = Object.keys(owned).map(Number).filter(t => t >= 1 && t <= 5)
    .find(t => new Set(owned[t].map(x => x.o)).size >= 2);
  const list = owned[tier];
  const first = list[0];
  const second = list.find(x => x.o !== first.o);
  const otherTier = Object.keys(owned).map(Number).find(t => t >= 1 && t <= 5 && t !== tier);
  const wrongTok = owned[otherTier][0];

  const bid = ethers.parseEther("3");
  const sellerA = await provider.getSigner(first.o);
  const sellerB = await provider.getSigner(second.o);
  const wrongSeller = await provider.getSigner(wrongTok.o);

  await (await market.connect(alice).makeOffer(0, tier, { value: bid })).wait();
  const oid = Number(await market.offersCount()) - 1;
  const [, amt, tok, gt, open] = await market.getOffer(oid);
  ok(tok === 0n && Number(gt) === tier && open, "tier offer recorded (tier " + tier + ", any token)");

  // a gun from the WRONG tier cannot fill it
  await (await guns.connect(wrongSeller).approve(await market.getAddress(), wrongTok.id)).wait();
  await reverts(() => market.connect(wrongSeller).acceptOffer(oid, wrongTok.id, { gasLimit: 400000 }),
    "wrong-tier gun cannot fill a tier offer");

  // ANY holder of the right tier can — here the SECOND holder, not the first
  await (await guns.connect(sellerB).approve(await market.getAddress(), second.id)).wait();
  const sBefore = await bal(second.o), deadBefore = await mwick.balanceOf(DEAD);
  const rc = await (await market.connect(sellerB).acceptOffer(oid, second.id, { gasLimit: 500000 })).wait();
  const gas = rc.gasUsed * rc.gasPrice;
  const fee = bid * 1500n / 10000n;
  ok(await guns.ownerOf(second.id) === A, "✅ ANY holder of that tier filled the offer");
  ok((await bal(second.o)) - sBefore + gas === bid - fee, "tier offer: seller got 85%");
  ok((await mwick.balanceOf(DEAD)) - deadBefore === fee * 1000n, "tier offer: 15% royalty burned as WICK");
  { const [, , , , stillOpen] = await market.getOffer(oid); ok(!stillOpen, "tier offer closes after one fill"); }

  // guards
  await reverts(() => market.connect(alice).makeOffer(5, 3, { value: bid, gasLimit: 300000 }),
    "cannot target a token AND a tier at once");
  // token-specific offers still behave
  await (await market.connect(alice).makeOffer(first.id, 0, { value: bid })).wait();
  const oid2 = Number(await market.offersCount()) - 1;
  await reverts(() => market.connect(wrongSeller).acceptOffer(oid2, wrongTok.id, { gasLimit: 400000 }),
    "token offer still refuses a different token");
  await (await market.connect(alice).cancelOffer(oid2, { gasLimit: 200000 })).wait();
  // collection-wide (0,0) still fillable by anything
  await (await market.connect(bob).makeOffer(0, 0, { value: bid })).wait();
  const oid3 = Number(await market.offersCount()) - 1;
  await (await guns.connect(wrongSeller).approve(await market.getAddress(), wrongTok.id)).wait();
  await (await market.connect(wrongSeller).acceptOffer(oid3, wrongTok.id, { gasLimit: 500000 })).wait();
  ok(await guns.ownerOf(wrongTok.id) === B, "collection-wide offer still fillable by any gun");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
