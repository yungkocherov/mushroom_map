@echo off
REM Запуск только стадии распознавания видов грибов по фото через Gemma (LM Studio).
REM
REM Использование:
REM   scripts\classify_photos.bat
REM   scripts\classify_photos.bat grib_spb

setlocal
cd /d "%~dp0.."

set GROUP=%~1
if "%GROUP%"=="" set GROUP=grib_spb

set PYTHONIOENCODING=utf-8
set PYTHON=.venv\Scripts\python.exe

if "%LM_STUDIO_URL%"=="" set LM_STUDIO_URL=http://127.0.0.1:1234/v1/chat/completions

echo ========================================================
echo   Photo Classification: %GROUP%
echo   LM Studio: %LM_STUDIO_URL%
echo ========================================================

curl -fsS --max-time 5 "http://127.0.0.1:1234/v1/models" >nul 2>&1
if errorlevel 1 (
    echo [ERROR] LM Studio is not available at 127.0.0.1:1234
    echo         1. Open LM Studio
    echo         2. Load model google/gemma-3-12b
    echo         3. Start server: Developer -^> Start Server
    exit /b 1
)
echo [ok] LM Studio is available

if not exist "data\vk\%GROUP%\raw_posts.json" (
    echo [ERROR] No file: data\vk\%GROUP%\raw_posts.json
    echo         Run first: scripts\ingest_vk.bat %GROUP% lenoblast collect
    exit /b 1
)
echo [ok] raw_posts.json found

"%PYTHON%" pipelines\ingest_vk.py --group %GROUP% --step photos

endlocal
