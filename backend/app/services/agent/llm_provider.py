import threading
import httpx
from collections import OrderedDict
from typing import Optional
from langchain_ollama import ChatOllama
from app.core.config import settings

_llm_lock = threading.Lock()
_llm_cache = OrderedDict()
MAX_LLM_CACHE_SIZE = 10
_model_context_lengths = {}


def get_model_context_length(model_name: str) -> int:
    """
    Interroge l'API Ollama /api/show pour récupérer la taille de contexte native du modèle.
    Utilise un cache en mémoire pour éviter les appels HTTP répétés.
    """
    global _model_context_lengths
    if model_name in _model_context_lengths:
        return _model_context_lengths[model_name]
        
    try:
        url = f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/show"
        with httpx.Client(timeout=2.0) as client:
            response = client.post(url, json={"name": model_name})
            if response.status_code == 200:
                data = response.json()
                model_info = data.get("model_info", {})
                for k, v in model_info.items():
                    if k.endswith(".context_length") and isinstance(v, int):
                        _model_context_lengths[model_name] = v
                        return v
    except Exception as e:
        print(f"[Ollama API] Impossible de récupérer le context_length de {model_name}: {e}")
        
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
