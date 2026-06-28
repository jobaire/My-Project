@echo off
setlocal

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "FRONTEND=%ROOT%frontend"
set "PYTHON=%BACKEND%\venv\Scripts\python.exe"

echo Starting Filaminto for web...
echo.

if not exist "%PYTHON%" (
  echo Backend virtual environment was not found:
  echo %PYTHON%
  echo.
  echo Please create/install the backend venv first, then run this file again.
  pause
  exit /b 1
)

if not exist "%FRONTEND%\node_modules" (
  echo Frontend node_modules was not found:
  echo %FRONTEND%\node_modules
  echo.
  echo Please run npm install inside the frontend folder first, then run this file again.
  pause
  exit /b 1
)

start "Filaminto Backend" powershell -NoExit -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath '%BACKEND%'; & '%PYTHON%' -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
start "Filaminto Frontend" powershell -NoExit -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath '%FRONTEND%'; npm run dev -- --host 0.0.0.0 --port 5173"

echo Waiting a few seconds before opening the browser...
timeout /t 5 /nobreak >nul

start "" "http://127.0.0.1:5173"

echo.
echo Filaminto should open at http://127.0.0.1:5173 (this PC)
echo From other devices on the same network: http://192.168.1.105:5173
echo Keep the backend and frontend windows open while using the app.
echo Close those windows when you want to stop Filaminto.
echo.
pause
