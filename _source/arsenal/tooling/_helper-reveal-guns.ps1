# WICK ARSENAL — reveal the guns. Double-click REVEAL-GUNS.cmd instead of running this.
# Your private key is typed here, held in memory only, passed to reveal.mjs on this
# machine. Never written to disk, never printed, never in command history.

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

function Line { param($t,$c="Gray") Write-Host $t -ForegroundColor $c }

Clear-Host
Line ""
Line "  ==========================================" "DarkYellow"
Line "     WICK ARSENAL  -  REVEAL THE GUNS" "Yellow"
Line "  ==========================================" "DarkYellow"
Line ""
Line "  This assigns every sealed case its real gun, forever." "White"
Line ""
Line "    1. Briefly closes the mint (about 20 seconds)"
Line "    2. Proves your committed seed on-chain -> all guns assigned"
Line "    3. REOPENS the mint so the sale keeps going"
Line ""
Line "  After this, holders can use their guns in-game right away," "White"
Line "  and anyone who mints later sees their gun instantly." "White"
Line ""
Line "  One-way door: reveal can only ever happen once." "DarkYellow"
Line "  Note: once revealed, the remaining unsold guns are public," "DarkYellow"
Line "  so buyers can see what is left before minting." "DarkYellow"
Line ""

# --- node ---
$nodeDirs = @("C:\Users\Bia\New folder\pangle-agent\node\node-v24.17.0-win-x64","C:\Program Files\nodejs")
$node = $null
foreach ($d in $nodeDirs) { if (Test-Path (Join-Path $d "node.exe")) { $node = Join-Path $d "node.exe"; break } }
if (-not $node) { $c = Get-Command node -ErrorAction SilentlyContinue; if ($c) { $node = $c.Source } }
if (-not $node) { Line "  ERROR: node.exe not found. Tell Claude." "Red"; Read-Host "`n  Press Enter to close"; exit 1 }

foreach ($f in @("reveal.mjs","out\deployed.json","out\secret-seed.json")) {
  if (-not (Test-Path $f)) { Line "  ERROR: missing $f" "Red"; Read-Host "`n  Press Enter to close"; exit 1 }
}

$env:RPC_URL = "https://rpc.pulsechain.com"

Line "  Paste the SAME wallet key you launched the mint with, then Enter." "White"
Line "  (Nothing appears as you paste - that is normal.)" "DarkGray"
Line ""
$secure = Read-Host "  PRIVATE KEY" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try   { $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
$key = $key.Trim()

if ($key.Length -eq 0) { Line "`n  Cancelled - nothing changed." "Yellow"; Read-Host "`n  Press Enter to close"; exit 1 }
if ($key -notmatch '^(0x)?[0-9a-fA-F]{64}$') {
  Line "`n  That is not a valid private key (needs 64 hex characters)." "Red"
  Line "  Nothing changed." "Red"; $key = $null
  Read-Host "`n  Press Enter to close"; exit 1
}
if ($key -notmatch '^0x') { $key = "0x$key" }

Line ""
Line "  Type  REVEAL  and press Enter to go. Anything else cancels." "Yellow"
$go = Read-Host "  Confirm"
if ($go.Trim().ToUpper() -ne "REVEAL") { Line "`n  Cancelled - nothing changed." "Yellow"; $key = $null; Read-Host "`n  Press Enter to close"; exit 1 }

Line ""
Line "  Working - do not close this window." "Cyan"
Line "  ------------------------------------------------------------------" "DarkGray"
$env:PRIVATE_KEY = $key
$key = $null
try { & $node "reveal.mjs"; $code = $LASTEXITCODE } finally { $env:PRIVATE_KEY = $null }
Line "  ------------------------------------------------------------------" "DarkGray"

if ($code -ne 0) {
  Line ""
  Line "  DID NOT COMPLETE. Copy the red text above and send it to Claude." "Red"
  Line "  IMPORTANT: if it closed the mint but failed before reopening," "Yellow"
  Line "  tell Claude right away so the sale is not left shut." "Yellow"
  Read-Host "`n  Press Enter to close"; exit 1
}

Line ""
Line "  ==========================================" "Green"
Line "     DONE - GUNS ARE REVEALED." "Green"
Line "  ==========================================" "Green"
Line ""
Line "  Holders should reconnect their wallet at games.wick.pics" "White"
Line "  to load their real guns." "White"
Line ""
Read-Host "  Press Enter to close"
