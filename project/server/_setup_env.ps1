$ErrorActionPreference = 'Stop'
$envFile = Join-Path $PSScriptRoot '.env'
$envExample = Join-Path $PSScriptRoot '.env.example'

if (-not (Test-Path $envFile)) {
  if (-not (Test-Path $envExample)) { throw ".env.example not found at $envExample" }
  Copy-Item -Force $envExample $envFile
}

$content = Get-Content $envFile -Raw
$jwtMatch = [regex]::Match($content, '^\s*JWT_SECRET=(.*)$', 'Multiline')
$val = if ($jwtMatch.Success) { $jwtMatch.Groups[1].Value.Trim() } else { '' }
$valid = ($val -match '^[0-9a-f]{64}$' -and $val -notmatch 'CHANGE_ME')

if (-not $valid) {
  $bytes = New-Object 'System.Byte[]' 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $sec = -join ($bytes | ForEach-Object { $_.ToString('x2') })
  if ($jwtMatch.Success) {
    $content = [regex]::Replace($content, '^\s*JWT_SECRET=.*$', "JWT_SECRET=$sec", 'Multiline')
  } else {
    $content = ($content.TrimEnd() + "`nJWT_SECRET=$sec`n")
  }
  Set-Content -NoNewline -Path $envFile -Value $content
}

(Get-Content $envFile) -match '^\s*JWT_SECRET=' | Select-Object -First 1 | Write-Output
