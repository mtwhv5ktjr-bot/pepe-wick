# PEPE WICK — source for review

Everything that builds games.wick.pics and mint.wick.pics, in one place so it can
be read with diffs. `_source/` is **not** served by Pages (Jekyll skips
underscore directories) — it exists purely for review.

## Where the code actually lives

| what | reviewable at | source of truth |
|---|---|---|
| The game (single-file engine, ~4600 lines) | [`/play/index.html`](../play/index.html) | `pepe-zero/index.html` |
| Contracts, tests, mint site, APIs | `_source/arsenal/**` | `wick-arsenal/` |
| The arcade hall + static pages | repo root (`index.html`, `arsenal/`, `horde/`) | this repo |

The game is already at `/play/index.html` — byte-identical to the source, copied
by `sync.cmd`, so review it there rather than duplicating 4600 lines here.

## 🔴 Unlaunched and most in need of eyes: WICK BILLBOARDS

`arsenal/contracts/WickBillboards.sol` — self-serve in-game advertising. **Built,
tested, deliberately NOT deployed.** The purchase UI is hidden behind `?ads=1`
until review + testing sign off.

- 1,000,000 PLS/day = a rotation slot (max 8 advertisers/day)
- 10,000,000 PLS/day = EXCLUSIVE: every billboard in the game is that buyer's
- Exclusive is only sellable while the day is **empty**, and it then closes the
  day — so nobody's paid rotation slot can be erased by a later takeover
- Every purchase splits **in the buy transaction**: 50% swapped to $WICK and
  burned via PulseX, 50% to the treasury. Failed swaps pool in `burnPending`
  behind a public crank; they never touch anything else
- Content is short text + a color, rendered in the game's house style. The owner
  can `setBanned` abusive content with no refund — stated at purchase

Worth attacking specifically: the exclusive/rotation interaction, the 60-day
booking window, refund/griefing paths, and whether `adsOf`'s parallel-array view
can be made to lie.

Tests: `arsenal/tests/test-billboards.mjs` — 28 ganache tests, plus a
mainnet-fork rehearsal that burns real $WICK through the live PulseX pool.

## Live contracts (PulseChain, chainId 369)

| contract | address |
|---|---|
| WickGuns | `0x188848DdB42fA8Ca2EB05649c944e05dfA2158FD` |
| WickMarket (v1, 15% burn royalty) | `0x1457C17A7132fCbCb2034337368050563DeD91e3` |
| WickMods (free mint, gun-gated) | `0x004E6610ff47c6A6510DA446257822B37D26CD73` |
| WickModsMarket (50% burn royalty) | `0xDDb963D1bb874d4ac5697550F513568c657E977E` |
| WickBillboards | not deployed |

## Running the tests

Needs `ganache` locally and borrows `ethers`/`solc` from a sibling project (see
the `createRequire` line at the top of each test).

```bash
node compile.mjs          # all contracts, prints deployed sizes vs the 24KB limit
node test.mjs             # 103 — guns + market + reveal + adversarial crypto QA
node test-mods.mjs        #  45 — gun-gated free mint, incl. the wallet-cycling attack
node test-mods-market.mjs #  16 — 50% burn royalty, escrow safety, dead-router paths
node test-billboards.mjs  #  28 — billboard day slots, exclusivity, split math
```

## Known-open items (not oversights)

- **WickMarket v1 doesn't clear a listing when an offer is accepted**, so a sold
  gun can leave a stale listing. The deployed v1 has this; the v2 in
  `contracts/WickMarket.sol` fixes it (`delete listings[tokenId]`) and is not yet
  deployed. The site filters stale rows client-side in the meantime.
- Mods offers-pool UI is unbuilt (the contract supports it).
- Leaderboard scores are wallet-signed but the *number* is client-supplied.
  Defence is per-mode ceilings in `api/leaderboard.js` plus manual review before
  any payout. Genuinely open to better ideas here.

## Secrets

`.env*`, `.vercel/`, and `out/secret-seed.json` are gitignored and have never
been committed. Deploy scripts read `process.env.PRIVATE_KEY`; the `.cmd`
launchers prompt for it with hidden input, hold it in memory only, and clear it
in a `finally` block. No key has ever been in this repo.
