@echo off
setlocal
cd /d "%~dp0"

set "SQLITE_INCLUDE=%~dp0vendor\sqlite-amalgamation-3490100"
if not exist "%SQLITE_INCLUDE%\sqlite3ext.h" (
    echo Missing SQLite headers in "%SQLITE_INCLUDE%".
    echo Expected sqlite3.h and sqlite3ext.h from SQLite 3.49.1.
    exit /b 1
)

where x86_64-w64-mingw32-gcc.exe >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    set "CC=x86_64-w64-mingw32-gcc.exe"
) else (
    if exist "C:\cygwin64\bin\x86_64-w64-mingw32-gcc.exe" (
        set "CC=C:\cygwin64\bin\x86_64-w64-mingw32-gcc.exe"
    ) else (
        echo x86_64-w64-mingw32-gcc.exe not found.
        echo Install the MinGW-w64 compiler or add it to PATH.
        exit /b 1
    )
)

echo Building scoring_ext.dll with %CC% ...
"%CC%" -shared -O2 -Wall -Wextra -o scoring_ext.dll scoring_ext.c -I"%SQLITE_INCLUDE%"
if %ERRORLEVEL% NEQ 0 (
    echo BUILD FAILED
    exit /b 1
)

echo Build successful: scoring_ext.dll
