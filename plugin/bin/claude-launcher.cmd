@echo off
setlocal enabledelayedexpansion

set "LAUNCHER_DIR=%~dp0"
if "%LAUNCHER_DIR:~-1%"=="\" set "LAUNCHER_DIR=%LAUNCHER_DIR:~0,-1%"
set "REAL_CLAUDE="

for /f "delims=" %%i in ('where claude 2^>nul') do (
    set "D=%%~dpi"
    if "!D:~-1!"=="\" set "D=!D:~0,-1!"
    if /i not "!D!"=="!LAUNCHER_DIR!" if not defined REAL_CLAUDE set "REAL_CLAUDE=%%i"
)

if defined REAL_CLAUDE goto :launch

echo [claude-code-zh-cn] real claude executable not found
exit /b 127

:launch
endlocal & set "ZH_CN_REAL_CLAUDE=%REAL_CLAUDE%" & "%REAL_CLAUDE%" %*
