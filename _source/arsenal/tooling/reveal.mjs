// Reveal the blind mint: proves the pre-committed seed on-chain, which assigns
// every sealed case its gun type (mixed with a post-close blockhash).
//
//   PRIVATE_KEY=0x... node reveal.mjs        (or just double-click REVEAL.cmd)
//
// Needs out/deployed.json + out/secret-seed.json from deploy.mjs.
//
// The contract requires the mint to be CLOSED before it will reveal, so this does:
//   1. closeMint()        -> arms revealBlock (mint is briefly shut, ~20s)
//   2. reveal(seed)       -> assigns every gun type, forever
//   3. setMintOpen(true)  -> REOPENS the mint if it was open when we started
// After the reveal, any gun minted later is readable immediately — new buyers see
// their weapon the moment they mint, no waiting.
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const root = dirname(fileURLToPath(import.meta.url));
const ethers = createRequire(import.meta.url)("ethers");

const PK = process.env.PRIVATE_KEY;
if (!PK) { console.error("Set PRIVATE_KEY (the deployer/owner wallet)."); process.exit(1); }
const dep = JSON.parse(readFileSync(join(root, "out", "deployed.json"), "utf8"));
const secret = JSON.parse(readFileSync(join(root, "out", "secret-seed.json"), "utf8"));
const RPC = (process.env.RPC_URL || dep.rpc || "https://rpc.pulsechain.com").trim();

const ABI = [
  "function revealed() view returns (bool)",
  "function revealBlock() view returns (uint256)",
  "function publicMinted() view returns (uint256)",
  "function mintOpen() view returns (bool)",
  "function seedCommit() view returns (bytes32)",
  "function owner() view returns (address)",
  "function closeMint()",
  "function reveal(bytes32 ownerSeed)",
  "function setMintOpen(bool v)",
  "function gunTypeOf(uint256) view returns (uint8)",
];
const NAMES = { 1:"Boogeyman P30", 2:"Continental Vector", 3:"Kimber Breacher", 4:"TTI Marksman",
  5:"Excommunicado", 11:"Gold Standard", 12:"The Impossible", 13:"High Table", 14:"Tabula Rasa",
  15:"Baba Yaga", 16:"Tangential Reaper" };

const CHAIN = new ethers.Network("pulsechain", 369);          // PulseChain has no ENS
const provider = new ethers.JsonRpcProvider(RPC, CHAIN, { staticNetwork: CHAIN });
const wallet = new ethers.Wallet(PK, provider);
const guns = new ethers.Contract(dep.guns, ABI, wallet);

// ---- safety checks before we touch anything ----
const owner = await guns.owner();
if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
  console.error("✗ This wallet is not the contract owner.\n   owner:  " + owner + "\n   you:    " + wallet.address);
  process.exit(1);
}
if (await guns.revealed()) { console.log("Already revealed — nothing to do."); process.exit(0); }
const commit = await guns.seedCommit();
if (ethers.keccak256(secret.ownerSeed).toLowerCase() !== commit.toLowerCase()) {
  console.error("✗ out/secret-seed.json does NOT match the on-chain commitment. Refusing to continue.");
  process.exit(1);
}
const wasOpen = await guns.mintOpen();
const sold = Number(await guns.publicMinted());
console.log("owner ok · seed matches commitment · sold " + sold + "/100 · mint was " + (wasOpen ? "OPEN" : "closed"));

// ---- 1. close (arms the reveal block) ----
let rb = await guns.revealBlock();
if (rb === 0n) {
  console.log("\n1/3 closing the mint to arm the reveal…");
  await (await guns.closeMint()).wait();
  rb = await guns.revealBlock();
}
console.log("    reveal block: " + rb);

// ---- 2. wait one block, then reveal ----
while (BigInt(await provider.getBlockNumber()) <= rb) {
  process.stdout.write("    waiting for the chain to pass it…\r");
  await new Promise(r => setTimeout(r, 3000));
}
console.log("\n2/3 revealing with the committed seed…");
await (await guns.reveal(secret.ownerSeed)).wait();
console.log("    ✅ REVEALED — every gun type is now fixed and public.");

// ---- 3. reopen so the sale continues ----
if (wasOpen) {
  console.log("\n3/3 reopening the mint…");
  await (await guns.setMintOpen(true)).wait();
  console.log("    ✅ mint is OPEN again (" + sold + "/100 sold). New mints now reveal instantly.");
} else {
  console.log("\n3/3 mint was already closed before this — leaving it closed.");
}

// ---- what everyone got ----
console.log("\n=== FULL ASSIGNMENT ===");
const tally = {};
for (let id = 2; id <= 101; id++) {
  const t = Number(await guns.gunTypeOf(id));
  tally[t] = (tally[t] || 0) + 1;
  if (id <= sold + 1) console.log("  #" + String(id).padStart(3) + "  " + (NAMES[t] || "type " + t));
}
console.log("\n=== POOL TOTALS (all 100 public) ===");
for (const t of Object.keys(tally).sort((a, b) => a - b))
  console.log("  " + String(tally[t]).padStart(3) + " x  " + (NAMES[t] || "type " + t));
console.log("\nHolders can now use their guns in-game at games.wick.pics — reconnect the wallet to refresh.");
