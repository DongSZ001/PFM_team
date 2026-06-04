@echo off
setlocal
cd /d "%~dp0\..\.."
set PFM_ENABLE_FERRO_CARD_EDITOR=1
start "" "http://127.0.0.1:4317"
node tools\ferro-card-editor\server.js
endlocal
