@echo off
setlocal enabledelayedexpansion
rem Install on Windows.bat - put FEBPlanStock into Fusion's add-ins folder.
rem
rem Double-click this file. It copies the FEBPlanStock folder sitting next to
rem it into Fusion's per-user AddIns directory, keeping any credentials.json
rem that is already installed. Nothing else on the machine is touched.

set "HERE=%~dp0"
set "SRC=%HERE%FEBPlanStock"
set "ADDINS=%APPDATA%\Autodesk\Autodesk Fusion 360\API\AddIns"
set "DEST=%ADDINS%\FEBPlanStock"

echo.
echo FEB Composites - Plan stock add-in for Fusion
echo ---------------------------------------------
echo.

if not exist "%SRC%\FEBPlanStock.manifest" (
  echo FAILED: no FEBPlanStock folder next to this installer.
  echo Unzip the whole download first, then run the installer from inside it.
  goto :done
)

tasklist /FI "IMAGENAME eq Fusion360.exe" 2>nul | find /I "Fusion360.exe" >nul
if not errorlevel 1 (
  echo Fusion is running. The add-in will be installed anyway, but you must
  echo close and reopen Fusion before it loads.
  echo.
)

if not exist "%ADDINS%" mkdir "%ADDINS%"
if not exist "%ADDINS%" (
  echo FAILED: could not create %ADDINS%
  goto :done
)

rem Keep the shared team account across an update.
set "KEPT="
if exist "%DEST%\credentials.json" (
  copy /Y "%DEST%\credentials.json" "%TEMP%\feb_credentials.json" >nul
  set "KEPT=yes"
)

if exist "%DEST%" (
  echo Replacing the add-in that is already installed.
  rmdir /S /Q "%DEST%"
) else (
  echo Installing the add-in.
)

xcopy /E /I /Y /Q "%SRC%" "%DEST%" >nul
if errorlevel 1 (
  echo FAILED: could not copy into %ADDINS%
  goto :done
)

if defined KEPT (
  copy /Y "%TEMP%\feb_credentials.json" "%DEST%\credentials.json" >nul
  del /Q "%TEMP%\feb_credentials.json" >nul 2>&1
  echo Kept the credentials.json you already had.
)

echo.
echo Installed FEBPlanStock into
echo   %DEST%
echo.
echo Now do this:
echo   1. Close Fusion completely and open it again.
echo      (Or, without restarting: Utilities tab ^> Add-Ins ^> Add-Ins tab ^>
echo       FEBPlanStock ^> Run.)
echo   2. Open a mold design. On the Utilities tab you will see a FEB panel
echo      with a Plan stock button.
echo   3. Select the mold body, press Plan stock, and sign in to the
echo      composites app in the panel that opens. It remembers you after that.

:done
echo.
pause
