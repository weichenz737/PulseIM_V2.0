$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$mobileDir = Join-Path $root 'frontend\mobile'

Push-Location $mobileDir
try {
    # The server serves the mobile web under /pulseim/ (see nginx.path.conf).
    # VITE_DEPLOY_PREFIX makes Vite emit /pulseim/... asset URLs and makes the
    # app call the same-origin /pulseim/api and /pulseim/ws endpoints.
    $env:VITE_DEPLOY_PREFIX = '/pulseim'
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm build failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}

$artifactDist = Join-Path (Join-Path $root 'deploy\artifacts\mobile') 'dist'
if (Test-Path -LiteralPath $artifactDist) {
    Remove-Item -LiteralPath $artifactDist -Recurse -Force
}
Copy-Item -LiteralPath (Join-Path $mobileDir 'dist') -Destination $artifactDist -Recurse

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$out = Join-Path (Join-Path $root 'deploy\artifacts') "pulse-mobile-web-$stamp.tgz"
tar -czf $out -C $mobileDir dist
Write-Host "Built and packaged: $out"
