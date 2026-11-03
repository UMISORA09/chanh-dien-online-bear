@echo off
setlocal EnableExtensions

title Chanh Dien Tinh Tam - Studio Live Launcher
set "ROOT=%~dp0"
set "LIVE=%~dp0live"

where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] Chua tim thay Node.js. Vui long cai Node.js (ban 20 tro len) roi chay lai.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [LOI] Chua tim thay npm. Vui long cai Node.js roi chay lai.
  pause
  exit /b 1
)

if not exist "%LIVE%\node_modules\ws" (
  echo [1/2] Dang cai dat thu vien cho may chu LIVE...
  pushd "%LIVE%"
  call npm install
  if errorlevel 1 (
    echo [LOI] npm install that bai. Kiem tra ket noi mang va thu lai.
    popd
    pause
    exit /b 1
  )
  popd
)

echo [2/2] Dang khoi dong May chu Chanh Dien tai http://localhost:3000 ...
start "Chanh Dien LIVE Server" /D "%LIVE%" cmd /k npm start

timeout /t 3 /nobreak >nul
start "" "http://localhost:3000/live/control.html"
start "" "http://localhost:3000/index.html"

echo.
echo ========================================================
echo   CHANH DIEN TINH TAM DA KHOI DONG THANH CONG!
echo ========================================================
echo   * Bang dieu khien LIVE: http://localhost:3000/live/control.html
echo   * Man hinh Overlay 9:16: http://localhost:3000/live/overlay.html
echo   * Web tu tap rieng:     http://localhost:3000/index.html
echo ========================================================
echo (De dung may chu, chi can dong cua so cmd "Chanh Dien LIVE Server")
echo.
timeout /t 6 /nobreak >nul
endlocal
