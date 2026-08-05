// Global TOP-10 leaderboard keyed by wallet address (git-file persistence).
//
// GET  -> { ok, top: [{a, score, level, mode, ts}] }        (top 10)
// POST { address, score, level, mode, message, signature }
//   message must contain the address, "score:<n>" and "ts:<epoch-ms>" (fresh).
//   The signature must recover to the address — you can only post scores for
//   a wallet you control. One entry per wallet (its personal best).
//
// STORAGE (changed 2026-08-04): was Vercel Blob, which got SUSPENDED with the
// data intact-but-unreadable and took the board down for weeks with no code-side
// fix. Now a JSON file in a git repo — free, un-suspendable, and every write is
// a commit, so the version history IS the backup. That is strictly better than
// the "lb-prev.json" one-deep snapshot this file used to keep by hand.
import { readJSON, mutateJSON, writeJSON, storeConfigured } from "./_gitstore.js";
import { verifyMessage, JsonRpcProvider, Contract, Network, getAddress } from "ethers";

const PATH = "lb.json";
const MAX_AGE_MS = 5 * 60 * 1000;
const CAP = 200;                    // keep this many entries server-side
const MAX_SCORE = 2_000_000;        // absolute backstop; the per-mode ceilings below are what actually bite

// PER-MODE CEILINGS. The signature proves the WALLET, never the SCORE — the number
// is chosen by the client. So the only real defence is refusing numbers the game
// cannot produce. The campaign has exactly 249 enemies across its 10 levels; even
// scoring every one at a sustained 40-combo, S-ranking all ten and taking every
// secret lands near 225k, so 300k is generous headroom over a perfect run.
// The gauntlet is endless, so it scales with the wave reached instead.
// The wave/level is CLIENT-SUPPLIED and feeds the ceiling, so it has to be bounded
// by what each mode can actually reach — otherwise a tampered client just claims a
// huge wave and buys itself a matching allowance.
function maxLevelFor(mode) {
  if (mode === "gauntlet") return 50;                     // the gauntlet ends at wave 50
  if (mode === "bossrush") return 4;
  if (String(mode).startsWith("daily-")) return 1;
  return 10;                                              // campaign: 10 contracts
}
function ceilingFor(mode, level) {
  // 20k/wave, not 12k. Modelled against the game's own scoring: a wave-50 run
  // scores ~476k played straight, and ~707k when every kill is stomped and chained
  // at combo. The old 12k/wave capped wave 50 at 605k — under a strong run — and,
  // because the old clamp let `level` reach 99 while the score grows quadratically,
  // long runs were refused outright somewhere past a million points.
  if (mode === "gauntlet") return 5_000 + Math.max(1, level) * 20_000;   // wave 50 -> 1,005,000
  if (String(mode).startsWith("daily-")) return 60_000;   // one level, one attempt — a perfect single-level run sits near ~30k
  if (mode === "bossrush") return 40_000;                 // 4 boss rounds + clear bonuses tops out well under this
  return 300_000;
}

// HOLDERS-ONLY BOARD: you must own at least one WICK ARSENAL gun to post a score.
// Enforced here on the server, not in the game — editing the client can't bypass it.
// Faking a score now costs a real NFT, and prizes only ever go to real holders.
const RPC = (process.env.RPC_URL || "https://rpc.pulsechain.com").trim();
const GUNS_ADDR = (process.env.GUNS_ADDR || "0x0000000000000000000000000000000000000000").trim();
const CHAIN = new Network("pulsechain", 369);          // PulseChain has no ENS — pin it
const GUNS_ABI = ["function balanceOf(address) view returns (uint256)"];
async function gunsHeld(addr) {
  if (/^0x0{40}$/i.test(GUNS_ADDR)) return null;       // contract not configured -> gate disabled
  const guns = new Contract(getAddress(GUNS_ADDR), GUNS_ABI,
    new JsonRpcProvider(RPC, CHAIN, { staticNetwork: CHAIN }));
  return Number(await guns.balanceOf(getAddress(addr)));
}

/* THROWS on failure — it must not return [].
   This used to swallow every error and return an empty array. The POST path does
   read -> modify -> write, so one transient storage hiccup made the handler
   believe the board was empty and then overwrite the real board with a single
   row. That is how a populated leaderboard becomes an empty one.
   An ABSENT file is genuinely empty and still returns []; anything else throws
   and the caller decides, and the writer refuses to write. */
async function readBoard(opts) {
  const { data } = await readJSON(PATH, opts);
  if (data === null) return [];                       // never written yet — legitimately empty
  if (!Array.isArray(data)) throw new Error("stored board is not an array");
  return data;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") {
    // 👑 world-record ghost for a daily: ?ghost=daily-YYYYMMDD returns the #1 run's
    // recorded positions (stored when that submission took the top spot)
    const ghostMode = String((req.query && req.query.ghost) || "").slice(0, 20);
    if (/^daily-\d{8}$/.test(ghostMode)) {
      try {
        const { data } = await readJSON("ghost-" + ghostMode + ".json");
        return res.status(200).json({ ok: true, ghost: data || null });
      } catch { return res.status(200).json({ ok: true, ghost: null }); }
    }
    // an unreadable board must not look like an empty one — say so
    let board;
    try { board = await readBoard(); }
    catch (e) {
      // server-side only: the cause can name the store/token, so it never goes in the response
      console.error("LB READ FAILED:", (e && e.name) + " :: " + (e && e.message));
      return res.status(200).json({ ok: true, top: [], total: 0, degraded: true,
        error: "leaderboard temporarily unreadable — scores are NOT lost" });
    }
    const want = String((req.query && req.query.mode) || "").slice(0, 20);
    if (want) {                                   // e.g. ?mode=daily-20260731 — that day's board only
      const rows = board.filter(e => (e.mode || "") === want);
      return res.status(200).json({ ok: true, top: rows.slice(0, 10), total: rows.length, mode: want });
    }
    // default view = the PRIZE board: daily-contract rows live in their own lane
    const rows = board.filter(e => !String(e.mode || "").startsWith("daily-"));
    return res.status(200).json({ ok: true, top: rows.slice(0, 10), total: rows.length });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "GET or POST" });

  try {
    const { address, name, score, level, mode, message, signature } = req.body || {};
    if (!address || !message || !signature) return res.status(400).json({ error: "missing fields" });
    const s = Math.floor(Number(score));
    if (!Number.isFinite(s) || s <= 0 || s > MAX_SCORE) return res.status(400).json({ error: "bad score" });

    let recovered;
    try { recovered = verifyMessage(message, signature); }
    catch { return res.status(401).json({ error: "bad signature" }); }
    if (recovered.toLowerCase() !== String(address).toLowerCase())
      return res.status(401).json({ error: "signature does not match address" });
    if (!message.toLowerCase().includes(String(address).toLowerCase()))
      return res.status(401).json({ error: "message must bind the address" });
    if (!message.includes("score:" + s))
      return res.status(401).json({ error: "message must bind the score" });
    const cleanMode = String(mode || "story").slice(0, 12);
    if (!message.includes("mode:" + cleanMode))
      return res.status(401).json({ error: "message must bind the mode" });   // no cross-mode replay of a legit signature
    const ts = (/ts:(\d+)/.exec(message) || [])[1];
    if (!ts || Math.abs(Date.now() - Number(ts)) > MAX_AGE_MS)
      return res.status(401).json({ error: "stale or missing timestamp" });

    const cleanLevel = Math.max(1, Math.min(maxLevelFor(cleanMode), Number(level) || 1));
    if (s > ceilingFor(cleanMode, cleanLevel))
      return res.status(400).json({ error: "score above what this mode can produce — flagged, not stored" });

    // --- NFT ownership gate (prize eligibility) ---
    // Fails CLOSED on RPC trouble: better to ask someone to retry than to let an
    // unverified wallet onto a board that pays out real money.
    let held;
    try { held = await gunsHeld(address); }
    catch { return res.status(503).json({ error: "could not verify NFT ownership right now — try again in a moment" }); }
    if (held !== null && held < 1)
      return res.status(403).json({ error: "holders only — you need a WICK ARSENAL gun NFT to post a score. Mint at mint.wick.pics" });

    const a = String(address).toLowerCase();
    // optional display name (cosmetic; not signed — only labels this wallet's own entry)
    const cleanName = String(name || "").replace(/[^\w .\-]/g, "").replace(/\s+/g, " ").trim().slice(0, 16);

    /* Read → apply → commit, re-running against a fresh read if another player
       committed first. The PB comparison lives INSIDE the callback on purpose:
       on a retry it must be judged against the board that actually won the race,
       not the stale copy we first read. If we cannot READ we must not WRITE —
       that would replace everyone's scores with this one row. */
    let board, unchanged = false;
    try {
      const out = await mutateJSON(PATH, [], (cur) => {
        const i = cur.findIndex(e => e.a === a && (e.mode || "story") === cleanMode);   // one PB per wallet PER MODE — gauntlet can't erase a story career
        if (i >= 0 && cur[i].score >= s) { unchanged = true; return null; }             // null = nothing to commit
        // guns = NFTs held at submit time; kept for prize review / display
        const entry = { a, name: cleanName, score: s, level: cleanLevel, mode: cleanMode, guns: held == null ? 0 : held, ts: Date.now() };
        const next = cur.slice();
        if (i >= 0) next[i] = entry; else next.push(entry);
        next.sort((x, y) => y.score - x.score);
        next.length = Math.min(next.length, CAP);
        return next;
      }, () => "score: " + (cleanName || a.slice(0, 8)) + " " + s + " (" + cleanMode + ")");
      board = out.data;
    } catch (e) {
      console.error("LB WRITE FAILED:", (e && e.name) + " :: " + (e && e.message));
      return res.status(503).json({ error: "leaderboard is temporarily unreadable — your score was NOT saved, try again in a moment" });
    }
    if (unchanged) {
      const i = board.findIndex(e => e.a === a && (e.mode || "story") === cleanMode);
      return res.status(200).json({ ok: true, rank: i + 1, unchanged: true, top: board.slice(0, 10) });
    }
    const rank = board.findIndex(e => e.a === a) + 1;
    // 👑 daily world ghost: if this run now LEADS its daily, store its recording so
    // everyone else races it. Validated hard — positions only, bounded size.
    try {
      const ghost = req.body && req.body.ghost;
      if (cleanMode.startsWith("daily-") && Array.isArray(ghost) && ghost.length >= 8 && ghost.length <= 6000
          && ghost.every(p => Array.isArray(p) && p.length === 3 && p.every(v => typeof v === "number" && isFinite(v)))) {
        const dayRows = board.filter(e => (e.mode || "") === cleanMode);
        if (dayRows.length && dayRows[0].a === a) {          // board is score-sorted → [0] is the day's #1
          const gpath = "ghost-" + cleanMode + ".json";
          const { sha } = await readJSON(gpath, { fresh: true });
          await writeJSON(gpath,
            { a, name: cleanName, score: s, pts: ghost.map(p => [Math.round(p[0]), Math.round(p[1]), p[2] >= 0 ? 1 : -1]) },
            { sha, message: "ghost: " + cleanMode + " " + s });
        }
      }
    } catch { /* the ghost is garnish — never fail a score over it */ }
    return res.status(200).json({ ok: true, rank, top: board.slice(0, 10) });
  } catch (e) {
    return res.status(500).json({ error: (e && e.message) || "leaderboard failed" });
  }
}
