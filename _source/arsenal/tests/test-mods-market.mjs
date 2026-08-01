// WickModsMarket — 50% burn-royalty market for the mods. Run: node test-mods-market.mjs
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const root = dirname(fileURLToPath(import.meta.url));
const reqHere = createRequire(import.meta.url);
const ganache = reqHere("ganache");
const ethers = reqHere("ethers");

const A = n => JSON.parse(readFileSync(join(root, "out", n + ".json"), "utf8"));
const [ModsArt, MktArt, GunsArt, WickArt, RouterArt, RevertArt] =
  ["WickMods", "WickModsMarket", "MockGuns", "MockWICK", "MockRouter", "MockRouterRevert"].map(A);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };
const eq = (a, b, m) => ok(String(a) === String(b), m + " (got " + a + ", want " + b + ")");
async function reverts(p, m) { try { await p; fail++; console.error("  ✗ did NOT revert: " + m); } catch { pass++; } }

const server = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 8, defaultBalance: 10000 }, miner: { blockGasLimit: 30_000_000 } });
const provider = new ethers.BrowserProvider(server);
const bal = async a => BigInt(await provider.send("eth_getBalance", [a, "latest"]));   // raw: dodge ethers' 250ms block-tag cache
const S = []; for (let i = 0; i < 8; i++) S.push(await provider.getSigner(i));
const [dep, seller, buyer, bidder] = S;
const GL = { gasLimit: 8_000_000n };
const DEAD = "0x000000000000000000000000000000000000dEaD";

console.log("deploying mocks + WickMods + WickModsMarket…");
const wick = await (await new ethers.ContractFactory(WickArt.abi, WickArt.bytecode, dep).deploy()).waitForDeployment();
const router = await (await new ethers.ContractFactory(RouterArt.abi, RouterArt.bytecode, dep).deploy(await wick.getAddress())).waitForDeployment();
const guns = await (await new ethers.ContractFactory(GunsArt.abi, GunsArt.bytecode, dep).deploy()).waitForDeployment();
const mods = await (await new ethers.ContractFactory(ModsArt.abi, ModsArt.bytecode, dep).deploy(await guns.getAddress())).waitForDeployment();
await (await mods.setMintOpen(true, GL)).wait();
// seller gets guns → mints mods
await (await guns.give(seller.address, 1, GL)).wait();
await (await guns.give(seller.address, 2, GL)).wait();
await (await mods.connect(seller).mint(6, GL)).wait();
const [sIds] = await mods.modsOfOwner(seller.address);
const t1 = Number(sIds[0]);

// fee cap enforced at 50%
await reverts(new ethers.ContractFactory(MktArt.abi, MktArt.bytecode, dep)
  .deploy(await mods.getAddress(), 5001, await router.getAddress(), await wick.getAddress(), await wick.getAddress()), "fee 50.01%");
const mkt = await (await new ethers.ContractFactory(MktArt.abi, MktArt.bytecode, dep)
  .deploy(await mods.getAddress(), 5000, await router.getAddress(), await wick.getAddress(), await wick.getAddress())).waitForDeployment();
const mktAddr = await mkt.getAddress();
eq(await mkt.feeBps(), 5000, "feeBps 5000");
await reverts(mkt.setFee(5001), "setFee above 50%");

// ---- list + buy: seller keeps 50%, other 50% burns as WICK in the SAME tx ----
await (await mods.connect(seller).setApprovalForAll(mktAddr, true, GL)).wait();
const PRICE = ethers.parseEther("100");
await (await mkt.connect(seller).list(t1, PRICE, GL)).wait();
const sBefore = await bal(seller.address);
const deadBefore = BigInt(await wick.balanceOf(DEAD));
await (await mkt.connect(buyer).buy(t1, { value: PRICE, ...GL })).wait();
eq(await mods.ownerOf(t1), buyer.address, "mod delivered");
eq(((await bal(seller.address)) - sBefore).toString(), ethers.parseEther("50").toString(), "seller got exactly 50%");
eq((BigInt(await wick.balanceOf(DEAD)) - deadBefore).toString(), (ethers.parseEther("50") * 1000n).toString(), "50% swapped+burned in-tx (mock 1:1000)");
eq((await bal(mktAddr)).toString(), "0", "market holds nothing after sale");

// ---- TYPE offer: any holder of that mod type can fill; wrong type rejected ----
const [sIds2, sTypes2] = await mods.modsOfOwner(seller.address);
const fillId = Number(sIds2[0]); const fillType = Number(sTypes2[0]);
let otherId = null, otherType = null;
for (let i = 1; i < sIds2.length; i++) if (Number(sTypes2[i]) !== fillType) { otherId = Number(sIds2[i]); otherType = Number(sTypes2[i]); break; }
await (await mkt.connect(bidder).makeOffer(0, fillType, { value: ethers.parseEther("10"), ...GL })).wait();
const offId = Number(await mkt.offersCount()) - 1;
if (otherId != null) await reverts(mkt.connect(seller).acceptOffer(offId, otherId), "filling a TYPE offer with the wrong type");
const dead2 = BigInt(await wick.balanceOf(DEAD));
await (await mkt.connect(seller).acceptOffer(offId, fillId, GL)).wait();
eq(await mods.ownerOf(fillId), bidder.address, "type offer delivered the mod");
eq((BigInt(await wick.balanceOf(DEAD)) - dead2).toString(), (ethers.parseEther("5") * 1000n).toString(), "50% of the offer burned");

// acceptOffer cleared any listing on that token (the v1 stale-listing lesson)
const [ls] = await mkt.getListing(fillId);
eq(ls, "0x0000000000000000000000000000000000000000", "no stale listing after offer fill");

// ---- escrow safety: cancel refunds in full, burnPending never touches escrow ----
await (await mkt.connect(bidder).makeOffer(0, 0, { value: ethers.parseEther("7"), ...GL })).wait();
const off2 = Number(await mkt.offersCount()) - 1;
const bBefore = await bal(bidder.address);
const rc = await (await mkt.connect(bidder).cancelOffer(off2, GL)).wait();
const gas = rc.gasUsed * rc.gasPrice;
ok((await bal(bidder.address)) - bBefore + gas === ethers.parseEther("7"), "cancel refunds escrow to the wei");

// ---- router down: sale still succeeds, royalty pools, crank burns it ----
const mktR = await (await new ethers.ContractFactory(MktArt.abi, MktArt.bytecode, dep)
  .deploy(await mods.getAddress(), 5000,
    await (await (await new ethers.ContractFactory(RevertArt.abi, RevertArt.bytecode, dep).deploy()).waitForDeployment()).getAddress(),
    await wick.getAddress(), await wick.getAddress())).waitForDeployment();
const [sIds3] = await mods.modsOfOwner(seller.address);
const t3 = Number(sIds3[0]);
await (await mods.connect(seller).setApprovalForAll(await mktR.getAddress(), true, GL)).wait();
await (await mktR.connect(seller).list(t3, ethers.parseEther("20"), GL)).wait();
await (await mktR.connect(buyer).buy(t3, { value: ethers.parseEther("20"), ...GL })).wait();
eq(await mods.ownerOf(t3), buyer.address, "sale survives a dead router");
eq((await mktR.burnPending()).toString(), ethers.parseEther("10").toString(), "50% pooled as burnPending");
await reverts(mktR.burnPool(0), "burnPool with a dead router reverts (funds stay)");
eq((await mktR.burnPending()).toString(), ethers.parseEther("10").toString(), "burnPending restored after failed crank");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
