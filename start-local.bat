@echo off
title Kaya Project Intelligence 360
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get it from https://nodejs.org & pause & exit /b 1)
node scripts\local-setup.mjs
pause
