@echo off
chcp 65001 >nul
title 启动 PulseIM

echo ========================================
echo 正在启动 PulseIM
echo ========================================

cd /d "E:\Desk\PulseIM（脉冲）\deploy"

if errorlevel 1 (
    echo.
    echo [错误] 找不到 PulseIM deploy 目录
    echo 当前配置目录：
    echo E:\Desk\PulseIM（脉冲）\deploy
    pause
    exit /b 1
)

echo.
echo [1/3] 检查 Docker...

docker info >nul 2>&1

if errorlevel 1 (
    echo.
    echo [错误] Docker Desktop 尚未启动
    echo 请先启动 Docker Desktop，等待启动完成后再运行此脚本
    pause
    exit /b 1
)

echo Docker 已启动

echo.
echo [2/3] 启动 PulseIM 容器...

docker compose -f docker-compose.yml -f docker-compose.wallet-fixed.yml up -d

if errorlevel 1 (
    echo.
    echo [错误] PulseIM 启动失败
    echo 请查看上面的 Docker 错误信息
    pause
    exit /b 1
)

echo.
echo [3/3] 查看容器状态...

docker compose -f docker-compose.yml -f docker-compose.wallet-fixed.yml ps

echo.
echo ========================================
echo PulseIM 启动命令执行完成
echo 浏览器访问：http://localhost
echo ========================================

pause
