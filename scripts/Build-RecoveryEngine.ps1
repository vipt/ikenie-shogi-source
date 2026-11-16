param(
    [ValidateRange(1,4)][int]$Jobs = 2,
    [string]$SevenZip = 'C:\Program Files\7-Zip\7z.exe'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$engineRoot = Join-Path $projectRoot '.tools\engines\meguru-v1'
$toolRoot = Join-Path $projectRoot '.tools\toolchains'
$lock = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'usi-engine-lock.json') -Raw | ConvertFrom-Json
if (-not (Test-Path -LiteralPath $SevenZip)) { throw '7-Zip is required. Pass -SevenZip with its path.' }
if (-not [System.Runtime.Intrinsics.X86.Avx2]::IsSupported -or -not [System.Runtime.Intrinsics.X86.Bmi2]::IsSupported) {
    throw 'This Windows build requires AVX2 and BMI2.'
}
& (Join-Path $PSScriptRoot 'Install-UsiEngine.ps1') -SevenZip $SevenZip
New-Item -ItemType Directory -Force $toolRoot,$engineRoot | Out-Null
$toolArchive = Join-Path $toolRoot 'w64devkit-x64-2.11.0.7z.exe'
if (-not (Test-Path -LiteralPath $toolArchive)) {
    Invoke-WebRequest 'https://github.com/skeeto/w64devkit/releases/download/v2.11.0/w64devkit-x64-2.11.0.7z.exe' -OutFile $toolArchive
}
if ((Get-FileHash -LiteralPath $toolArchive).Hash -ne '54C2BB9962E8A30C8270E34C5EFC3D5FEE579F53087FA7D435B95FBBA2AF7B2B') {
    throw 'Toolchain SHA256 mismatch'
}
$compilerBin = Join-Path $toolRoot 'w64devkit\bin'
if (-not (Test-Path -LiteralPath (Join-Path $compilerBin 'g++.exe'))) {
    & $SevenZip x $toolArchive "-o$toolRoot" -y | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Toolchain extraction failed' }
}
$sourceArchive = Join-Path $projectRoot '.tools\engines\downloads\yaneuraou-V900-git-win64-all.7z'
if ((Get-FileHash -LiteralPath $sourceArchive).Hash.ToLowerInvariant() -ne $lock.engine.archiveSha256) {
    throw 'Upstream archive SHA256 mismatch'
}
# Restore pristine upstream source before applying the checked local patch.
& $SevenZip x $sourceArchive "-o$engineRoot" 'source/*' -y | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Source extraction failed' }
& node (Join-Path $PSScriptRoot 'patch-recovery-engine.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Recovery patch failed' }
$previousPath = $env:PATH
try {
    $env:PATH = "$compilerBin;$previousPath"
    & (Join-Path $compilerBin 'make.exe') -C (Join-Path $engineRoot 'source') "-j$Jobs" normal COMPILER=g++ TARGET_CPU=AVX2 YANEURAOU_EDITION=YANEURAOU_ENGINE_NNUE ENGINE_NAME=MeguruShogi-Recovery-1 LTOFLAGS= 2>&1 |
        Tee-Object -FilePath (Join-Path $engineRoot 'build.log') | Select-Object -Last 3
    if ($LASTEXITCODE -ne 0) { throw 'Recovery engine build failed; see .tools/engines/meguru-v1/build.log' }
} finally {
    $env:PATH = $previousPath
}
& node (Join-Path $PSScriptRoot 'finalize-recovery-engine.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Build manifest failed' }
Write-Output 'Built MeguruShogi-Recovery-1. Run npm run engine:recovery:validate to verify.'

