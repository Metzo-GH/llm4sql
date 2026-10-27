# ==============================================================================
# Backend Dev Launcher - LLM4SQL (Windows PowerShell)
# Configures host Ollama + PostgreSQL container + local Uvicorn server
# ==============================================================================

$ErrorActionPreference = "Continue"
try { Clear-Host } catch {}

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "           LLM4SQL - BACKEND DEV LAUNCHER           " -ForegroundColor Cyan
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

# 1. Persist and verify host Ollama instance
Write-Host "`n1. Configuring and verifying host Ollama on port 11434..." -ForegroundColor Yellow

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
        } else {
            Write-Host "   [ERROR] Ollama failed to respond on http://127.0.0.1:11434 within timeout." -ForegroundColor Red
        }
        exit 1
    }
    Start-Sleep -Milliseconds 300
}

$wildcardVerified = Test-OllamaWildcardBinding
$logVerified = Get-OllamaLogActiveEnv
$tagsResponse = Get-OllamaTags

if ($wildcardVerified) {
    Write-Host "   [OK] Ollama listening on 0.0.0.0:11434" -ForegroundColor Green
} else {
    Write-Host "   [WARN] Ollama is listening on loopback only (127.0.0.1:11434)." -ForegroundColor Yellow
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

# 2. Ensure uv is on PATH
Write-Host "`n2. Checking Python uv toolchain..." -ForegroundColor Yellow
$localBinPath = Join-Path $env:USERPROFILE ".local\bin"
if ($env:PATH -notlike "*$localBinPath*") {
    $env:PATH += ";$localBinPath"
}
if (-not (Get-Command "uv" -ErrorAction SilentlyContinue)) {
    Write-Host "   [ERROR] 'uv' not found in PATH. Install uv from https://docs.astral.sh/uv/" -ForegroundColor Red
    exit 1
}
Write-Host "   [OK] uv toolchain available." -ForegroundColor Green

# 3. Start PostgreSQL container
Write-Host "`n3. Starting PostgreSQL container via Docker Compose..." -ForegroundColor Yellow
Set-Location $PSScriptRoot
$repoRoot = Split-Path -Parent $PSScriptRoot
$rootEnv = Join-Path $repoRoot ".env"
if (Test-Path $rootEnv) {
    $envRaw = Get-Content -Path $rootEnv -Raw -ErrorAction SilentlyContinue
    if ($envRaw -match 'your_db_user_here|your_secure_password_here') {
        Write-Host "   [WARN] Root .env contains placeholder DB credentials (your_*_here); update DB_USER/DB_PASSWORD before starting." -ForegroundColor Yellow
    }
}
$null = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "   [ERROR] Docker daemon is not running. Start Docker Desktop and retry." -ForegroundColor Red
    exit 1
}

docker compose up -d db
if ($LASTEXITCODE -ne 0) {
    docker compose up -d
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   [ERROR] Failed to start PostgreSQL via Docker Compose." -ForegroundColor Red
        exit 1
    }
}
Write-Host "   [OK] PostgreSQL container started (port 5433)." -ForegroundColor Green

# 4. Wait for PostgreSQL readiness
Write-Host "`n4. Waiting 3s for PostgreSQL initialization..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# 5. Seed reference database (BD Ouvrages)
Write-Host "`n5. Seeding reference dataset (BD Ouvrages)..." -ForegroundColor Yellow
uv run -m app.database.seed_db
if ($LASTEXITCODE -eq 0) {
    Write-Host "   [OK] Reference schema and seed data initialized." -ForegroundColor Green
} else {
    Write-Host "   [WARN] Database seed command returned non-zero status ($LASTEXITCODE)." -ForegroundColor Yellow
}

# 6. Start FastAPI development server
Write-Host "`n====================================================" -ForegroundColor Cyan
Write-Host "      STARTING FASTAPI SERVER (127.0.0.1:8000)      " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload --timeout-graceful-shutdown 2
