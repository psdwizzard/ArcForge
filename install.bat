@echo off
echo ========================================
echo ArcForge - D^&D 5e Combat Tracker
echo Installation Script
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed!
    echo.
    echo Please install Node.js 18 or newer from:
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM Display Node.js version
echo [OK] Node.js found:
node --version
echo.

REM Check if npm is available
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm is not installed!
    echo.
    echo npm should come with Node.js. Please reinstall Node.js.
    pause
    exit /b 1
)

echo [OK] npm found:
npm --version
echo.

REM Install dependencies
echo ========================================
echo Installing dependencies...
echo ========================================
echo.
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] npm install failed!
    echo Please check your internet connection and try again.
    pause
    exit /b 1
)

echo.
echo ========================================
echo Creating data directories...
echo ========================================
echo.

REM Create data directories if they don't exist
if not exist "data" mkdir data
if not exist "data\encounters" mkdir data\encounters
if not exist "data\characters" mkdir data\characters
if not exist "data\effects" mkdir data\effects
if not exist "data\creatures" mkdir data\creatures
if not exist "uploads" mkdir uploads

echo [OK] Data directories created/verified
echo.

echo ========================================
echo Installation Complete!
echo ========================================
echo.
echo ArcForge has been successfully installed.
echo.
echo Next steps:
echo   1. Run 'start.bat' to launch the server
echo   2. Open your browser to http://localhost:3000
echo   3. Start tracking your D^&D combat!
echo.
echo Additional commands:
echo   - npm run dev    : Run with auto-reload (development)
echo   - kill-server.bat: Stop the server
echo.
pause

