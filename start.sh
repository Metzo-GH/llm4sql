#!/usr/bin/env bash
# ==============================================================================
# Script de démarrage unifié - LLM4SQL (Linux / macOS)
# Orchestre Ollama (Hôte GPU) + Docker Compose (PostgreSQL, FastAPI, React)
# ==============================================================================

set -e

echo -e "\033[1;36m====================================================\033[0m"
echo -e "\033[1;36m        DÉMARRAGE AUTOMATISÉ UNIFIÉ - LLM4SQL       \033[0m"
echo -e "\033[1;36m====================================================\033[0m"

# 1. Variables d'optimisation matérielle Ollama
export OLLAMA_KV_CACHE_TYPE="q4_0"
export OLLAMA_FLASH_ATTENTION="1"
export OLLAMA_KEEP_ALIVE="-1"
export OLLAMA_NUM_PARALLEL="1"
export OLLAMA_HOST="0.0.0.0:11434"
export OLLAMA_ORIGINS="*"

echo -e "\n\033[1;33m1. Vérification d'Ollama sur le système hôte...\033[0m"
if ! curl -s "http://127.0.0.1:11434/api/tags" > /dev/null 2>&1; then
    echo -e "   [~] Démarrage d'Ollama en arrière-plan..."
    if command -v ollama >/dev/null 2>&1; then
        ollama serve >/dev/null 2>&1 &
        sleep 2
    else
        echo -e "   \033[1;33m[AVERTISSEMENT] Binaire ollama introuvable dans le PATH. Assurez-vous qu'il tourne sur le port 11434.\033[0m"
    fi
else
    echo -e "   \033[1;32m[OK] Ollama est déjà actif sur le port 11434.\033[0m"
fi

# 2. Vérification de Docker
echo -e "\n\033[1;33m2. Vérification du démon Docker...\033[0m"
if ! docker info > /dev/null 2>&1; then
    echo -e "   \033[1;31m[ERREUR] Le moteur Docker n'est pas démarré.\033[0m"
    exit 1
fi
echo -e "   \033[1;32m[OK] Moteur Docker opérationnel.\033[0m"

# 3. Lancement de Docker Compose
echo -e "\n\033[1;33m3. Construction et lancement de la Stack Docker Compose...\033[0m"
cd "$(dirname "$0")"
docker compose up --build -d

# 4. Attente de la disponibilité
echo -e "\n\033[1;33m4. Attente de la disponibilité de l'application...\033[0m"
for i in {1..30}; do
    if curl -s -I "http://localhost:5173" | grep -q "200 OK"; then
        break
    fi
    sleep 1
done

echo -e "\n\033[1;36m====================================================\033[0m"
echo -e "\033[1;36m        🎉 LLM4SQL EST EN LIGNE ET PRÊT !           \033[0m"
echo -e "\033[1;36m====================================================\033[0m"
echo -e " - Frontend Web    : \033[1;37mhttp://localhost:5173\033[0m"
echo -e " - Backend FastAPI : \033[1;37mhttp://localhost:8000\033[0m"
echo -e " - BDD PostgreSQL  : \033[1;37mPort 5433\033[0m"
echo -e " - Ollama (Hôte)   : \033[1;37mPort 11434\033[0m"
echo -e "\033[1;36m====================================================\033[0m"
echo -e "Pour arrêter l'application : ./stop.sh"

# Ouverture du navigateur selon l'OS
if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:5173" >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
    open "http://localhost:5173" >/dev/null 2>&1 &
fi
