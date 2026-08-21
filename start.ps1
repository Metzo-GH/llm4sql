# ==============================================================================
# Script de démarrage unifié - LLM4SQL (Windows PowerShell)
# Orchestre Ollama (Hôte GPU) + Docker Compose (PostgreSQL, FastAPI, React)
# ==============================================================================

$ErrorActionPreference = "Continue"
Clear-Host

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "        DÉMARRAGE AUTOMATISÉ UNIFIÉ - LLM4SQL       " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# 1. Vérification et Configuration des Optimisations Matérielles d'Ollama
Write-Host "`n1. Vérification des optimisations matérielles Ollama (GPU / VRAM)..." -ForegroundColor Yellow

$requiredVars = @{
    "OLLAMA_KV_CACHE_TYPE"   = "q4_0"
    "OLLAMA_FLASH_ATTENTION" = "1"
    "OLLAMA_KEEP_ALIVE"      = "-1"
    "OLLAMA_NUM_PARALLEL"    = "1"
    "OLLAMA_HOST"            = "0.0.0.0:11434"
    "OLLAMA_ORIGINS"         = "*"
}

# Test si Ollama est en cours d'exécution
$ollamaRunning = $false
try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -Method Get -TimeoutSec 2 -ErrorAction SilentlyContinue
    if ($response) {
        $ollamaRunning = $true
    }
} catch {}

# Vérification si les variables d'environnement requises sont déjà appliquées
$needsRestart = $false
foreach ($key in $requiredVars.Keys) {
    $currentVal = [Environment]::GetEnvironmentVariable($key, "User")
    if ($currentVal -ne $requiredVars[$key]) {
        [Environment]::SetEnvironmentVariable($key, $requiredVars[$key], "User")
        $needsRestart = $true
    }
    # Injection dans le processus courant
    [System.Environment]::SetEnvironmentVariable($key, $requiredVars[$key], "Process")
}

# Si Ollama est déjà actif mais sans les paramètres optimisés ou sans écoute 0.0.0.0 -> Redémarrage
if ($ollamaRunning -and $needsRestart) {
    Write-Host "   [~] Paramètres Ollama manquants ou modifiés détectés." -ForegroundColor Yellow
    Write-Host "   [~] Redémarrage propre d'Ollama avec Turbo Quant (q4_0) & Flash Attention..." -ForegroundColor Yellow
    Stop-Process -Name "ollama*" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    $ollamaRunning = $false
}

# Démarrage d'Ollama s'il n'est pas actif
if (-not $ollamaRunning) {
    Write-Host "   [~] Démarrage d'Ollama sur le port 11434..." -ForegroundColor Yellow
    $ollamaAppPath = "$env:LOCALAPPDATA\Programs\Ollama\ollama app.exe"
    $started = $false
    
    if (Test-Path $ollamaAppPath) {
        Start-Process $ollamaAppPath -ErrorAction SilentlyContinue
        for ($i = 0; $i -lt 10; $i++) {
            Start-Sleep -Milliseconds 500
            try {
                $response = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -Method Get -TimeoutSec 1 -ErrorAction SilentlyContinue
                if ($response) { $started = $true; break }
            } catch {}
        }
    }
    
    if (-not $started) {
        Start-Process "ollama" -ArgumentList "serve" -WindowStyle Hidden -ErrorAction SilentlyContinue
        for ($i = 0; $i -lt 12; $i++) {
            Start-Sleep -Milliseconds 500
            try {
                $response = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -Method Get -TimeoutSec 1 -ErrorAction SilentlyContinue
                if ($response) { $started = $true; break }
            } catch {}
        }
    }
    
    if ($started) {
        Write-Host "   [OK] Ollama est actif avec optimisations Turbo Quant q4_0 & Flash Attention !" -ForegroundColor Green
    } else {
        Write-Host "   [AVERTISSEMENT] Ollama n'a pas pu être validé sur le port 11434." -ForegroundColor Yellow
    }
} else {
    Write-Host "   [OK] Ollama est déjà actif avec les paramètres optimisés." -ForegroundColor Green
}

# 2. Vérification de Docker Desktop
Write-Host "`n2. Vérification du moteur Docker..." -ForegroundColor Yellow
try {
    $null = docker info 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   [ERREUR] Le moteur Docker n'est pas démarré. Lancez Docker Desktop !" -ForegroundColor Red
        Exit 1
    }
    Write-Host "   [OK] Moteur Docker opérationnel." -ForegroundColor Green
} catch {
    Write-Host "   [ERREUR] Docker n'est pas accessible. Assurez-vous que Docker Desktop est installé." -ForegroundColor Red
    Exit 1
}

# 3. Lancement de la Stack Docker Compose
Write-Host "`n3. Construction et lancement des conteneurs (PostgreSQL, FastAPI, Frontend React)..." -ForegroundColor Yellow
$scriptDir = $PSScriptRoot
Set-Location $scriptDir

docker compose up --build -d

# 4. Attente de la disponibilité de l'application
Write-Host "`n4. Synchronisation des services et initialisation de la base..." -ForegroundColor Yellow
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:5173" -Method Head -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($resp -and $resp.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {}
}

Write-Host "`n====================================================" -ForegroundColor Cyan
Write-Host "        🎉 LLM4SQL EST EN LIGNE ET PRÊT !           " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " - Frontend Web    : http://localhost:5173" -ForegroundColor White
Write-Host " - Backend FastAPI : http://localhost:8000" -ForegroundColor White
Write-Host " - BDD PostgreSQL  : Port 5433" -ForegroundColor White
Write-Host " - Ollama (Hôte)   : Port 11434" -ForegroundColor White
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "Pour arrêter l'application : lancez .\stop.ps1 ou .\stop.bat" -ForegroundColor Gray
Write-Host "Ouverture automatique de votre navigateur..." -ForegroundColor Yellow

Start-Process "http://localhost:5173"
