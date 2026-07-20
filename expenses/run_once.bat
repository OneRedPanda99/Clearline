@echo off
REM Run the receipt pipeline once (pull new R2 images, OCR, append to CSV, push to GitHub).
REM Triggered by Task Scheduler (see setup_autorun.bat) every 15 minutes for hands-off operation.
cd /d "%~dp0"
where python >nul 2>&1 && set PY=python || set PY=py
%PY% process_receipts.py
if errorlevel 1 (
    echo Pipeline finished with errors — see above.
    pause
)
