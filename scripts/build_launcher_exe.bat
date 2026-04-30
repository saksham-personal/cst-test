@echo off
rem ============================================================
rem  build_launcher_exe.bat
rem  Compiles launcher\launcher.py into a standalone exe using
rem  PyInstaller.
rem
rem  IMPORTANT: Uses the SYSTEM Python (not python_runtime\), because
rem  the Python embeddable package does not include tkinter, which
rem  customtkinter requires.  Make sure Python 3.11+ is in PATH.
rem
rem  Output: dist\CompanyScreenerLauncher.exe
rem  Copy to the repo root before zipping the distribution.
rem ============================================================

cd /d "%~dp0.."
set ROOT=%CD%

where python >nul 2>&1
if errorlevel 1 (
    echo ERROR: 'python' not found in PATH.
    echo Install Python 3.11+ from python.org and ensure it is in PATH.
    pause
    exit /b 1
)

echo Installing PyInstaller and launcher deps into system Python...
python -m pip install pyinstaller customtkinter psutil --no-warn-script-location

echo.
echo Compiling launcher (using system Python with tkinter)...
python -m PyInstaller ^
    --onefile ^
    --noconsole ^
    --name "CompanyScreenerLauncher" ^
    --distpath "%ROOT%\dist" ^
    --workpath "%ROOT%\build" ^
    --specpath "%ROOT%\build" ^
    "%ROOT%\launcher\launcher.py"

if errorlevel 1 (
    echo.
    echo ERROR: PyInstaller failed.
    pause
    exit /b 1
)

echo.
echo ====================================================
echo  Built: %ROOT%\dist\CompanyScreenerLauncher.exe
echo  Copy this file to the root of the distribution folder.
echo  Analysts can double-click it instead of Launch.bat.
echo ====================================================
pause
