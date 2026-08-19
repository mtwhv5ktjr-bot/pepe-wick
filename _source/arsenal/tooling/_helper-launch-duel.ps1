# WICK DUEL — deploy the wager escrow for WICK SHOOTER head-to-head duels.
# Double-click LAUNCH-DUEL.cmd instead of running this directly.
# Key is typed here, held in memory only, never written to disk or history.

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
function Line { param($t,$c="Gray") Write-Host $t -ForegroundColor $c }

Clear-Host
Line ""
Line "  ==========================================" "DarkYellow"
Line "     LAUNCH WICK DUEL" "Yellow"
Line "  ==========================================" "DarkYellow"
Line ""
Line "  Head-to-head wagers in WICK SHOOTER:" "White"
Line "    both players stake the same $WICK (min $20 at spot, priced on-chain)" "Gray"
Line "    same seeded run, one attempt, 6:00 - higher score wins" "Gray"
Line "    winner takes the pot, 5% goes to your treasury in the same tx" "Gray"
Line "    the referee (duel server) only names the winner - it can never move funds" "Gray"
Line "    no settlement in 48h -> either player calls expire() and both are refunded" "Gray"
Line ""
Line "  Treasury defaults to the deployer; change later with setTreasury." "DarkGray"
Line ""

$nodeDirs = @("C:\Users\Bia\New folder\pangle-agent\node\node-v24.17.0-win-x64","C:\Program Files\nodejs")
$node = $null
foreach ($d in $nodeDirs) { if (Test-Path (Join-Path $d "node.exe")) { $node = Join-Path $d "node.exe"; break } }
if (-not $node) { $c = Get-Command node -ErrorAction SilentlyContinue; if ($c) { $node = $c.Source } }
if (-not $node) { Line "  ERROR: node.exe not found." "Red"; Read-Host "`n  Press Enter to close"; exit 1 }
foreach ($f in @("deploy-duel.mjs","out\WickDuel.json","out\duel-referee.json")) {
  if (-not (Test-Path $f)) { Line "  ERROR: missing $f  (contract: node compile-duel.mjs · referee: node duel-referee-key.mjs)" "Red"; Read-Host "`n  Press Enter to close"; exit 1 }
}
$ref = (Get-Content "out\duel-referee.json" | ConvertFrom-Json)
if (-not $ref.address) { Line "  ERROR: out\duel-referee.json has no address" "Red"; Read-Host "`n  Press Enter to close"; exit 1 }
Line ("  Referee address: " + $ref.address + "  (its key is in Vercel as DUEL_REFEREE_KEY)") "Cyan"
Line ""

$env:RPC_URL = "https://rpc.pulsechain.com"
$env:REFEREE = $ref.address

Line "  Paste your deployer wallet key, then Enter." "White"
Line "  (Nothing appears as you paste - that is normal.)" "DarkGray"
Line ""
$secure = Read-Host "  PRIVATE KEY" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try   { $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
$key = $key.Trim()
if ($key.Length -eq 0) { Line "`n  Cancelled - nothing deployed." "Yellow"; Read-Host "`n  Press Enter to close"; exit 1 }
if ($key -notmatch '^(0x)?[0-9a-fA-F]{64}$') { Line "`n  Not a valid private key." "Red"; $key=$null; Read-Host "`n  Press Enter to close"; exit 1 }
if ($key -notmatch '^0x') { $key = "0x$key" }

Line ""
Line "  Type  LAUNCH  and press Enter. Anything else cancels." "Yellow"
$go = Read-Host "  Confirm"
if ($go.Trim().ToUpper() -ne "LAUNCH") { Line "`n  Cancelled - nothing deployed." "Yellow"; $key=$null; Read-Host "`n  Press Enter to close"; exit 1 }

Line ""
Line "  Deploying - do not close this window." "Cyan"
Line "  ------------------------------------------------------------------" "DarkGray"
$env:PRIVATE_KEY = $key
$key = $null
try { & $node "deploy-duel.mjs"; $code = $LASTEXITCODE } finally { $env:PRIVATE_KEY = $null }
Line "  ------------------------------------------------------------------" "DarkGray"

if ($code -ne 0) { Line "`n  DID NOT COMPLETE - send the text above to Claude." "Red"; Read-Host "`n  Press Enter to close"; exit 1 }

Line ""
Line "  ==========================================" "Green"
Line "     WICK DUEL IS DEPLOYED" "Green"
Line "  ==========================================" "Green"
Line ""
Line "  Two more steps (printed above, or send Claude the WICKDUEL address):" "White"
Line "    1. referee env:  echo <addr> | npx vercel env add DUEL_ADDR production   then  npx vercel deploy --prod --yes" "Gray"
Line "    2. game:         cd ..\wick-shooter && node build.mjs && npx vercel deploy --prod --yes" "Gray"
Line ""
Read-Host "  Press Enter to close"
