@echo off
echo ========================================
echo Restarting ArcForge Server
echo ========================================
echo.

echo [1/2] Stopping existing server (port 3000)...
call kill-server.bat
if %ERRORLEVEL% NEQ 0 (
    echo   Warning: kill-server.bat returned error code %ERRORLEVEL%.
)

echo.
echo [2/2] Launching server...
start "ArcForge Server" cmd /c start.bat

echo.
echo Server restart command issued. If a new window did not appear, check start.bat.
pause

