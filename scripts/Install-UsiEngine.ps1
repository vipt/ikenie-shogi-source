param([string]$SevenZip = 'C:\Program Files\7-Zip\7z.exe')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$engineRoot = Join-Path $projectRoot '.tools\engines'
$lock = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'usi-engine-lock.json') -Raw | ConvertFrom-Json
if (-not (Test-Path -LiteralPath $SevenZip)) { throw '7-Zip is required. Pass -SevenZip with its executable path.' }
if (-not [System.Runtime.Intrinsics.X86.Avx2]::IsSupported -or -not [System.Runtime.Intrinsics.X86.Bmi2]::IsSupported) {
    throw 'This build requires Windows x64 with AVX2 and BMI2. Use a matching engine build on other CPUs.'
}
New-Item -ItemType Directory -Force (Join-Path $engineRoot 'downloads') | Out-Null
function Get-CheckedDownload($Url, $Path, $Hash) {
    if (-not (Test-Path -LiteralPath $Path)) { Invoke-WebRequest -Uri $Url -OutFile $Path }
    if ((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Hash) {
        throw "SHA256 mismatch: $Path"
    }
}
$engineArchive = Join-Path $engineRoot 'downloads\yaneuraou-V900-git-win64-all.7z'
$evalArchive = Join-Path $engineRoot 'downloads\hao.7z'
Get-CheckedDownload $lock.engine.url $engineArchive $lock.engine.archiveSha256
Get-CheckedDownload $lock.evaluation.url $evalArchive $lock.evaluation.archiveSha256
# Keep the official source archive locally; extract only the binary needed at runtime.
& $SevenZip x $engineArchive "-o$(Join-Path $engineRoot 'yaneuraou-v9.00')" $lock.engine.archiveEntry -y | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Engine extraction failed' }
& $SevenZip x $evalArchive "-o$(Join-Path $engineRoot 'hao')" -y | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Evaluation extraction failed' }
foreach ($item in @(
    @{ File = $lock.engine.executable; Hash = $lock.engine.sha256 },
    @{ File = $lock.evaluation.file; Hash = $lock.evaluation.sha256 }
)) {
    if ((Get-FileHash -LiteralPath (Join-Path $projectRoot $item.File)).Hash.ToLowerInvariant() -ne $item.Hash) {
        throw "Installed file hash mismatch: $($item.File)"
    }
}
Write-Output 'Installed YaneuraOu V9.00 + Hao. Windows security settings were not changed.'

