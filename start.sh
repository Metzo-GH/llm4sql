#!/usr/bin/env bash
# ==============================================================================
# Unified Launcher - LLM4SQL (Linux / macOS)
# Configures host Ollama (GPU/CPU) + Docker Compose (PostgreSQL, FastAPI, React)
# ==============================================================================

set -euo pipefail

CYAN='\033[1;36m'
YELLOW='\033[1;33m'
GREEN='\033[1;32m'
RED='\033[1;31m'
NC='\033[0m'

OLLAMA_LOG="/tmp/ollama-llm4sql.log"

echo -e "${CYAN}====================================================${NC}"
echo -e "${CYAN}             LLM4SQL - UNIFIED LAUNCHER             ${NC}"
echo -e "${CYAN}====================================================${NC}"

# 1. Export target Ollama runtime variables
export OLLAMA_KV_CACHE_TYPE="q4_0"
export OLLAMA_FLASH_ATTENTION="1"
export OLLAMA_KEEP_ALIVE="-1"
export OLLAMA_NUM_PARALLEL="1"
export OLLAMA_HOST="0.0.0.0:11434"
export OLLAMA_ORIGINS="*"

ollama_api_ready() {
    curl -fsS --max-time 2 "http://127.0.0.1:11434/api/tags" >/dev/null 2>&1
}

ollama_wildcard_bound() {
    if command -v ss >/dev/null 2>&1; then
        ss -tln 2>/dev/null | grep -Eq '(\*:11434|0\.0\.0\.0:11434|\[::\]:11434|:::11434)\b'
        return $?
    elif command -v lsof >/dev/null 2>&1; then
        lsof -nP -iTCP:11434 -sTCP:LISTEN 2>/dev/null | grep -Eq '(\*:11434|0\.0\.0\.0:11434|\[::\]:11434)'
        return $?
    elif command -v netstat >/dev/null 2>&1; then
        netstat -an 2>/dev/null | grep -E 'LISTEN' | grep -Eq '(0\.0\.0\.0[:.]11434|\*[:.]11434|\[::\][: .]11434|:::11434)'
        return $?
    fi
    return 1
}

ollama_runtime_flags_ok() {
    local pid=""
    if command -v pgrep >/dev/null 2>&1; then
        pid="$(pgrep -x ollama 2>/dev/null | head -n 1 || true)"
    fi

    if [[ -n "$pid" && -r "/proc/$pid/environ" ]]; then
        local env_dump
        env_dump="$(tr '\0' '\n' < "/proc/$pid/environ" 2>/dev/null || true)"
        echo "$env_dump" | grep -qx 'OLLAMA_KV_CACHE_TYPE=q4_0' || return 1
        echo "$env_dump" | grep -Eq '^OLLAMA_FLASH_ATTENTION=(1|true)$' || return 1
        echo "$env_dump" | grep -qx 'OLLAMA_KEEP_ALIVE=-1' || return 1
        echo "$env_dump" | grep -qx 'OLLAMA_NUM_PARALLEL=1' || return 1
        return 0
    fi

    if [[ -r "$OLLAMA_LOG" ]]; then
        local last_env
        last_env="$(grep 'OLLAMA_KV_CACHE_TYPE:' "$OLLAMA_LOG" 2>/dev/null | tail -n 1 || true)"
        if [[ -n "$last_env" ]]; then
            echo "$last_env" | grep -Eq 'OLLAMA_KV_CACHE_TYPE:q4_0\b' || return 1
            echo "$last_env" | grep -Eq 'OLLAMA_FLASH_ATTENTION:(true|1)\b' || return 1
            # Go runtime logs KEEP_ALIVE=-1 as 2562047h47m16.854775807s
            echo "$last_env" | grep -Eq 'OLLAMA_KEEP_ALIVE:(-1|2562047h)' || return 1
            echo "$last_env" | grep -Eq 'OLLAMA_NUM_PARALLEL:1\b' || return 1
            return 0
        fi
    fi

    if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet ollama 2>/dev/null; then
        local sys_env
        sys_env="$(systemctl show ollama --property=Environment 2>/dev/null || true)"
        echo "$sys_env" | grep -q 'OLLAMA_KV_CACHE_TYPE=q4_0' || return 1
        echo "$sys_env" | grep -Eq 'OLLAMA_FLASH_ATTENTION=(1|true)' || return 1
        return 0
    fi

    return 1
}

echo -e "\n${YELLOW}1. Checking live host Ollama instance on port 11434...${NC}"
OLLAMA_RUNNING=false
if ollama_api_ready; then
    OLLAMA_RUNNING=true
fi

if [[ "$OLLAMA_RUNNING" == "true" ]]; then
    WILDCARD_OK=false
    FLAGS_OK=false
    if ollama_wildcard_bound; then WILDCARD_OK=true; fi
    if ollama_runtime_flags_ok; then FLAGS_OK=true; fi

    if [[ "$WILDCARD_OK" != "true" || "$FLAGS_OK" != "true" ]]; then
        if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet ollama 2>/dev/null; then
            if [[ "$(id -u)" -eq 0 ]]; then
                echo -e "   [~] Updating systemd ollama environment and restarting service..."
                systemctl set-environment \
                    OLLAMA_HOST="0.0.0.0:11434" \
                    OLLAMA_ORIGINS="*" \
                    OLLAMA_KV_CACHE_TYPE="q4_0" \
                    OLLAMA_FLASH_ATTENTION="1" \
                    OLLAMA_KEEP_ALIVE="-1" \
                    OLLAMA_NUM_PARALLEL="1"
                systemctl restart ollama
                sleep 2
            else
                echo -e "   ${YELLOW}[WARN] Ollama is managed by systemd without 0.0.0.0:11434 or GPU flags.${NC}"
                echo -e "   ${YELLOW}       Run as root to apply flags to systemd:${NC}"
                echo -e "   ${YELLOW}       sudo systemctl set-environment OLLAMA_HOST=0.0.0.0:11434 OLLAMA_ORIGINS='*' OLLAMA_KV_CACHE_TYPE=q4_0 OLLAMA_FLASH_ATTENTION=1 OLLAMA_KEEP_ALIVE=-1 OLLAMA_NUM_PARALLEL=1 && sudo systemctl restart ollama${NC}"
            fi
        else
            echo -e "   [~] Restarting user Ollama process to apply 0.0.0.0:11434 binding and GPU flags..."
            pkill -x ollama 2>/dev/null || killall ollama 2>/dev/null || true
            for _ in {1..10}; do
                if ! ollama_api_ready; then
                    break
                fi
                sleep 0.5
            done
            OLLAMA_RUNNING=false
        fi
    else
        echo -e "   ${GREEN}[OK] Existing Ollama instance already matches required host and GPU flags.${NC}"
    fi
fi

if [[ "$OLLAMA_RUNNING" != "true" ]]; then
    if ! command -v ollama >/dev/null 2>&1; then
        echo -e "   ${RED}[ERROR] 'ollama' binary not found in PATH. Install Ollama from https://ollama.com${NC}"
        exit 1
    fi

    echo -e "   [~] Starting host Ollama server on 0.0.0.0:11434..."
    rm -f "$OLLAMA_LOG"
    nohup ollama serve >"$OLLAMA_LOG" 2>&1 &

    STARTED=false
    for _ in {1..30}; do
        sleep 0.5
        if ollama_api_ready; then
            STARTED=true
            break
        fi
    done

    if [[ "$STARTED" != "true" ]]; then
        echo -e "   ${RED}[ERROR] Ollama failed to respond on http://127.0.0.1:11434 within 15s (see $OLLAMA_LOG).${NC}"
        exit 1
    fi
    sleep 0.3
fi

# Post-start live verification readout
if ollama_wildcard_bound; then
    echo -e "   ${GREEN}[OK] Ollama listening on 0.0.0.0:11434 (reachable from Docker)${NC}"
else
    echo -e "   ${YELLOW}[WARN] Ollama is listening on loopback only (127.0.0.1:11434); Docker containers may fail to connect.${NC}"
fi

if ollama_runtime_flags_ok; then
    echo -e "   ${GREEN}[OK] Active flags: KV_CACHE_TYPE=q4_0 | FLASH_ATTENTION=1 | KEEP_ALIVE=-1 | NUM_PARALLEL=1${NC}"
else
    echo -e "   ${YELLOW}[WARN] Could not confirm all runtime flags from /proc or $OLLAMA_LOG; check active Ollama service config.${NC}"
fi

TAGS_JSON="$(curl -fsS --max-time 2 "http://127.0.0.1:11434/api/tags" 2>/dev/null || echo '{}')"
MODEL_COUNT="$(printf '%s' "$TAGS_JSON" | grep -o '"name"[[:space:]]*:' | wc -l | tr -d ' ')"
if [[ "${MODEL_COUNT:-0}" -gt 0 ]]; then
    echo -e "   ${GREEN}[OK] Installed Ollama models detected: ${MODEL_COUNT}${NC}"
else
    echo -e "   ${YELLOW}[WARN] No local models found. Run: ollama pull qwen3.5:4b${NC}"
fi

# 2. Check Docker daemon
echo -e "\n${YELLOW}2. Checking Docker daemon...${NC}"
if ! docker info >/dev/null 2>&1; then
    echo -e "   ${RED}[ERROR] Docker daemon is not running. Start Docker and retry.${NC}"
    exit 1
fi
echo -e "   ${GREEN}[OK] Docker daemon is running.${NC}"

# 3. Build and start Docker Compose stack
echo -e "\n${YELLOW}3. Building and starting Docker Compose services (db, backend, frontend)...${NC}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
docker compose up --build -d

# 4. Wait for frontend and end-to-end backend-to-Ollama reachability
echo -e "\n${YELLOW}4. Waiting for frontend and container-to-Ollama connectivity...${NC}"
FRONTEND_READY=false
BRIDGE_ONLINE=false

for _ in {1..30}; do
    sleep 1
    if [[ "$FRONTEND_READY" != "true" ]]; then
        if curl -fsS -I --max-time 2 "http://localhost:5173" 2>/dev/null | grep -Eq '^HTTP/[0-9.]+ 200'; then
            FRONTEND_READY=true
        fi
    fi
    if [[ "$BRIDGE_ONLINE" != "true" ]]; then
        BRIDGE_JSON="$(curl -fsS --max-time 2 "http://localhost:8000/api/ollama/models" 2>/dev/null || true)"
        if printf '%s' "$BRIDGE_JSON" | grep -Eq '"online"[[:space:]]*:[[:space:]]*true'; then
            BRIDGE_ONLINE=true
        fi
    fi
    if [[ "$FRONTEND_READY" == "true" && "$BRIDGE_ONLINE" == "true" ]]; then
        break
    fi
done

if [[ "$FRONTEND_READY" == "true" ]]; then
    echo -e "   ${GREEN}[OK] Frontend ready at http://localhost:5173${NC}"
else
    echo -e "   ${YELLOW}[WARN] Frontend did not respond within 30s (check: docker compose logs frontend).${NC}"
fi

if [[ "$BRIDGE_ONLINE" == "true" ]]; then
    echo -e "   ${GREEN}[OK] Backend container verified connection to host Ollama (/api/ollama/models online=true)${NC}"
else
    echo -e "   ${YELLOW}[WARN] Backend container could not confirm Ollama connectivity within 30s (check: docker compose logs backend).${NC}"
fi

echo -e "\n${CYAN}====================================================${NC}"
echo -e "${CYAN}              LLM4SQL STACK IS ONLINE               ${NC}"
echo -e "${CYAN}====================================================${NC}"
echo -e " - Web UI         : http://localhost:5173"
echo -e " - FastAPI Backend: http://localhost:8000"
echo -e " - PostgreSQL 16  : localhost:5433"
echo -e " - Host Ollama    : 0.0.0.0:11434"
echo -e "${CYAN}====================================================${NC}"
echo -e "Stop stack with: ./stop.sh"

if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:5173" >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
    open "http://localhost:5173" >/dev/null 2>&1 &
fi
