// Compile WICK Arsenal contracts, reusing cashcat-printer's installed solc.
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const root = dirname(fileURLToPath(import.meta.url));
// solc/ethers are already installed next door — borrow them, no reinstall.
const require = createRequire("C:/Users/Bia/New folder/cashcat-printer/");
const solc = require("solc");

const files = ["WickGuns.sol", "WickMarket.sol", "WickGunArt.sol", "WickGunBodies.sol", "WickMods.sol", "WickModsMarket.sol", "WickBillboards.sol", "TestMocks.sol"];
const sources = {};
for (const f of files) sources[f] = { content: readFileSync(join(root, "contracts", f), "utf8") };

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    evmVersion: "paris",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object", "metadata"] } },
  },
};

const out = JSON.parse(solc.compile(JSON.stringify(input)));
let fatal = false;
for (const e of out.errors ?? []) {
  console[e.severity === "error" ? "error" : "warn"](e.formattedMessage);
  if (e.severity === "error") fatal = true;
}
if (fatal) process.exit(1);

mkdirSync(join(root, "out"), { recursive: true });
for (const [file, name] of [["WickGuns.sol", "WickGuns"], ["WickMarket.sol", "WickMarket"], ["WickGunArt.sol", "WickGunArt"], ["WickGunBodies.sol", "WickGunBodies"], ["WickMods.sol", "WickMods"], ["WickModsMarket.sol", "WickModsMarket"], ["WickBillboards.sol", "WickBillboards"], ["TestMocks.sol", "MockWICK"], ["TestMocks.sol", "MockGuns"], ["TestMocks.sol", "MockRouter"], ["TestMocks.sol", "MockRouterRevert"]]) {
  const c = out.contracts[file][name];
  writeFileSync(join(root, "out", name + ".json"),
    JSON.stringify({ abi: c.abi, bytecode: "0x" + c.evm.bytecode.object, metadata: c.metadata }, null, 2));
  const size = c.evm.deployedBytecode.object.length / 2;
  console.log(`${name}: deployed ${size} bytes (limit 24576) · ${size <= 24576 ? "OK" : "!! OVER LIMIT"} · ABI ${c.abi.length}`);
}
writeFileSync(join(root, "out", "verify-input.json"), JSON.stringify(input, null, 2));
console.log("wrote out/*.json + verify-input.json");
