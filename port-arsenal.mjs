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

// Verbatim assets — same folder, so the app's relative <script src>/@font-face
// still resolve. Optional entries are skipped rather than failing the sync: the
// 2026-08-01 redesign dropped abi.js and added the self-hosted display font.
const ASSETS = [
  ["ethers.min.js", true], ["config.js", true], ["gunart.js", true],
  ["abi.js", false], ["black-ops-one.woff2", false],
];
for (const [f, required] of ASSETS) {
  if (existsSync(join(SRC, f))) copyFileSync(join(SRC, f), join(DST, f));
  else if (required) { console.error("port-arsenal: missing required asset " + f); process.exit(1); }
}
// anything the HTML asks for that we did not copy is a broken page — catch it here


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

// Every same-origin asset the HTML references must exist in the port, or the
// page ships broken. Cheap check, catches an asset added upstream.
// ${...} means the value is built at runtime inside a JS template literal, not a
// static file — those are not ours to resolve.
const missing = [];
const consider = (p) => { if (!p.includes("${") && !p.includes("<") && !existsSync(join(DST, p))) missing.push(p); };
for (const m of html.matchAll(/(?:src|href)="(?!https?:|data:|#|\/)([^"?#]+)/g)) consider(m[1]);
for (const m of html.matchAll(/url\((["']?)(?!https?:|data:)([^)"']+)\1\)/g)) consider(m[2]);
if (missing.length) {
  console.error("port-arsenal: HTML references files not in the port: " + [...new Set(missing)].join(", "));
  process.exit(1);
}

writeFileSync(join(DST, "index.html"), html);
console.log("port-arsenal: /arsenal/ updated (" + before + " api calls rewritten, "
  + ASSETS.filter(([f]) => existsSync(join(DST, f))).length + " assets)");
