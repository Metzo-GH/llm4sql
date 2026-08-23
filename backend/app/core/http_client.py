import httpx
import logging
import threading
from typing import Optional

logger = logging.getLogger("llm4sql.http_client")

_async_client: Optional[httpx.AsyncClient] = None
_sync_client: Optional[httpx.Client] = None
_client_lock = threading.Lock()


def init_http_clients() -> None:
    """
    Initialise les instances globales httpx.AsyncClient et httpx.Client
    avec Keep-Alive connection pooling pour réutilisation efficace des connexions TCP.
    """
    global _async_client, _sync_client
    with _client_lock:
        limits = httpx.Limits(
            max_keepalive_connections=20,
            max_connections=50,
            keepalive_expiry=10.0
        )
        timeout = httpx.Timeout(10.0, connect=2.0)
        
        if _async_client is None or _async_client.is_closed:
            _async_client = httpx.AsyncClient(limits=limits, timeout=timeout)
            
        if _sync_client is None or _sync_client.is_closed:
            _sync_client = httpx.Client(limits=limits, timeout=timeout)
            
    logger.info("[HTTP Client] Pools HTTPX initialisés (Async & Sync).")


async def close_http_clients() -> None:
    """
    Ferme proprement les connexions actives des pools HTTPX lors de l'arrêt de l'application.
    """
    global _async_client, _sync_client
    with _client_lock:
        if _async_client is not None and not _async_client.is_closed:
            await _async_client.aclose()
            _async_client = None
            
        if _sync_client is not None and not _sync_client.is_closed:
            _sync_client.close()
            _sync_client = None
            
    logger.info("[HTTP Client] Pools HTTPX fermés avec succès.")


def get_async_http_client() -> httpx.AsyncClient:
    """
    Retourne l'instance partagée httpx.AsyncClient. L'initialise si nécessaire.
    """
    global _async_client
    if _async_client is None or _async_client.is_closed:
        init_http_clients()
    return _async_client


def get_sync_http_client() -> httpx.Client:
    """
    Retourne l'instance partagée httpx.Client pour les contextes synchrones. L'initialise si nécessaire.
    """
    global _sync_client
    if _sync_client is None or _sync_client.is_closed:
        init_http_clients()
    return _sync_client
