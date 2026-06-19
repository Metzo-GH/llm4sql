import contextlib
import threading
from typing import Generator, Any
from psycopg2.pool import ThreadedConnectionPool
from app.core.config import settings

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


@contextlib.contextmanager
def get_db_conn(readonly: bool = False) -> Generator[Any, None, None]:
    """
    Context manager pour obtenir et libérer une connexion du pool.
    Configure automatiquement le search_path sur 'user_sandbox, public' et le mode lecture seule.
    """
    pool = get_pool()
    conn = pool.getconn()
    try:
        conn.readonly = readonly
        with conn.cursor() as cur:
            cur.execute("SET search_path TO user_sandbox, public;")
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
