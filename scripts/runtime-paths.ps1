function Resolve-ADMetaRuntime([string]$ProjectRoot) {
    if ($env:AD_META_RUNTIME_ROOT) {
        $configuredRuntime = $env:AD_META_RUNTIME_ROOT
        if (![System.IO.Path]::IsPathRooted($configuredRuntime)) {
            $configuredRuntime = Join-Path $ProjectRoot $configuredRuntime
        }
        $configuredRuntime = [System.IO.Path]::GetFullPath($configuredRuntime)
        if (!(Test-Path -LiteralPath $configuredRuntime -PathType Container)) {
            throw "Configured AD_META_RUNTIME_ROOT does not exist: $configuredRuntime"
        }
        return $configuredRuntime
    }
    $newRuntime = Join-Path $ProjectRoot '.tmp\runtime'
    $legacyRuntime = Join-Path $ProjectRoot 'frontend\.tmp\runtime'
    if (Test-Path -LiteralPath $newRuntime -PathType Container) { return $newRuntime }
    if (Test-Path -LiteralPath $legacyRuntime -PathType Container) { return $legacyRuntime }
    return $newRuntime
}
