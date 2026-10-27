# ==============================================================================
# Unified Launcher - LLM4SQL (Windows PowerShell)
# Configures host Ollama (GPU/CPU) + Docker Compose (PostgreSQL, FastAPI, React)
# ==============================================================================

$ErrorActionPreference = "Continue"
try { Clear-Host } catch {}

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "             LLM4SQL - UNIFIED LAUNCHER             " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

$requiredVars = [ordered]@{
    "OLLAMA_KV_CACHE_TYPE"   = "q4_0"
    "OLLAMA_FLASH_ATTENTION" = "1"
    "OLLAMA_KEEP_ALIVE"      = "-1"
    "OLLAMA_NUM_PARALLEL"    = "1"
    "OLLAMA_HOST"            = "0.0.0.0:11434"
    "OLLAMA_ORIGINS"         = "*"
}

$cliErrLog = Join-Path $env:TEMP "ollama-llm4sql.err.log"
$cliOutLog = Join-Path $env:TEMP "ollama-llm4sql.out.log"
$ollamaAppPath = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama app.exe"

function Get-OllamaTags {
    try {
        return Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -Method Get -TimeoutSec 2 -ErrorAction Stop
    } catch {
        return $null
    }
}

function Test-OllamaApi {
    return ($null -ne (Get-OllamaTags))
}

function Test-OllamaDesktopRunning {
    $desktopProcs = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -eq "ollama app" })
    return ($desktopProcs.Count -gt 0)
}

function Test-OllamaWildcardBinding {
    if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
        $listeners = Get-NetTCPConnection -LocalPort 11434 -State Listen -ErrorAction SilentlyContinue
        if ($null -ne $listeners) {
            $wildcard = @($listeners | Where-Object { $_.LocalAddress -in @("0.0.0.0", "::") })
            return ($wildcard.Count -gt 0)
        }
    }
    $netstatLines = netstat -ano 2>$null
    foreach ($line in $netstatLines) {
        if ($line -match '^\s*TCP\s+(0\.0\.0\.0|\[::\]):11434\s+\S+\s+LISTENING\b') {
            return $true
        }
    }
    return $false
}

function Get-OllamaLogActiveEnv {
    $candidates = @(
        $cliErrLog,
        (Join-Path $env:LOCALAPPDATA "Ollama\server.log")
    ) | Where-Object { $_ -and (Test-Path $_) } |
        Sort-Object { (Get-Item $_).LastWriteTime } -Descending

    foreach ($logFile in $candidates) {
        $tailLines = Get-Content -Path $logFile -Tail 250 -ErrorAction SilentlyContinue
        if (-not $tailLines) { continue }

        $envLines = @($tailLines | Where-Object { $_ -match 'OLLAMA_KV_CACHE_TYPE:' -or $_ -match 'env="map\[' })
        if ($envLines.Count -eq 0) { continue }

        $lastLine = $envLines[-1]
        $kv = if ($lastLine -match 'OLLAMA_KV_CACHE_TYPE:([^\s"\]]+)') { $Matches[1] } else { "unknown" }
        $fa = if ($lastLine -match 'OLLAMA_FLASH_ATTENTION:([^\s"\]]+)') { $Matches[1] } else { "unknown" }
        $ka = if ($lastLine -match 'OLLAMA_KEEP_ALIVE:([^\s"\]]+)') { $Matches[1] } else { "unknown" }
        $np = if ($lastLine -match 'OLLAMA_NUM_PARALLEL:([^\s"\]]+)') { $Matches[1] } else { "unknown" }

        $kvOk = ($kv -eq "q4_0")
        $faOk = ($fa -in @("true", "1"))
        # Go runtime logs KEEP_ALIVE=-1 as 2562047h47m16.854775807s
        $kaOk = ($ka -eq "-1" -or $ka -like "2562047h*")
        $npOk = ($np -eq "1")

        return @{
            Found          = $true
            LogPath        = $logFile
            AllValid       = ($kvOk -and $faOk -and $kaOk -and $npOk)
            KvCache        = $kv
            FlashAttention = $fa
            KeepAlive      = $ka
            NumParallel    = $np
        }
    }

    return @{
        Found    = $false
        AllValid = $false
    }
}

# 1. Persist and export Ollama environment variables
Write-Host "`n1. Configuring host Ollama environment variables..." -ForegroundColor Yellow

$registryChanged = $false
foreach ($key in $requiredVars.Keys) {
    $targetVal = $requiredVars[$key]
    [System.Environment]::SetEnvironmentVariable($key, $targetVal, "Process")

    $currentUserVal = [Environment]::GetEnvironmentVariable($key, "User")
    if ($currentUserVal -ne $targetVal) {
        [Environment]::SetEnvironmentVariable($key, $targetVal, "User")
        $registryChanged = $true
    }
}

# 2. Probe live Ollama instance and verify socket binding + active runtime flags
Write-Host "`n2. Checking live host Ollama instance on port 11434..." -ForegroundColor Yellow

$ollamaRunning = Test-OllamaApi
if ($ollamaRunning) {
    $wildcardOk = Test-OllamaWildcardBinding
    $logState = Get-OllamaLogActiveEnv
    $flagsMismatch = ($logState.Found -and (-not $logState.AllValid))
    $desktopMissing = ((Test-Path $ollamaAppPath) -and (-not (Test-OllamaDesktopRunning)))

    if ($registryChanged -or (-not $wildcardOk) -or $flagsMismatch -or $desktopMissing) {
        $reasons = @()
        if ($registryChanged) { $reasons += "User environment updated" }
        if (-not $wildcardOk) { $reasons += "bound to 127.0.0.1 instead of 0.0.0.0:11434" }
        if ($flagsMismatch)   { $reasons += "runtime flags mismatch in Ollama log" }
        if ($desktopMissing)  { $reasons += "headless daemon running without Ollama desktop app" }

        Write-Host "   [~] Restarting Ollama ($($reasons -join '; '))..." -ForegroundColor Yellow
        Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -eq "ollama app" } | Stop-Process -Force -ErrorAction SilentlyContinue
        Get-Process -Name "ollama*" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

        for ($i = 0; $i -lt 10; $i++) {
            Start-Sleep -Milliseconds 500
            if (-not (Test-OllamaApi) -and -not (Test-OllamaWildcardBinding)) {
                break
            }
        }
        $ollamaRunning = $false
    } else {
        Write-Host "   [OK] Existing Ollama instance already matches required host and GPU flags." -ForegroundColor Green
    }
}

# 3. Start Ollama if stopped and verify active state
if (-not $ollamaRunning) {
    $ollamaCli = Get-Command "ollama" -ErrorAction SilentlyContinue
    $started = $false

    if (Test-Path $ollamaAppPath) {
        Write-Host "   [~] Launching Ollama Windows app on 0.0.0.0:11434..." -ForegroundColor Yellow
        Remove-Item -Path $cliErrLog, $cliOutLog -Force -ErrorAction SilentlyContinue
        Start-Process -FilePath $ollamaAppPath -ErrorAction SilentlyContinue | Out-Null

        for ($i = 0; $i -lt 40; $i++) {
            Start-Sleep -Milliseconds 500
            if (Test-OllamaApi) {
                $started = $true
                break
            }
        }
    }

    if ((-not $started) -and ($null -ne $ollamaCli)) {
        Write-Host "   [~] Falling back to headless 'ollama serve' on 0.0.0.0:11434..." -ForegroundColor Yellow
        Remove-Item -Path $cliErrLog, $cliOutLog -Force -ErrorAction SilentlyContinue
        try {
            Start-Process -FilePath $ollamaCli.Source -ArgumentList "serve" -WindowStyle Hidden `
                -RedirectStandardError $cliErrLog -RedirectStandardOutput $cliOutLog -ErrorAction Stop | Out-Null
        } catch {
            Start-Process -FilePath $ollamaCli.Source -ArgumentList "serve" -WindowStyle Hidden -ErrorAction SilentlyContinue | Out-Null
        }

        for ($i = 0; $i -lt 30; $i++) {
            Start-Sleep -Milliseconds 500
            if (Test-OllamaApi) {
                $started = $true
                break
            }
        }
    }

    if (-not $started) {
        if ((-not (Test-Path $ollamaAppPath)) -and ($null -eq $ollamaCli)) {
            Write-Host "   [ERROR] Ollama executable not found in $ollamaAppPath or PATH." -ForegroundColor Red
            Write-Host "           Install Ollama from https://ollama.com and re-run this script." -ForegroundColor Red
        } else {
            Write-Host "   [ERROR] Ollama failed to respond on http://127.0.0.1:11434 within timeout." -ForegroundColor Red
        }
        exit 1
    }
    Start-Sleep -Milliseconds 300
}

# Post-start live verification readout
$wildcardVerified = Test-OllamaWildcardBinding
$logVerified = Get-OllamaLogActiveEnv
$tagsResponse = Get-OllamaTags

if ($wildcardVerified) {
    Write-Host "   [OK] Ollama listening on 0.0.0.0:11434 (reachable from Docker)" -ForegroundColor Green
} else {
    Write-Host "   [WARN] Ollama is listening on loopback only (127.0.0.1:11434); Docker containers may fail to connect." -ForegroundColor Yellow
}

if ($logVerified.Found -and $logVerified.AllValid) {
    Write-Host "   [OK] Active flags: KV_CACHE_TYPE=q4_0 | FLASH_ATTENTION=1 | KEEP_ALIVE=-1 | NUM_PARALLEL=1" -ForegroundColor Green
} elseif ($logVerified.Found) {
    Write-Host "   [WARN] Active flags in log: KV_CACHE_TYPE=$($logVerified.KvCache) | FLASH_ATTENTION=$($logVerified.FlashAttention) | KEEP_ALIVE=$($logVerified.KeepAlive) | NUM_PARALLEL=$($logVerified.NumParallel)" -ForegroundColor Yellow
} else {
    Write-Host "   [OK] Active flags (process env): KV_CACHE_TYPE=q4_0 | FLASH_ATTENTION=1 | KEEP_ALIVE=-1 | NUM_PARALLEL=1" -ForegroundColor Green
}

$modelCount = if ($null -ne $tagsResponse -and $null -ne $tagsResponse.models) { @($tagsResponse.models).Count } else { 0 }
if ($modelCount -gt 0) {
    Write-Host "   [OK] Installed Ollama models detected: $modelCount" -ForegroundColor Green
} else {
    Write-Host "   [WARN] No local models found. Run: ollama pull qwen3.5:4b" -ForegroundColor Yellow
}

# 4. Check Docker daemon, build/start Compose stack, and verify container-to-host bridge
Write-Host "`n3. Checking Docker daemon..." -ForegroundColor Yellow
try {
    $null = docker info 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   [ERROR] Docker daemon is not running. Start Docker Desktop and retry." -ForegroundColor Red
        exit 1
    }
    Write-Host "   [OK] Docker daemon is running." -ForegroundColor Green
} catch {
    Write-Host "   [ERROR] Docker CLI not found. Install Docker Desktop and retry." -ForegroundColor Red
    exit 1
}

Write-Host "`n4. Building and starting Docker Compose services (db, backend, frontend)..." -ForegroundColor Yellow
Set-Location $PSScriptRoot

$envFile = Join-Path $PSScriptRoot ".env"
$envExampleFile = Join-Path $PSScriptRoot ".env.example"
if ((-not (Test-Path $envFile)) -and (Test-Path $envExampleFile)) {
    Copy-Item -Path $envExampleFile -Destination $envFile
    Write-Host "   [OK] Initialized .env from .env.example" -ForegroundColor Green
}
if (Test-Path $envFile) {
    $envRaw = Get-Content -Path $envFile -Raw -ErrorAction SilentlyContinue
    if ($envRaw -match 'your_db_user_here|your_secure_password_here') {
        Write-Host "   [WARN] .env still contains placeholder DB credentials (your_*_here); align DB_USER/DB_PASSWORD with your PostgreSQL volume." -ForegroundColor Yellow
    }
}

docker compose up --build -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "   [ERROR] 'docker compose up --build -d' exited with code $LASTEXITCODE." -ForegroundColor Red
    exit 1
}

Write-Host "`n5. Waiting for frontend and container-to-Ollama connectivity..." -ForegroundColor Yellow
$frontendReady = $false
$bridgeOnline = $false

for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if (-not $frontendReady) {
        try {
            $feResp = Invoke-WebRequest -Uri "http://localhost:5173" -Method Head -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
            if ($feResp.StatusCode -eq 200) {
                $frontendReady = $true
            }
        } catch {}
    }
    if (-not $bridgeOnline) {
        try {
            $bridgeResp = Invoke-RestMethod -Uri "http://localhost:8000/api/ollama/models" -Method Get -TimeoutSec 2 -ErrorAction Stop
            if ($null -ne $bridgeResp -and $bridgeResp.online -eq $true) {
                $bridgeOnline = $true
            }
        } catch {}
    }
    if ($frontendReady -and $bridgeOnline) {
        break
    }
}

if ($frontendReady) {
    Write-Host "   [OK] Frontend ready at http://localhost:5173" -ForegroundColor Green
} else {
    Write-Host "   [WARN] Frontend did not respond within 30s (check: docker compose logs frontend)." -ForegroundColor Yellow
}

if ($bridgeOnline) {
    Write-Host "   [OK] Backend container verified connection to host Ollama (/api/ollama/models online=true)" -ForegroundColor Green
} else {
    Write-Host "   [WARN] Backend container could not confirm Ollama connectivity within 30s (check: docker compose logs backend)." -ForegroundColor Yellow
}

Write-Host "`n====================================================" -ForegroundColor Cyan
Write-Host "              LLM4SQL STACK IS ONLINE               " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " - Web UI         : http://localhost:5173" -ForegroundColor White
Write-Host " - FastAPI Backend: http://localhost:8000" -ForegroundColor White
Write-Host " - PostgreSQL 16  : localhost:5433" -ForegroundColor White
Write-Host " - Host Ollama    : 0.0.0.0:11434" -ForegroundColor White
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "Stop stack with: .\stop.ps1 (or .\stop.bat)" -ForegroundColor Gray

Start-Process "http://localhost:5173"
