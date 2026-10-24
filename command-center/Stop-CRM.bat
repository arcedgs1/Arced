@echo off
cd /d "%~dp0"
docker compose --env-file .windows.env stop
if errorlevel 1 echo Could not stop the CRM. Check that Docker Desktop is running.
echo Your saved database and uploaded files have not been deleted.
pause
