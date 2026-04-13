@echo off
REM Запуск полного VK-пайплайна: collect -> dates -> photos -> db
REM
REM Использование:
REM   scripts\ingest_vk.bat
REM   scripts\ingest_vk.bat grib_spb
REM   scripts\ingest_vk.bat grib_spb lenoblast
REM   scripts\ingest_vk.bat grib_spb lenoblast dates

setlocal
cd /d "%~dp0.."

set GROUP=%~1
if "%GROUP%"=="" set GROUP=grib_spb

set REGION=%~2
if "%REGION%"=="" set REGION=lenoblast

set STEP=%~3

set PYTHONIOENCODING=utf-8
set PYTHON=.venv\Scripts\python.exe

echo ========================================================
echo   VK Pipeline: %GROUP% -^> %REGION%
echo ========================================================

docker ps --format "{{.Names}}" | findstr /B /C:"mushroom_db" >nul
if errorlevel 1 (
    echo [warn] Container mushroom_db not running, starting...
    docker compose up -d db
    timeout /t 3 /nobreak >nul
)

if "%STEP%"=="" (
    "%PYTHON%" pipelines\ingest_vk.py --group %GROUP% --region %REGION%
) else (
    "%PYTHON%" pipelines\ingest_vk.py --group %GROUP% --region %REGION% --step %STEP%
)

endlocal
