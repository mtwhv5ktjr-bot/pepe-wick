# WICK ARSENAL — gun NFTs for PEPE WICK (PulseChain)

**Mint: 1,000,000 PLS per sealed case. 100% of every mint is used to buy & burn $WICK.**
(The burn is a policy commitment executed from the mint treasury — `withdraw()`
sends proceeds to the owner wallet, which performs the buy-and-burn.)

**The mint is BLIND (commit-reveal).** You mint a sealed case — no gun type
exists on-chain until `reveal()`. At deploy, a secret seed's hash is committed
(saved to `out/secret-seed.json` — KEEP IT). When the mint sells out (or you
call `closeMint()`), a future blockhash is armed; `node reveal.mjs` then proves
the committed seed and mixes it with that blockhash to shuffle the fixed tier
pool (30/25/18/15/7) across all 95 tokens. Neither minters nor the owner can
predict or influence which token becomes which gun.

100 on-chain gun NFTs. Hold one in your wallet and it unlocks that gun in the
game. 95 are minted from a fixed rarity pool; 5 are platinum-holographic 1/1s.
Art + metadata are 100% on-chain (no IPFS, no server).

**No gun is strictly best.** Every gun sits in the same power band as the game's
rifle and trades raw stats for a signature mechanic.

| Tier | Gun | Supply | Signature |
|------|-----|--------|-----------|
| Common | Boogeyman P30 (pistol) | 30 | clean all-rounder |
| Uncommon | Continental Vector (SMG) | 25 | builds FOCUS 25% faster |
| Uncommon | Kimber Breacher (shotgun) | 18 | massive knockback (SPLAT combos) |
| Rare | TTI Marksman (rifle) | 15 | pierces one enemy |
| Epic | Excommunicado (heavy) | 7 | explosive rounds |
| 1/1 | Gold Standard | 1 | 2× coins, executions heal |
| 1/1 | The Impossible | 1 | ricochets between lanes |
| 1/1 | High Table | 1 | single / burst |
| 1/1 | Tabula Rasa | 1 | perfect reload = overcharge |
| 1/1 | Baba Yaga | 1 | hand-cannon: huge dmg, 3-round mag |

## Contracts
- `contracts/WickGuns.sol` — self-contained ERC-721. `MAX_SUPPLY=100`, IDs 1–5 are
  the owner-minted 1/1s, public mint draws IDs 6–100 from the rarity pool.
  `gunsOfOwner(addr)` / `gunTypeOf(id)` let the game read a wallet's loadout.
- `contracts/WickGunArt.sol` — the on-chain SVG renderer: each NFT is a premium
  400×560 holographic trading card (framed art window, stat bars, rarity stamp,
  serial number; animated rainbow foil on the 1/1s). Split from WickGuns for
  the 24KB size limit.
- `contracts/WickGunBodies.sol` — the vector gun drawings + 1/1 overlays,
  split from WickGunArt for the same size limit. Deploy order (handled by
  deploy.mjs): Bodies → Art(bodies) → Guns(art) → Market(guns).
- `contracts/WickMarket.sol` — approval-based secondary market: `list / buy /
  cancel`, fee in bps, reentrancy-guarded.

## Build & test (no keys needed)
```
npm run compile      # -> out/WickGuns.json, out/WickMarket.json
npm test             # 34 assertions on an in-process ganache chain
```

## Deploy (YOU run this — needs your deployer key)
```
PRIVATE_KEY=0x...                 # your PulseChain deployer wallet
RPC_URL=https://rpc.pulsechain.com
MINT_PRICE_PLS=1000000            # price per gun, whole PLS (set what you like)
FEE_BPS=250                       # marketplace fee = 2.5%
MINT_1OF1=1                       # mint the 5 platinum 1/1s to you
OPEN_MINT=1                       # open public mint immediately
node deploy.mjs
```
Prints + writes `out/deployed.json` with the two contract addresses.

Verify source on the explorer with `out/verify-input.json`
(Blockscout → "Solidity (Standard JSON input)").

## Wire up the front-end + game
1. Paste the addresses from `out/deployed.json` into `web/config.js`
   (`guns` and `market`).
2. Redeploy the site:  `vercel deploy --prod`  (already live at
   **wick-arsenal.vercel.app** — a static preview until step 1).
3. Set the API's contract address so ownership checks work:
   `vercel env add GUNS_ADDR` → paste the WickGuns address (Production).
   (Optional `RPC_URL` env; defaults to PulseChain.) Then redeploy.
4. The **game** (`wick-shooter`) already calls `https://wick-arsenal.vercel.app/api/verify`.
   If you host the API elsewhere, edit `NFT_VERIFY_URL` in the game's `index.html`.

## How gating works
On the game menu, **N** connects a wallet. The player signs a timestamped
message; the game POSTs it to `/api/verify`, which recovers the signer, checks
freshness, and reads `gunsOfOwner` on-chain. Verified guns become selectable
loadouts (`[` / `]`).

This proves ownership cryptographically — you can't just *claim* to own a gun.
But the game is client-side, so a determined cheater can still edit local JS.
True anti-cheat needs server-authoritative gameplay; this is the honest ceiling
for a browser game.
