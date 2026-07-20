@echo off
REM Run the receipt pipeline once (pull new R2 images, OCR, append to CSV, push to GitHub).
REM Schedule this via Windows Task Scheduler every 15 min for hands-off operation.
cd /d "%~dp0"
python process_receipts.py
if errorlevel 1 (
    echo Pipeline finished with errors — see above.
    pause
)
