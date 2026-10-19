$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$desktopDir = Join-Path $root 'frontend\desktop'
$artifactDir = Join-Path $root 'deploy\artifacts\desktop-web'
$artifactDist = Join-Path $artifactDir 'dist'

Push-Location $desktopDir
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "desktop build failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}

if (Test-Path -LiteralPath $artifactDist) {
    Remove-Item -LiteralPath $artifactDist -Recurse -Force
}
New-Item -ItemType Directory -Path $artifactDir -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $desktopDir 'dist') -Destination $artifactDist -Recurse

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$out = Join-Path (Join-Path $root 'deploy\artifacts') "pulse-desktop-web-$stamp.tgz"
tar -czf $out -C $desktopDir dist
Write-Host "Built and packaged: $out"
