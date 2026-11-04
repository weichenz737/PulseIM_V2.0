param([string]$BackendBuildRoot = '')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $BackendBuildRoot) { $BackendBuildRoot = Join-Path $root 'backend' }
$artifactRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'artifacts'))

# Run Maven verify and the three production web builds before this script.
# BackendBuildRoot also accepts an isolated build directory when local JARs
# are held open by the running development services on Windows.
$sources = @{
    api = Join-Path $BackendBuildRoot 'pulse-api/target/pulse-api-1.0.0-SNAPSHOT.jar'
    im = Join-Path $BackendBuildRoot 'pulse-im-server/target/pulse-im-server-1.0.0-SNAPSHOT.jar'
    mobile = Join-Path $root 'frontend/mobile/dist'
    admin = Join-Path $root 'frontend/admin/dist'
    'desktop-web' = Join-Path $root 'frontend/desktop/dist'
}
foreach ($source in $sources.Values) {
    if (-not (Test-Path -LiteralPath $source)) { throw "Build output missing: $source" }
}
foreach ($name in $sources.Keys) {
    $destination = Join-Path $artifactRoot $name
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    if ($name -in @('api', 'im')) {
        Copy-Item -LiteralPath $sources[$name] -Destination $destination -Force
        Copy-Item -LiteralPath (Join-Path $root "docker/$name/Dockerfile.prebuilt") -Destination (Join-Path $destination 'Dockerfile') -Force
    } else {
        $dist = [IO.Path]::GetFullPath((Join-Path $destination 'dist'))
        if (-not $dist.StartsWith($artifactRoot + [IO.Path]::DirectorySeparatorChar)) { throw 'Artifact path escaped workspace' }
        if (Test-Path -LiteralPath $dist) { Remove-Item -LiteralPath $dist -Recurse -Force }
        Copy-Item -LiteralPath $sources[$name] -Destination $dist -Recurse
        Copy-Item -LiteralPath (Join-Path $root 'docker/mobile/Dockerfile.prebuilt') -Destination (Join-Path $destination 'Dockerfile') -Force
        $nginx = if ($name -eq 'admin') { 'docker/admin/nginx.conf' } else { 'docker/mobile/nginx.conf' }
        Copy-Item -LiteralPath (Join-Path $root $nginx) -Destination (Join-Path $destination 'nginx.docker.conf') -Force
    }
}
$revision = (& git -C $root rev-parse HEAD).Trim()
$manifest = @{ revision = $revision; builtAtUtc = [DateTime]::UtcNow.ToString('o'); files = @() }
foreach ($name in $sources.Keys) {
    Get-ChildItem -LiteralPath (Join-Path $artifactRoot $name) -Recurse -File | ForEach-Object {
        $manifest.files += @{ path = $_.FullName.Substring($artifactRoot.Length + 1).Replace('\', '/'); sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
    }
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $artifactRoot 'release-manifest.json') -Encoding utf8
Write-Host "Prepared API, IM, mobile, admin and desktop web artifacts for $revision"
