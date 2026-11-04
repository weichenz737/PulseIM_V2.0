@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\..\tools\local-dev.ps1" -Action Desktop
if errorlevel 1 (
    echo.
    echo 电脑端启动失败，请查看上面的错误和 .local\dev-logs。
    pause
    exit /b 1
)
start "" "http://127.0.0.1:5175/"
endlocal
