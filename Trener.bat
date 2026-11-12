@echo off
chcp 65001 >nul
rem Trener: starts the local server (if it is not running yet) and opens the app window.
rem Browser order: Chrome, then Edge, then the default browser.
set "HERE=%~dp0"
set "URL=http://127.0.0.1:47810/"
set "PYW=%LOCALAPPDATA%\Programs\Python\Python312\pythonw.exe"
if not exist "%PYW%" set "PYW=pythonw"
start "" "%PYW%" "%HERE%trener_serwer.py"
timeout /t 2 /nobreak >nul

set "BROWSER="
for %%P in ("%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe") do (
  if not defined BROWSER if exist "%%~P" set "BROWSER=%%~P"
)
if not defined BROWSER (
  for /f "tokens=2,*" %%A in ('reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" /ve 2^>nul ^| find "REG_SZ"') do set "BROWSER=%%~B"
)
if not defined BROWSER (
  for /f "tokens=2,*" %%A in ('reg query "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" /ve 2^>nul ^| find "REG_SZ"') do set "BROWSER=%%~B"
)
if not defined BROWSER (
  for %%P in ("%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe") do (
    if not defined BROWSER if exist "%%~P" set "BROWSER=%%~P"
  )
)
if defined BROWSER (
  start "" "%BROWSER%" --app=%URL% --window-size=1500,980
) else (
  start "" %URL%
)
