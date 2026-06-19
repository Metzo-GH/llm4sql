import time
from typing import Dict, Any, Optional

from langgraph.graph import StateGraph, END

from app.core.config import settings
from app.services.agent.state import AgentState, send_agent_event
from app.services.agent.nodes import node_select_tables, node_generate_sql, node_execute_sql
from app.services.cache import semantic_cache


def should_continue(state: AgentState) -> str:
    """
    Edge conditionnel pour décider si on continue la boucle d'auto-correction (Self-Healing)
    ou si on s'arrête (succès ou limite d'itérations de 3 atteinte).
    """
    if state["error_message"] is None:
        print("\n[FIN] Requete resolue avec succes et validee !")
        send_agent_event("log", "[FIN] Requete resolue avec succes et validee !")
        return END
        
    if state["iteration_count"] >= 3:
        print(f"\n[FIN] Limite d'iterations d'auto-correction atteinte ({state['iteration_count']}/3). Abandon.")
        send_agent_event("log", f"[FIN] Limite d'iterations d'auto-correction atteinte ({state['iteration_count']}/3). Abandon.")
        return END
        
    print(f"\n[AUTO-CORRECTION] Une erreur est survenue. Lancement de la correction automatique (Tentative #{state['iteration_count'] + 1}/3)...")
    send_agent_event("log", f"[AUTO-CORRECTION] Une erreur est survenue. Lancement de la correction automatique (Tentative #{state['iteration_count'] + 1}/3)...")
    return "generate_sql"


def create_agent_graph() -> StateGraph:
    """
    Crée et compile le graphe LangGraph.
    """
    workflow = StateGraph(AgentState)
    
    workflow.add_node("select_tables", node_select_tables)
    workflow.add_node("generate_sql", node_generate_sql)
    workflow.add_node("execute_sql", node_execute_sql)
    
    workflow.set_entry_point("select_tables")
    
    workflow.add_edge("select_tables", "generate_sql")
    workflow.add_edge("generate_sql", "execute_sql")
    workflow.add_conditional_edges("execute_sql", should_continue)
    
    return workflow.compile()


# Instance compilée prête à l'utilisation
agent_app = create_agent_graph()


def run_agent(
    question: str, 
    custom_schema: Optional[str] = None, 
    simulate_only: bool = False,
    model: Optional[str] = None,
    temperature: Optional[float] = None,
    context_size: Optional[int] = None
) -> Dict[str, Any]:
    """
    Interface simple de haut niveau pour lancer l'agent sur une question utilisateur.
    Elle intègre la vérification du cache sémantique et la mise en cache des réponses.
    """
    print(f"\n[DEBUT AGENT] Lancement du moteur LangGraph pour la question : '{question}'")
    send_agent_event("log", f"[DEBUT AGENT] Lancement du moteur LangGraph pour la question : '{question}'")
    
    # 1. Vérification du cache sémantique (RAG Mémoire)
    active_model = model or settings.OLLAMA_MODEL
    
    cached_res = semantic_cache.check(question, model=active_model)
    if cached_res:
        print(f"[CACHE HIT] Résultat sémantique trouvé pour : '{question}'")
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
        "context_size": context_size
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
