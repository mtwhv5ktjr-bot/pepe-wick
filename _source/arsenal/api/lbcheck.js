// Wiring check for the git-backed leaderboard store.
//   GET /api/lbcheck  ->  { ok, configured, repo, branch, canRead, canWrite, entries }
//
// Read-only by design: it asks GitHub what the token is ALLOWED to do instead of
// proving it by committing, so hitting this endpoint can never spam the repo or
// touch the board. It exists because the most common way to get this wrong is a
// token with "Contents: read" only — reads would look perfect and every score
// would fail later, which is exactly the kind of silent break that took the old
// board down. Never echoes the token.
import { readJSON, storeConfigured } from "./_gitstore.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  const repo = (process.env.LB_GH_REPO || "").trim();
  const branch = (process.env.LB_GH_BRANCH || "main").trim();
  const token = (process.env.LB_GH_TOKEN || "").trim();
  const out = {
    ok: true,
    configured: storeConfigured(),
    tokenSet: !!token,
    repo: repo || null,
    branch,
    canRead: null, canWrite: null, entries: null, hint: null,
  };

  if (!out.configured) {
    out.ok = false;
    out.hint = !token ? "LB_GH_TOKEN is not set in this environment"
      : "LB_GH_REPO must look like owner/name";
    return res.status(200).json(out);
  }

  // what may this token do? repo metadata carries the granted permissions
  try {
    const r = await fetch("https://api.github.com/repos/" + repo, {
      headers: {
        authorization: "Bearer " + token,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "wick-arsenal-leaderboard",
      },
      cache: "no-store",
    });
    if (r.status === 401) { out.ok = false; out.hint = "token rejected by GitHub (expired, revoked, or mistyped)"; return res.status(200).json(out); }
    if (r.status === 404) { out.ok = false; out.hint = "repo not found, or the token was not granted access to THIS repo"; return res.status(200).json(out); }
    if (!r.ok) { out.ok = false; out.hint = "GitHub returned " + r.status; return res.status(200).json(out); }
    const j = await r.json();
    out.canWrite = !!(j.permissions && (j.permissions.push || j.permissions.admin));
    out.private = !!j.private;
    if (!out.canWrite) { out.ok = false; out.hint = 'token is read-only — set "Contents: Read and write" on the fine-grained token'; }
  } catch (e) {
    out.ok = false; out.hint = "could not reach GitHub: " + ((e && e.message) || "?");
    return res.status(200).json(out);
  }

  // can we actually read the board file? (absent file is fine — it means "no scores yet")
  try {
    const { data } = await readJSON("lb.json", { fresh: true });
    out.canRead = true;
    out.entries = data === null ? 0 : (Array.isArray(data) ? data.length : "NOT AN ARRAY");
    if (data === null && !out.hint) out.hint = "no lb.json yet — it is created by the first score posted";
  } catch (e) {
    out.canRead = false; out.ok = false;
    out.hint = "read failed: " + ((e && e.message) || "?");
  }
  return res.status(200).json(out);
}
