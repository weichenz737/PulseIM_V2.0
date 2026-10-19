@echo off
setlocal
cd /d "%~dp0"
title Pulse Desktop Dev Server

echo Starting Pulse desktop preview...
curl.exe --silent --fail --max-time 2 "http://127.0.0.1:5173/" >nul 2>&1
if errorlevel 1 (
    echo No desktop server detected. Starting Vite...
    start "Pulse Desktop Dev Server" cmd /k "node ..\mobile\node_modules\vite\bin\vite.js --host 127.0.0.1 --clearScreen false"
    timeout /t 2 /nobreak >nul
) else (
    echo Desktop server is already running on port 5173.
)
start "" /b "http://127.0.0.1:5173/"

echo.
echo Pulse desktop preview: http://127.0.0.1:5173
echo Keep the server window open while previewing.
endlocal
