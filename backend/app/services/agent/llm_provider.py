import threading
from collections import OrderedDict
from typing import Optional
from langchain_ollama import ChatOllama
from app.core.config import settings

_llm_lock = threading.Lock()
_llm_cache = OrderedDict()
MAX_LLM_CACHE_SIZE = 10


def get_llm(model: Optional[str] = None, temperature: float = 0.0, context_size: int = 4096) -> ChatOllama:
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
                
            _llm_cache[cache_key] = ChatOllama(
                model=model,
                base_url=settings.OLLAMA_BASE_URL,
                temperature=temperature,
                num_ctx=context_size,
                keep_alive=-1,
                reasoning=True
            )
        return _llm_cache[cache_key]
