// TEMPORARY: the Blob store is suspended so the public CDN URL 403s, but list()
// still works. Try every read path the SDK offers to recover the board for the
// prize payout. Delete once the scores are safely re-homed.
import { list, head } from "@vercel/blob";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const out = { tried: [] };
  try {
    const { blobs } = await list({ prefix: "lb.json", limit: 1 });
    if (!blobs.length) return res.status(200).json({ error: "no lb.json in the store" });
    const b = blobs[0];
    out.meta = { size: b.size, uploadedAt: b.uploadedAt, pathname: b.pathname };

    const candidates = [
      ["downloadUrl", b.downloadUrl],
      ["url", b.url],
    ];
    try { const h = await head(b.url); if (h?.downloadUrl) candidates.push(["head.downloadUrl", h.downloadUrl]); } catch {}

    for (const [label, u] of candidates) {
      if (!u) { out.tried.push({ label, skipped: true }); continue; }
      try {
        const r = await fetch(u + (u.includes("?") ? "&" : "?") + "v=" + Date.now(), { cache: "no-store" });
        const t = await r.text();
        out.tried.push({ label, status: r.status, bytes: t.length });
        if (r.ok) { try { out.board = JSON.parse(t); return res.status(200).json(out); } catch { out.raw = t.slice(0, 4000); return res.status(200).json(out); } }
      } catch (e) { out.tried.push({ label, err: String(e.message || e).slice(0, 120) }); }
    }
  } catch (e) { out.error = String(e.message || e).slice(0, 200); }
  return res.status(200).json(out);
}
