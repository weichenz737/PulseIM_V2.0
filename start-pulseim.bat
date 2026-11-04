@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\local-dev.ps1" -Action Start
if errorlevel 1 (
    echo.
    echo PulseIM 启动失败，请查看上面的错误和 .local\dev-logs。
    pause
    exit /b 1
)
echo.
echo PulseIM 本地服务已就绪。
endlocal
