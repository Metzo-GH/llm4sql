#!/usr/bin/env bash
# ==============================================================================
# Script d'arrêt propre - LLM4SQL (Linux / macOS)
# ==============================================================================

set -e

echo -e "\033[1;36m====================================================\033[0m"
echo -e "\033[1;36m            ARRÊT DES CONTENEURS LLM4SQL            \033[0m"
echo -e "\033[1;36m====================================================\033[0m"

cd "$(dirname "$0")"
docker compose down

echo -e "\n\033[1;32m[OK] Tous les conteneurs sont arrêtés et les ports libérés.\033[0m"
