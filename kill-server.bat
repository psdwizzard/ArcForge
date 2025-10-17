@echo off
for /f "tokens=5" %%a in ('netstat -aon ^| find "3000"') do (
    taskkill /F /PID %%a
)
exit
