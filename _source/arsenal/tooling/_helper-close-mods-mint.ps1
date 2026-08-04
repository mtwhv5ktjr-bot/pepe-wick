# WICK BILLBOARDS — deploy the self-serve in-game ad contract.
# Double-click LAUNCH-BILLBOARDS.cmd instead of running this directly.
# Key is typed here, held in memory only, never written to disk or history.

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
function Line { param($t,$c="Gray") Write-Host $t -ForegroundColor $c }

Clear-Host
Line ""
Line "  ==========================================" "DarkYellow"
Line "     CLOSE WICK MODS MINT" "Yellow"
Line "  ==========================================" "DarkYellow"
Line ""
Line "  STEP 1 of the MODS II airdrop." "White"
Line "  Closes the v1 free mint so the entitlement snapshot cannot" "Gray"
Line "  move while we work - nobody double-claims across v1 and v2." "Gray"
Line "" "Gray"
Line "  Reversible: setMintOpen(true) puts it back." "DarkGray"
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
Line "  Type  CLOSE  and press Enter. Anything else cancels." "Yellow"
$go = Read-Host "  Confirm"
if ($go.Trim().ToUpper() -ne "CLOSE") { Line "`n  Cancelled - nothing deployed." "Yellow"; $key=$null; Read-Host "`n  Press Enter to close"; exit 1 }

Line ""
Line "  Deploying - do not close this window." "Cyan"
Line "  ------------------------------------------------------------------" "DarkGray"
$env:PRIVATE_KEY = $key
$key = $null
try { & $node "close-mods-mint.mjs"; $code = $LASTEXITCODE } finally { $env:PRIVATE_KEY = $null }
Line "  ------------------------------------------------------------------" "DarkGray"

if ($code -ne 0) { Line "`n  DID NOT COMPLETE - send the text above to Claude." "Red"; Read-Host "`n  Press Enter to close"; exit 1 }

Line ""
Line "  ==========================================" "Green"
Line "     V1 MINT IS CLOSED" "Green"
Line "  ==========================================" "Green"
Line ""
Line "NEXT: run SNAPSHOT-MODS-AIR.cmd to build the airdrop list." "White"
  Line ""
Read-Host "  Press Enter to close"
