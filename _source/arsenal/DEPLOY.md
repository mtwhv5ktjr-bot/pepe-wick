# WICK ARSENAL — LAUNCH RUNBOOK (current as of 2026-07-29)

Everything here has been dry-run end-to-end on a local PulseChain-chainId fork
(deploy → 4 contracts → 1/1s → open mint → paid public mint → `gunsOfOwner`
matches the game's `verify.js`). **You run the deploy; Claude never touches keys.**

Pre-flight status (re-verified 2026-07-30):
- ✅ 53/53 contract tests pass (`node test.mjs`) — full Bodies→Art→Guns→Market stack deploys in simulation
- ✅ **100% buy & burn is now AUTOMATIC and IN-CONTRACT**: every mint swaps its PLS
  to $WICK through the 9mm V3 SmartRouter (the WICK/WPLS 2% pool — where the
  liquidity is; route fingerprinted on-chain + swap simulated via eth_call) and
  sends it to the dead address inside the mint transaction. `withdraw()` is gone —
  mint revenue cannot leave the contract except as a burn. If a swap ever fails,
  the PLS pools and the public `burnPool(minOut)` crank lets ANYONE convert it
  (mints never block).
- ✅ Blind commit-reveal mint wired (sealed cases; `reveal.mjs` + `out/secret-seed.json` created at deploy)
- ✅ deploy.mjs: self-managed nonces (fast-RPC safe), auto-patches `web/config.js`, writes `out/deployed.json`
- ✅ Mint site, verify API (signed POST + watch-mode GET), leaderboard (mode-bound signatures, per-mode PBs) all LIVE
- ✅ Game (pepe-zero) NFT flow ready: 3 verification paths, in-game gun swap (Q / tap), holder +1♥, holo +20%
- Economics: 1,000,000 PLS per sealed case · 101 guns (100 public + the Reaper) ·
  5 holo 1/1s hidden in the cases · 100% of mint → $WICK buy & burn (in-contract)
- ✅ **Marketplace v2**: list/buy any gun + an **escrowed OFFERS POOL** (bid on a specific
  gun, or `tokenId 0` = a standing offer on ANY gun that any holder can fill).
  **15% royalty on every secondary sale, 100% of it swapped to $WICK and burned in the
  sale tx** — the market owner collects nothing. Escrowed bids are tracked separately
  from the burn pool, so a failed burn can never touch a bidder's money.

## 0. Before you start
- **Deployer wallet** with **PLS for gas**. The Art (21KB) + Bodies (18KB)
  contracts are large — this is ~10 transactions; budget generously (~50–100 PLS).
- The deployer becomes contract **owner**, receives the **5 holo 1/1s**, and
  collects **all mint PLS**. Consider a fresh dedicated wallet.
- Have your **private key** ready to paste into your own terminal only.
  Never commit it, never paste it into chat.
- Contracts already compiled (`out/*.json`). To recompile: `node compile.mjs`.

## 1. Deploy (one command — YOU run this)
From `wick-arsenal/`, in your own terminal:

```bash
PRIVATE_KEY=0xYOUR_DEPLOYER_KEY \
RPC_URL=https://rpc.pulsechain.com \
MINT_PRICE_PLS=1000000 \
FEE_BPS=250 \
MINT_1OF1=1 \
OPEN_MINT=1 \
node deploy.mjs
```

What it does, in order:
1. Commits a blind-mint seed → writes `out/secret-seed.json` **(keep this safe — the reveal depends on it; never commit it)**.
2. Deploys **Bodies → Art → Guns → Market** (explicit nonces — fast-RPC safe).
3. Mints **#1 TANGENTIAL REAPER straight to tangent.pls's wallet** (`0xf7B5…787D`,
   baked in; override with `TANGENT_ADDR=` if it ever changes). That is the ONLY
   reserved token — the five platinum holos are INSIDE the 100 sealed cases, so
   any public mint can hit one. The Reaper itself is never mintable.
4. **Opens the public mint** (`OPEN_MINT=1`; omit to open later via `setMintOpen(true)`).
5. Writes `out/deployed.json` and auto-patches `web/config.js` with the live addresses.

Afterwards, close that terminal (the key sits in shell history otherwise —
or prefix the command with a space if your shell skips history for it).

## 2. Send Claude the addresses
Paste the four addresses from `out/deployed.json` (bodies / art / guns / market)
into chat. Claude then finishes the launch:

1. Redeploys the **mint site** (config.js already patched by deploy.mjs).
2. Sets **`GUNS_ADDR`** env on the wick-arsenal Vercel project → verify API +
   watch-mode lookups go live.
3. Patches **`GUNS_ADDR`** in pepe-zero's `index.html` (the game's direct
   on-chain fallback) and redeploys the game.
4. End-to-end check: watch-mode lookup on the deployer address must return the
   5 holos; mint page shows live supply; game unlocks guns; leaderboard signing works.
5. Preps/posts the launch announcements (LAUNCH.md).

## 3. After sellout — the reveal
`node reveal.mjs` (uses `out/secret-seed.json`) reveals the sealed cases.
Without the seed the blind mint cannot be revealed; with it anyone can
precompute the outcome — guard the file.

## Safety notes
- Claude never touches PRIVATE_KEY, never runs the deploy, never holds funds.
- The 100%-burn commitment is enforced BY CODE: mint() auto-swaps to $WICK and burns
  in-tx (burn route defaults baked into deploy.mjs: 9mm V3 SmartRouter
  0xf6076d61…a717 + WPLS + WICK + 2% fee tier, overridable via BURN_ROUTER / WPLS /
  WICK_TOKEN / BURN_FEE envs). Every mint tx shows the burn on-chain — link a few
  in announcements for credibility.
