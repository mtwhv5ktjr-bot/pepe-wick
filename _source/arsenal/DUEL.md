# WICK DUEL — bet $WICK head-to-head in WICK SHOOTER

Two players stake the same $WICK. They play the **same seeded SURVIVAL run, one
attempt each, 6:00 budget, NORMAL difficulty pinned**. Higher score wins the pot
minus **5% to the treasury**; a tie refunds both. Minimum stake **$20 in $WICK
at spot**, priced on-chain from PulseX reserves.

## Rules + matchmaker

Every duel carries `rules` on-chain (fixed at `create`, agreed by staking):

| rules | name | what it means |
|---|---|---|
| 0 | **⚖ HOUSE IRON** | both play the stock loadout — NFT guns OFF for both, pure skill |
| 1 | **🔫 BRING YOUR OWN** | each may carry up to **2** of their own WICK ARSENAL guns (primary equipped, secondary racked — Q swaps) |

The report each player signs declares what was carried (`loadout: house | nft:t1[,t2]`);
the referee reads `rules` from CHAIN and refuses anything the rules don't allow.

**⚡ QUICK MATCH** (the matchmaker, `duel.js renderQuick/quickMatch`): pick RULES +
a STAKE TIER ($20/$50/$100/$250 — converted to WICK at spot via `minStake()`, which
IS $20). FIND MATCH calls `findMatches(rules, ±3% stake band, me, scan 300, 5)` — an
on-chain view returning open PUBLIC duels with the same rules inside the band,
**oldest first** — and joins the first still-open one (skipping any that closed
under it). Nobody waiting → it opens a duel at your stake and holds the door; the
6s poll flips it to MATCHED the moment someone quick-matches the tier (CANCEL &
REFUND while waiting). Private challenges (`opponent` set) are never offered.

## Pieces

| Piece | Where | Status |
|---|---|---|
| `WickDuel.sol` escrow | `contracts/WickDuel.sol` · `out/WickDuel.json` | compiled, **64 ganache tests green**, **NOT deployed** — run `LAUNCH-DUEL.cmd` |
| Referee (serverless) | `api/duel.js` + `api/_duel-core.js` (pure rules, 38 tests) | **LIVE** at `wick-arsenal.vercel.app/api/duel` — answers `online:false` until `DUEL_ADDR` is set |
| Game mode | `../wick-shooter/duel.js` + `duel-config.js` + hooks in `index.html` | **LIVE** at wick-shooter.vercel.app — MODE ▸ ⚔ WAGER DUEL / the ⚔ pill — shows DUELS OFFLINE until the contract address lands |
| Referee key | `out/duel-referee.json` (gitignored) ↔ Vercel env `DUEL_REFEREE_KEY` (production) | generated 2026-08-14 · address `0xF3E85ef3A96D049c95c3070f0cdEBDBF7688F2f8` |
| Local QA rig | `duel-local.mjs` | ganache :8546 (chainId 369) + the real handler on :8547 with an in-memory store, 25s budgets |

## Going live (3 steps, ~5 min)

1. **Deploy the contract** — double-click `LAUNCH-DUEL.cmd`, paste the deployer
   key, type LAUNCH. It resolves the PulseX pairs (WICK/WPLS + WPLS/DAI, V2 then
   V1), deploys with treasury = deployer (change with `setTreasury`) and referee =
   the address in `out/duel-referee.json`, sets pricing, writes the address to
   `out/deployed.json` and `../wick-shooter/duel-config.js`.
2. **Tell the referee** — `echo <WICKDUEL_ADDR> | npx vercel env add DUEL_ADDR production`
   then `npx vercel deploy --prod --yes` (in wick-arsenal).
3. **Ship the game** — `cd ..\wick-shooter && node build.mjs && npx vercel deploy --prod --yes`.

Then `GET /api/duel?info=1` shows `online:true` and the lobby lists open duels.

## How a duel runs

1. **CREATE** — approve + `create(amount, opponent)`; `opponent` = zero for anyone, or a wallet for a private challenge. Stake must be ≥ `minStake()` ($20 at spot). Escrowed in the contract.
2. **JOIN** — `join(id, amount)` matches the stake (credited by balance delta, so a fee-on-transfer token can never leave the pot short). Match becomes ACTIVE; `joinedAt` starts the clocks.
3. **START** (each player, within 30 min of the join) — the client signs `WICK duel start…`, the referee records `startedAt` ONCE and returns the **seed** (referee-derived, identical for both, unknown until you press START) and the budget. The game clears attract-mode state, pins NORMAL difficulty, swaps `Math.random` for the seeded PRNG and starts SURVIVAL (HOUSE: stock loadout · BYO: your ≤2 picks). START is idempotent only for ~20s (a lost response); after that **the seed is never re-issued** — a reload/crash does not restart the attempt.
4. **RUN** — 6:00 or death, whichever first. HUD shows the countdown. Telemetry every 4s, and the run-so-far is persisted in localStorage every stamp (`duel_pending_<id>`) so a crash still has something to send. Pause → RESTART is locked during a duel; any level rebuild ends the run.
5. **REPORT** — the client signs `WICK duel report … score:… wave:… kills:… ms:… loadout:…`; the referee checks the signature, the loadout against the on-chain rules, one-report-per-player, wall-clock consistency (a 6-minute run can't be reported 20s after START), physical caps (score/wave/kill rates), and telemetry shape: present, **first stamp within 8s of the run start**, **no gap over 20s**, monotone, ends at the score — so a fresh run started after a reload (whose stamps begin minutes in) is refused. Refused/failed report → **RE-SEND** (from memory or the persisted snapshot; there is no RESUME).
6. **DECIDE** — both reported → higher score (tie = draw). One reported and the other missed their cutoff (never started by the start deadline / never reported by start+budget+grace) → the reporter wins by forfeit. **Nobody reported → the referee never invents a winner**; after 48h either player calls `expire()` and both stakes come home.
7. **CLAIM** — anyone sends the referee's signature to `settle(id, winner, sig)`; the contract verifies the signer, pays the winner 95% and the treasury 5% in the same tx (draw: refunds both, no fee). Nothing is revealed about either run until the decision exists.

## Trust model (read this before raising stakes)

- The referee decides the **winner**, never the **money**: it can only name a participant (or a draw), the fee is capped in the contract, the owner has no sweep of $WICK, `pause` blocks entry only, and `expire()` guarantees an exit if the referee is ever silent.
- The game is **client-authoritative** — like every browser game. The referee enforces what it can prove (seed unknown until START, one attempt, wall clock, caps, signatures, sealed scores). A modded client can still play "perfectly" inside the caps. This is the same trust level as the existing signed leaderboard. **Size stakes accordingly**; server-side replay of an input log is the hardening path if volume justifies it (`api/_duel-core.js` is where caps live — calibrated 2026-08-14 against an invulnerable auto-fire client: ~250 pts/s, ~1 kill/s, 5–8 s/wave; ceilings ~10× / 4× / 2×).
- Min-bet pricing uses PulseX **spot** reserves — manipulable, but manipulation only lets someone bet slightly *less* than $20; it's a UX floor, not a security boundary.

## Review (2026-08-18, 12-agent adversarial workflow, 8 confirmed → all fixed)

- one attempt bypass via reload+RESUME → referee never re-issues the seed after 20s; client has no RESUME, persists the pending run, RE-SENDs; telemetry must start ≤8s in with no >20s gaps
- attract-mode demo hijacking a duel run → begin() clears demo/menuIdle/keys; demo never starts while the lobby is open
- pause → RESTART LEVEL mid-duel (free heal, score kept) → locked in duels; snapshot treats any level rebuild as run over
- difficulty not pinned (HARD = ×1.5 score) → NORMAL pinned in begin(), restored in end()
- unauthenticated state reads bypassing the store cache (PAT/RPC exhaustion → opponent's REPORT fails) → cached reads for state, chain memo, per-instance rate limit; **add a Vercel Firewall rate rule on /api/duel as the real backstop**

## Ops

- Tests: `node test-duel.mjs` (contract) · `node test-duel-referee.mjs` (rules + e2e with the referee's signature settling the contract).
- Rotate the referee: new key → Vercel env `DUEL_REFEREE_KEY` → `setReferee(newAddr)` on the contract (old signatures die instantly).
- Store: match state lives in the leaderboard's git-file store as `duel-369-<id>.json` (~5 commits per match).
- Referee env: `DUEL_REFEREE_KEY`, `DUEL_ADDR`, optional `RPC_URL`; local rigs may set `DUEL_BUDGET_MS`.
