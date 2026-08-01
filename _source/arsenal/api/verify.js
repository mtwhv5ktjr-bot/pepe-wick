// Vercel serverless: verify a wallet actually holds WICK guns, via a signed
// message + on-chain lookup. The game calls this before unlocking NFT guns.
//
// POST { address, message, signature }
//   message must contain "ts:<epoch-ms>" (freshness) and the address (binding).
// -> { ok, address, guns:[{id,type}], verifiedAt }
//
// Honest limitation: this proves ownership cryptographically, but a client-only
// game can still be tampered with locally. It stops "I just claim I own it",
// not "I edited the JS". Real anti-cheat needs server-authoritative gameplay.
import { verifyMessage, JsonRpcProvider, Contract, Network, getAddress } from "ethers";

const RPC = (process.env.RPC_URL || "https://rpc.pulsechain.com").trim();
// .trim() matters: an env value set with a trailing newline stops looking like a hex
// address, and ethers then tries to ENS-resolve it — which PulseChain has no resolver for.
const GUNS_ADDR = (process.env.GUNS_ADDR || "0x0000000000000000000000000000000000000000").trim();
// WICK MODS (free-mint attachments) — optional second collection. Zero = not deployed
// yet: the response simply carries mods:[] and the game runs vanilla guns.
const MODS_ADDR = (process.env.MODS_ADDR || "0x0000000000000000000000000000000000000000").trim();
const ABI = ["function gunsOfOwner(address) view returns (uint256[], uint8[])"];
const MODS_ABI = ["function modsOfOwner(address) view returns (uint256[], uint8[])"];

// attachments must never break gun verification: a mods read failure returns [].
async function modsOf(address, provider) {
  if (/^0x0{40}$/i.test(MODS_ADDR)) return [];
  try {
    const mods = new Contract(getAddress(MODS_ADDR), MODS_ABI, provider);
    const [ids, types] = await mods.modsOfOwner(getAddress(address));
    return ids.map((id, i) => ({ id: Number(id), type: Number(types[i]) }));
  } catch { return []; }
}
const MAX_AGE_MS = 5 * 60 * 1000;
// staticNetwork: PulseChain has no ENS; pin the chain so ethers never attempts a lookup
const CHAIN = new Network("pulsechain", 369);
const rpc = () => new JsonRpcProvider(RPC, CHAIN, { staticNetwork: CHAIN });

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") return res.status(204).end();

  // GET ?address=0x… — WATCH MODE: address-only on-chain lookup, no signature.
  // Unlocks guns in-game for viewing/playing; score submission still requires the signed POST flow,
  // so pasting someone else's address gains nothing on the leaderboard.
  if (req.method === "GET") {
    try {
      const address = String((req.query && req.query.address) || "");
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return res.status(400).json({ error: "bad address" });
      if (GUNS_ADDR === "0x0000000000000000000000000000000000000000")
        return res.status(503).json({ error: "GUNS_ADDR not configured" });
      const provider = rpc();
      const guns = new Contract(getAddress(GUNS_ADDR), ABI, provider);
      const [[ids, types], modList] = await Promise.all([
        guns.gunsOfOwner(getAddress(address)), modsOf(address, provider)]);
      const list = ids.map((id, i) => ({ id: Number(id), type: Number(types[i]) }));
      return res.status(200).json({ ok: true, address, guns: list, mods: modList, watch: true, verifiedAt: Date.now() });
    } catch (e) {
      return res.status(500).json({ error: (e && e.message) || "lookup failed" });
    }
  }

  if (req.method !== "POST") return res.status(405).json({ error: "GET or POST" });

  try {
    const { address, message, signature } = req.body || {};
    if (!address || !message || !signature) return res.status(400).json({ error: "missing address/message/signature" });

    // signature must recover to the claimed address
    let recovered;
    try { recovered = verifyMessage(message, signature); }
    catch { return res.status(401).json({ error: "bad signature" }); }
    if (recovered.toLowerCase() !== String(address).toLowerCase())
      return res.status(401).json({ error: "signature does not match address" });

    // message must be fresh and actually mention this address (anti-replay / anti-misuse)
    const ts = (/ts:(\d+)/.exec(message) || [])[1];
    if (!ts || Math.abs(Date.now() - Number(ts)) > MAX_AGE_MS)
      return res.status(401).json({ error: "stale or missing timestamp" });
    if (!message.toLowerCase().includes(String(address).toLowerCase()))
      return res.status(401).json({ error: "message must bind the address" });

    if (GUNS_ADDR === "0x0000000000000000000000000000000000000000")
      return res.status(503).json({ error: "GUNS_ADDR not configured" });

    const provider = rpc();
    const guns = new Contract(getAddress(GUNS_ADDR), ABI, provider);
    const [[ids, types], modList] = await Promise.all([
      guns.gunsOfOwner(getAddress(address)), modsOf(address, provider)]);
    const list = ids.map((id, i) => ({ id: Number(id), type: Number(types[i]) }));
    return res.status(200).json({ ok: true, address, guns: list, mods: modList, verifiedAt: Date.now() });
  } catch (e) {
    return res.status(500).json({ error: (e && e.message) || "verify failed" });
  }
}
