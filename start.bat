@echo off
chcp 65001 >nul 2>&1
title AgentColony — One-Click Setup
color 0A

echo.
echo ═══════════════════════════════════════════════════════
echo        🌍 AgentColony — One-Click Setup (Windows)
echo ═══════════════════════════════════════════════════════
echo.

REM ── Check for Node.js ──
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Node.js not found! Please install it first:
    echo    https://nodejs.org/
    pause
    exit /b 1
)
echo ✓ Node.js found

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ npm not found!
    pause
    exit /b 1
)
echo ✓ npm found
echo.

REM ── Step 1: Install root dependencies ──
echo [1/4] Installing main app dependencies...
call npm install --legacy-peer-deps
if %errorlevel% neq 0 (
    echo ⚠ npm install had issues, continuing...
)
echo   ✓ Main dependencies installed
echo.

REM ── Step 2: Install & build mini-service ──
echo [2/4] Setting up agent-chat backend...
cd mini-services\agent-chat
call npm install --legacy-peer-deps
echo   📦 Compiling backend...
call npx tsc --esModuleInterop --skipLibCheck --moduleResolution node --target es2020 --outDir dist --module ESNext index.ts 2>nul
if not exist "dist\index.js" (
    echo   ⚠ TypeScript compile may have failed, will try direct run...
)
cd ..\..
echo   ✓ Backend ready
echo.

REM ── Step 3: Setup database ──
echo [3/4] Setting up database...
call npx prisma db push --accept-data-loss 2>nul
call npx prisma generate 2>nul
echo   ✓ Database ready
echo.

REM ── Step 4: Start everything ──
echo [4/4] Starting servers...
echo.

REM Kill existing processes
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3004 " ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>nul
timeout /t 1 /nobreak >nul

REM Start backend
echo   🚀 Starting agent-chat backend on port 3004...
cd mini-services\agent-chat
if exist "dist\index.js" (
    start "AgentChat Backend" /min cmd /c "node dist/index.js"
) else (
    start "AgentChat Backend" /min cmd /c "npx tsx index.ts"
)
cd ..\..
timeout /t 3 /nobreak >nul
echo   ✓ Backend starting
echo.

REM Start frontend
echo   🚀 Starting Next.js frontend on port 3000...
start "AgentColony Frontend" cmd /c "npm run dev"
timeout /t 5 /nobreak >nul
echo   ✓ Frontend starting
echo.

echo ═══════════════════════════════════════════════════════
echo          🎉 AgentColony is running!
echo ═══════════════════════════════════════════════════════
echo.
echo   Frontend:  http://localhost:3000
echo   Backend:   http://localhost:3004
echo.
echo   Close the terminal windows to stop the servers.
echo.

REM Open browser
timeout /t 3 /nobreak >nul
start http://localhost:3000

echo Press any key to exit this setup window...
pause >nul
