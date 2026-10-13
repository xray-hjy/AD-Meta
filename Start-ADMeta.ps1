param([ValidateSet('backend', 'frontend', 'worker', 'worker-test', 'prepare', 'verify')][string]$Service = 'frontend')

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$runtime = Join-Path $PSScriptRoot 'frontend\.tmp\runtime'
$nodeMarker = Join-Path $runtime 'node-path.txt'
if (Test-Path -LiteralPath $nodeMarker) {
    $nodeDirectory = Join-Path $runtime (Get-Content -LiteralPath $nodeMarker -Raw).Trim()
    $env:PATH = "$nodeDirectory;$env:PATH"
}
if ([int]((node --version) -replace '^v(\d+).*', '$1') -lt 22) {
    throw 'Node.js 22 or newer is required.'
}

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
    'frontend' { npm run dev:frontend }
    'prepare' { npm run prepare:runtime }
    'verify' { npm run verify }
    'worker' { Invoke-WorkerScript 'server.R' }
    'worker-test' { Invoke-WorkerScript 'tests/model_smoke.R' }
}
exit $LASTEXITCODE
