import httpx
import logging
from typing import Dict, Any
from fastapi import APIRouter
from app.core.config import settings

logger = logging.getLogger("llm4sql.monitoring")

router = APIRouter(tags=["Monitoring & Ollama"])


@router.get("/")
async def read_root() -> Dict[str, str]:
    """
    Point d'entrée racine retournant le statut de l'API.
    
    Returns:
        Dict[str, str]: Message de statut.
    """
    return {
        "status": "online",
        "message": "Bienvenue sur l'API LLM4SQL local !",
        "environment": settings.ENV
    }


@router.get("/api/ollama/models")
async def get_ollama_models() -> Dict[str, Any]:
    """
    Récupère la liste des modèles installés localement dans Ollama.
    """
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/tags")
            if response.status_code == 200:
                data = response.json()
                models = [m["name"] for m in data.get("models", [])]
                return {"models": models, "online": True}
    except Exception as e:
        logger.error(f"[Ollama API Error] Impossible de joindre Ollama: {str(e)}")
    
    # Fallback si Ollama est injoignable
    return {
        "models": ["qwen3.5:4b", "qwen3.5:9b", "deepseek-r1:1.5b", "deepseek-r1:8b"],
        "online": False
    }


@router.get("/api/ollama/status")
async def get_ollama_status() -> Dict[str, Any]:
    """
    Récupère l'état en temps réel des modèles chargés en mémoire (GPU/CPU).
    """
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/ps")
            if response.status_code == 200:
                data = response.json()
                loaded_models = []
                for m in data.get("models", []):
                    size = m.get("size", 0)
                    size_vram = m.get("size_vram", 0)
                    
                    if size > 0:
                        vram_ratio = size_vram / size
                        gpu_percent = round(vram_ratio * 100)
                    else:
                        gpu_percent = 0
                    
                    cpu_percent = 100 - gpu_percent
                    
                    if gpu_percent == 100:
                        processor_str = "100% GPU"
                    elif gpu_percent == 0:
                        processor_str = "100% CPU"
                    else:
                        processor_str = f"{gpu_percent}% GPU / {cpu_percent}% CPU"
                        
                    loaded_models.append({
                        "name": m.get("name"),
                        "size": size,
                        "size_vram": size_vram,
                        "gpu_percent": gpu_percent,
                        "cpu_percent": cpu_percent,
                        "processor": processor_str,
                        "context_length": m.get("context_length", 0)
                    })
                return {"online": True, "models": loaded_models}
    except Exception as e:
        logger.error(f"[Ollama Status Error] Impossible d'interroger le statut Ollama: {str(e)}")
    return {"online": False, "models": []}
