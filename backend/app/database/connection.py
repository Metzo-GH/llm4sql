import psycopg2
from typing import Any
from app.core.config import settings
from app.core.security import validate_sandbox_sql


def get_db_connection(readonly: bool = False) -> Any:
    """
    Crée et retourne une nouvelle connexion à la base de données PostgreSQL.
    
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
    
    Chaque script SQL est validé par l'analyseur AST de sécurité avant exécution.
    
    Args:
        schema_sql (str): Le script SQL DDL (CREATE TABLE...).
        insert_sql (str, optional): Le script SQL DML (INSERT INTO...).
        
    Raises:
        ValueError: Si le SQL contient des instructions interdites.
        RuntimeError: En cas d'erreur SQL lors de l'initialisation.
    """
    if schema_sql and schema_sql.strip():
        is_safe, message = validate_sandbox_sql(schema_sql)
        if not is_safe:
            raise ValueError(f"DDL rejeté par le moteur de securite : {message}")

    if insert_sql and insert_sql.strip():
        is_safe, message = validate_sandbox_sql(insert_sql)
        if not is_safe:
            raise ValueError(f"DML rejeté par le moteur de securite : {message}")

    from app.database.pool import get_db_conn
    try:
        with get_db_conn(readonly=False) as conn:
            with conn.cursor() as cur:
                cur.execute("DROP SCHEMA IF EXISTS user_sandbox CASCADE;")
                cur.execute("CREATE SCHEMA user_sandbox;")
                cur.execute("SET search_path TO user_sandbox;")
                
                if schema_sql and schema_sql.strip():
                    cur.execute(schema_sql)
                
                if insert_sql and insert_sql.strip():
                    cur.execute(insert_sql)
            conn.commit()
    except Exception as e:
        raise RuntimeError(f"Erreur SQL lors de l'initialisation du Bac à sable : {str(e)}")
