from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

class ChatRequest(BaseModel):
    """
    Modèle de validation pour la requête de discussion SQL.
    """
    question: str = Field(
        ..., 
        max_length=1000,
        description="La question en français formulée par l'utilisateur.",
        examples=["Donne-moi la liste des ouvrages dessinés par Christophe Blain."]
    )
    custom_schema: Optional[str] = Field(
        None,
        max_length=100000,
        description="Schéma de base de données fourni par l'utilisateur (optionnel)."
    )
    simulate_only: bool = Field(
        False,
        description="Si vrai, l'agent générera le SQL mais ne l'exécutera pas."
    )
    model: Optional[str] = Field(None, max_length=100, description="Modèle Ollama à utiliser (optionnel).")
    temperature: Optional[float] = Field(None, description="Température de génération (optionnelle).")
    context_size: Optional[int] = Field(None, description="Taille du contexte Ollama (optionnelle).")
    bypass_semantic_cache: bool = Field(False, description="Si vrai, l'agent ignorera le cache sémantique et ré-exécutera le LLM.")


class ChatResponse(BaseModel):
    """
    Modèle de validation pour la réponse de discussion SQL.
    """
    question: str = Field(..., description="La question initiale de l'utilisateur.")
    sql_query: Optional[str] = Field(None, description="La requête SQL PostgreSQL SELECT générée.")
    error_message: Optional[str] = Field(None, description="Message d'erreur SQL ou de sécurité si échec.")
    query_results: Optional[List[Dict[str, Any]]] = Field(None, description="Résultats de l'exécution SQL (dictionnaire JSON).")
    iteration_count: int = Field(..., description="Le nombre d'itérations d'auto-correction réalisées.")
    steps: List[Dict[str, Any]] = Field(default=[], description="Trace des étapes d'exécution de l'agent.")
    cache_hit: bool = Field(default=False, description="Indique si la réponse provient du cache sémantique.")
    tables: List[str] = Field(default=[], description="Liste des tables impliquées dans la requête.")
