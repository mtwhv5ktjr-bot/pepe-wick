# WICK ARSENAL — sweep pooled PLS into a $WICK burn.
# Double-click BURN-POOL.cmd instead of running this directly.
# Key is typed here, held in memory only, never written to disk or history.

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
function Line { param($t,$c="Gray") Write-Host $t -ForegroundColor $c }

Clear-Host
Line ""
Line "  ==========================================" "DarkYellow"
Line "     BURN THE POOLED PLS" "Yellow"
Line "  ==========================================" "DarkYellow"
Line ""
Line "  Some mints came in with a gas limit too tight for the" "White"
Line "  swap, so their PLS is sitting in the contract instead of" "White"
Line "  being burned. This buys \$WICK with it and burns it." "White"
Line ""
Line "  The money was never at risk and nobody can take it out -" "DarkGray"
Line "  a burn is the only way PLS can leave that contract." "DarkGray"
Line ""

$nodeDirs = @("C:\Users\Bia\New folder\pangle-agent\node\node-v24.17.0-win-x64","C:\Program Files\nodejs")
$node = $null
foreach ($d in $nodeDirs) { if (Test-Path (Join-Path $d "node.exe")) { $node = Join-Path $d "node.exe"; break } }
if (-not $node) { $c = Get-Command node -ErrorAction SilentlyContinue; if ($c) { $node = $c.Source } }
if (-not $node) { Line "  ERROR: node.exe not found." "Red"; Read-Host "`n  Press Enter to close"; exit 1 }
if (-not (Test-Path "burn-pool.mjs")) { Line "  ERROR: burn-pool.mjs missing." "Red"; Read-Host "`n  Press Enter to close"; exit 1 }

$env:RPC_URL = "https://rpc.pulsechain.com"
if (-not $env:SLIPPAGE_PCT) { $env:SLIPPAGE_PCT = "5" }

Line "  Paste any wallet key with a little PLS for gas, then Enter." "White"
Line "  (Nothing appears as you paste - that is normal.)" "DarkGray"
Line ""
$secure = Read-Host "  PRIVATE KEY" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try   { $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
$key = $key.Trim()
if ($key.Length -eq 0) { Line "`n  Cancelled." "Yellow"; Read-Host "`n  Press Enter to close"; exit 1 }
if ($key -notmatch '^(0x)?[0-9a-fA-F]{64}$') { Line "`n  Not a valid private key." "Red"; $key=$null; Read-Host "`n  Press Enter to close"; exit 1 }
if ($key -notmatch '^0x') { $key = "0x$key" }

Line ""
Line "  Type  BURN  and press Enter. Anything else cancels." "Yellow"
$go = Read-Host "  Confirm"
if ($go.Trim().ToUpper() -ne "BURN") { Line "`n  Cancelled." "Yellow"; $key=$null; Read-Host "`n  Press Enter to close"; exit 1 }

Line ""
Line "  ------------------------------------------------------------------" "DarkGray"
$env:PRIVATE_KEY = $key
$key = $null
try { & $node "burn-pool.mjs"; $code = $LASTEXITCODE } finally { $env:PRIVATE_KEY = $null }
Line "  ------------------------------------------------------------------" "DarkGray"
if ($code -ne 0) { Line "`n  Did not complete - send the text above to Claude." "Red" }
else { Line "`n  Done." "Green" }
Read-Host "`n  Press Enter to close"
