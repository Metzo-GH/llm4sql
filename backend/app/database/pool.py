import contextlib
import threading
import psycopg2
from typing import Generator, Any
from psycopg2.pool import ThreadedConnectionPool
from app.core.config import settings
from app.core.security import validate_sandbox_sql

_pool = None
_pool_lock = threading.Lock()


def init_db_pool() -> None:
    """
    Initialise le pool de connexions ThreadedConnectionPool.
    """
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                # Créer un pool avec minconn=2 et maxconn=10
                _pool = ThreadedConnectionPool(
                    minconn=2,
                    maxconn=10,
                    **settings.get_db_params()
                )


def get_pool() -> ThreadedConnectionPool:
    """
    Retourne l'instance du pool. Initialise le pool si nécessaire.
    """
    if _pool is None:
        init_db_pool()
    return _pool


def close_db_pool() -> None:
    """
    Ferme proprement toutes les connexions du pool.
    """
    global _pool
    if _pool is not None:
        with _pool_lock:
            if _pool is not None:
                _pool.closeall()
                _pool = None


def get_db_connection(schema: str = "public", readonly: bool = False) -> Any:
    """
    Crée et retourne une nouvelle connexion à la base de données PostgreSQL (hors pool, pour scripts isolés).
    
    Args:
        schema (str): Le schéma PostgreSQL cible ("public" ou "user_sandbox").
        readonly (bool): Si True, la connexion sera marquée en lecture seule.
        
    Returns:
        psycopg2.extensions.connection: L'objet connexion PostgreSQL.
        
    Raises:
        ValueError: Si le schéma n'est ni 'public' ni 'user_sandbox'.
        RuntimeError: En cas d'échec de la connexion à la base de données.
    """
    if schema not in ("public", "user_sandbox"):
        raise ValueError(f"Schéma non autorisé : '{schema}'. Choisir 'public' ou 'user_sandbox'.")
    try:
        conn = psycopg2.connect(**settings.get_db_params())
        if readonly:
            conn.readonly = True
        with conn.cursor() as cur:
            cur.execute(f"SET search_path TO {schema};")
        return conn
    except Exception as e:
        raise RuntimeError(f"Échec de la connexion à PostgreSQL sur {settings.DB_HOST}:{settings.DB_PORT} - Erreur : {str(e)}")


@contextlib.contextmanager
def get_db_conn(schema: str = "public", readonly: bool = False) -> Generator[Any, None, None]:
    """
    Context manager pour obtenir et libérer une connexion du pool.
    Configure automatiquement le search_path sur le schéma spécifié et le mode lecture seule.
    """
    if schema not in ("public", "user_sandbox"):
        raise ValueError(f"Schéma non autorisé : '{schema}'. Choisir 'public' ou 'user_sandbox'.")
    pool = get_pool()
    conn = pool.getconn()
    try:
        conn.readonly = readonly
        with conn.cursor() as cur:
            cur.execute(f"SET search_path TO {schema};")
        yield conn
    except Exception:
        conn.rollback()
        raise
    finally:
        try:
            conn.readonly = False
            conn.rollback()
        except Exception:
            pass
        pool.putconn(conn)


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
