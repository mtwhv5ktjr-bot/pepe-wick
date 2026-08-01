# WICK ARSENAL — one-shot launcher.
# Double-click LAUNCH.cmd instead of running this directly.
# Your private key is typed here, held in memory only, and passed straight to
# deploy.mjs on this machine. It is never written to disk, never logged, and
# never leaves your computer.

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

function Line { param($t,$c="Gray") Write-Host $t -ForegroundColor $c }

Clear-Host
Line ""
Line "  ==========================================" "DarkYellow"
Line "     WICK ARSENAL  -  LAUNCH" "Yellow"
Line "  ==========================================" "DarkYellow"
Line ""
Line "  This will, in ONE run:" "White"
Line "    1. Deploy the 4 contracts to PulseChain"
Line "    2. Send the TANGENTIAL REAPER to tangent.pls"
Line "    3. OPEN the public mint (100 sealed cases)"
Line "    4. Turn on the automatic 100% buy-and-burn"
Line ""
Line "  You need: a wallet with about 100 PLS for gas." "White"
Line "  It spends real money. Nothing is reversible." "DarkYellow"
Line ""

# --- find node -------------------------------------------------------------
$nodeDirs = @(
  "C:\Users\Bia\New folder\pangle-agent\node\node-v24.17.0-win-x64",
  "C:\Program Files\nodejs"
)
$node = $null
foreach ($d in $nodeDirs) { if (Test-Path (Join-Path $d "node.exe")) { $node = Join-Path $d "node.exe"; break } }
if (-not $node) { $c = Get-Command node -ErrorAction SilentlyContinue; if ($c) { $node = $c.Source } }
if (-not $node) { Line "  ERROR: could not find node.exe. Tell Claude and stop here." "Red"; Read-Host "`n  Press Enter to close"; exit 1 }

if (-not (Test-Path "deploy.mjs")) {
  Line "  ERROR: deploy.mjs not found next to this script." "Red"
  Line "  This file must live in the wick-arsenal folder." "Red"
  Read-Host "`n  Press Enter to close"; exit 1
}

# --- settings (these are the launch values we agreed on) -------------------
$env:RPC_URL        = "https://rpc.pulsechain.com"
$env:MINT_PRICE_PLS = "1000000"   # 1,000,000 PLS per sealed case
$env:FEE_BPS        = "1500"      # 15% secondary royalty -> 100% burned
$env:MINT_1OF1      = "1"         # mint the Reaper to tangent.pls
$env:OPEN_MINT      = "1"         # open the public mint immediately

Line "  Settings:" "White"
Line "    price per case ... 1,000,000 PLS"
Line "    resale royalty ... 15%  (100% of it burns WICK)"
Line "    mint opens ....... immediately"
Line "    Reaper goes to ... tangent.pls (0xf7B5...787D)"
Line ""

# --- key prompt (hidden) ---------------------------------------------------
Line "  Paste your deployer wallet's PRIVATE KEY and press Enter." "White"
Line "  (Nothing will appear as you paste - that is normal.)" "DarkGray"
Line ""
$secure = Read-Host "  PRIVATE KEY" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try   { $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }

$key = $key.Trim()
if ($key.Length -eq 0) { Line "`n  Nothing entered - cancelled. Nothing was deployed." "Yellow"; Read-Host "`n  Press Enter to close"; exit 1 }
if ($key -notmatch '^(0x)?[0-9a-fA-F]{64}$') {
  Line "`n  That does not look like a private key (needs 64 hex characters)." "Red"
  Line "  Nothing was deployed. Close this and try again." "Red"
  $key = $null
  Read-Host "`n  Press Enter to close"; exit 1
}
if ($key -notmatch '^0x') { $key = "0x$key" }

# --- final confirm ---------------------------------------------------------
Line ""
Line "  Type  GO  and press Enter to launch. Anything else cancels." "Yellow"
$go = Read-Host "  Confirm"
if ($go.Trim().ToUpper() -ne "GO") { Line "`n  Cancelled. Nothing was deployed." "Yellow"; $key = $null; Read-Host "`n  Press Enter to close"; exit 1 }

# --- run -------------------------------------------------------------------
Line ""
Line "  Launching. This takes a minute or two - do not close this window." "Cyan"
Line "  ------------------------------------------------------------------" "DarkGray"
$env:PRIVATE_KEY = $key
$key = $null
try {
  & $node "deploy.mjs"
  $code = $LASTEXITCODE
} finally {
  $env:PRIVATE_KEY = $null      # key out of the environment either way
}
Line "  ------------------------------------------------------------------" "DarkGray"

if ($code -ne 0) {
  Line ""
  Line "  IT DID NOT FINISH. Nothing is half-broken - the mint is simply not open." "Red"
  Line "  Copy the red text above and send it to Claude." "White"
  Line "  Most common cause: not enough PLS in the wallet for gas." "DarkGray"
  Read-Host "`n  Press Enter to close"; exit 1
}

# --- success ---------------------------------------------------------------
Line ""
Line "  ==========================================" "Green"
Line "     DONE. THE MINT IS OPEN." "Green"
Line "  ==========================================" "Green"
Line ""
Line "  TWO THINGS LEFT:" "Yellow"
Line ""
Line "  1) BACK UP THIS FILE somewhere safe and private:" "White"
Line "       $(Join-Path $PSScriptRoot 'out\secret-seed.json')"
Line "     It is the only thing that can open the sealed cases later." "DarkGray"
Line ""
Line "  2) SEND CLAUDE the text below (it is now on your clipboard too):" "White"
Line ""
if (Test-Path "out\deployed.json") {
  $dep = Get-Content "out\deployed.json" -Raw
  Write-Host $dep -ForegroundColor Cyan
  try { Set-Clipboard -Value $dep; Line "  (copied to clipboard)" "DarkGray" } catch {}
} else {
  Line "  out\deployed.json is missing - copy the addresses from the log above." "Red"
}
Line ""
Read-Host "  Press Enter to close"
