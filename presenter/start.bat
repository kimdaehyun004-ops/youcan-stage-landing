@echo off
chcp 65001 >nul
setlocal
set "PORT=8123"
set "URL=http://localhost:%PORT%/presenter/"
cd /d "%~dp0.."

set "CMD="
py -3 --version >/dev/null 2>&1 && set "CMD=py -3 -m http.server %PORT% --bind 127.0.0.1"
if not defined CMD python --version >/dev/null 2>&1 && set "CMD=python -m http.server %PORT% --bind 127.0.0.1"
if not defined CMD node --version >/dev/null 2>&1 && set "CMD=npx --yes http-server -p %PORT% -a 127.0.0.1 -c-1"

if not defined CMD (
  echo.
  echo   [!] Python 또는 Node.js 가 필요합니다.
  echo       https://www.python.org/downloads/ 에서 Python 설치 시
  echo       설치할 때 "Add python.exe to PATH" 를 꼭 체크하세요.
  echo.
  pause
  exit /b 1
)

echo.
echo   유캔 프리젠터
echo   --------------------------------------------
echo   주소 : %URL%
echo   브라우저 : Chrome 또는 Edge 에서 여세요
echo   종료 : 이 창을 닫으면 서버가 멈춥니다
echo.
start "" "%URL%"
%CMD%
