# ==============================================================================
# Dockerfile Backend - LLM4SQL (Python 3.12 + uv + FastAPI)
# ==============================================================================
FROM python:3.12-slim

# Configuration des variables d'environnement Python
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# Installation de uv depuis l'image officielle Astral
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Installation des dépendances système légères si nécessaires (ex: curl pour healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copie des fichiers de dépendances
COPY pyproject.toml uv.lock ./

# Installation des dépendances Python via uv (sans dev)
RUN uv sync --frozen --no-dev --no-install-project

# Copie du code source et des scripts
COPY app/ ./app/
COPY entrypoint.sh ./entrypoint.sh

# Droits d'exécution sur le script d'entrée
RUN chmod +x ./entrypoint.sh

# Exposition du port de l'API FastAPI
EXPOSE 8000

# Commande d'exécution du conteneur
ENTRYPOINT ["./entrypoint.sh"]
