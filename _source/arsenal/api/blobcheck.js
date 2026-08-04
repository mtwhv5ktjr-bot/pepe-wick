// TEMPORARY diagnostic: is the Blob store broken, or just lb.json?
// Writes a tiny probe under its own key and reads it back. Never touches lb.json.
// Delete this file once the store is healthy again.
import { put, list } from "@vercel/blob";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const out = { tokenSet: !!process.env.BLOB_READ_WRITE_TOKEN, steps: [] };
  const KEY = "probe-selftest.json";
  const body = JSON.stringify({ t: Date.now(), probe: true });

  try {
    const p = await put(KEY, body, { access: "public", addRandomSuffix: false,
      allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 0 });
    out.steps.push({ write: "ok", url: safe(p.url) });
    try {
      const r = await fetch(p.url + "?v=" + Date.now(), { cache: "no-store" });
      out.steps.push({ readFresh: r.status, ok: r.ok });
    } catch (e) { out.steps.push({ readFresh: "ERR", msg: short(e) }); }
  } catch (e) { out.steps.push({ write: "FAILED", msg: short(e) }); }

  // and the existing board blob, for comparison
  try {
    const { blobs } = await list({ prefix: "lb.json", limit: 1 });
    out.steps.push({ listLb: blobs.length, size: blobs[0]?.size ?? null, uploadedAt: blobs[0]?.uploadedAt ?? null });
    if (blobs[0]) {
      const r = await fetch(blobs[0].url + "?v=" + Date.now(), { cache: "no-store" });
      out.steps.push({ readLb: r.status, ok: r.ok });
    }
  } catch (e) { out.steps.push({ listLb: "FAILED", msg: short(e) }); }

  return res.status(200).json(out);
}
const short = e => String((e && e.message) || e).slice(0, 160);
const safe = u => { try { const p = new URL(u); return p.host + p.pathname; } catch { return "?"; } };
