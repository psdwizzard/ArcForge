@echo off
echo Restarting server via nodemon...
copy /b "server\server.js" +,, "server\server.js" > nul
echo Server restart triggered.
exit

