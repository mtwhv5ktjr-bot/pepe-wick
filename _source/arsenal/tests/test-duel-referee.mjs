// WICK DUEL referee core — unit tests + an end-to-end where the referee's own
// signature settles the real contract on ganache.   node test-duel-referee.mjs
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";
import { RULES, ZERO, startMessage, reportMessage, verifyPlayer, seedFor, sanitizeRun, checkRun, checkLoadout, normalizeLoadout, decide, signSettlement, publicView, playerCutoff, RULES_HOUSE, RULES_BYO } from "./api/_duel-core.js";

const root = dirname(fileURLToPath(import.meta.url));
const req = createRequire(import.meta.url);
const ganache = req("ganache"), ethers = req("ethers");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL:", m); } };
const section = t => console.log("\n== " + t + " ==");

const A = ethers.Wallet.createRandom(), B = ethers.Wallet.createRandom(), REF = ethers.Wallet.createRandom();
const CONTRACT = "0x1111111111111111111111111111111111111111";
const T0 = 1_800_000_000_000;

section("signed messages");
{
  const msg = startMessage(A.address, 7, T0);
  const sig = await A.signMessage(msg);
  ok(verifyPlayer("start", { address: A.address, matchId: 7, message: msg, signature: sig }, T0 + 1000).ok, "valid start verifies");
  ok(!verifyPlayer("start", { address: B.address, matchId: 7, message: msg, signature: sig }, T0 + 1000).ok, "wrong address refused");
  ok(!verifyPlayer("start", { address: A.address, matchId: 8, message: msg, signature: sig }, T0 + 1000).ok, "message bound to match id");
  ok(!verifyPlayer("start", { address: A.address, matchId: 7, message: msg, signature: sig }, T0 + RULES.MSG_MAX_AGE_MS + 1).ok, "stale message refused");
  const run = { score: 12000, wave: 6, kills: 40, durationMs: 200000, loadout: "nft:4" };
  const rmsg = reportMessage(A.address, 7, run, T0);
  const rsig = await A.signMessage(rmsg);
  ok(verifyPlayer("report", { address: A.address, matchId: 7, message: rmsg, signature: rsig, run }, T0).ok, "valid report verifies");
  ok(!verifyPlayer("report", { address: A.address, matchId: 7, message: rmsg, signature: rsig, run: { ...run, score: 99999 } }, T0).ok, "report score bound by signature — can't inflate after signing");
}

section("seed");
{
  const s1 = seedFor("secret", 369, CONTRACT, 5), s2 = seedFor("secret", 369, CONTRACT, 5), s3 = seedFor("secret", 369, CONTRACT, 6), s4 = seedFor("other", 369, CONTRACT, 5);
  ok(s1 === s2 && s1 !== s3 && s1 !== s4, "seed deterministic per (secret, match), differs across matches/secrets");
  ok(Number.isInteger(s1) && s1 >= 0 && s1 <= 0xFFFFFFFF, "32-bit seed");
}

section("run sanity + caps");
{
  ok(sanitizeRun({ score: "12", wave: 3.7, kills: 5, durationMs: 60000, loadout: "house", telemetry: [[0, 0], [30000, 6]] }).wave === 3, "sanitize floors numbers");
  ok(sanitizeRun({ score: 1, wave: 1, kills: 1, durationMs: 5000, loadout: "rocket launcher" }) === null, "malformed loadout refused at sanitize");
  ok(sanitizeRun({ score: NaN }) === null, "NaN run refused");
  // realistic client telemetry: a stamp every 4s from t≈0, score rising to the final
  const dense = (durMs, score) => { const t = []; for (let ms = 0; ms <= durMs; ms += 4000) t.push([ms, Math.round(score * ms / durMs)]); if (t[t.length - 1][0] !== durMs) t.push([durMs, score]); return t; };
  const good = { score: 40000, wave: 20, kills: 100, durationMs: 200000, telemetry: dense(200000, 40000) };
  ok(checkRun(good, 201000) === null, "plausible run passes (200s, 200 pts/s)");
  ok(/before the run/.test(checkRun(good, 20000)), "reported 20s after START for a 200s run → refused");
  ok(/window closed/.test(checkRun(good, RULES.RUN_BUDGET_MS + RULES.REPORT_GRACE_MS + 1)), "report after the window → refused");
  ok(/score exceeds/.test(checkRun({ ...good, score: 5000 + 2500 * 200 + 1 }, 201000)), "score above ceiling refused");
  ok(checkRun({ ...good, score: 5000 + 2500 * 200, telemetry: dense(200000, 5000 + 2500 * 200) }, 201000) === null, "score at ceiling passes");
  ok(/wave exceeds/.test(checkRun({ ...good, wave: 1 + Math.floor(200 / 3) + 1 }, 201000)), "impossible wave count refused");
  ok(/kills exceed/.test(checkRun({ ...good, kills: 10 + 4 * 200 + 1 }, 201000)), "impossible kill count refused");
  ok(/monotone/.test(checkRun({ ...good, telemetry: dense(200000, 40000).map((p, i) => i === 10 ? [p[0], 30000] : p) }, 201000)), "score going down in telemetry refused");
  ok(/end at the reported/.test(checkRun({ ...good, telemetry: dense(200000, 1000) }, 201000)), "telemetry ending far from reported score refused");
  ok(/longer than the budget/.test(checkRun({ ...good, durationMs: RULES.RUN_BUDGET_MS + 5000 }, RULES.RUN_BUDGET_MS + 6000)), "run longer than budget refused");
  ok(/too short/.test(checkRun({ ...good, durationMs: 1000, score: 500, telemetry: [] }, 2000)), "1s run with a score refused");
  // ONE ATTEMPT hardening: telemetry must start with the run and never go quiet
  ok(/no telemetry/.test(checkRun({ ...good, telemetry: [] }, 201000)), "a real run without telemetry is refused");
  ok(/does not start with the run/.test(checkRun({ ...good, telemetry: [[55000, 0], [100000, 20000], [200000, 40000]] }, 201000)), "first stamp a minute in = reload/second attempt → refused");
  ok(/telemetry gap/.test(checkRun({ ...good, telemetry: [[0, 0], [30000, 5000], [200000, 40000]] }, 201000)), "30s+ silence in telemetry refused");
  ok(checkRun({ ...good, telemetry: [[16, 0], [4016, 900], [8016, 1800], [12016, 2700], [16016, 3600], [20016, 4500], [24016, 5400], [28016, 6300], [32016, 7200], [36016, 8100], [40016, 9000], [44016, 9900], [48016, 10800], [52016, 11700], [56016, 12600], [60016, 13500], [64016, 14400], [68016, 15300], [72016, 16200], [76016, 17100], [80016, 18000], [84016, 18900], [88016, 19800], [92016, 20700], [96016, 21600], [100016, 22500], [104016, 23400], [108016, 24300], [112016, 25200], [116016, 26100], [120016, 27000], [124016, 27900], [128016, 28800], [132016, 29700], [136016, 30600], [140016, 31500], [144016, 32400], [148016, 33300], [152016, 34200], [156016, 35100], [160016, 36000], [164016, 36900], [168016, 37800], [172016, 38700], [176016, 39000], [180016, 39300], [184016, 39600], [188016, 39800], [192016, 39900], [196016, 40000], [200000, 40000]] }, 201000) === null, "honest 4s-cadence telemetry from t≈0 passes");
  ok(checkRun({ score: 0, wave: 1, kills: 0, durationMs: 1000, telemetry: [] }, 2000) === null, "instant death with 0 score is fine");
  ok(checkRun({ score: 300, wave: 1, kills: 3, durationMs: 9000, telemetry: [[0, 0], [4000, 100], [8000, 300]] }, 10000) === null, "short honest run passes");
}

section("loadout rules — HOUSE IRON vs BRING YOUR OWN (max 2)");
{
  ok(normalizeLoadout("HOUSE") === "house" && normalizeLoadout("nft:15,4") === "nft:4,15" && normalizeLoadout("nft:4,4") === "nft:4", "normalize: case, order, dupes");
  ok(normalizeLoadout("nft:7") === null && normalizeLoadout("nft:") === null && normalizeLoadout("") === null, "invalid types / empty refused");
  ok(checkLoadout(RULES_HOUSE, "house") === null, "HOUSE: stock loadout ok");
  ok(/not allowed/.test(checkLoadout(RULES_HOUSE, "nft:4")), "HOUSE: any NFT gun refused");
  ok(checkLoadout(RULES_BYO, "nft:4,15") === null && checkLoadout(RULES_BYO, "nft:1") === null && checkLoadout(RULES_BYO, "house") === null, "BYO: 1 or 2 guns (or none) ok");
  ok(/at most 2/.test(checkLoadout(RULES_BYO, "nft:1,2,3")), "BYO: 3 guns refused");
  ok(/unknown/.test(checkLoadout(9, "house")), "unknown rules refused");
  // the loadout is BOUND by the signature: changing it after signing breaks the report
  const r2 = { score: 100, wave: 1, kills: 1, durationMs: 9000, loadout: "house" };
  const m2 = reportMessage(A.address, 3, r2, T0), s2 = await A.signMessage(m2);
  ok(verifyPlayer("report", { address: A.address, matchId: 3, message: m2, signature: s2, run: r2 }, T0).ok, "signed house report verifies");
  ok(!verifyPlayer("report", { address: A.address, matchId: 3, message: m2, signature: s2, run: { ...r2, loadout: "nft:15" } }, T0).ok, "loadout swapped after signing → refused");
  // the handler verifies against the RAW string the client signed, then stores the normalized form
  const r3 = { score: 100, wave: 1, kills: 1, durationMs: 9000, loadout: "nft:15,2" };
  const m3 = reportMessage(A.address, 4, r3, T0), s3 = await A.signMessage(m3);
  ok(verifyPlayer("report", { address: A.address, matchId: 4, message: m3, signature: s3, run: r3 }, T0).ok && sanitizeRun(r3).loadout === "nft:2,15", "raw 'nft:15,2' verifies as signed and normalizes to 'nft:2,15' for storage");
}

section("decision — the referee never invents a winner");
{
  const base = () => ({ creator: A.address, joiner: B.address, joinedAtMs: T0, players: {} });
  const a = A.address.toLowerCase(), b = B.address.toLowerCase();
  let st = base(); st.players[a] = { startedAt: T0 + 1000, report: { score: 500 } }; st.players[b] = { startedAt: T0 + 2000, report: { score: 900 } };
  ok(decide(st, T0 + 5000).winner === B.address, "both reported → higher score wins");
  st.players[b].report.score = 500;
  ok(decide(st, T0 + 5000).winner === ZERO, "equal scores → draw (zero address)");
  st = base(); st.players[a] = { startedAt: T0 + 1000, report: { score: 500 } };
  ok(decide(st, T0 + 5000) === null, "one reported, other still inside the start window → wait");
  ok(decide(st, T0 + RULES.START_WINDOW_MS + 1).winner === A.address, "other never started by the deadline → reporter wins");
  ok(/never started/.test(decide(st, T0 + RULES.START_WINDOW_MS + 1).reason), "reason: never started");
  st = base(); st.players[a] = { startedAt: T0 + 1000, report: { score: 500 } }; st.players[b] = { startedAt: T0 + 60000 };
  ok(decide(st, T0 + 60000 + RULES.RUN_BUDGET_MS) === null, "opponent started, still inside their report window → wait");
  ok(decide(st, T0 + 60000 + RULES.RUN_BUDGET_MS + RULES.REPORT_GRACE_MS + 1).winner === A.address, "opponent started but never reported → reporter wins");
  st = base(); st.players[a] = { startedAt: T0 + 1000 };
  ok(decide(st, T0 + 10 * 24 * 3600 * 1000) === null, "NOBODY reported → no settlement ever (contract expire() refunds both)");
  st = base();
  ok(decide(st, T0 + 10 * 24 * 3600 * 1000) === null, "nobody even started → no settlement");
  ok(playerCutoff({ startedAt: T0 }, T0) === T0 + RULES.RUN_BUDGET_MS + RULES.REPORT_GRACE_MS, "cutoff after start = budget + grace");
  ok(playerCutoff({}, T0) === T0 + RULES.START_WINDOW_MS, "cutoff before start = start window");
}

section("blindness — scores sealed until settlement");
{
  const a = A.address.toLowerCase(), b = B.address.toLowerCase();
  const st = { id: 1, chainId: 369, contract: CONTRACT, creator: A.address, joiner: B.address, joinedAtMs: T0, players: { [a]: { startedAt: T0, report: { score: 777, wave: 5, kills: 9, durationMs: 100000 } } }, settlement: null };
  const v = publicView(st, T0 + 1, "ACTIVE");
  ok(v.players[a].reported === true && v.players[b].reported === false, "reported flags visible");
  ok(!("scores" in v) && JSON.stringify(v).indexOf("777") === -1, "score NOT leaked before settlement");
  st.settlement = { winner: A.address, sig: "0x", at: T0 + 2 };
  ok(publicView(st, T0 + 3, "ACTIVE").scores[a].score === 777, "scores unsealed after settlement");
}

section("END-TO-END — referee decision settles the real contract");
{
  const load = n => JSON.parse(readFileSync(join(root, "out", n + ".json"), "utf8"));
  const Duel = load("WickDuel"), ERC = load("MockERC20");
  const provider = new ethers.BrowserProvider(ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 4, defaultBalance: 100 } }));
  const [owner, s1, s2] = await Promise.all((await provider.send("eth_accounts", [])).slice(0, 3).map(x => provider.getSigner(x)));
  const P1 = await s1.getAddress(), P2 = await s2.getAddress();
  const chainId = Number((await provider.getNetwork()).chainId);
  const wick = await (await new ethers.ContractFactory(ERC.abi, ERC.bytecode, owner).deploy()).waitForDeployment();
  const duel = await (await new ethers.ContractFactory(Duel.abi, Duel.bytecode, owner).deploy(await wick.getAddress(), await owner.getAddress(), REF.address, 1n)).waitForDeployment();
  const D = await duel.getAddress();
  for (const [s, who] of [[s1, P1], [s2, P2]]) { await (await wick.mint(who, 10n ** 24n)).wait(); await (await wick.connect(s).approve(D, ethers.MaxUint256)).wait(); }
  await (await duel.connect(s1).create(10n ** 21n, ethers.ZeroAddress, 0)).wait();
  await (await duel.connect(s2).join(1, 10n ** 21n)).wait();
  // referee state: P2 outscored P1
  const st = { creator: P1, joiner: P2, joinedAtMs: Date.now(), players: { [P1.toLowerCase()]: { startedAt: 1, report: { score: 100 } }, [P2.toLowerCase()]: { startedAt: 1, report: { score: 200 } } } };
  const d = decide(st, Date.now());
  const sig = await signSettlement(REF, chainId, D, 1, d.winner);
  const b0 = BigInt(await wick.balanceOf(P2));
  await (await duel.connect(s1).settle(1, d.winner, sig)).wait();     // loser submits — anyone may
  ok((await duel.getMatch(1)).winner === P2 && BigInt(await wick.balanceOf(P2)) - b0 === 19n * 10n ** 20n, "referee signature accepted on-chain, winner paid 95% of pot");
  // draw path end-to-end
  await (await duel.connect(s1).create(10n ** 21n, ethers.ZeroAddress, 0)).wait();
  await (await duel.connect(s2).join(2, 10n ** 21n)).wait();
  const st2 = { ...st, players: { [P1.toLowerCase()]: { startedAt: 1, report: { score: 5 } }, [P2.toLowerCase()]: { startedAt: 1, report: { score: 5 } } } };
  const d2 = decide(st2, Date.now());
  const sig2 = await signSettlement(REF, chainId, D, 2, d2.winner);
  await (await duel.connect(s2).settle(2, d2.winner, sig2)).wait();
  ok((await duel.getMatch(2)).winner === ethers.ZeroAddress && Number((await duel.getMatch(2)).status) === 3, "draw signature settles as refund on-chain");
}

console.log(`\nDUEL REFEREE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
