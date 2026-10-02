param([Parameter(Mandatory=$true)][string]$ApiUrl)
$ErrorActionPreference = 'Stop'
$parsed = [Uri]$ApiUrl
if ($parsed.Scheme -ne 'https' -or $parsed.AbsolutePath -ne '/' -or $parsed.Query -or $parsed.Fragment -or $parsed.UserInfo) { throw 'API URL must be the bare HTTPS tunnel origin.' }
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$running = Get-NetTCPConnection -LocalPort 4174 -State Listen -ErrorAction SilentlyContinue
if ($running) { throw 'Port 4174 is already in use. Do not run two backend processes against the same local database.' }
Write-Host 'Starting Together. Keep this window running while friends use the website.'
$env:PORT = '4174'
$env:WEB_URL = 'https://www.philipgheno.com/togetherapp/'
$env:API_URL = $parsed.GetLeftPart([UriPartial]::Authority)
$env:SERVE_WEB = 'false'
& node server.mjs
