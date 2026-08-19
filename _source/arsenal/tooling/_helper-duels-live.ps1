# Brings WICK DUEL online: takes the GitHub token, proves it works BEFORE storing
# it, sets it in Vercel production, redeploys, and waits for the referee.
# The token is held in memory only and wiped in the finally block.
#
# NOTE on native commands: the Vercel CLI writes its banner to stderr on every
# call. Under $ErrorActionPreference = "Stop", piping that through 2>&1 makes
# PowerShell treat a SUCCESSFUL command as a terminating error. So native calls
# below run with Continue and are judged on $LASTEXITCODE only, never on stderr.
$ErrorActionPreference = "Stop"
$bstr = [IntPtr]::Zero
$repo = "mtwhv5ktjr-bot/wick-board"

function Say($m, $c = "Gray") { Write-Host "  $m" -ForegroundColor $c }

function Invoke-Native {
  param([string[]]$Args, $StdIn = $null)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    if ($null -ne $StdIn) { $StdIn | & npx.cmd @Args | Out-Null }
    else { & npx.cmd @Args | Out-Null }
    return $LASTEXITCODE
  } finally { $ErrorActionPreference = $prev }
}

try {
  Say ""
  Say "Paste the GitHub token. It will not be shown as you type." "Yellow"
  $sec = Read-Host "  token" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  $tok  = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)

  if ([string]::IsNullOrWhiteSpace($tok)) { Say "Nothing entered. Stopping." "Red"; exit 1 }
  $tok = $tok.Trim()
  if ($tok -notmatch '^(github_pat_|ghp_)') {
    Say "That does not look like a GitHub token. Nothing was changed." "Red"; exit 1
  }

  # --- prove it works before it goes anywhere ---
  Say ""
  Say "Checking the token against $repo ..." "Cyan"
  $h = @{ Authorization = "Bearer $tok"; "User-Agent" = "wick-duel-setup"; Accept = "application/vnd.github+json" }
  try { $r = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo" -Headers $h -Method Get }
  catch { Say "The token cannot read $repo. Check its repository scope." "Red"
          Say "Nothing was changed." "Red"; exit 1 }
  if (-not $r.permissions.push) {
    Say "The token can READ $repo but cannot WRITE to it." "Red"
    Say "Set Contents to 'Read and write'. Nothing was changed." "Red"; exit 1
  }
  Say "Token is valid and can write. Storing it." "Green"

  # --- store it (replace any existing value) ---
  Say ""
  Say "Setting LB_GH_TOKEN in Vercel production ..." "Cyan"
  Invoke-Native @("--yes","vercel","env","rm","LB_GH_TOKEN","production","--yes") | Out-Null   # absent is fine
  $code = Invoke-Native @("--yes","vercel","env","add","LB_GH_TOKEN","production") $tok
  if ($code -ne 0) { Say "Vercel refused the variable (exit $code). Nothing else changed." "Red"; exit 1 }
  Say "Stored." "Green"

  # --- redeploy so the running deployment picks it up ---
  Say ""
  Say "Redeploying the arsenal (env changes need a fresh deploy) ..." "Cyan"
  $code = Invoke-Native @("--yes","vercel","deploy","--prod","--yes")
  if ($code -ne 0) { Say "Deploy failed (exit $code). The token IS saved; just re-run this." "Red"; exit 1 }
  Say "Deployed." "Green"

  # --- wait for the referee ---
  Say ""
  Say "Waiting for the referee to come online ..." "Cyan"
  $online = $false; $j = $null
  for ($i = 1; $i -le 12; $i++) {
    Start-Sleep -Seconds 5
    try {
      $j = Invoke-RestMethod -Method Get -Uri "https://wick-arsenal.vercel.app/api/duel?info=1&cb=$(Get-Random)"
      if ($j.online) { $online = $true; break }
    } catch {}
    Say "still offline (try $i of 12)"
  }

  Say ""
  if ($online) {
    Say "REFEREE IS ONLINE." "Green"
    Say "Contract $($j.contract)" "Green"
    Say ""
    Say "Tell Claude 'go' - it will run the tests, drive a full duel on the" "Yellow"
    Say "local rig, deploy the shooter and post the announcement." "Yellow"
  } else {
    Say "Still offline after 60s. The token is saved - tell Claude and it will diagnose." "Yellow"
  }
}
finally {
  if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  Remove-Variable tok -ErrorAction SilentlyContinue
  [GC]::Collect()
}
