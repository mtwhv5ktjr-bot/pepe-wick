# WICK BILLBOARDS — deploy the self-serve in-game ad contract.
# Double-click LAUNCH-BILLBOARDS.cmd instead of running this directly.
# Key is typed here, held in memory only, never written to disk or history.

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
function Line { param($t,$c="Gray") Write-Host $t -ForegroundColor $c }

Clear-Host
Line ""
Line "  ==========================================" "DarkYellow"
Line "     SNAPSHOT MODS AIRDROP" "Yellow"
Line "  ==========================================" "DarkYellow"
Line ""
Line "  STEP 2 of the MODS II airdrop." "White"
Line "  Reads the chain and writes the exact list to" "Gray"
Line "  out\\mods-air-plan.json. NOTHING is sent - review it first." "Gray"
Line "" "Gray"
Line "  Your key is not used to send anything in this step." "DarkGray"
Line ""

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
Line "  Type  SNAP  and press Enter. Anything else cancels." "Yellow"
$go = Read-Host "  Confirm"
if ($go.Trim().ToUpper() -ne "SNAP") { Line "`n  Cancelled - nothing deployed." "Yellow"; $key=$null; Read-Host "`n  Press Enter to close"; exit 1 }

Line ""
Line "  Deploying - do not close this window." "Cyan"
Line "  ------------------------------------------------------------------" "DarkGray"
$env:PRIVATE_KEY = $key
$key = $null
try { & $node "snapshot-mods-air.mjs"; $code = $LASTEXITCODE } finally { $env:PRIVATE_KEY = $null }
Line "  ------------------------------------------------------------------" "DarkGray"

if ($code -ne 0) { Line "`n  DID NOT COMPLETE - send the text above to Claude." "Red"; Read-Host "`n  Press Enter to close"; exit 1 }

Line ""
Line "  ==========================================" "Green"
Line "     SNAPSHOT WRITTEN" "Green"
Line "  ==========================================" "Green"
Line ""
Line "NEXT: open out\\mods-air-plan.json and check it," "White"
  Line "      then run LAUNCH-MODS-AIR.cmd" "White"
  Line ""
Read-Host "  Press Enter to close"
