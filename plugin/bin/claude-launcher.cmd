@echo off
setlocal enabledelayedexpansion

set "LAUNCHER_DIR=%~dp0"
if "%LAUNCHER_DIR:~-1%"=="\" set "LAUNCHER_DIR=%LAUNCHER_DIR:~0,-1%"
set "FILTERED_PATH="
set "REST=%PATH%"
set "REAL_CLAUDE="

:filter_path
for /f "tokens=1* delims=;" %%A in ("!REST!") do (
    set "ENTRY=%%~A"
    set "REST=%%~B"
)
if defined ENTRY (
    set "D=!ENTRY!"
    if "!D:~-1!"=="\" set "D=!D:~0,-1!"
    if /i not "!D!"=="!LAUNCHER_DIR!" (
        if defined FILTERED_PATH (
            set "FILTERED_PATH=!FILTERED_PATH!;!ENTRY!"
        ) else (
            set "FILTERED_PATH=!ENTRY!"
        )
    )
)
if defined REST goto :filter_path
if not defined FILTERED_PATH set "FILTERED_PATH=%PATH%"
set "PATH=!FILTERED_PATH!"

for /f "delims=" %%i in ('where claude 2^>nul') do (
    set "D=%%~dpi"
    if "!D:~-1!"=="\" set "D=!D:~0,-1!"
    if /i not "!D!"=="!LAUNCHER_DIR!" if not defined REAL_CLAUDE set "REAL_CLAUDE=%%i"
)

if defined REAL_CLAUDE goto :launch

echo [claude-code-zh-cn] real claude executable not found
exit /b 127

:launch
endlocal & set "ZH_CN_REAL_CLAUDE=%REAL_CLAUDE%" & set "PATH=%FILTERED_PATH%" & "%REAL_CLAUDE%" %*
