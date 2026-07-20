@echo off
REM Register the Clearline receipt pipeline as a Windows Task Scheduler task
REM that runs every 15 minutes (while the PC is awake). No public IP or server needed.
REM
REM Run this once (double-click). It creates task "ClearlineExpenses" that runs
REM run_once.bat silently in the background. To remove it later:
REM   schtasks /delete /tn "ClearlineExpenses" /f
SETLOCAL
SET "HERE=%~dp0"
SET "TASK=ClearlineExpenses"
SET "PY=%SystemDrive%\Python313\python.exe"
if not exist "%PY%" (
  REM fall back to whatever 'python' resolves to on PATH
  where python >nul 2>&1 && for /f "delims=" %%P in ('where python') do set "PY=%%P"
)
echo Registering task ^"%TASK%^" to run every 15 min using:
echo   %PY%  +  %HERE%run_once.bat

schtasks /create /tn "%TASK%" /tr "\"%HERE%run_once.bat\"" /sc minute /mo 15 /ru "%USERNAME%" /rl LIMITED /f
if errorlevel 1 (
  echo.
  echo FAILED to create the task. Try running this file as Administrator.
  pause
  exit /b 1
)
echo.
echo Done. The pipeline will now run automatically every 15 minutes while this PC is on.
echo (Open Task Scheduler to see / edit it, or run: schtasks /delete /tn "%TASK%" /f)
pause
