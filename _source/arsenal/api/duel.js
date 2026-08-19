// WICK DUEL referee — serverless. Rules live in _duel-core.js (pure, tested);
// this file only wires chain reads, the git-file store and the referee key.
//
//   GET  /api/duel?id=N                 → public match view (scores sealed until settled)
//   GET  /api/duel?info=1               → { contract, chainId, rules }
//   POST /api/duel { action:"start",  id, address, message, signature }
//        → { seed, budgetMs, startedAt, reportDeadline }   (one START per player)
//   POST /api/duel { action:"report", id, address, message, signature, run:{score,wave,kills,durationMs,telemetry} }
//        → { ok, settled?: {winner, sig} }
//   POST /api/duel { action:"settle", id }   → force a decision check (anyone; idempotent)
//
// ENV (Vercel):
//   DUEL_REFEREE_KEY   the referee wallet's private key — its ADDRESS is what the
//                      contract's `referee` is set to. Signs settlements + derives seeds.
//   DUEL_ADDR          WickDuel address on PulseChain (zero/unset = duels offline)
//   RPC_URL            read RPC (defaults to the batch-reliable g4mm4 node)
//   LB_GH_TOKEN / LB_GH_REPO / LB_GH_BRANCH — the existing git-file store
import { readJSON, mutateJSON, storeConfigured } from "./_gitstore.js";
import { JsonRpcProvider, Contract, Network, Wallet, getAddress } from "ethers";
import { RULES, ZERO, lower, verifyPlayer, seedFor, sanitizeRun, checkRun, checkLoadout, decide, signSettlement, publicView, reportDeadline } from "./_duel-core.js";

const RPC = (process.env.RPC_URL || "https://rpc-pulsechain.g4mm4.io").trim();
const DUEL_ADDR = (process.env.DUEL_ADDR || "0x0000000000000000000000000000000000000000").trim();
const KEY = (process.env.DUEL_REFEREE_KEY || "").trim();
const CHAIN_ID = 369;
const CHAIN = new Network("pulsechain", CHAIN_ID);
const ABI = ["function getMatch(uint256) view returns (tuple(address creator,address joiner,address opponent,uint128 stake,uint128 stakeJoin,uint64 createdAt,uint64 joinedAt,uint8 status,uint8 rules,address winner,uint128 payout,uint128 fee))"];
const STATUS = ["NONE", "OPEN", "ACTIVE", "SETTLED", "CANCELLED", "EXPIRED"];

const configured = () => KEY && !/^0x0{40}$/i.test(DUEL_ADDR) && storeConfigured();
const referee = () => new Wallet(KEY);
const path = id => "duel-" + CHAIN_ID + "-" + id + ".json";

// warm-instance memo for READ paths (state/GET): the RPC must not be a lever an
// attacker can pull by hammering the referee. Player ACTIONS always read fresh.
const cmCache = new Map(); const CM_TTL = 10_000;
async function chainMatch(id, { fresh = false } = {}) {
  const hit = cmCache.get(id);
  if (!fresh && hit && Date.now() - hit.at < CM_TTL) return hit.cm;
  const c = new Contract(getAddress(DUEL_ADDR), ABI, new JsonRpcProvider(RPC, CHAIN, { staticNetwork: CHAIN }));
  const m = await c.getMatch(id);
  const cm = { creator: m.creator, joiner: m.joiner, opponent: m.opponent, stake: m.stake.toString(), joinedAtMs: Number(m.joinedAt) * 1000, status: Number(m.status), rules: Number(m.rules), winner: m.winner };
  // cache only once ACTIVE or terminal: an OPEN match flips to ACTIVE on the join,
  // and a stale OPEN read (joinedAt=0) would tell the joiner their start window is closed
  if (cm.status >= 2) cmCache.set(id, { cm, at: Date.now() }); else cmCache.delete(id);
  return cm;
}
// per-instance token bucket (ip + match). Vercel runs many instances, so this is a
// speed bump, not a wall — pair it with a Firewall rate rule on /api/duel for the real backstop.
const buckets = new Map();
function rateLimited(key, perMin) {
  const now = Date.now(); let b = buckets.get(key);
  if (!b || now - b.at > 60_000) { b = { at: now, n: 0 }; buckets.set(key, b); }
  if (buckets.size > 5000) buckets.clear();
  return ++b.n > perMin;
}
function freshState(id, cm) {
  return { id, chainId: CHAIN_ID, contract: DUEL_ADDR, creator: cm.creator, joiner: cm.joiner, joinedAtMs: cm.joinedAtMs, rules: cm.rules, players: {}, settlement: null };
}
// settle if decidable; mutates + persists once. Returns the settlement or null.
async function maybeSettle(id, cm) {
  const now = Date.now();
  const { data } = await mutateJSON(path(id), null, async cur => {
    if (!cur) return null;
    if (cur.settlement) return null;
    const d = decide(cur, now);
    if (!d) return null;
    const sig = await signSettlement(referee(), CHAIN_ID, DUEL_ADDR, id, d.winner);
    cur.settlement = { winner: d.winner, reason: d.reason, sig, at: now };
    return cur;
  }, "duel " + id + ": settle");
  return data && data.settlement ? data.settlement : null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") return res.status(204).end();
  const q = req.query || {};

  if (req.method === "GET" && q.info) {
    return res.status(200).json({ ok: true, online: !!configured(), contract: DUEL_ADDR, chainId: CHAIN_ID, referee: KEY ? referee().address : null, rules: RULES });
  }
  if (!configured()) return res.status(503).json({ ok: false, error: "duels offline (referee not configured)" });

  const id = Math.floor(Number(q.id || (req.body && req.body.id)));
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: "bad id" });
  const ip = String(req.headers && (req.headers["x-forwarded-for"] || req.headers["x-real-ip"]) || "?").split(",")[0].trim();
  const isAction = req.method === "POST" && req.body && ["start", "report"].includes(String(req.body.action || ""));
  if (rateLimited("ip:" + ip, 60) || rateLimited("id:" + id, 120)) return res.status(429).json({ ok: false, error: "slow down" });

  let cm;
  try { cm = await chainMatch(id, { fresh: isAction }); } catch (e) { console.error("DUEL chain read failed", e && e.message); return res.status(502).json({ ok: false, error: "chain read failed" }); }
  if (cm.status === 0) return res.status(404).json({ ok: false, error: "no such match" });

  const body = req.body || {};
  const action = String(body.action || "");
  if (req.method === "GET" || action === "state") {   // POST {action:"state"} = GET (some embedded browsers block simple cross-origin GETs)
    try {
      let { data } = await readJSON(path(id));   // cached read: every settlement goes through mutateJSON, which re-reads fresh
      const state = data || freshState(id, cm);
      // ACTIVE on chain + decidable but never persisted (e.g. a player vanished) → decide now
      if (cm.status === 2 && !state.settlement && data && decide(state, Date.now())) { const s = await maybeSettle(id, cm); if (s) state.settlement = s; }
      if (state.rules == null) state.rules = cm.rules;
      return res.status(200).json({ ok: true, match: publicView(state, Date.now(), STATUS[cm.status]), stake: cm.stake, rules: cm.rules });
    } catch (e) { console.error("DUEL read failed", e && e.message); return res.status(200).json({ ok: false, error: "state temporarily unreadable" }); }
  }
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "GET or POST" });
  const now = Date.now();

  if (action === "settle") {
    if (cm.status !== 2) return res.status(200).json({ ok: true, chainStatus: STATUS[cm.status], settled: null });
    try { const s = await maybeSettle(id, cm); return res.status(200).json({ ok: true, settled: s }); }
    catch (e) { console.error("DUEL settle failed", e && e.message); return res.status(500).json({ ok: false, error: "settle failed" }); }
  }

  // ---- player actions: must be a participant of an ACTIVE match, signed
  if (cm.status !== 2) return res.status(409).json({ ok: false, error: "match is " + STATUS[cm.status] });
  const address = String(body.address || "");
  const isC = lower(address) === lower(cm.creator), isJ = lower(address) === lower(cm.joiner);
  if (!isC && !isJ) return res.status(403).json({ ok: false, error: "not a participant" });

  if (action === "start") {
    const v = verifyPlayer("start", { address, matchId: id, message: body.message, signature: body.signature }, now);
    if (!v.ok) return res.status(401).json({ ok: false, error: v.err });
    if (now > cm.joinedAtMs + RULES.START_WINDOW_MS) return res.status(409).json({ ok: false, error: "start window closed" });
    let out = null, err = null, reject = null;
    try {
      await mutateJSON(path(id), freshState(id, cm), cur => {
        if (!cur.players) cur.players = {};
        const p = cur.players[lower(address)] || (cur.players[lower(address)] = {});
        if (p.startedAt) {
          // idempotent ONLY for an immediate retry (lost response). Past that, the seed is
          // never handed out again: a reload does not restart your one attempt — RE-SEND
          // whatever the run had reached (the client persists it), or forfeit.
          if (now - p.startedAt > RULES.START_REISSUE_MS) { reject = "already started — your one attempt is on the clock; RE-SEND your run"; return null; }
          out = p; return null;
        }
        p.startedAt = now; out = p; return cur;
      }, "duel " + id + ": start " + lower(address).slice(0, 10));
    } catch (e) { err = e; }
    if (err) { console.error("DUEL start store failed", err.message); return res.status(500).json({ ok: false, error: "store failed" }); }
    if (reject) return res.status(409).json({ ok: false, error: reject });
    const seed = seedFor(KEY, CHAIN_ID, DUEL_ADDR, id);
    return res.status(200).json({ ok: true, seed, budgetMs: RULES.RUN_BUDGET_MS, startedAt: out.startedAt, reportDeadline: reportDeadline(out.startedAt), resumed: out.startedAt !== now });
  }

  if (action === "report") {
    const run = sanitizeRun(body.run);
    if (!run) return res.status(400).json({ ok: false, error: "bad run" });
    // verify against what the client actually SIGNED (raw loadout string); the stored form is normalized
    const rawRun = { ...run, loadout: String(body.run && body.run.loadout || "").trim().toLowerCase() };
    const v = verifyPlayer("report", { address, matchId: id, message: body.message, signature: body.signature, run: rawRun }, now);
    if (!v.ok) return res.status(401).json({ ok: false, error: v.err });
    let result = null, reject = null;
    try {
      await mutateJSON(path(id), freshState(id, cm), cur => {
        const p = (cur.players || {})[lower(address)];
        if (!p || !p.startedAt) { reject = "not started"; return null; }
        if (p.report) { reject = "already reported"; return null; }
        const badL = checkLoadout(cm.rules, run.loadout);       // rules are read from CHAIN, never from the client
        if (badL) { reject = badL; return null; }
        const bad = checkRun(run, now - p.startedAt);
        if (bad) { reject = bad; return null; }
        p.report = { score: run.score, wave: run.wave, kills: run.kills, durationMs: run.durationMs, loadout: run.loadout, telemetry: run.telemetry, at: now };
        result = p.report; return cur;
      }, "duel " + id + ": report " + lower(address).slice(0, 10));
    } catch (e) { console.error("DUEL report store failed", e.message); return res.status(500).json({ ok: false, error: "store failed" }); }
    if (reject) return res.status(409).json({ ok: false, error: reject });
    let settled = null;
    try { settled = await maybeSettle(id, cm); } catch (e) { console.error("DUEL post-report settle failed", e.message); }
    return res.status(200).json({ ok: true, recorded: true, settled });
  }

  return res.status(400).json({ ok: false, error: "unknown action" });
}
