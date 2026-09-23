@echo off
cd /d "%~dp0"
start "가사 프롬프터 서버" cmd /k node server.js
timeout /t 2 >nul
start http://localhost:5500
