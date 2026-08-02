// Vercel serverless: today's purchased billboards, ready for the game renderer.
// GET -> { ok, day, exclusive, ads:[{name,tag,url,color}] }   (banned ads filtered out)
// GET ?day=<unixDay> -> that day's slots (the purchase page uses this for availability)
//
// Fails soft: any read trouble returns ads:[] so the game just shows its house boards.
import { JsonRpcProvider, Contract, Network, getAddress } from "ethers";

const RPC = (process.env.RPC_URL || "https://rpc-pulsechain.g4mm4.io").trim();
const BB_ADDR = (process.env.BILLBOARDS_ADDR || "0x0000000000000000000000000000000000000000").trim();
const CHAIN = new Network("pulsechain", 369);
const ABI = [
  "function todayId() view returns (uint32)",
  "function daySlots(uint32) view returns (uint256 taken, bool exclusiveTaken)",
  "function adsOf(uint32) view returns (address[] buyers, bool[] exclusives, bool[] banneds, uint24[] colors, string[] names, string[] tags, string[] urls, uint256[] logos)",
];

/* ---- COMPED TAKEOVER ----
   The contract has no free path — buy() demands msg.value == PRICE exactly, and
   the only owner functions are setOwner/setTreasury/setBanned. So a gifted slot
   is granted HERE, by serving it exactly as the chain would.

   Hard rule: this only ever fills an EMPTY day. Anyone who actually paid wins,
   always — a comped ad must never displace a customer. `to` is required so a
   freebie can't silently run forever.                                          */
const HOUSE = {
  from: 20667, to: 20667,            // unix-day ids, inclusive (1 day)
  name: "$WARTIME",
  tag: "IT'S WARTIME",               // their own slogan, off their art
  url: "",                           // no link line until they give us a real one
  color: "#e03131",
  // 16x16 one-bit heavy bomber. Their poster art thresholds to noise at this
  // size (tested: 12-48% ink, all unreadable), so the mark is hand-drawn.
  logo: "0180018001800180018015a87ffe7ffe01800180018001800ff00ff000000000",
};
function houseAdFor(day) {
  if (!HOUSE || !HOUSE.name) return null;
  if (!(day >= HOUSE.from && day <= HOUSE.to)) return null;
  return {
    name: String(HOUSE.name).slice(0, 20),
    tag: String(HOUSE.tag || "").slice(0, 28),
    url: String(HOUSE.url || "").slice(0, 32),
    color: HOUSE.color || "#7cf9a5",
    exclusive: true,
    logo: HOUSE.logo || null,
    comped: true,                    // so it is never mistaken for revenue
  };
}

// tiny in-instance cache — the game polls this and ad days change rarely
let cache = { at: 0, key: "", body: null };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  if (/^0x0{40}$/i.test(BB_ADDR)) return res.status(200).json({ ok: true, day: 0, exclusive: false, ads: [] });

  const qDay = Number((req.query && req.query.day) || 0) | 0;
  const key = "d" + qDay;
  if (cache.body && cache.key === key && Date.now() - cache.at < 60_000)
    return res.status(200).json(cache.body);

  try {
    const bb = new Contract(getAddress(BB_ADDR), ABI, new JsonRpcProvider(RPC, CHAIN, { staticNetwork: CHAIN }));
    const day = qDay > 0 ? qDay : Number(await bb.todayId());
    const v = await bb.adsOf(day);
    const ads = [];
    let exclusive = false;
    for (let i = 0; i < v.names.length; i++) {
      if (v.banneds[i]) continue;                       // moderated out
      if (v.exclusives[i]) exclusive = true;
      ads.push({
        name: String(v.names[i]).slice(0, 20),
        tag: String(v.tags[i]).slice(0, 28),
        url: String(v.urls[i]).slice(0, 32),
        color: "#" + Number(v.colors[i]).toString(16).padStart(6, "0"),
        exclusive: v.exclusives[i],
        // 16x16 one-bit sprite as a 64-char hex string (0 = none, house Pepe stands there)
        logo: v.logos[i] ? BigInt(v.logos[i]).toString(16).padStart(64, "0") : null,
      });
    }
    const [taken, exTaken] = await bb.daySlots(day);

    // comped takeover fills an empty day only — a paying advertiser always wins
    let comped = false;
    if (!ads.length) {
      const h = houseAdFor(day);
      if (h) { ads.push(h); exclusive = true; comped = true; }
    }

    const body = { ok: true, day, exclusive, ads, slotsTaken: Number(taken), exclusiveTaken: exTaken, comped };
    cache = { at: Date.now(), key, body };
    return res.status(200).json(body);
  } catch (e) {
    return res.status(200).json({ ok: true, day: 0, exclusive: false, ads: [], degraded: true });
  }
}
