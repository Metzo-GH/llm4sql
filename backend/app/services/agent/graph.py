from typing import Dict, Any, Optional
import logging

from langgraph.graph import StateGraph, END
from app.core.config import settings
from app.services.agent.state import AgentState, send_agent_event
from app.services.cache import semantic_cache

logger = logging.getLogger("llm4sql.agent.graph")

# Importation des nœuds et du routage découpés (SOLID - SRP)
from app.services.agent.nodes import (
    node_agent_loop,
    node_execute_tools,
    node_force_loop_break,
    node_clean_and_finalize
)
from app.services.agent.routing import should_continue_react


def create_agent_graph() -> StateGraph:
    """
    Crée et compile le graphe LangGraph ReAct.
    """
    workflow = StateGraph(AgentState)
    
    # Enregistrement des nœuds
    workflow.add_node("agent_loop", node_agent_loop)
    workflow.add_node("execute_tools", node_execute_tools)
    workflow.add_node("force_loop_break", node_force_loop_break)
    workflow.add_node("clean_and_finalize", node_clean_and_finalize)
    
    # Configuration du point d'entrée
    workflow.set_entry_point("agent_loop")
    
    # Configuration des transitions conditionnelles
    workflow.add_conditional_edges("agent_loop", should_continue_react, {
        "execute_tools": "execute_tools",
        "force_loop_break": "force_loop_break",
        "clean_and_finalize": "clean_and_finalize"
    })
    
    # Transitions standards
    workflow.add_edge("execute_tools", "agent_loop")
    workflow.add_edge("force_loop_break", END)
    workflow.add_edge("clean_and_finalize", END)
    
    return workflow.compile()


# Instance globale du graphe compilé prêt à l'emploi
agent_app = create_agent_graph()


def run_agent(
    question: str, 
    custom_schema: Optional[str] = None, 
    simulate_only: bool = False,
    model: Optional[str] = None,
    temperature: Optional[float] = None,
    context_size: Optional[int] = None,
    bypass_semantic_cache: bool = False
) -> Dict[str, Any]:
    """
    Interface simple de haut niveau pour lancer l'agent sur une question utilisateur.
    Elle intègre la vérification du cache sémantique et la mise en cache des réponses.
    """
    logger.info(f"[DEBUT AGENT] Lancement du moteur LangGraph pour la question : '{question}' (Bypass Cache: {bypass_semantic_cache})")
    send_agent_event("log", f"[DEBUT AGENT] Lancement du moteur LangGraph (Bypass Cache: {bypass_semantic_cache})")
    
    # 1. Vérification du cache sémantique (RAG Mémoire)
    active_model = model or settings.OLLAMA_MODEL
    cached_res = None if bypass_semantic_cache else semantic_cache.check(question, model=active_model)
    if cached_res:
        logger.info(f"[CACHE HIT] Résultat sémantique trouvé pour : '{question}'")
        send_agent_event("log", f"[CACHE HIT] Résultat sémantique trouvé pour : '{question}'")
        send_agent_event("log", "[FIN] Requete resolue avec succes et validee !")
        return {
            "question": question,
            "sql_query": cached_res["sql_query"],
            "error_message": None,
            "query_results": cached_res["query_results"],
            "iteration_count": cached_res["iteration_count"],
            "schema_context": custom_schema or "",
            "simulate_only": simulate_only,
            "steps": [{
                "node": "semantic_cache",
                "elapsed": 0.0,
                "success": True,
                "message": "Récupéré du cache sémantique local (0ms)"
            }],
            "tables": cached_res.get("tables", []),
            "cache_hit": True
        }
        
    # 2. Déterminer le schéma à utiliser
    schema_context = custom_schema if custom_schema else ""
    
    # 3. Définir l'état de départ
    initial_state: AgentState = {
        "question": question,
        "sql_query": None,
        "error_message": None,
        "query_results": None,
        "iteration_count": 0,
        "schema_context": schema_context,
        "simulate_only": simulate_only,
        "steps": [],
        "tables": [],
        "model": model,
        "temperature": temperature,
        "context_size": context_size,
        "messages": []
    }
    
    # 4. Exécuter le graphe
    final_state = agent_app.invoke(initial_state)
    
    # 5. Mettre en cache si exécution réussie
    if final_state.get("query_results") is not None and not final_state.get("error_message"):
        semantic_cache.set(
            question=question,
            model=active_model,
            sql_query=final_state["sql_query"],
            query_results=final_state["query_results"],
            iteration_count=final_state["iteration_count"],
            tables=final_state.get("tables", [])
        )
        
    return final_state
