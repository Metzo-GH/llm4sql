# Script de démarrage automatisé - LLM4SQL Backend 🚀
# Ce script configure l'environnement, lance Docker et prépare Ollama.

$ErrorActionPreference = "Stop"
Clear-Host

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "      DÉMARRAGE AUTOMATISÉ DU BACKEND LLM4SQL       " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# 1. Configuration des optimisations avancées d'Ollama (Turbo Quant & Speed)
Write-Host "`n1. Configuration des optimisations VRAM d'Ollama..." -ForegroundColor Yellow
$env:OLLAMA_KV_CACHE_TYPE = "q8_0"
$env:OLLAMA_FLASH_ATTENTION = "1"
Write-Host "   [OK] KV Cache quantifié en 8-bit activé (OLLAMA_KV_CACHE_TYPE=q8_0)" -ForegroundColor Green
Write-Host "   [OK] Flash Attention activée (OLLAMA_FLASH_ATTENTION=1)" -ForegroundColor Green

# 2. Ajout de uv local au PATH pour la session courante
Write-Host "`n2. Configuration de l'environnement Python (uv)..." -ForegroundColor Yellow
$localBinPath = "$env:USERPROFILE\.local\bin"
if ($env:PATH -notlike "*$localBinPath*") {
    $env:PATH += ";$localBinPath"
}
Write-Host "   [OK] Path local 'uv' configuré." -ForegroundColor Green

# 3. Démarrage du conteneur PostgreSQL Docker
Write-Host "`n3. Démarrage de la base de données PostgreSQL (Docker)..." -ForegroundColor Yellow
try {
    # On se place dans le dossier du script
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    Set-Location $scriptDir

    # Lancement de Docker Compose
    docker compose up -d
    Write-Host "   [OK] Conteneurs Docker démarrés (Port 5433)." -ForegroundColor Green
} catch {
    Write-Host "   [ERREUR] Impossible de lancer Docker Compose. Assurez-vous que Docker Desktop est démarré !" -ForegroundColor Red
    Exit 1
}

# 4. Attente de la préparation de la base
Write-Host "`n4. Attente de la préparation de PostgreSQL (3 secondes)..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# 5. Peuplement de la base de données (Seed)
Write-Host "`n5. Initialisation des données (BD Ouvrages)..." -ForegroundColor Yellow
try {
    uv run seed_db.py
    Write-Host "   [OK] Schéma et données de BD initialisés avec succès !" -ForegroundColor Green
} catch {
    Write-Host "   [AVERTISSEMENT] Échec de l'initialisation des données." -ForegroundColor Yellow
}

# 6. Fin du script de démarrage
Write-Host "`n====================================================" -ForegroundColor Cyan
Write-Host "          BACKEND PRÊT ET OPTIMISÉ ! 🎉              " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "Pour tester l'intégration complète (POC LLM) :" -ForegroundColor Gray
Write-Host "-> uv run test_llm_db.py" -ForegroundColor Yellow
Write-Host "====================================================" -ForegroundColor Cyan
