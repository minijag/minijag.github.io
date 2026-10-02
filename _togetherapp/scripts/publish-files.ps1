param([Parameter(Mandatory=$true)][string]$ApiUrl)
$ErrorActionPreference = 'Stop'
$parsed = [Uri]$ApiUrl
if ($parsed.Scheme -ne 'https' -or $parsed.AbsolutePath -ne '/' -or $parsed.Query -or $parsed.Fragment -or $parsed.UserInfo) { throw 'API URL must be a bare HTTPS origin.' }
$projectRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = Join-Path $projectRoot 'site-repo'
if (-not (Test-Path -LiteralPath (Join-Path $repoRoot '.git'))) { throw 'Expected the website clone at site-repo.' }
$publicRoot = Join-Path $repoRoot 'togetherapp'
$sourceRoot = Join-Path $repoRoot '_togetherapp'
New-Item -ItemType Directory -Path $publicRoot,$sourceRoot -Force | Out-Null
# Explicit allowlists: credentials, private records, logs and tools are never copied.
foreach ($file in @('index.html','style.css','google.css','app.mjs','availability.mjs')) {
  Copy-Item -LiteralPath (Join-Path $projectRoot "web/$file") -Destination (Join-Path $publicRoot $file)
}
$config = 'window.TOGETHER_API = ' + (ConvertTo-Json $parsed.GetLeftPart([UriPartial]::Authority) -Compress) + ';'
Set-Content -LiteralPath (Join-Path $publicRoot 'config.js') -Value $config -Encoding utf8
foreach ($dir in @('server','web','scripts')) {
  $target = Join-Path $sourceRoot $dir
  New-Item -ItemType Directory -Path $target -Force | Out-Null
  Get-ChildItem -LiteralPath (Join-Path $projectRoot $dir) -File | Where-Object { $_.Extension -in @('.mjs','.js','.css','.html','.ps1') } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $target $_.Name)
  }
}
foreach ($file in @('package.json','server.mjs','.gitignore','.env.example','HOSTING.md','README.md')) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination (Join-Path $sourceRoot $file)
}
Write-Host 'Public app and source prepared. Review and test before committing.'
