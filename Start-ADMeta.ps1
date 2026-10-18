param([ValidateSet('backend', 'frontend', 'worker', 'worker-test', 'prepare', 'verify', 'gmrepo', 'build', 'preview', 'benchmark')][string]$Service = 'frontend')

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
. (Join-Path $PSScriptRoot 'scripts\runtime-paths.ps1')
$runtime = Resolve-ADMetaRuntime $PSScriptRoot
$nodeMarker = Join-Path $runtime 'node-path.txt'
if (Test-Path -LiteralPath $nodeMarker) {
    $nodeDirectory = Join-Path $runtime (Get-Content -LiteralPath $nodeMarker -Raw).Trim()
    $env:PATH = "$nodeDirectory;$env:PATH"
}
$nodeVersion = node --version
if ([version]($nodeVersion -replace '^v', '') -lt [version]'22.12.0') {
    throw 'Node.js 22.12.0 or newer is required.'
}
Write-Host "AD-Meta: $Service | Node $nodeVersion | runtime: $runtime"

function Invoke-WorkerScript([string]$Script) {
    $env:R_LIBS_USER = Join-Path $runtime 'r-library'
    $env:RENV_PATHS_ROOT = Join-Path $runtime 'renv'
    $env:RENV_PATHS_LIBRARY = Join-Path $runtime 'worker-library'
    $env:RENV_PATHS_SANDBOX = Join-Path $runtime 'renv\sandbox'
    $env:LC_ALL = 'C'
    $rscript = Join-Path $runtime 'R-4.5.2\bin\Rscript.exe'
    if (!(Test-Path -LiteralPath $rscript)) { $rscript = 'Rscript' }
    Set-Location -LiteralPath (Join-Path $PSScriptRoot 'stats-worker')
    & $rscript $Script
}

switch ($Service) {
    'backend' { npm run dev:backend }
    'frontend' { Write-Host 'Development: http://127.0.0.1:3000'; npm run dev:frontend }
    'prepare' { npm run prepare:runtime }
    'gmrepo' { npm run setup:gmrepo }
    'verify' { npm run verify }
    'build' { npm run build }
    'preview' { Write-Host 'Build preview: http://127.0.0.1:4173'; npm run preview }
    'benchmark' { npm run benchmark:startup }
    'worker' { Invoke-WorkerScript 'server.R' }
    'worker-test' { Invoke-WorkerScript 'tests/model_smoke.R' }
}
exit $LASTEXITCODE
