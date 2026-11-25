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
rem Only the explicit hosted Actions observation enables a loopback debug endpoint.
rem This never accepts a replacement executable, arbitrary flags or headless mode.
set "D4_PREVIEW_CI_FLAGS="
if "%GITHUB_ACTIONS%"=="true" if "%RUNNER_OS%"=="Windows" if "%RUNNER_ENVIRONMENT%"=="github-hosted" if "%D4_PREVIEW_CI_INSPECT%"=="1" set "D4_PREVIEW_CI_FLAGS=--remote-debugging-address=127.0.0.1 --remote-debugging-port=0"
start "" "%D4_PREVIEW_BROWSER%" --app="%D4_PREVIEW_URL%" --user-data-dir="%LOCALAPPDATA%\MyTodo-D4-03-Preview\browser-profile" --no-first-run --no-default-browser-check --disable-background-networking --disable-sync --disable-component-update %D4_PREVIEW_CI_FLAGS%
exit /b 0
