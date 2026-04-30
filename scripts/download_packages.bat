@echo off
rem ============================================================
rem  download_packages.bat
rem  Re-downloads / refreshes the offline wheel cache in packages\
rem  Run this on a machine with internet access whenever you update
rem  backend\requirements.txt or launcher\requirements.txt.
rem ============================================================

cd /d "%~dp0.."
set ROOT=%CD%

if not exist "%ROOT%\python_runtime\python.exe" (
    echo ERROR: python_runtime\ not found.
    echo Run scripts\prep_distribution.bat first.
    pause
    exit /b 1
)

echo Downloading wheels to packages\ ...
mkdir "%ROOT%\packages" 2>nul

"%ROOT%\python_runtime\python.exe" -m pip download ^
    -r "%ROOT%\backend\requirements.txt" ^
    -r "%ROOT%\launcher\requirements.txt" ^
    -d "%ROOT%\packages"

echo.
echo Done. packages\ now contains %ROOT%\packages
pause
