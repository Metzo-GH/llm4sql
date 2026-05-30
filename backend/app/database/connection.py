import psycopg2
from typing import Any
from app.core.config import settings


def get_db_connection(readonly: bool = False) -> Any:
    """
    Crée et retourne une nouvelle connexion à la base de données PostgreSQL.
    
    Cette méthode centralise la connexion en s'appuyant sur la configuration globale.
    Elle permet de forcer le mode lecture seule au niveau du pilote si spécifié.
    
    Args:
        readonly (bool): Si True, la connexion sera marquée en lecture seule.
        
    Returns:
        psycopg2.extensions.connection: L'objet connexion PostgreSQL.
        
    Raises:
        RuntimeError: En cas d'échec de la connexion à la base de données.
    """
    try:
        conn = psycopg2.connect(**settings.get_db_params())
        if readonly:
            conn.readonly = True
        return conn
    except Exception as e:
        raise RuntimeError(f"Échec de la connexion à PostgreSQL sur {settings.DB_HOST}:{settings.DB_PORT} - Erreur : {str(e)}")


def init_user_sandbox(schema_sql: str, insert_sql: str = None) -> None:
    """
    Crée un environnement isolé (sandbox) pour l'utilisateur dans PostgreSQL.
    Détruit l'ancien bac à sable s'il existait, puis exécute les scripts de création et d'insertion.
    
    Args:
        schema_sql (str): Le script SQL DDL (CREATE TABLE...).
        insert_sql (str, optional): Le script SQL DML (INSERT INTO...).
    """
    conn = get_db_connection(readonly=False)
    try:
        with conn.cursor() as cur:
            # 1. Nettoyage et création du schéma isolé
            cur.execute("DROP SCHEMA IF EXISTS user_sandbox CASCADE;")
            cur.execute("CREATE SCHEMA user_sandbox;")
            # On se place dans ce nouveau schéma
            cur.execute("SET search_path TO user_sandbox;")
            
            # 2. Exécution du Schéma (DDL)
            if schema_sql and schema_sql.strip():
                cur.execute(schema_sql)
            
            # 3. Exécution des Données (DML)
            if insert_sql and insert_sql.strip():
                cur.execute(insert_sql)
                
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise RuntimeError(f"Erreur SQL lors de l'initialisation du Bac à sable : {str(e)}")
    finally:
        conn.close()
