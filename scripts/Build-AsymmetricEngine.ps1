param([ValidateRange(1,4)][int]$Jobs=2)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
Push-Location $projectRoot
try {
    & node scripts/patch-asymmetric-engine.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Asymmetric patch failed; build and validate the base recovery engine first.' }
    $previousPath=$env:PATH
    try {
        $env:PATH=(Join-Path $projectRoot '.tools\toolchains\w64devkit\bin')+';'+$previousPath
        & '.tools/toolchains/w64devkit/bin/make.exe' -C '.tools/engines/meguru-asymmetric-v1/source' "-j$Jobs" normal COMPILER=g++ TARGET_CPU=AVX2 YANEURAOU_EDITION=YANEURAOU_ENGINE_NNUE ENGINE_NAME=MeguruShogi-Asymmetric-1 LTOFLAGS= *> .tools/engines/meguru-asymmetric-v1/build.log
        if ($LASTEXITCODE -ne 0) { throw 'Build failed; see .tools/engines/meguru-asymmetric-v1/build.log' }
    } finally { $env:PATH=$previousPath }
    & node scripts/finalize-asymmetric-engine.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Build manifest failed' }
} finally { Pop-Location }
