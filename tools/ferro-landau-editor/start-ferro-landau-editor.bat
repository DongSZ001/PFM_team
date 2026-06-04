@echo off
setlocal
cd /d "%~dp0\..\.."
set PFM_ENABLE_FERRO_LANDAU_EDITOR=1
start "" "http://127.0.0.1:4318"
node tools\ferro-landau-editor\server.js
endlocal
