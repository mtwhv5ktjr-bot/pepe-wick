// Convert PLS pooled in the contracts into a $WICK burn.
//
//   PRIVATE_KEY=0x... node burn-pool.mjs        (or double-click BURN-POOL.cmd)
//
// Why this exists: mint() and the marketplace swap-and-burn inside the same
// transaction, but if a buyer sends a tight gas limit the swap runs out of gas.
// The mint still succeeds (by design — a router hiccup must never break a sale)
// and the PLS pools in the contract instead. burnPool() sweeps it into a real burn.
// Anyone may call it; running it yourself just means you control the slippage.
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const root = dirname(fileURLToPath(import.meta.url));
const ethers = createRequire(import.meta.url)("ethers");

const PK = process.env.PRIVATE_KEY;
if (!PK) { console.error("Set PRIVATE_KEY."); process.exit(1); }
const dep = JSON.parse(readFileSync(join(root, "out", "deployed.json"), "utf8"));
const RPC = (process.env.RPC_URL || dep.rpc || "https://rpc.pulsechain.com").trim();
const SLIPPAGE = Number(process.env.SLIPPAGE_PCT || 5);   // reject the swap if it returns less than this under quote

const ROUTER = "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02";
const WPLS   = "0xA1077a294dDE1B09bB078844df40758a5D0f9a27";
const WICK   = "0x8CDaf3d630Da9E1450832924D5701CC0500E9cfC";
const DEAD   = "0x000000000000000000000000000000000000dEaD";

const CHAIN = new ethers.Network("pulsechain", 369);
const provider = new ethers.JsonRpcProvider(RPC, CHAIN, { staticNetwork: CHAIN });
const wallet = new ethers.Wallet(PK, provider);
const router = new ethers.Contract(ROUTER, ["function getAmountsOut(uint256,address[]) view returns (uint256[])"], provider);
const wick = new ethers.Contract(WICK, ["function balanceOf(address) view returns (uint256)"], provider);
const f = n => Number(ethers.formatEther(n));

const TARGETS = [
  { name: "WickGuns (mint revenue)", addr: dep.guns,   abi: ["function burnPool(uint256 minOut)"] },
  { name: "WickMarket (royalties)",  addr: dep.market, abi: ["function burnPool(uint256 minOut)", "function burnPending() view returns (uint256)"] },
];

console.log("caller:", wallet.address, "· slippage tolerance:", SLIPPAGE + "%\n");
let any = false;

for (const t of TARGETS) {
  const c = new ethers.Contract(t.addr, t.abi, wallet);
  // the market only ever burns its recorded royalty pool, never escrowed offers
  let amount = await provider.getBalance(t.addr);
  if (t.name.startsWith("WickMarket")) {
    try { amount = await c.burnPending(); } catch { amount = 0n; }
  }
  if (amount === 0n) { console.log(t.name + ": nothing pooled ✓"); continue; }

  const quote = (await router.getAmountsOut(amount, [WPLS, WICK]))[1];
  const minOut = quote * BigInt(Math.round((100 - SLIPPAGE) * 100)) / 10000n;
  console.log(t.name + ":");
  console.log("  pooled ....... " + f(amount).toLocaleString() + " PLS");
  console.log("  quote ........ " + f(quote).toFixed(2) + " WICK");
  console.log("  min accepted . " + f(minOut).toFixed(2) + " WICK");

  const before = await wick.balanceOf(DEAD);
  try {
    const tx = await c.burnPool(minOut, { gasLimit: 500000 });
    console.log("  sent " + tx.hash + " …");
    await tx.wait();
    const burned = (await wick.balanceOf(DEAD)) - before;
    console.log("  ✅ BURNED " + f(burned).toFixed(2) + " WICK\n");
    any = true;
  } catch (e) {
    console.error("  ✗ failed: " + (e.shortMessage || e.reason || e.message));
    console.error("    (if it's slippage, retry with a higher SLIPPAGE_PCT)\n");
  }
}

if (!any) console.log("Nothing needed burning.");
console.log("Total WICK now at the dead address: " + f(await wick.balanceOf(DEAD)).toLocaleString());
