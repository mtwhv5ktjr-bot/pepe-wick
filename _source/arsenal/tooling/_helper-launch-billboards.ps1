# WICK BILLBOARDS — deploy the self-serve in-game ad contract.
# Double-click LAUNCH-BILLBOARDS.cmd instead of running this directly.
# Key is typed here, held in memory only, never written to disk or history.

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
function Line { param($t,$c="Gray") Write-Host $t -ForegroundColor $c }

Clear-Host
Line ""
Line "  ==========================================" "DarkYellow"
Line "     LAUNCH WICK BILLBOARDS" "Yellow"
Line "  ==========================================" "DarkYellow"
Line ""
Line "  Self-serve in-game advertising:" "White"
Line "    1,000,000 PLS / day  - rotation slot (max 8 a day)" "Gray"
Line "    10,000,000 PLS / day - EXCLUSIVE: the only board that day" "Gray"
Line ""
Line "  Every sale splits IN the purchase transaction:" "Yellow"
Line "  50% buys and burns WICK - 50% to your treasury wallet." "White"
Line "  (Treasury defaults to the deployer; change later with setTreasury.)" "Gray"
Line ""

$nodeDirs = @("C:\Users\Bia\New folder\pangle-agent\node\node-v24.17.0-win-x64","C:\Program Files\nodejs")
$node = $null
foreach ($d in $nodeDirs) { if (Test-Path (Join-Path $d "node.exe")) { $node = Join-Path $d "node.exe"; break } }
if (-not $node) { $c = Get-Command node -ErrorAction SilentlyContinue; if ($c) { $node = $c.Source } }
if (-not $node) { Line "  ERROR: node.exe not found." "Red"; Read-Host "`n  Press Enter to close"; exit 1 }
foreach ($f in @("deploy-mods.mjs","out\WickMods.json","out\WickModsMarket.json")) {
  if (-not (Test-Path $f)) { Line "  ERROR: missing $f" "Red"; Read-Host "`n  Press Enter to close"; exit 1 }
}

$env:RPC_URL = "https://rpc.pulsechain.com"

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
try { & $node "deploy-billboards.mjs"; $code = $LASTEXITCODE } finally { $env:PRIVATE_KEY = $null }
Line "  ------------------------------------------------------------------" "DarkGray"

if ($code -ne 0) { Line "`n  DID NOT COMPLETE - send the text above to Claude." "Red"; Read-Host "`n  Press Enter to close"; exit 1 }

Line ""
Line "  ==========================================" "Green"
Line "     WICK BILLBOARDS ARE LIVE" "Green"
Line "  ==========================================" "Green"
Line ""
Line "  Send Claude the BILLBOARDS_ADDR printed above and he wires" "White"
Line "  the purchase page + the in-game renderer." "White"
Line ""
Read-Host "  Press Enter to close"
