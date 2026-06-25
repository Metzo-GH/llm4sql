#!/usr/bin/env bash

set -e

echo "===================================================="
echo "      DÉMARRAGE AUTOMATISÉ DU BACKEND LLM4SQL       "
echo "===================================================="

###############################################################################
# 1. Configuration Ollama
###############################################################################

echo
echo "1. Configuration globale des optimisations Ollama sous Linux..."

OLLAMA_RUNNING=false

if curl -s --max-time 2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    OLLAMA_RUNNING=true
fi

if [[ "$OLLAMA_RUNNING" == "true" ]] \
   && [[ "${OLLAMA_KV_CACHE_TYPE:-}" == "q4_0" ]]; then

    echo "   [OK] Ollama est déjà configuré et actif (Port 11434)."

else

    export OLLAMA_KV_CACHE_TYPE="q4_0"
    export OLLAMA_FLASH_ATTENTION="1"
    export OLLAMA_KEEP_ALIVE="-1"
    export OLLAMA_NUM_PARALLEL="1"

    echo "   [OK] Variables Ollama configurées."
    echo "   [~] Démarrage d'Ollama..."

    pkill -f ollama >/dev/null 2>&1 || true
    sleep 2

    STARTED=false

    # Vérifie si ollama est installé
    if command -v ollama >/dev/null 2>&1; then

        nohup ollama serve >/dev/null 2>&1 &

        for i in {1..12}; do
            sleep 0.5

            if curl -s --max-time 1 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
                STARTED=true
                echo "   [OK] Serveur Ollama démarré (Port 11434 actif)."
                break
            fi
        done
    fi

    if [[ "$STARTED" != "true" ]]; then
        echo "   [AVERTISSEMENT] Impossible de valider le démarrage d'Ollama."
        echo "                    Vérifiez qu'il tourne sur le port 11434."
    fi
fi

###############################################################################
# 2. Configuration de uv
###############################################################################

echo
echo "2. Configuration de l'environnement Python (uv)..."

LOCAL_BIN="$HOME/.local/bin"

if [[ ":$PATH:" != *":$LOCAL_BIN:"* ]]; then
    export PATH="$PATH:$LOCAL_BIN"
fi

echo "   [OK] Path local 'uv' configuré."

###############################################################################
# 3. Démarrage PostgreSQL Docker
###############################################################################

echo
echo "3. Démarrage de la base de données PostgreSQL (Docker)..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if docker compose up -d; then
    echo "   [OK] Conteneurs Docker démarrés (Port 5433)."
else
    echo "   [ERREUR] Impossible de lancer Docker Compose."
    echo "             Assurez-vous que Docker est démarré."
    exit 1#!/usr/bin/env bash
fi

set -e

echo "===================================================="
echo "      DÉMARRAGE AUTOMATISÉ DU BACKEND LLM4SQL       "
echo "===================================================="


###############################################################################
# 4. Attente PostgreSQL
###############################################################################

echo
echo "4. Attente de la préparation de PostgreSQL (3 secondes)..."
sleep 3

###############################################################################
# 5. Seed de la base
###############################################################################

echo
echo "5. Initialisation des données (BD Ouvrages)..."

if uv run -m app.database.seed_db; then
    echo "   [OK] Schéma et données initialisés avec succès !"
else
    echo "   [AVERTISSEMENT] Échec de l'initialisation des données."
fi

###############################################################################
# 6. Lancement FastAPI
###############################################################################

echo
echo "===================================================="
echo "          BACKEND PRÊT ET OPTIMISÉ ! 🎉"
echo "===================================================="
echo "Lancement automatique du serveur FastAPI..."
echo "===================================================="

exec uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

echo "===================================================="
