// Deploy WICK Arsenal to PulseChain (or any EVM chain via RPC_URL).
//
//   YOU run this — it needs your deployer private key. Claude never touches keys.
//
//   PRIVATE_KEY=0x...  \
//   RPC_URL=https://rpc.pulsechain.com  \   (default; chainId 369)
//   MINT_PRICE_PLS=1000000  \               (price per gun, in whole PLS)
//   FEE_BPS=1500  \                         (marketplace royalty, 15% — 100% of it buys & burns $WICK)
//   OPEN_MINT=1  \                          (optional: open public mint now)
//   MINT_1OF1=1  \                          (optional: mint the 6 platinum 1/1s; #6 TANGENT)
//   TANGENT_ADDR=0x…  \                     (optional: mint 1/1 #6 straight to tangent.pls's wallet; default = you)
//   node deploy.mjs
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const root = dirname(fileURLToPath(import.meta.url));
const ethers = createRequire("C:/Users/Bia/New folder/cashcat-printer/")("ethers");

const PK = process.env.PRIVATE_KEY;
if (!PK) { console.error("Set PRIVATE_KEY (deployer wallet)."); process.exit(1); }
const RPC = process.env.RPC_URL || "https://rpc.pulsechain.com";
const mintPrice = ethers.parseEther(String(process.env.MINT_PRICE_PLS || "1000000"));
const feeBps = BigInt(process.env.FEE_BPS || "1500");   // 15% royalty, 100% burned

const load = n => JSON.parse(readFileSync(join(root, "out", n + ".json"), "utf8"));
const Guns = load("WickGuns"), Market = load("WickMarket"), Art = load("WickGunArt"), Bodies = load("WickGunBodies");

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(PK, provider);
const net = await provider.getNetwork();
console.log("deployer", wallet.address, "chainId", net.chainId.toString(), "RPC", RPC);
console.log("mint price", ethers.formatEther(mintPrice), "PLS · fee", feeBps.toString(), "bps");

// 100% automatic buy&burn route (PulseChain mainnet defaults, verified 2026-07-30):
// PulseX V1 Router02 — WPLS() + factory fingerprinted on-chain, and the exact
// burn swap (swapExactETHForTokensSupportingFeeOnTransferTokens → dead address)
// simulated successfully via eth_call against the live WICK/WPLS pair.
// Override via env only if the liquidity moves. Set BURN_ROUTER=0x0 to deploy with burns pooling.
const BURN_ROUTER = process.env.BURN_ROUTER ?? "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02"; // PulseX Router02
const WPLS        = process.env.WPLS        ?? "0xA1077a294dDE1B09bB078844df40758a5D0f9a27";
const WICK_TOKEN  = process.env.WICK_TOKEN  ?? "0x8CDaf3d630Da9E1450832924D5701CC0500E9cfC"; // Green Wick
console.log("burn route: PulseX router", BURN_ROUTER, "path WPLS→WICK", WICK_TOKEN);

// blind-mint commit: generate a secret seed NOW, publish only its hash.
// KEEP out/secret-seed.json SAFE — reveal.mjs needs it after sellout.
const ownerSeed = ethers.hexlify(ethers.randomBytes(32));
const seedCommit = ethers.keccak256(ownerSeed);
writeFileSync(join(root, "out", "secret-seed.json"), JSON.stringify({ ownerSeed, seedCommit }, null, 2));
console.log("blind-mint seed committed:", seedCommit, "(secret saved to out/secret-seed.json — keep it!)");

// Deterministic, self-managed nonces: a one-shot mainnet deploy must not depend
// on ethers' internal nonce cache (which can race on fast/instamine RPCs).
let nonce = await provider.getTransactionCount(wallet.address, "pending");
const nx = () => ({ nonce: nonce++ });

const bodiesC = await (await new ethers.ContractFactory(Bodies.abi, Bodies.bytecode, wallet).deploy(nx())).waitForDeployment();
const bodiesAddr = await bodiesC.getAddress();
console.log("WickGunBodies->", bodiesAddr);

const artC = await (await new ethers.ContractFactory(Art.abi, Art.bytecode, wallet).deploy(bodiesAddr, nx())).waitForDeployment();
const artAddr = await artC.getAddress();
console.log("WickGunArt->", artAddr);

const guns = await (await new ethers.ContractFactory(Guns.abi, Guns.bytecode, wallet).deploy(mintPrice, artAddr, seedCommit, BURN_ROUTER, WPLS, WICK_TOKEN, nx())).waitForDeployment();
const gunsAddr = await guns.getAddress();
console.log("WickGuns  ->", gunsAddr);

const market = await (await new ethers.ContractFactory(Market.abi, Market.bytecode, wallet).deploy(gunsAddr, feeBps, BURN_ROUTER, WPLS, WICK_TOKEN, nx())).waitForDeployment();
const marketAddr = await market.getAddress();
console.log("WickMarket->", marketAddr);

if (process.env.MINT_1OF1 === "1") {
  // The five platinum holos are IN the public blind pool now — nothing pre-mints to the deployer.
  // tangent.pls — checksum-validated, confirmed live (11.5M PLS, 4k+ txs) 2026-07-30
  const tangentTo = process.env.TANGENT_ADDR || "0xf7B5054c0B8b67E7b0f6454747d98452f736787D";
  await (await guns.mintTangent(tangentTo, { gasLimit: 300000, ...nx() })).wait();
  console.log("minted #1 TANGENTIAL REAPER ->", tangentTo);
}
if (process.env.OPEN_MINT === "1") { await (await guns.setMintOpen(true, nx())).wait(); console.log("public mint OPEN"); }

const out = {
  chainId: Number(net.chainId), rpc: RPC,
  bodies: bodiesAddr, art: artAddr, guns: gunsAddr, market: marketAddr,
  mintPrice: mintPrice.toString(), feeBps: Number(feeBps),
};
writeFileSync(join(root, "out", "deployed.json"), JSON.stringify(out, null, 2));

// auto-wire the front-end: patch web/config.js guns/market addresses in place
try {
  const cfgPath = join(root, "web", "config.js");
  let cfg = readFileSync(cfgPath, "utf8");
  cfg = cfg.replace(/guns:\s*"0x[0-9a-fA-F]{40}"/, `guns:   "${gunsAddr}"`)
           .replace(/market:\s*"0x[0-9a-fA-F]{40}"/, `market: "${marketAddr}"`);
  writeFileSync(cfgPath, cfg);
  console.log("patched web/config.js with guns/market addresses.");
} catch (e) { console.warn("could not auto-patch web/config.js:", e.message); }

console.log("\nwrote out/deployed.json:\n" + JSON.stringify(out, null, 2));
console.log("\n=== FINISH THE LAUNCH ===");
console.log("1) redeploy the site (picks up web/config.js):");
console.log("     npx vercel deploy --prod --yes");
console.log("2) point the verify API at the collection so the game unlocks owned guns:");
console.log(`     npx vercel env add GUNS_ADDR production      # paste: ${gunsAddr}`);
console.log("     npx vercel deploy --prod --yes               # redeploy to apply env");
console.log("3) KEEP out/secret-seed.json SAFE — reveal.mjs needs it after sellout.");
console.log("   (never commit it; it's the blind-mint reveal secret.)");
