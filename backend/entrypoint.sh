#!/bin/sh
set -e

echo "[LLM4SQL Docker Entrypoint] Démarrage du backend..."

# 1. Attente active de PostgreSQL
echo "[LLM4SQL Docker Entrypoint] Attente de la disponibilité de PostgreSQL ($DB_HOST:$DB_PORT)..."
python - <<'EOF'
import os
import time
import psycopg2

db_host = os.getenv("DB_HOST", "db")
db_port = int(os.getenv("DB_PORT", "5432"))
db_name = os.getenv("DB_NAME", "llm4sql_db")
db_user = os.getenv("DB_USER", "postgres")
db_password = os.getenv("DB_PASSWORD", "postgres")

max_retries = 30
for i in range(max_retries):
    try:
        conn = psycopg2.connect(
            host=db_host,
            port=db_port,
            dbname=db_name,
            user=db_user,
            password=db_password,
            connect_timeout=2
        )
        conn.close()
        print(f"[LLM4SQL Docker Entrypoint] PostgreSQL est prêt et accessible !")
        break
    except Exception as e:
        print(f"[LLM4SQL Docker Entrypoint] Attente PostgreSQL ({i+1}/{max_retries})...")
        time.sleep(1)
else:
    print("[LLM4SQL Docker Entrypoint] ERREUR: Impossible de joindre PostgreSQL après 30s.")
    exit(1)
EOF

# 2. Initialisation / Seed de la base de données (si les tables n'existent pas)
echo "[LLM4SQL Docker Entrypoint] Vérification du schéma initial..."
python - <<'EOF'
import os
import psycopg2

db_host = os.getenv("DB_HOST", "db")
db_port = int(os.getenv("DB_PORT", "5432"))
db_name = os.getenv("DB_NAME", "llm4sql_db")
db_user = os.getenv("DB_USER", "postgres")
db_password = os.getenv("DB_PASSWORD", "postgres")

try:
    conn = psycopg2.connect(
        host=db_host,
        port=db_port,
        dbname=db_name,
        user=db_user,
        password=db_password
    )
    cur = conn.cursor()
    cur.execute("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ouvrage';")
    count = cur.fetchone()[0]
    conn.close()
    
    if count == 0:
        print("[LLM4SQL Docker Entrypoint] Schéma absent : exécution du seed initial (BD Ouvrages)...")
        from app.database.seed_db import seed_database
        seed_database()
        print("[LLM4SQL Docker Entrypoint] Seed terminé avec succès !")
    else:
        print("[LLM4SQL Docker Entrypoint] Données existantes détectées dans la base.")
except Exception as err:
    print(f"[LLM4SQL Docker Entrypoint] Avertissement vérification schéma: {err}")
EOF

# 3. Lancement de l'application FastAPI avec Uvicorn
echo "[LLM4SQL Docker Entrypoint] Lancement du serveur FastAPI Uvicorn sur 0.0.0.0:8000..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --timeout-graceful-shutdown 2
