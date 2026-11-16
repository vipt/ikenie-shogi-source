param([switch]$Web)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath 'node_modules/expo/bin/cli')) {
  Write-Host '先に npm install を実行してください。'
  exit 1
}
if ($Web) { node node_modules/expo/bin/cli start --web --port 8081 }
else { node node_modules/expo/bin/cli start --lan --port 8081 }
