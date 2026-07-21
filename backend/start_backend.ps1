# Script de démarrage automatisé - LLM4SQL Backend 🚀
# Ce script configure l'environnement, lance Docker et prépare Ollama.

$ErrorActionPreference = "Stop"
Clear-Host

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "      DÉMARRAGE AUTOMATISÉ DU BACKEND LLM4SQL       " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# 1. Configuration des optimisations avancées d'Ollama (Turbo Quant & Speed)
Write-Host "`n1. Configuration globale des optimisations Ollama sous Windows..." -ForegroundColor Yellow

# Vérification si Ollama est déjà actif
$ollamaRunning = $false
try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -Method Get -TimeoutSec 2 -ErrorAction SilentlyContinue
    if ($response) {
        $ollamaRunning = $true
    }
} catch {}

$envKV = [Environment]::GetEnvironmentVariable("OLLAMA_KV_CACHE_TYPE", "User")

if ($ollamaRunning -and $envKV -eq "q4_0") {
    Write-Host "   [OK] Ollama est déjà configuré et actif (Port 11434)." -ForegroundColor Green
} else {
    # Application permanente des variables dans le profil Utilisateur Windows
    [Environment]::SetEnvironmentVariable("OLLAMA_KV_CACHE_TYPE", "q4_0", "User")
    [Environment]::SetEnvironmentVariable("OLLAMA_FLASH_ATTENTION", "1", "User")
    [Environment]::SetEnvironmentVariable("OLLAMA_KEEP_ALIVE", "-1", "User")
    [Environment]::SetEnvironmentVariable("OLLAMA_NUM_PARALLEL", "1", "User")
    
    # Application immédiate dans le processus courant pour héritage
    $env:OLLAMA_KV_CACHE_TYPE = "q4_0"
    $env:OLLAMA_FLASH_ATTENTION = "1"
    $env:OLLAMA_KEEP_ALIVE = "-1"
    $env:OLLAMA_NUM_PARALLEL = "1"
    
    Write-Host "   [OK] Variables systèmes inscrites." -ForegroundColor Green
    Write-Host "   [~] Démarrage de l'application Ollama..." -ForegroundColor Yellow
    
    Stop-Process -Name "ollama*" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    
    $ollamaAppPath = "$env:LOCALAPPDATA\Programs\Ollama\ollama app.exe"
    $started = $false
    
    # Tentative 1 : Lancement de l'application système Windows Ollama Desktop
    if (Test-Path $ollamaAppPath) {
        Start-Process $ollamaAppPath -ErrorAction SilentlyContinue
        # Attente active de 4 secondes max pour vérifier si le port répond
        for ($i = 0; $i -lt 8; $i++) {
            Start-Sleep -Milliseconds 500
            try {
                $response = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -Method Get -TimeoutSec 1 -ErrorAction SilentlyContinue
                if ($response) {
                    $started = $true
                    Write-Host "   [OK] Ollama Desktop démarré (Port 11434 actif)." -ForegroundColor Green
                    break
                }
            } catch {}
        }
    }
    
    # Tentative 2 : Fallback sur le serveur CLI en arrière-plan (sans GUI) si l'app Desktop échoue ou est absente
    if (-not $started) {
        Write-Host "   [~] Lancement du serveur CLI Ollama en arrière-plan (ollama serve)..." -ForegroundColor Yellow
        Start-Process "ollama" -ArgumentList "serve" -WindowStyle Hidden -ErrorAction SilentlyContinue
        
        # Attente active de 6 secondes max
        for ($i = 0; $i -lt 12; $i++) {
            Start-Sleep -Milliseconds 500
            try {
                $response = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -Method Get -TimeoutSec 1 -ErrorAction SilentlyContinue
                if ($response) {
                    $started = $true
                    Write-Host "   [OK] Serveur Ollama CLI démarré en arrière-plan (Port 11434 actif)." -ForegroundColor Green
                    break
                }
            } catch {}
        }
    }
    
    if (-not $started) {
        Write-Host "   [AVERTISSEMENT] Impossible de valider le démarrage d'Ollama. Assurez-vous qu'il tourne sur le port 11434." -ForegroundColor Yellow
    }
}

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
    $scriptDir = $PSScriptRoot
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
    uv run -m app.database.seed_db
    Write-Host "   [OK] Schéma et données de BD initialisés avec succès !" -ForegroundColor Green
} catch {
    Write-Host "   [AVERTISSEMENT] Échec de l'initialisation des données." -ForegroundColor Yellow
}

# 6. Fin du script de démarrage et lancement de FastAPI
Write-Host "`n====================================================" -ForegroundColor Cyan
Write-Host "          BACKEND PRÊT ET OPTIMISÉ ! 🎉              " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "Lancement automatique du serveur FastAPI..." -ForegroundColor Yellow
Write-Host "====================================================" -ForegroundColor Cyan

# Lancement du serveur FastAPI avec uv et uvicorn
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload --timeout-graceful-shutdown 2

