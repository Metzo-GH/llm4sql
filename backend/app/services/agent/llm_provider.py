import threading
import httpx
import logging
from collections import OrderedDict
from typing import Optional
from langchain_ollama import ChatOllama
from app.core.config import settings

logger = logging.getLogger("llm4sql.agent.llm_provider")

_llm_lock = threading.Lock()
_llm_cache = OrderedDict()
MAX_LLM_CACHE_SIZE = 10
_model_context_lengths = {}


def get_model_context_length(model_name: str, force_refresh: bool = False) -> int:
    """
    Récupère la taille de contexte réelle du modèle depuis l'API Ollama /api/ps si chargé,
    ou interroge /api/show en limitant à une taille réaliste pour éviter les valeurs théoriques géantes.
    """
    global _model_context_lengths
    if not force_refresh and model_name in _model_context_lengths:
        return _model_context_lengths[model_name]
        
    # 1. Tenter d'abord /api/ps pour le modèle actif en mémoire
    try:
        url = f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/ps"
        with httpx.Client(timeout=1.0) as client:
            response = client.get(url)
            if response.status_code == 200:
                data = response.json()
                for m in data.get("models", []):
                    m_name = m.get("name", "")
                    # Match exact ou par préfixe
                    if m_name == model_name or m_name.split(":")[0] == model_name.split(":")[0]:
                        ctx_len = m.get("context_length", 0)
                        if ctx_len > 0:
                            _model_context_lengths[model_name] = ctx_len
                            return ctx_len
    except Exception as e:
        logger.warning(f"[Ollama API] Erreur /api/ps pour context_length: {e}")

    # 2. Repli sur /api/show
    try:
        url = f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/show"
        with httpx.Client(timeout=1.0) as client:
            response = client.post(url, json={"name": model_name})
            if response.status_code == 200:
                data = response.json()
                model_info = data.get("model_info", {})
                for k, v in model_info.items():
                    if k.endswith(".context_length") and isinstance(v, int):
                        # Si la valeur est aberrante (taille max théorique comme 262144),
                        # on la cap à 8192 car Ollama utilise 2048/8192 par défaut.
                        val = v if v <= 32768 else 8192
                        _model_context_lengths[model_name] = val
                        return val
    except Exception as e:
        logger.warning(f"[Ollama API] Impossible de récupérer le context_length via show de {model_name}: {e}")
        
    return 2048


def get_llm(model: Optional[str] = None, temperature: float = 0.0, context_size: int = 0) -> ChatOllama:
    """
    Récupère ou initialise de manière paresseuse un singleton ChatOllama pour une configuration donnée.
    Cette méthode est thread-safe pour éviter les instanciations concurrentes.
    Utilise un cache LRU limité à 10 instances pour éviter les fuites mémoire.
    
    Returns:
        ChatOllama: L'instance unique du client LLM local.
    """
    global _llm_cache
    if not model:
        model = settings.OLLAMA_MODEL
        
    cache_key = f"{model}_{temperature}_{context_size}"
    
    if cache_key in _llm_cache:
        with _llm_lock:
            if cache_key in _llm_cache:
                _llm_cache.move_to_end(cache_key)
                return _llm_cache[cache_key]
            
    with _llm_lock:
        if cache_key not in _llm_cache:
            # Éliminer le plus ancien si limite atteinte
            if len(_llm_cache) >= MAX_LLM_CACHE_SIZE:
                _llm_cache.popitem(last=False)
                
            kwargs = {
                "model": model,
                "base_url": settings.OLLAMA_BASE_URL,
                "temperature": temperature,
                "keep_alive": -1,
                "reasoning": True
            }
            if context_size and context_size > 0:
                kwargs["num_ctx"] = context_size
                
            _llm_cache[cache_key] = ChatOllama(**kwargs)
        return _llm_cache[cache_key]
