@echo off
setlocal
rem Opens only the shipped synthetic HTML in a dedicated browser profile.
set "D4_PREVIEW_HTML=%~dp0mytodo-d4-03-demo.html"
if not exist "%D4_PREVIEW_HTML%" (
  echo Missing mytodo-d4-03-demo.html next to this launcher.
  exit /b 1
)
set "D4_PREVIEW_BROWSER="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "D4_PREVIEW_BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined D4_PREVIEW_BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "D4_PREVIEW_BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined D4_PREVIEW_BROWSER if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "D4_PREVIEW_BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined D4_PREVIEW_BROWSER if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "D4_PREVIEW_BROWSER=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not defined D4_PREVIEW_BROWSER (
  echo No installed Edge or Chrome was found. No browser is downloaded.
  exit /b 2
)
set "D4_PREVIEW_URL=file:///%D4_PREVIEW_HTML:\=/%"
start "" "%D4_PREVIEW_BROWSER%" --app="%D4_PREVIEW_URL%" --user-data-dir="%LOCALAPPDATA%\MyTodo-D4-03-Preview\browser-profile" --no-first-run --no-default-browser-check --disable-background-networking --disable-sync --disable-component-update
exit /b 0
