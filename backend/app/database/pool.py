import contextlib
import threading
import psycopg
from typing import Generator, Any
from psycopg_pool import ConnectionPool
from app.core.config import settings
from app.core.security import validate_sandbox_sql

_pool = None
_pool_lock = threading.Lock()


def init_db_pool() -> None:
    """
    Initialise le pool de connexions ConnectionPool.
    """
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                # Créer un pool avec min_size=2 et max_size=10
                _pool = ConnectionPool(
                    conninfo=settings.get_conninfo(),
                    min_size=2,
                    max_size=10,
                    open=True
                )


def get_pool() -> ConnectionPool:
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
                _pool.close()
                _pool = None


def _configure_connection(conn: Any, schema: str = "public", readonly: bool = False) -> None:
    """
    Configure le search_path et le mode lecture seule sur une connexion PostgreSQL active.
    
    Raises:
        ValueError: Si le schéma n'est ni 'public' ni 'user_sandbox'.
    """
    if schema not in ("public", "user_sandbox"):
        raise ValueError(f"Schéma non autorisé : '{schema}'. Choisir 'public' ou 'user_sandbox'.")
    conn.autocommit = True
    conn.execute(psycopg.sql.SQL("SET search_path TO {}").format(psycopg.sql.Identifier(schema)))
    conn.autocommit = False
    conn.read_only = readonly


def get_db_connection(schema: str = "public", readonly: bool = False) -> Any:
    """
    Crée et retourne une nouvelle connexion à la base de données PostgreSQL (hors pool, pour scripts isolés).
    
    Args:
        schema (str): Le schéma PostgreSQL cible ("public" ou "user_sandbox").
        readonly (bool): Si True, la connexion sera marquée en lecture seule.
        
    Returns:
        psycopg.Connection: L'objet connexion PostgreSQL.
        
    Raises:
        ValueError: Si le schéma n'est ni 'public' ni 'user_sandbox'.
        RuntimeError: En cas d'échec de la connexion à la base de données.
    """
    if schema not in ("public", "user_sandbox"):
        raise ValueError(f"Schéma non autorisé : '{schema}'. Choisir 'public' ou 'user_sandbox'.")
    try:
        conn = psycopg.connect(settings.get_conninfo())
        _configure_connection(conn, schema=schema, readonly=readonly)
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
        _configure_connection(conn, schema=schema, readonly=readonly)
        yield conn
    except Exception:
        conn.rollback()
        raise
    finally:
        try:
            conn.rollback()
            conn.read_only = False
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
