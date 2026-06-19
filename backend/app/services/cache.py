import logging
import threading
from typing import List, Dict, Any, Optional
import httpx
from app.core.config import settings

# Configuration du logger pour le cache sémantique
logger = logging.getLogger("llm4sql.cache")

class SemanticCache:
    """
    Système de Cache Sémantique ultra-léger (RAG Mémoire) pour LLM4SQL.
    
    Permet de stocker et de rechercher les requêtes SQL précédemment générées
    et exécutées en utilisant les embeddings du LLM local (Ollama).
    En cas de problème technique, un algorithme Jaccard prend le relais.
    """
    
    def __init__(self) -> None:
        """
        Initialise la structure de données en mémoire et le verrou de synchronisation.
        """
        self._cache: List[Dict[str, Any]] = []
        self._lock = threading.Lock()
        
    def _jaccard_similarity(self, str1: str, str2: str) -> float:
        """
        Calcule la similarité de Jaccard au niveau des mots entre deux chaînes.
        Sert de mécanisme de repli (fallback) robuste.
        
        Args:
            str1 (str): Première chaîne de caractères.
            str2 (str): Deuxième chaîne de caractères.
            
        Returns:
            float: Score de similarité entre 0.0 et 1.0.
        """
        words1 = set(str1.lower().split())
        words2 = set(str2.lower().split())
        if not words1 and not words2:
            return 1.0
        intersection = words1.intersection(words2)
        union = words1.union(words2)
        return len(intersection) / len(union)

    def _cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """
        Calcule le produit scalaire (similarité cosinus pour des vecteurs normalisés L2).
        
        Args:
            vec1 (List[float]): Premier vecteur.
            vec2 (List[float]): Deuxième vecteur.
            
        Returns:
            float: Score de similarité cosinus.
        """
        if len(vec1) != len(vec2) or not vec1:
            return 0.0
        return sum(a * b for a, b in zip(vec1, vec2))

    def _get_embedding(self, text: str, model: str) -> Optional[List[float]]:
        """
        Génère l'embedding du texte via l'API locale d'Ollama (/api/embed).
        
        Args:
            text (str): Texte à vectoriser.
            model (str): Modèle à utiliser pour la vectorisation.
            
        Returns:
            Optional[List[float]]: Vecteur d'embeddings ou None en cas d'erreur.
        """
        url = f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/embed"
        payload = {
            "model": model,
            "input": text
        }
        try:
            # Utilisation de httpx pour un appel synchrone rapide
            with httpx.Client(timeout=5.0) as client:
                response = client.post(url, json=payload)
                if response.status_code == 200:
                    data = response.json()
                    embeddings = data.get("embeddings")
                    if embeddings and len(embeddings) > 0:
                        return embeddings[0]
        except Exception as e:
            logger.warning(f"Échec de récupération de l'embedding Ollama: {str(e)}. Utilisation du repli Jaccard.")
        return None

    def check(self, question: str, model: str, threshold: float = 0.85) -> Optional[Dict[str, Any]]:
        """
        Recherche une question sémantiquement similaire dans le cache.
        """
        query_text = question.strip()
        if not query_text:
            return None
            
        with self._lock:
            # 1. Recherche exacte immédiate (sans appel d'embedding)
            for entry in self._cache:
                if entry["question"].lower() == query_text.lower():
                    logger.info(f"Hit exact trouvé dans le cache pour: '{query_text}'")
                    return entry["response"]
            
            # Si le cache est vide, pas besoin d'aller plus loin
            if not self._cache:
                return None
                
            # Snapshot de la liste pour les calculs hors verrou
            cache_snapshot = list(self._cache)

        # 2. Recherche sémantique via embeddings Ollama (HORS VERROU)
        query_vector = self._get_embedding(query_text, model)
        
        best_score = -1.0
        best_entry = None
        
        if query_vector is not None:
            for entry in cache_snapshot:
                cached_vector = entry.get("vector")
                if cached_vector:
                    score = self._cosine_similarity(query_vector, cached_vector)
                    if score > best_score:
                        best_score = score
                        best_entry = entry
            
            logger.info(f"Meilleur score de similarité cosinus: {best_score:.4f} (Seuil: {threshold})")
            if best_score >= threshold and best_entry:
                logger.info(f"Hit sémantique (Cosinus) pour: '{query_text}' -> '{best_entry['question']}'")
                return best_entry["response"]
        
        # 3. Repli (Fallback) sur la similarité Jaccard (HORS VERROU)
        best_jaccard = -1.0
        best_jaccard_entry = None
        
        for entry in cache_snapshot:
            score = self._jaccard_similarity(query_text, entry["question"])
            if score > best_jaccard:
                best_jaccard = score
                best_jaccard_entry = entry
                
        logger.info(f"Meilleur score de similarité Jaccard: {best_jaccard:.4f} (Seuil: {threshold})")
        if best_jaccard >= threshold and best_jaccard_entry:
            logger.info(f"Hit sémantique (Jaccard) pour: '{query_text}' -> '{best_jaccard_entry['question']}'")
            return best_jaccard_entry["response"]
            
        return None

    def set(
        self, 
        question: str, 
        model: str, 
        sql_query: str, 
        query_results: List[Dict[str, Any]], 
        iteration_count: int,
        tables: List[str]
    ) -> None:
        """
        Stocke une nouvelle réponse réussie dans le cache sémantique.
        """
        query_text = question.strip()
        if not query_text or not sql_query:
            return
            
        # Obtenir l'embedding pour le stockage futur (HORS VERROU)
        vector = self._get_embedding(query_text, model)
        
        response_data = {
            "sql_query": sql_query,
            "query_results": query_results,
            "iteration_count": iteration_count,
            "tables": tables,
            "error_message": None
        }
        
        with self._lock:
            # Éviter les doublons exacts dans le cache en mémoire
            self._cache = [e for e in self._cache if e["question"].lower() != query_text.lower()]
            
            # Limiter le cache à 100 entrées maximum pour éviter les fuites mémoire
            if len(self._cache) >= 100:
                self._cache.pop(0)
                
            self._cache.append({
                "question": query_text,
                "vector": vector,
                "response": response_data
            })
            logger.info(f"Ajout au cache sémantique réussi : '{query_text}'")

    def clear(self) -> None:
        """
        Vide l'intégralité du cache sémantique.
        """
        with self._lock:
            self._cache.clear()
            logger.info("Le cache sémantique a été vidé.")

# Instance globale partagée
semantic_cache = SemanticCache()
