param(
    [ValidateSet('Start', 'Desktop', 'Status', 'Stop')]
    [string]$Action = 'Start'
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$local = Join-Path $root '.local'
$logDir = Join-Path $local 'dev-logs'
$postgresData = Join-Path $local 'postgres-data'
$postgresPort = 15432
$redisPort = 16379

function Get-PortOwner([int]$port) {
    $connection = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $connection) { return $null }
    return Get-CimInstance Win32_Process -Filter "ProcessId=$($connection.OwningProcess)"
}

function Assert-PortOwner([int]$port, [string]$marker) {
    $owner = Get-PortOwner $port
    if (-not $owner) { return $false }
    $command = [string]$owner.CommandLine
    if ($command.Replace('\', '/').IndexOf($marker.Replace('\', '/'), [StringComparison]::OrdinalIgnoreCase) -lt 0) {
        throw "端口 $port 已被其他程序占用：PID $($owner.ProcessId) $command"
    }
    return $true
}

function Wait-Port([int]$port, [int]$seconds = 60) {
    for ($i = 0; $i -lt $seconds; $i++) {
        if (Get-PortOwner $port) { return }
        Start-Sleep -Seconds 1
    }
    throw "端口 $port 在 $seconds 秒内未就绪，请查看 $logDir 中的日志。"
}

function Resolve-PgCtl {
    $service = Get-CimInstance Win32_Service -Filter "Name='postgresql-x64-16'" -ErrorAction SilentlyContinue
    if ($service -and $service.PathName -match '(?i)([A-Z]:\\.*?pg_ctl\.exe)') {
        $candidate = $Matches[1]
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    $command = Get-Command pg_ctl.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    throw '未找到 PostgreSQL 16 的 pg_ctl.exe。请安装 PostgreSQL 16 或将其 bin 目录加入 PATH。'
}

function Resolve-Java {
    $bundled = Join-Path $local 'tools/jdk-21.0.12.1+1/bin/java.exe'
    if (Test-Path -LiteralPath $bundled) { return $bundled }
    if ($env:JAVA_HOME) {
        $candidate = Join-Path $env:JAVA_HOME 'bin/java.exe'
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    $command = Get-Command java.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    throw '未找到 Java。请安装 JDK 21。'
}

function Start-Postgres {
    if (-not (Test-Path -LiteralPath (Join-Path $postgresData 'PG_VERSION'))) {
        throw "项目数据库尚未初始化：$postgresData"
    }
    $marker = $postgresData.Replace('\', '/')
    if (Assert-PortOwner $postgresPort $marker) { return }
    $pgCtl = Resolve-PgCtl
    & $pgCtl -D $postgresData -l (Join-Path $logDir 'postgres.log') -o "-h 127.0.0.1 -p $postgresPort" start
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL 启动失败。' }
    Wait-Port $postgresPort 30
}

function Start-Container([string]$name, [int]$port, [string[]]$createArgs) {
    $existing = & docker.exe ps -a --filter "name=^/${name}$" --format '{{.Names}}' 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop 未运行。Redis 和 MinIO 需要 Docker。' }
    if ($existing -contains $name) {
        & docker.exe update --restart unless-stopped $name | Out-Null
        & docker.exe start $name | Out-Null
    } else {
        & docker.exe @createArgs | Out-Null
    }
    if ($LASTEXITCODE -ne 0) { throw "容器 $name 启动失败。" }
    Wait-Port $port 45
}

function Assert-ContainerPort([string]$name, [int]$port) {
    $running = & docker.exe ps --filter "name=^/${name}$" --format '{{.Names}}' 2>$null
    if ($LASTEXITCODE -ne 0 -or $running -notcontains $name) {
        throw "端口 $port 已被占用，但 $name 容器未运行。请检查端口占用。"
    }
}

function Start-Infrastructure {
    Start-Postgres
    if (-not (Get-PortOwner $redisPort)) {
        $redisData = Join-Path $local 'redis-data'
        New-Item -ItemType Directory -Force -Path $redisData | Out-Null
        Start-Container 'pulseim-local-redis' $redisPort @(
            'run', '-d', '--name', 'pulseim-local-redis', '--restart', 'unless-stopped',
            '-p', '127.0.0.1:16379:6379',
            '--mount', "type=bind,source=$redisData,target=/data",
            'redis:7-alpine', 'redis-server', '--appendonly', 'yes'
        )
    } else {
        Assert-ContainerPort 'pulseim-local-redis' $redisPort
        & docker.exe update --restart unless-stopped pulseim-local-redis | Out-Null
    }
    if (-not (Get-PortOwner 19090)) {
        Start-Container 'pulseim-local-minio' 19090 @(
            'run', '-d', '--name', 'pulseim-local-minio', '--restart', 'unless-stopped',
            '-p', '127.0.0.1:19090:9000', '-p', '127.0.0.1:19091:9001',
            '-v', 'pulseim_local_minio:/data',
            '-e', 'MINIO_ROOT_USER=minioadmin', '-e', 'MINIO_ROOT_PASSWORD=minioadmin',
            'ghcr.io/coollabsio/minio:latest', 'server', '/data', '--console-address', ':9001'
        )
    } else {
        Assert-ContainerPort 'pulseim-local-minio' 19090
    }
}

function Start-JavaService([string]$name, [int]$port, [string]$jar) {
    if (Assert-PortOwner $port $jar) { return }
    $jarPath = Join-Path $root "backend/$jar"
    if (-not (Test-Path -LiteralPath $jarPath)) { throw "缺少后端构建产物：$jarPath" }
    $env:DB_PORT = [string]$postgresPort
    $env:REDIS_PORT = [string]$redisPort
    $env:MINIO_ENDPOINT = 'http://127.0.0.1:19090'
    $env:MINIO_PUBLIC_URL = 'http://127.0.0.1:19090/pulse-avatar'
    $env:PULSE_UPLOAD_DIR = Join-Path $root 'backend/uploads'
    Start-Process -FilePath (Resolve-Java) -ArgumentList @('-jar', $jarPath) `
        -WorkingDirectory (Join-Path $root 'backend') -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logDir "$name.out.log") `
        -RedirectStandardError (Join-Path $logDir "$name.err.log") | Out-Null
    Wait-Port $port 90
}

function Start-Vite([string]$name, [int]$port, [string]$bindAddress) {
    $work = Join-Path $root "frontend/$name"
    $vite = Join-Path $work 'node_modules/vite/bin/vite.js'
    if (Assert-PortOwner $port $vite) { return }
    if (-not (Test-Path -LiteralPath $vite)) { throw "缺少 $name 的 npm 依赖，请先在 $work 运行 npm install。" }
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    Start-Process -FilePath $node -ArgumentList @($vite, '--host', $bindAddress, '--port', [string]$port, '--strictPort') `
        -WorkingDirectory $work -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logDir "$name.out.log") `
        -RedirectStandardError (Join-Path $logDir "$name.err.log") | Out-Null
    Wait-Port $port 30
}

function Show-Status {
    foreach ($item in @(
        @('PostgreSQL', 15432), @('Redis', 16379), @('MinIO', 19090),
        @('API', 8080), @('IM', 9001), @('Mobile', 5173), @('Admin', 5174), @('Desktop', 5175)
    )) {
        $owner = Get-PortOwner ([int]$item[1])
        $state = if ($owner) { "运行中 PID $($owner.ProcessId)" } else { '未运行' }
        Write-Host ("{0,-12} {1,-6} {2}" -f $item[0], $item[1], $state)
    }
    Write-Host '移动端: http://127.0.0.1:5173/'
    Write-Host '管理后台: http://127.0.0.1:5174/admin/'
    Write-Host '电脑端: http://127.0.0.1:5175/'
}

function Enable-AndroidReverse {
    $adb = Get-Command adb.exe -ErrorAction SilentlyContinue
    if (-not $adb) { return }
    $connected = & $adb.Source devices 2>$null |
        Select-String -Pattern "`tdevice$" |
        Select-Object -First 1
    if (-not $connected) { return }
    foreach ($port in @(5173, 8080, 9001)) {
        & $adb.Source reverse "tcp:$port" "tcp:$port" | Out-Null
    }
    Write-Host 'Android ADB 转发: 5173 / 8080 / 9001 已启用'
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
switch ($Action) {
    'Start' {
        Start-Infrastructure
        Start-JavaService 'api' 8080 'pulse-api/target/pulse-api-1.0.0-SNAPSHOT.jar'
        Start-JavaService 'im' 9001 'pulse-im-server/target/pulse-im-server-1.0.0-SNAPSHOT.jar'
        Start-Vite 'mobile' 5173 '0.0.0.0'
        Start-Vite 'admin' 5174 '127.0.0.1'
        Start-Vite 'desktop' 5175 '127.0.0.1'
        Enable-AndroidReverse
        Show-Status
    }
    'Desktop' {
        Start-Vite 'desktop' 5175 '127.0.0.1'
        Show-Status
    }
    'Status' { Show-Status }
    'Stop' {
        foreach ($item in @(
            @('mobile', 5173), @('admin', 5174), @('desktop', 5175),
            @('pulse-api', 8080), @('pulse-im-server', 9001)
        )) {
            $owner = Get-PortOwner ([int]$item[1])
            if ($owner -and ([string]$owner.CommandLine).Contains([string]$item[0])) {
                Stop-Process -Id $owner.ProcessId
            }
        }
        Show-Status
    }
}
