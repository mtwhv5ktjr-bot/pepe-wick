// JSON storage backed by a GitHub repo file, via the contents API.
//
// WHY THIS EXISTS: the leaderboard used to live in Vercel Blob. That store was
// suspended with the data intact and unreadable, which took the board down for
// weeks and could not be fixed from code. A file in a git repo cannot be
// suspended, costs nothing, and — unlike Blob — keeps a full version history,
// so every single write is its own restorable snapshot. That replaces the
// hand-rolled one-deep "lb-prev.json" backup the Blob version needed.
//
// ENV (set in Vercel → Settings → Environment Variables):
//   LB_GH_TOKEN   fine-grained PAT, "Contents: read and write", THIS REPO ONLY
//   LB_GH_REPO    "owner/name" of the repo holding the board file
//   LB_GH_BRANCH  optional, defaults to "main"
//
// Reads THROW on anything except a genuine 404. That invariant is load-bearing:
// the POST path does read -> modify -> write, so a read that quietly returned []
// on a transient failure would overwrite the whole board with one row. An absent
// file is legitimately empty and returns null; everything else throws and the
// caller refuses to write.

const API = "https://api.github.com";
const TOKEN = () => (process.env.LB_GH_TOKEN || "").trim();
const REPO = () => (process.env.LB_GH_REPO || "").trim();
const BRANCH = () => (process.env.LB_GH_BRANCH || "main").trim();

export function storeConfigured() {
  return !!TOKEN() && /^[^/\s]+\/[^/\s]+$/.test(REPO());
}

function headers() {
  return {
    authorization: "Bearer " + TOKEN(),
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "wick-arsenal-leaderboard",
  };
}

/* Warm-instance read cache. A serverless container serves many requests, and the
   board is read far more often than it is written. 15s keeps the API well inside
   its 5000/hr budget without anyone noticing staleness. Writes always bypass it,
   because a write needs the current sha anyway. */
const cache = new Map();
const TTL_MS = 15_000;
export function dropCache(path) { cache.delete(path); }

/** -> { data, sha } ; data === null means the file does not exist yet. */
export async function readJSON(path, { fresh = false } = {}) {
  if (!storeConfigured()) throw new Error("git store not configured");
  if (!fresh) {
    const hit = cache.get(path);
    if (hit && Date.now() - hit.at < TTL_MS) return { data: hit.data, sha: hit.sha };
  }
  const url = API + "/repos/" + REPO() + "/contents/" + encodeURIComponent(path)
            + "?ref=" + encodeURIComponent(BRANCH());
  const r = await fetch(url, { headers: headers(), cache: "no-store" });
  if (r.status === 404) { cache.set(path, { data: null, sha: null, at: Date.now() }); return { data: null, sha: null }; }
  if (!r.ok) throw new Error("git read " + r.status);
  const j = await r.json();
  let data;
  try { data = JSON.parse(Buffer.from(j.content || "", "base64").toString("utf8")); }
  catch { throw new Error("stored file is not valid JSON"); }
  cache.set(path, { data, sha: j.sha, at: Date.now() });
  return { data, sha: j.sha };
}

/** Commit `data`. Pass the sha you read (null to create). 409/422 = someone else
    wrote first; the caller retries with a fresh read. */
export async function writeJSON(path, data, { sha = null, message } = {}) {
  if (!storeConfigured()) throw new Error("git store not configured");
  const body = {
    message: message || ("update " + path),
    content: Buffer.from(JSON.stringify(data, null, 1), "utf8").toString("base64"),
    branch: BRANCH(),
  };
  if (sha) body.sha = sha;
  const r = await fetch(API + "/repos/" + REPO() + "/contents/" + encodeURIComponent(path), {
    method: "PUT", headers: { ...headers(), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (r.status === 409 || r.status === 422) { dropCache(path); const e = new Error("git conflict"); e.conflict = true; throw e; }
  if (!r.ok) { dropCache(path); throw new Error("git write " + r.status); }
  const j = await r.json().catch(() => ({}));
  const newSha = j && j.content && j.content.sha;
  cache.set(path, { data, sha: newSha || null, at: Date.now() });
  return newSha;
}

/**
 * Read → apply → write, retrying when a concurrent writer wins the race.
 * `apply(current)` must return the value to store, or null to abort the write.
 * Without this, two players submitting in the same second would silently drop
 * one of the two scores.
 */
export async function mutateJSON(path, empty, apply, message, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    const { data, sha } = await readJSON(path, { fresh: true });
    const cur = data === null ? empty : data;
    const next = await apply(cur);
    if (next === null) return { skipped: true, data: cur };
    try {
      await writeJSON(path, next, { sha, message: typeof message === "function" ? message(next) : message });
      return { data: next };
    } catch (e) {
      if (!e.conflict) throw e;
      lastErr = e;
      await new Promise(r => setTimeout(r, 120 * (i + 1)));   // brief backoff, then re-read
    }
  }
  throw lastErr || new Error("git write kept conflicting");
}
