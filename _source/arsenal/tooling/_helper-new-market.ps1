# WICK ARSENAL — deploy the upgraded marketplace (tier offers).
# Double-click NEW-MARKET.cmd instead of running this directly.
# Key is typed here, held in memory only, never written to disk or history.

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
function Line { param($t,$c="Gray") Write-Host $t -ForegroundColor $c }

Clear-Host
Line ""
Line "  ==========================================" "DarkYellow"
Line "     UPGRADE THE MARKETPLACE" "Yellow"
Line "  ==========================================" "DarkYellow"
Line ""
Line "  Adds TIER BIDS: 'I'll pay X for ANY Marksman'," "White"
Line "  which ANY holder of that gun type can fill." "White"
Line ""
Line "  Your NFTs are NOT touched. Only the trading venue changes." "White"
Line ""
Line "  Heads up - the old marketplace keeps working, but:" "DarkYellow"
Line "    * current listings must be re-listed on the new one"
Line "    * anyone with an escrowed bid should cancel it on the old"
Line "      contract to get their PLS back, then re-bid"
Line ""

$nodeDirs = @("C:\Users\Bia\New folder\pangle-agent\node\node-v24.17.0-win-x64","C:\Program Files\nodejs")
$node = $null
foreach ($d in $nodeDirs) { if (Test-Path (Join-Path $d "node.exe")) { $node = Join-Path $d "node.exe"; break } }
if (-not $node) { $c = Get-Command node -ErrorAction SilentlyContinue; if ($c) { $node = $c.Source } }
if (-not $node) { Line "  ERROR: node.exe not found." "Red"; Read-Host "`n  Press Enter to close"; exit 1 }
foreach ($f in @("deploy-market.mjs","out\deployed.json","out\WickMarket.json")) {
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
if ($key.Length -eq 0) { Line "`n  Cancelled - nothing deployed." "Yellow"; Read-Host "`n  Press Enter to close"; exit 1 }
if ($key -notmatch '^(0x)?[0-9a-fA-F]{64}$') { Line "`n  Not a valid private key." "Red"; $key=$null; Read-Host "`n  Press Enter to close"; exit 1 }
if ($key -notmatch '^0x') { $key = "0x$key" }

Line ""
Line "  Type  UPGRADE  and press Enter. Anything else cancels." "Yellow"
$go = Read-Host "  Confirm"
if ($go.Trim().ToUpper() -ne "UPGRADE") { Line "`n  Cancelled - nothing deployed." "Yellow"; $key=$null; Read-Host "`n  Press Enter to close"; exit 1 }

Line ""
Line "  Deploying - do not close this window." "Cyan"
Line "  ------------------------------------------------------------------" "DarkGray"
$env:PRIVATE_KEY = $key
$key = $null
try { & $node "deploy-market.mjs"; $code = $LASTEXITCODE } finally { $env:PRIVATE_KEY = $null }
Line "  ------------------------------------------------------------------" "DarkGray"

if ($code -ne 0) { Line "`n  DID NOT COMPLETE - send the text above to Claude." "Red"; Read-Host "`n  Press Enter to close"; exit 1 }

Line ""
Line "  ==========================================" "Green"
Line "     NEW MARKETPLACE IS LIVE" "Green"
Line "  ==========================================" "Green"
Line ""
Line "  Send Claude the NEW MARKET address printed above" "White"
Line "  and he'll publish the updated site." "White"
Line ""
Read-Host "  Press Enter to close"
