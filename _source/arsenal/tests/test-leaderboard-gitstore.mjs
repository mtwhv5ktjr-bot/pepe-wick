/* Leaderboard-on-git tests. Runs the REAL api/leaderboard.js handler against a
 * fake GitHub contents API held in memory, so every check exercises the actual
 * shipping code path — including the read→apply→commit retry that protects two
 * players who submit in the same second.
 *
 *   node test-leaderboard-gitstore.mjs
 */
import { verifyMessage, Wallet } from "ethers";

process.env.LB_GH_TOKEN = "test-token";
process.env.LB_GH_REPO = "owner/board";
process.env.LB_GH_BRANCH = "main";
delete process.env.GUNS_ADDR;                 // gate off for these tests (held === null)

/* ---------- fake GitHub contents API ---------- */
const files = new Map();                       // path -> { json, sha }
let shaSeq = 0;
let forceConflictOnce = false;
let writes = 0, reads = 0;
const b64 = s => Buffer.from(s, "utf8").toString("base64");

globalThis.fetch = async (url, opt = {}) => {
  const u = new URL(url);
  if (u.host !== "api.github.com") throw new Error("unexpected host " + u.host);
  const path = decodeURIComponent(u.pathname.replace("/repos/owner/board/contents/", ""));
  const method = (opt.method || "GET").toUpperCase();
  const ok = (code, obj) => ({ ok: code < 300, status: code, json: async () => obj });

  if (method === "GET") {
    reads++;
    const f = files.get(path);
    if (!f) return ok(404, { message: "Not Found" });
    return ok(200, { content: b64(JSON.stringify(f.json)), sha: f.sha });
  }
  if (method === "PUT") {
    writes++;
    const body = JSON.parse(opt.body);
    const cur = files.get(path);
    if (forceConflictOnce) {                   // simulate another writer landing first
      forceConflictOnce = false;
      return ok(409, { message: "conflict" });
    }
    if (cur && body.sha !== cur.sha) return ok(409, { message: "sha mismatch" });
    if (!cur && body.sha) return ok(422, { message: "sha for missing file" });
    const sha = "sha" + (++shaSeq);
    files.set(path, { json: JSON.parse(Buffer.from(body.content, "base64").toString("utf8")), sha });
    return ok(200, { content: { sha } });
  }
  throw new Error("unexpected method " + method);
};

const { default: handler } = await import("./api/leaderboard.js");
const { dropCache } = await import("./api/_gitstore.js");

/* ---------- harness ---------- */
function mkRes() {
  const r = { headers: {}, code: 0, body: null };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = c => { r.code = c; return r; };
  r.json = o => { r.body = o; return r; };
  r.end = () => r;
  return r;
}
const call = async (method, { query = {}, body = null } = {}) => {
  const res = mkRes();
  await handler({ method, query, body }, res);
  return res;
};
async function signed(w, { score, mode = "kjp", level = 3, name = "", ts = Date.now(), msgScore }) {
  const message = "WICK score\naddress:" + w.address + "\nscore:" + (msgScore ?? score) + "\nmode:" + mode + "\nts:" + ts;
  return { address: w.address, name, score, level, mode, message, signature: await w.signMessage(message) };
}

let pass = 0, fail = 0;
const t = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (detail ? " — " + detail : "")); }
};

/* ---------- tests ---------- */
console.log("\nleaderboard on git store\n");

const alice = Wallet.createRandom(), bob = Wallet.createRandom(), carol = Wallet.createRandom();

let r = await call("GET", { query: { mode: "kjp" } });
t("empty board reads clean (not degraded)", r.code === 200 && r.body.total === 0 && !r.body.degraded, JSON.stringify(r.body));

r = await call("POST", { body: await signed(alice, { score: 24100, name: "ALICE" }) });
t("valid score accepted", r.code === 200 && r.body.ok && r.body.rank === 1, JSON.stringify(r.body));

r = await call("GET", { query: { mode: "kjp" } });
t("score is readable back", r.body.total === 1 && r.body.top[0].score === 24100, JSON.stringify(r.body.top));

r = await call("POST", { body: await signed(alice, { score: 900, name: "ALICE" }) });
t("lower score leaves PB intact", r.body.unchanged === true && r.body.top[0].score === 24100, JSON.stringify(r.body));

r = await call("POST", { body: await signed(alice, { score: 31000, name: "ALICE" }) });
t("higher score replaces PB", r.body.ok && !r.body.unchanged && r.body.top[0].score === 31000);
r = await call("GET", { query: { mode: "kjp" } });
t("one row per wallet per mode", r.body.total === 1, "total=" + r.body.total);

/* --- anti-cheat, unchanged from the Blob version --- */
r = await call("POST", { body: await signed(bob, { score: 299999, msgScore: 5 }) });
t("score not bound in message rejected", r.code === 401, r.code + " " + JSON.stringify(r.body));

r = await call("POST", { body: await signed(bob, { score: 5000, ts: Date.now() - 9e5 }) });
t("stale timestamp rejected", r.code === 401, r.code + "");

r = await call("POST", { body: await signed(bob, { score: 400000, level: 10 }) });
t("above mode ceiling rejected", r.code === 400, r.code + "");

const forged = await signed(bob, { score: 1000 });
forged.signature = await carol.signMessage(forged.message);
r = await call("POST", { body: forged });
t("signature from another wallet rejected", r.code === 401, r.code + "");

const replay = await signed(bob, { score: 20000, mode: "kjp" });
replay.mode = "gauntlet";
r = await call("POST", { body: replay });
t("cross-mode replay rejected", r.code === 401, r.code + "");

/* --- the new risk: concurrent writers --- */
forceConflictOnce = true;
r = await call("POST", { body: await signed(bob, { score: 18500, name: "BOB" }) });
t("write retries after a conflict", r.code === 200 && r.body.ok, r.code + " " + JSON.stringify(r.body));
r = await call("GET", { query: { mode: "kjp" } });
t("conflict retry kept BOTH players", r.body.total === 2, "total=" + r.body.total);

/* genuinely parallel submissions must not drop anyone */
files.clear(); shaSeq = 0;
const many = await Promise.all(
  Array.from({ length: 6 }, (_, i) => Wallet.createRandom())
    .map(async (w, i) => call("POST", { body: await signed(w, { score: 1000 + i * 100, name: "P" + i }) })));
t("6 parallel submissions all return ok", many.every(x => x.code === 200 && x.body.ok),
  many.map(x => x.code).join(","));
r = await call("GET", { query: { mode: "kjp" } });
t("6 parallel submissions all persisted", r.body.total === 6, "total=" + r.body.total);

/* --- an unreadable store must never look like an empty board --- */
const realFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });

// a warm instance rides out a blip on its cached copy rather than flashing an
// empty/broken board at players — the read cache is a feature here
r = await call("GET", { query: { mode: "kjp" } });
t("brief outage still serves the cached board", r.body.total === 6 && !r.body.degraded, JSON.stringify(r.body).slice(0, 80));

// but a WRITE must never ride the cache: it re-reads fresh, so it refuses
r = await call("POST", { body: await signed(Wallet.createRandom(), { score: 5000 }) });
t("unreadable store refuses to write (503)", r.code === 503, r.code + "");

// once the cache is cold, an unreadable store must SAY so, not report zero scores
dropCache("lb.json");
r = await call("GET", { query: { mode: "kjp" } });
t("cold cache + unreadable store reports degraded, not empty",
  r.body.degraded === true && r.body.ok === true && r.body.total === 0, JSON.stringify(r.body));
globalThis.fetch = realFetch;
dropCache("lb.json");

r = await call("GET", { query: { mode: "kjp" } });
t("board survived the outage untouched", r.body.total === 6, "total=" + r.body.total);

/* --- daily lane stays separate from the prize board --- */
const day = "daily-20260804";
r = await call("POST", { body: await signed(alice, { score: 40000, mode: day, level: 1 }) });
t("daily score accepted", r.code === 200 && r.body.ok, JSON.stringify(r.body));
r = await call("GET", {});
t("default view excludes daily rows", r.body.top.every(e => !String(e.mode).startsWith("daily-")), JSON.stringify(r.body.top.map(e => e.mode)));

console.log("\n" + pass + "/" + (pass + fail) + " pass" + (fail ? "  — " + fail + " FAILED" : ""));
console.log("(fake API served " + reads + " reads, " + writes + " writes)\n");
process.exit(fail ? 1 : 0);
