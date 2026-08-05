# Leaderboard storage — off Vercel Blob, onto a git file

The board used to live in Vercel Blob. That store (`wick-board`,
`store_aGYTctI5mdCs0Snw`) was **suspended** with the data intact but unreadable,
which took the leaderboard down and could not be fixed from code. It now stores
the board as a JSON file in a GitHub repo:

- **free**, with no storage product to suspend
- **every write is a commit**, so the version history *is* the backup — strictly
  better than the one-deep `lb-prev.json` snapshot the Blob code kept by hand
- same API contract, same anti-cheat, same holders-only gate

## What you need to do (about 3 minutes)

### 1. Make a repo to hold the board

Create a new **private** repo — `wick-board` is a good name.

> **Do not use the `pepe-wick` repo.** It publishes GitHub Pages, so every score
> posted would trigger a site rebuild. The board needs its own repo.

Nothing needs to be in it. `lb.json` is created by the first score posted.

### 2. Make a token that can only touch that repo

<https://github.com/settings/personal-access-tokens/new>

| Field | Value |
| --- | --- |
| Resource owner | the account that owns `wick-board` |
| Repository access | **Only select repositories** → `wick-board` |
| Repository permissions | **Contents: Read and write** |
| Expiration | your call — if it expires, the board stops accepting scores |

Leave every other permission alone. Scoped this way, the token can do nothing
except read and write files in that one repo.

### 3. Add three variables in Vercel

Vercel → project **wick-arsenal** → Settings → Environment Variables →
**Production**:

| Name | Value |
| --- | --- |
| `LB_GH_TOKEN` | the token from step 2 |
| `LB_GH_REPO` | `your-github-name/wick-board` |
| `LB_GH_BRANCH` | `main` *(optional — this is the default)* |

Paste the token straight into Vercel. It should never go through chat, a file,
or a commit.

### 4. Redeploy and check

Environment changes only take effect on a new deploy:

```bash
npx vercel deploy --prod --yes
```

Then open <https://mint.wick.pics/api/lbcheck>. You want:

```json
{ "ok": true, "configured": true, "canRead": true, "canWrite": true, "entries": 0 }
```

`canWrite: false` means the token is read-only — reads will look perfect and
every score will fail later, so fix it before announcing. The check asks GitHub
what the token is permitted to do; it never writes anything and never echoes the
token.

## The old scores

They are still inside the suspended Blob store — **not lost**, just unreadable
while it stays suspended. If you ever unsuspend it (Vercel → Storage →
wick-board), the rows can be rescued and merged in; `kjp-wick/tools/lb-server.mjs
--import <file>` already does the merge, keeping the better score per wallet per
mode. Until then the new board starts empty.

## Limits worth knowing

- GitHub allows 5,000 API calls/hour on the token. A score costs 2 (read +
  commit); a board view costs 1, and views are served from a 15-second in-memory
  cache, so a busy tournament sits far under the ceiling.
- Two players submitting in the same instant is handled — the write re-reads and
  re-applies on conflict, so neither score is dropped (covered by
  `test-leaderboard-gitstore.mjs`).
- A brief GitHub outage serves the last cached board rather than flashing an
  empty one, and **never** writes on stale data — writes always re-read fresh
  and fail closed with a 503 telling the player their score was not saved.

## Tests

```bash
node test-leaderboard-gitstore.mjs
```

21 checks against the real handler with a fake GitHub API: PB handling, forged
signatures, stale timestamps, per-mode ceilings, cross-mode replay, concurrent
writes, and the outage behaviour above.

## Still on Blob

`api/hit.js` (page-view counter) and `api/blobcheck.js` (a diagnostic for the old
store) still import `@vercel/blob`. `hit.js` is silently broken by the same
suspension; `blobcheck.js` is deliberately kept — it is what you would use to
confirm the old store is readable again before rescuing the scores.
