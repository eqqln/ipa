@echo off
chcp 65001 >nul
title 极跃棋牌 · 企业级运营系统 启动器

echo.
echo   ============================================================
echo      极跃棋牌 · 企业级运营系统（三端）
echo      后端服务 + Web管理后台 + 桌面游戏客户端
echo   ============================================================
echo.

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo   [错误] 未检测到 Node.js，请先安装 Node.js 18+
  pause
  exit /b 1
)

echo   [1/3] 启动后端服务 (端口 3100)...
start "极跃棋牌-后端服务" cmd /c "cd /d %~dp0server && set PORT=3100 && node src/index.js"
timeout /t 2 /nobreak >nul

echo   [2/3] 启动 Web 管理后台 (端口 5174)...
if not exist "%~dp0admin-web\node_modules" (
  echo        首次运行，正在安装管理后台依赖...
  call cd /d %~dp0admin-web ^&^& npm install
)
start "极跃棋牌-管理后台" cmd /c "cd /d %~dp0admin-web && npm run dev"

echo   [3/3] 启动桌面游戏客户端...
if not exist "%~dp0desktop\node_modules" (
  echo        首次运行，正在安装客户端依赖...
  call cd /d %~dp0desktop ^&^& npm install
)
start "极跃棋牌-桌面客户端" cmd /c "cd /d %~dp0desktop && npm run dev"

echo.
echo   服务启动中，请稍候...
echo   ----------------------------------------------------
echo   🌐 Web 管理后台:  http://localhost:5174
echo     admin / admin123456
echo   💻 桌面客户端:    自动打开 Electron 窗口
echo   ⚙️  后端服务:      http://localhost:3100
echo   ----------------------------------------------------
echo.
echo   关闭对应命令行窗口即可停止服务。
echo.
pause
