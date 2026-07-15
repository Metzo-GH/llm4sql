#!/usr/bin/env bash

# Script de démarrage automatisé - LLM4SQL Backend 🚀
# Ce script configure l'environnement, lance Docker, applique les optimisations et prépare Ollama.

set -e

# Couleurs pour le terminal
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}====================================================${NC}"
echo -e "${CYAN}      DÉMARRAGE AUTOMATISÉ DU BACKEND LLM4SQL       ${NC}"
echo -e "${CYAN}====================================================${NC}"

# 1. Configuration des optimisations avancées d'Ollama (Turbo Quant & Speed)
echo
echo -e "${YELLOW}1. Configuration globale des optimisations Ollama sous Linux...${NC}"

# Configuration des variables d'environnement dans la session courante pour héritage immédiat
export OLLAMA_KV_CACHE_TYPE="q4_0"
export OLLAMA_FLASH_ATTENTION="1"
export OLLAMA_KEEP_ALIVE="-1"
export OLLAMA_NUM_PARALLEL="1"

# Détection si Ollama tourne en tant que service systemd
if systemctl is-active --quiet ollama 2>/dev/null; then
    # Si le service systemd est actif mais n'est pas optimisé
    if [ ! -f /etc/systemd/system/ollama.service.d/override.conf ]; then
        echo -e "   [~] Service Ollama systemd détecté sans les optimisations."
        echo -e "   [~] Configuration automatique du service (nécessite des privilèges d'administration)..."
        
        # Création de la surcharge systemd de manière permanente
        sudo mkdir -p /etc/systemd/system/ollama.service.d
        sudo tee /etc/systemd/system/ollama.service.d/override.conf <<EOF >/dev/null
[Service]
Environment="OLLAMA_KV_CACHE_TYPE=q4_0"
Environment="OLLAMA_FLASH_ATTENTION=1"
Environment="OLLAMA_KEEP_ALIVE=-1"
Environment="OLLAMA_NUM_PARALLEL=1"
EOF
        # Rechargement et redémarrage du service
        echo -e "   [~] Rechargement de systemd et redémarrage d'Ollama..."
        sudo systemctl daemon-reload
        sudo systemctl restart ollama
        echo -e "   ${GREEN}[OK] Service Ollama configuré de manière permanente et redémarré !${NC}"
    else
        echo -e "   ${GREEN}[OK] Service Ollama systemd déjà configuré avec les optimisations permanentes.${NC}"
    fi
else
    # Si Ollama ne tourne pas sous systemd, vérification s'il est déjà démarré manuellement
    OLLAMA_RUNNING=false
    if curl -s --max-time 2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
        OLLAMA_RUNNING=true
    fi

    if [[ "$OLLAMA_RUNNING" == "true" ]]; then
        echo -e "   ${GREEN}[OK] Ollama est déjà actif sur le port 11434 (mode autonome).${NC}"
    else
        # Démarrage manuel d'Ollama en arrière-plan
        echo -e "   [~] Démarrage d'un serveur Ollama local..."
        
        if command -v ollama >/dev/null 2>&1; then
            pkill -f ollama >/dev/null 2>&1 || true
            sleep 1
            nohup ollama serve >/dev/null 2>&1 &
            
            STARTED=false
            for i in {1..12}; do
                sleep 0.5
                if curl -s --max-time 1 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
                    STARTED=true
                    echo -e "   ${GREEN}[OK] Serveur Ollama CLI démarré en arrière-plan (Port 11434 actif).${NC}"
                    break
                fi
            done
            
            if [[ "$STARTED" != "true" ]]; then
                echo -e "   ${YELLOW}[AVERTISSEMENT] Impossible de valider le démarrage d'Ollama.${NC}"
            fi
        else
            echo -e "   ${YELLOW}[AVERTISSEMENT] Ollama n'est pas installé ou n'est pas dans le PATH.${NC}"
        fi
    fi
fi

# 2. Ajout de uv local au PATH pour la session courante
echo
echo -e "${YELLOW}2. Configuration de l'environnement Python (uv)...${NC}"

LOCAL_BIN="$HOME/.local/bin"
if [[ ":$PATH:" != *":$LOCAL_BIN:"* ]]; then
    export PATH="$PATH:$LOCAL_BIN"
fi

echo -e "   ${GREEN}[OK] Path local 'uv' configuré.${NC}"

# 3. Démarrage du conteneur PostgreSQL Docker
echo
echo -e "${YELLOW}3. Démarrage de la base de données PostgreSQL (Docker)...${NC}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if docker compose up -d; then
    echo -e "   ${GREEN}[OK] Conteneurs Docker démarrés (Port 5433).${NC}"
else
    echo -e "   ${RED}[ERREUR] Impossible de lancer Docker Compose. Assurez-vous que Docker est démarré.${NC}"
    exit 1
fi

# 4. Attente de la préparation de la base
echo
echo -e "${YELLOW}4. Attente de la préparation de PostgreSQL (3 secondes)...${NC}"
sleep 3

# 5. Peuplement de la base de données (Seed)
echo
echo -e "${YELLOW}5. Initialisation des données (BD Ouvrages)...${NC}"

if uv run -m app.database.seed_db; then
    echo -e "   ${GREEN}[OK] Schéma et données de BD initialisés avec succès !${NC}"
else
    echo -e "   ${YELLOW}[AVERTISSEMENT] Échec de l'initialisation des données.${NC}"
fi

# 6. Fin du script de démarrage et lancement de FastAPI
echo
echo -e "${CYAN}====================================================${NC}"
echo -e "${CYAN}          BACKEND PRÊT ET OPTIMISÉ ! 🎉              ${NC}"
echo -e "${CYAN}====================================================${NC}"
echo -e "${YELLOW}Lancement automatique du serveur FastAPI...${NC}"
echo -e "${CYAN}====================================================${NC}"

exec uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
