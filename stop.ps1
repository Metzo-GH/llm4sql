# ==============================================================================
# Script d'arrêt propre - LLM4SQL (Windows PowerShell)
# ==============================================================================

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "            ARRÊT DES CONTENEURS LLM4SQL            " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

$scriptDir = $PSScriptRoot
Set-Location $scriptDir

docker compose down

Write-Host "`n[OK] Tous les conteneurs sont arrêtés et les ports libérés." -ForegroundColor Green
