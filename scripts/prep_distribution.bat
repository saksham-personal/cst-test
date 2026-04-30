@echo off
setlocal enabledelayedexpansion

rem ============================================================
rem  prep_distribution.bat
rem  Developer one-time script — run this on a machine that has
rem  Python 3.11+ and Node.js installed.
rem
rem  What it does:
rem    1. Copies the system Python into python_runtime\ (embeds it)
rem    2. Installs all Python packages into python_runtime\
rem    3. Downloads wheel files to packages\ for offline re-installs
rem    4. Builds the React frontend into frontend\dist\
rem    5. Writes .setup_complete
rem ============================================================

cd /d "%~dp0.."
set ROOT=%CD%

echo === Company Screener Distribution Prep ===
echo Root: %ROOT%
echo.

rem ---- 1. Locate system Python ----
where python >nul 2>&1
if errorlevel 1 (
    echo ERROR: 'python' not found in PATH. Install Python 3.11+ first.
    goto :fail
)
for /f "delims=" %%P in ('where python') do set SYS_PYTHON=%%P
echo Found Python: %SYS_PYTHON%

rem ---- 2. Create python_runtime from embedded zip ----
rem  Check if already present
if exist "%ROOT%\python_runtime\python.exe" (
    echo python_runtime\ already exists — skipping extraction.
    goto :pip_install
)

rem  Look for a python-3.*.x-embed-amd64.zip in tools\
set EMBED_ZIP=
for %%F in ("%ROOT%\tools\python-3.*-embed-amd64.zip") do set EMBED_ZIP=%%F

if not defined EMBED_ZIP (
    echo.
    echo No embedded Python zip found in tools\.
    echo Downloading Python 3.11.9 embeddable package...
    mkdir "%ROOT%\tools" 2>nul
    powershell -Command "Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip' -OutFile '%ROOT%\tools\python-3.11.9-embed-amd64.zip'"
    if errorlevel 1 ( echo ERROR: Download failed.; goto :fail )
    set EMBED_ZIP=%ROOT%\tools\python-3.11.9-embed-amd64.zip
)

echo Extracting embedded Python...
mkdir "%ROOT%\python_runtime" 2>nul
powershell -Command "Expand-Archive -Path '%EMBED_ZIP%' -DestinationPath '%ROOT%\python_runtime' -Force"
if errorlevel 1 ( echo ERROR: Extraction failed.; goto :fail )

rem  Enable site-packages in embedded Python (edit python311._pth)
for %%F in ("%ROOT%\python_runtime\python3*._pth") do (
    powershell -Command "(Get-Content '%%F') -replace '#import site','import site' | Set-Content '%%F'"
)

rem  Bootstrap pip
echo Bootstrapping pip in embedded Python...
powershell -Command "Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile '%ROOT%\tools\get-pip.py'"
"%ROOT%\python_runtime\python.exe" "%ROOT%\tools\get-pip.py" --no-warn-script-location
if errorlevel 1 ( echo ERROR: pip bootstrap failed.; goto :fail )

:pip_install
rem ---- 3. Install all packages into python_runtime ----
echo.
echo Installing Python packages into python_runtime\...
"%ROOT%\python_runtime\python.exe" -m pip install ^
    -r "%ROOT%\backend\requirements.txt" ^
    -r "%ROOT%\launcher\requirements.txt" ^
    --no-warn-script-location
if errorlevel 1 ( echo ERROR: pip install failed.; goto :fail )

rem ---- 4. Download wheels to packages\ for offline analyst setup ----
echo.
echo Downloading wheel cache to packages\ (for offline installs)...
mkdir "%ROOT%\packages" 2>nul
"%ROOT%\python_runtime\python.exe" -m pip download ^
    -r "%ROOT%\backend\requirements.txt" ^
    -r "%ROOT%\launcher\requirements.txt" ^
    -d "%ROOT%\packages" ^
    --no-warn-script-location
if errorlevel 1 ( echo WARNING: wheel download failed — offline installs may not work. )

rem ---- 5. Build the React frontend ----
echo.
echo Building React frontend...
where npm >nul 2>&1
if errorlevel 1 (
    echo ERROR: 'npm' not found. Install Node.js and rerun.
    goto :fail
)
cd "%ROOT%\frontend"
call npm install
if errorlevel 1 ( echo ERROR: npm install failed.; goto :fail )
call npm run build
if errorlevel 1 ( echo ERROR: npm run build failed.; goto :fail )
cd "%ROOT%"

rem ---- 6. Mark setup complete ----
echo ok > "%ROOT%\.setup_complete"

echo.
echo ====================================================
echo  Distribution prep COMPLETE.
echo  Ship the entire CompanyScreener\ folder EXCEPT:
echo    node_modules\  ^(too large^)
echo    __pycache__\   ^(auto-generated^)
echo    .git\          ^(source control^)
echo  Everything else — including python_runtime\,
echo  packages\, frontend\dist\ — should be included.
echo ====================================================
goto :end

:fail
echo.
echo Prep script FAILED. See errors above.
pause
exit /b 1

:end
pause
endlocal
