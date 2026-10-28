@echo off
rem Double-click to run botstyle-score locally (needs Node.js 18+ from nodejs.org; nothing else to install).
cd /d "%~dp0"
start "" http://localhost:8787/
node tools\serve.mjs
