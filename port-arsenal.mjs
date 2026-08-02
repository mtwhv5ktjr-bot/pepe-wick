// Port the WICK Arsenal mint+market app into this Pages repo at /arsenal/.
//
// games.wick.pics is GitHub Pages — STATIC ONLY. The app is otherwise portable
// (contract reads/writes go straight to a PulseChain RPC), but its two
// serverless calls are relative and would 404 here. Rewrite them to the Vercel
// origin, which serves them with Access-Control-Allow-Origin: * .
//
// Run from sync.cmd so the copy is regenerated every deploy and cannot drift
// from the source of truth in ../wick-arsenal/web.
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..", "wick-arsenal", "web");
const DST = join(here, "arsenal");
const API = "https://wick-arsenal.vercel.app";

if (!existsSync(join(SRC, "index.html"))) {
  console.error("port-arsenal: source not found at " + SRC);
  process.exit(1);
}
mkdirSync(DST, { recursive: true });

// verbatim assets — same folder, so the app's relative <script src> still resolve
for (const f of ["ethers.min.js", "config.js", "abi.js", "gunart.js"]) {
  copyFileSync(join(SRC, f), join(DST, f));
}

let html = readFileSync(join(SRC, "index.html"), "utf8");

// ---- the only edits: relative serverless calls -> the Vercel origin ----
const before = (html.match(/["'`]\/api\//g) || []).length;
html = html.replace(/(["'`])\/api\//g, `$1${API}/api/`);
const after = (html.match(/["'`]\/api\//g) || []).length;
if (after !== 0) { console.error("port-arsenal: " + after + " relative /api/ calls left"); process.exit(1); }

// canonical/OG must point at THIS copy, not the Vercel one, or the two compete in search
html = html.replace(/https:\/\/mint\.wick\.pics\/?(?=["'])/g, "https://games.wick.pics/arsenal/");

// a way back to the arcade — this copy lives inside the arcade, not standalone
if (!html.includes('id="backToArcade"')) {
  html = html.replace(
    /(<header[^>]*>)/i,
    `$1<a id="backToArcade" href="/" style="display:inline-flex;align-items:center;gap:6px;` +
    `font:bold 12px Arial;letter-spacing:1px;color:#8a93a5;text-decoration:none;margin-right:6px" ` +
    `title="Back to Arcade Alley">&#8592; ARCADE</a>`
  );
}

// stamp it so a stale copy is obvious in view-source
html = html.replace(/<\/head>/i,
  `<!-- ported from wick-arsenal/web by port-arsenal.mjs — do not edit here -->\n</head>`);

writeFileSync(join(DST, "index.html"), html);
console.log("port-arsenal: /arsenal/ updated (" + before + " api calls rewritten to " + API + ")");
