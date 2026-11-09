@echo off
setlocal
cd /d "%~dp0\..\.."
if not exist "logs" mkdir "logs"
"%~1" scripts\start-production.mjs >> logs\application.log 2>&1
exit /b %errorlevel%
