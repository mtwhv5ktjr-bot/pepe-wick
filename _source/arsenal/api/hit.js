// First-party traffic counter (Vercel Blob persistence).
//
// Why not Vercel Web Analytics: the game's primary home is games.wick.pics on
// GitHub Pages, which can't serve /_vercel/insights. Both mirrors ALREADY call
// this origin for the leaderboard, so a first-party endpoint here is the only
// thing that sees all the traffic. No cookies, no third party, no IP stored.
//
// POST { k }  k = "load" (menu reached) | "play" (a level actually started)
//   The client sends "load" once per browser session (sessionStorage guard), so
//   a session ~= a visit. Plays are counted every level start.
// GET  -> { ok, days:{ "YYYYMMDD":{load,play} }, totals:{load,play}, since }
//
// These numbers are deliberately plain counters. They are NOT unique humans —
// a session is a browser tab-session, and nothing here dedupes a returning
// visitor. Anything published off the back of this has to say so.
import { put, list } from "@vercel/blob";

const PATH = "hits.json";
const KEYS = new Set(["load", "play"]);
const MAX_DAYS = 400;

const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, "");

/* THROWS on failure — same lesson as the leaderboard. This is a read-modify-write
   against an overwriting put(); if a failed read returned an empty object we would
   overwrite the entire history with today's single tick. An ABSENT blob is a true
   cold start and still returns empty. */
async function read() {
  const { blobs } = await list({ prefix: PATH, limit: 1 });
  if (!blobs.length) return { days: {}, since: today() };     // never written — real cold start
  const r = await fetch(blobs[0].url + "?v=" + Date.now(), { cache: "no-store" });
  if (!r.ok) throw new Error("blob read " + r.status);
  const j = await r.json();
  if (!j || typeof j !== "object" || !j.days) throw new Error("blob malformed");
  return j;
}

async function write(data) {
  await put(PATH, JSON.stringify(data), {
    access: "public", contentType: "application/json",
    addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 0,
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") {
    let d;
    try { d = await read(); }
    catch { return res.status(200).json({ ok: true, days: {}, totals: { load: 0, play: 0 }, degraded: true,
      note: "counters temporarily unreadable — history is NOT lost" }); }
    const totals = { load: 0, play: 0 };
    for (const k in d.days) { totals.load += d.days[k].load || 0; totals.play += d.days[k].play || 0; }
    return res.status(200).json({ ok: true, days: d.days, totals, since: d.since,
      note: "counters, not unique humans — a load is one browser session" });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "GET or POST" });

  let k = "";
  try {
    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    k = String(b.k || "");
  } catch { /* sendBeacon can arrive as text — fall through to the check below */ }
  if (!KEYS.has(k)) return res.status(400).json({ error: "bad k" });

  try {
    // cannot read -> must not write, or one tick replaces the whole history
    let d;
    try { d = await read(); }
    catch { return res.status(200).json({ ok: true, skipped: true }); }
    const t = today();
    d.days[t] = d.days[t] || { load: 0, play: 0 };
    d.days[t][k] = (d.days[t][k] || 0) + 1;
    // keep the file bounded — a year and a bit of daily rows is plenty
    const keys = Object.keys(d.days).sort();
    while (keys.length > MAX_DAYS) delete d.days[keys.shift()];
    if (!d.since) d.since = t;
    await write(d);
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(200).json({ ok: true, degraded: true });   // never let counting break the game
  }
}
