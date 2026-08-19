param([string]$Dollars = "1")
$bstr = [IntPtr]::Zero
try {
  Write-Host "  Paste the OWNER private key (hidden). It is never saved." -ForegroundColor Yellow
  $sec  = Read-Host "  key" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  $key  = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
  if ([string]::IsNullOrWhiteSpace($key)) { Write-Host "  Nothing entered." -ForegroundColor Red; exit 1 }
  $env:DUEL_OWNER_KEY = $key.Trim()
  $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  & node.exe "$PSScriptRoot\set-min-usd.mjs" $Dollars
  $ErrorActionPreference = $prev
}
finally {
  $env:DUEL_OWNER_KEY = $null
  if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  Remove-Variable key -ErrorAction SilentlyContinue
  [GC]::Collect()
}
