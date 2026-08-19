// WICK DUEL referee — PURE core. No I/O, no env: every rule the referee applies
// lives here so it can be unit-tested in node and read in one sitting.
//
// THE FORMAT: same-seed SURVIVAL duel in WICK SHOOTER. Both players get an
// identical seeded run, ONE attempt each, a fixed time budget. Higher score wins,
// equal = draw. Nothing about either run is revealed until the match is decided.
//
// TRUST MODEL: the game is client-authoritative (like every browser game). The
// referee cannot re-simulate the run, so it enforces what it CAN prove:
//   · the seed is unknown until you press START (referee-derived, one issue per player)
//   · one attempt: START is recorded once; the report must arrive within the budget
//   · wall-clock consistency: a 6-minute run cannot be reported 20 seconds after START
//   · physical caps: score / wave / kill rates a legit client cannot exceed
//   · signatures: every START and REPORT is signed by the player's wallet
//   · blindness: scores stay sealed until settlement — finishing first tells you nothing
// A modded client can still play "perfectly" inside those caps. That is the same
// trust level as the leaderboard; stakes should be sized accordingly. Server-side
// replay of an input log is the hardening path if volume ever justifies it.
import { keccak256, toUtf8Bytes, solidityPackedKeccak256, getBytes, verifyMessage, getAddress } from "ethers";

const ENV = typeof process !== "undefined" && process.env ? process.env : {};
export const RULES = {
  RUN_BUDGET_MS: Number(ENV.DUEL_BUDGET_MS) || 6 * 60 * 1000,   // the duel run: 6:00 of survival, then the client calls TIME (env override for local QA rigs only)
  REPORT_GRACE_MS: 45 * 1000,          // slack for the report to arrive after the budget
  START_WINDOW_MS: 30 * 60 * 1000,     // both players must press START within 30 min of the join
  MSG_MAX_AGE_MS: 5 * 60 * 1000,       // signed messages must be fresh
  MIN_RUN_MS: 3000,                    // anything shorter with a score is nonsense
  // physical caps — calibrated 2026-08-14 against an INVULNERABLE auto-fire client
  // (survival, normal): ~250 pts/s, ~1 kill/s, 5–8 s per wave. Score multiplies
  // by combo (≤×10) and difficulty (≤×1.5): one heavy at full combo on HARD is
  // 3,750 pts, so the score ceiling has to leave room for a genuinely great run —
  // refusing a legit winner is far worse than a loose ceiling (both players face
  // the same cap; it only bounds a cheater's headroom, it doesn't decide matches).
  MAX_SCORE_PER_SEC: 2500,             // ~10× the bot; needs 2.5 kills/s at ×10 combo to touch
  SCORE_FLAT: 5000,
  MIN_SEC_PER_WAVE: 3.0,               // bot: 5–8s; a strong human ~5s
  MAX_KILLS_PER_SEC: 4,                // bot: ~1/s
  KILLS_FLAT: 10,
  MAX_TELEMETRY: 240,
  // telemetry must START with the run and never go quiet: a reload mid-duel that
  // starts a fresh run would show its first stamp minutes in — that is a second
  // attempt, and it is refused (review finding, 2026-08-18)
  MAX_FIRST_STAMP_MS: 8000,
  MAX_TELEMETRY_GAP_MS: 20000,
  START_REISSUE_MS: 20000,             // START is idempotent only for an immediate retry; after this, no seed re-issue
};

export const ZERO = "0x0000000000000000000000000000000000000000";
export const lower = a => String(a || "").toLowerCase();

// ---- messages the PLAYER signs (personal_sign) ------------------------------
export function startMessage(address, matchId, ts) {
  return "WICK duel start\naddress:" + lower(address) + "\nmatch:" + matchId + "\nts:" + ts;
}
export function reportMessage(address, matchId, run, ts) {
  return "WICK duel report\naddress:" + lower(address) + "\nmatch:" + matchId +
    "\nscore:" + run.score + "\nwave:" + run.wave + "\nkills:" + run.kills + "\nms:" + run.durationMs +
    "\nloadout:" + run.loadout + "\nts:" + ts;
}

// ---- loadout rules (agreed on-chain at create; the report declares what was carried) ----
export const RULES_HOUSE = 0, RULES_BYO = 1, BYO_MAX_GUNS = 2;
export const RULE_NAMES = { 0: "HOUSE IRON", 1: "BRING YOUR OWN" };
/** "house" | "nft:4" | "nft:4,15" → normalized string or null if malformed */
export function normalizeLoadout(s) {
  s = String(s || "").trim().toLowerCase();
  if (s === "house") return "house";
  const m = /^nft:([0-9]{1,2}(?:,[0-9]{1,2})*)$/.exec(s);
  if (!m) return null;
  const types = [...new Set(m[1].split(",").map(Number))].filter(t => (t >= 1 && t <= 6) || (t >= 11 && t <= 16)).sort((a, b) => a - b);
  if (!types.length) return null;
  return "nft:" + types.join(",");
}
/** does the declared loadout satisfy the match rules? returns null or a reason */
export function checkLoadout(rules, loadout) {
  const n = normalizeLoadout(loadout);
  if (n === null) return "malformed loadout";
  if (rules === RULES_HOUSE) return n === "house" ? null : "HOUSE IRON duel — NFT guns are not allowed";
  if (rules === RULES_BYO) { if (n === "house") return null; const k = n.slice(4).split(",").length; return k <= BYO_MAX_GUNS ? null : "BRING YOUR OWN allows at most " + BYO_MAX_GUNS + " guns"; }
  return "unknown rules";
}
/** verify a player message: recovers to `address`, binds match + fields, fresh. */
export function verifyPlayer(kind, { address, matchId, message, signature, run }, now) {
  let rec;
  try { rec = verifyMessage(message, signature); } catch { return { ok: false, err: "bad signature" }; }
  if (lower(rec) !== lower(address)) return { ok: false, err: "signature does not match address" };
  const ts = Number((/ts:(\d+)/.exec(message) || [])[1]);
  if (!ts || Math.abs(now - ts) > RULES.MSG_MAX_AGE_MS) return { ok: false, err: "stale or missing timestamp" };
  const expected = kind === "start" ? startMessage(address, matchId, ts) : reportMessage(address, matchId, run, ts);
  if (message !== expected) return { ok: false, err: "message does not bind the " + kind + " fields" };
  return { ok: true, ts };
}

// ---- the seed: referee-derived, identical for both players, unknown until START ----
export function seedFor(refereeSecret, chainId, contract, matchId) {
  const salt = keccak256(toUtf8Bytes("WICKDUEL-SEED|" + refereeSecret));
  const h = keccak256(toUtf8Bytes(salt + "|" + chainId + "|" + lower(contract) + "|" + matchId));
  return Number(BigInt(h) & 0xFFFFFFFFn) >>> 0;   // 32-bit for mulberry32
}

// ---- report sanity ----------------------------------------------------------
export function sanitizeRun(raw) {
  const n = (v, lo, hi) => { const x = Math.floor(Number(v)); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : NaN; };
  const run = {
    score: n(raw && raw.score, 0, 1e9), wave: n(raw && raw.wave, 0, 10000), kills: n(raw && raw.kills, 0, 1e6),
    durationMs: n(raw && raw.durationMs, 0, 1e8),
    loadout: normalizeLoadout(raw && raw.loadout),
    telemetry: Array.isArray(raw && raw.telemetry) ? raw.telemetry.slice(0, RULES.MAX_TELEMETRY).map(p => [n(p && p[0], 0, 1e8), n(p && p[1], 0, 1e9)]) : [],
  };
  if ([run.score, run.wave, run.kills, run.durationMs].some(v => !Number.isFinite(v))) return null;
  if (run.loadout === null) return null;
  if (run.telemetry.some(p => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return null;
  return run;
}
/** physical + consistency caps. `elapsedSinceStartMs` = referee wall clock since the START it issued. */
export function checkRun(run, elapsedSinceStartMs) {
  const sec = run.durationMs / 1000;
  if (run.durationMs > RULES.RUN_BUDGET_MS + 2000) return "run longer than the budget";
  if (run.score > 0 && run.durationMs < RULES.MIN_RUN_MS) return "run too short for that score";
  // you cannot report a run that has not had time to happen
  if (elapsedSinceStartMs < run.durationMs - 5000) return "reported before the run could have finished";
  if (elapsedSinceStartMs > RULES.RUN_BUDGET_MS + RULES.REPORT_GRACE_MS) return "report window closed";
  if (run.score > RULES.SCORE_FLAT + RULES.MAX_SCORE_PER_SEC * sec) return "score exceeds physical ceiling";
  if (run.wave > 1 + sec / RULES.MIN_SEC_PER_WAVE) return "wave exceeds physical ceiling";
  if (run.kills > RULES.KILLS_FLAT + RULES.MAX_KILLS_PER_SEC * sec) return "kills exceed physical ceiling";
  // telemetry: present, starts with the run, no long silences, monotone, ends at the reported score
  let lt = -1, ls = -1;
  if (run.durationMs > RULES.MIN_RUN_MS && !run.telemetry.length) return "no telemetry";
  if (run.telemetry.length && run.telemetry[0][0] > RULES.MAX_FIRST_STAMP_MS) return "telemetry does not start with the run — a reload is not a second attempt";
  for (const [t, s] of run.telemetry) {
    if (t < lt || s < ls) return "telemetry not monotone";
    if (lt >= 0 && t - lt > RULES.MAX_TELEMETRY_GAP_MS) return "telemetry gap";
    if (t > run.durationMs + 1500) return "telemetry beyond duration";
    lt = t; ls = s;
  }
  if (run.telemetry.length && Math.abs(ls - run.score) > Math.max(400, run.score * 0.05)) return "telemetry does not end at the reported score";
  return null;
}

// ---- deadlines --------------------------------------------------------------
export function startDeadline(joinedAtMs) { return joinedAtMs + RULES.START_WINDOW_MS; }
export function reportDeadline(startedAtMs) { return startedAtMs + RULES.RUN_BUDGET_MS + RULES.REPORT_GRACE_MS; }
/** the last moment anything can still change for a player who never started */
export function playerCutoff(p, joinedAtMs) {
  return p && p.startedAt ? reportDeadline(p.startedAt) : startDeadline(joinedAtMs);
}

// ---- the decision -----------------------------------------------------------
// state: { creator, joiner, joinedAtMs, players: { [lowerAddr]: { startedAt?, report? } } }
// returns null (not decidable yet / never decidable) or { winner, reason }
export function decide(state, now) {
  const c = lower(state.creator), j = lower(state.joiner);
  const pc = state.players[c] || {}, pj = state.players[j] || {};
  const rc = pc.report, rj = pj.report;
  if (rc && rj) {
    if (rc.score > rj.score) return { winner: state.creator, reason: "higher score" };
    if (rj.score > rc.score) return { winner: state.joiner, reason: "higher score" };
    return { winner: ZERO, reason: "draw" };
  }
  const cOut = !rc && now > playerCutoff(pc, state.joinedAtMs);   // creator can no longer report
  const jOut = !rj && now > playerCutoff(pj, state.joinedAtMs);
  if (rc && jOut) return { winner: state.creator, reason: pj.startedAt ? "opponent never reported" : "opponent never started" };
  if (rj && cOut) return { winner: state.joiner, reason: pc.startedAt ? "opponent never reported" : "opponent never started" };
  // neither reported and both windows closed: no evidence either way — leave it
  // to the contract's expire(), which refunds both. The referee never invents a winner.
  return null;
}

// ---- the settlement message the CONTRACT verifies ---------------------------
export function settleDigest(chainId, contract, matchId, winner) {
  return solidityPackedKeccak256(["string", "uint256", "address", "uint256", "address"], ["WICKDUEL", chainId, getAddress(contract), matchId, getAddress(winner)]);
}
export async function signSettlement(signer, chainId, contract, matchId, winner) {
  return signer.signMessage(getBytes(settleDigest(chainId, contract, matchId, winner)));
}

// ---- what the public may see ------------------------------------------------
export function publicView(state, now, chainStatus) {
  const c = lower(state.creator), j = lower(state.joiner);
  const p = a => { const x = state.players[a] || {}; return { started: !!x.startedAt, reported: !!x.report }; };
  const v = {
    id: state.id, chainId: state.chainId, contract: state.contract,
    creator: state.creator, joiner: state.joiner, joinedAt: state.joinedAtMs,
    chainStatus,
    startDeadline: startDeadline(state.joinedAtMs),
    players: { [c]: p(c), [j]: p(j) },
    settlement: state.settlement || null,
    now,
  };
  v.rules = state.rules == null ? null : state.rules;
  if (state.settlement) {  // scores unseal only once decided
    v.scores = {};
    for (const a of [c, j]) { const r = (state.players[a] || {}).report; if (r) v.scores[a] = { score: r.score, wave: r.wave, kills: r.kills, durationMs: r.durationMs, loadout: r.loadout }; }
  }
  return v;
}
