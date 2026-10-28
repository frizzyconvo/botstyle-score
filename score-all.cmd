@echo off
rem Score every card dataset with the current scorer (results by version in eval\scores\).
rem Resumes if stopped; safe to leave running overnight. Needs Node.js 18+ and "npm install" once.
cd /d "%~dp0"
if not exist node_modules\wink-pos-tagger call npm install
node tools\score_all.mjs %*
pause
