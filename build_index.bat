@echo off
echo Building Company Screener Index...
cd /d "%~dp0"
python build_index.py --input master_companies.xlsx --output search_index_exact
echo.
echo Index build complete.
pause
