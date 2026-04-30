@echo off
cd /d "%~dp0"
python_runtime\python.exe launcher\launcher.py
if errorlevel 1 (
    echo.
    echo ERROR: Could not start launcher.
    echo Make sure python_runtime\ exists (run scripts\prep_distribution.bat first^).
    pause
)
