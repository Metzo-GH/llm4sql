@echo off
title LLM4SQL - Arret des conteneurs
echo ====================================================
echo            ARRET DES CONTENEURS LLM4SQL
echo ====================================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop.ps1"
pause
