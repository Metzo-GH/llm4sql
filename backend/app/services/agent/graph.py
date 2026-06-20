import time
import json
import re
from typing import Dict, Any, Optional, List

from langgraph.graph import StateGraph, END
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, ToolMessage, BaseMessage
from langchain_core.tools import tool

from app.core.config import settings
from app.services.agent.state import AgentState, send_agent_event, event_callback_var
from app.services.agent.llm_provider import get_llm, get_model_context_length
from app.services.agent.schema import get_database_schema_context
from app.services.agent.sql_utils import extract_sql_query, clean_sql_query
from app.services.cache import semantic_cache


@tool
def mcp_list_tables() -> str:
    """
    Liste toutes les tables utilisateur présentes dans le schéma de la base de données.
    """
    from app.mcp.mcp_server import list_tables
    return list_tables()


@tool
def mcp_get_schema(table_name: str) -> str:
    """
    Récupère le schéma détaillé d'une table spécifique (colonnes, types, contraintes null et clés étrangères).
    
    Args:
        table_name (str): Nom de la table.
    """
    from app.mcp.mcp_server import get_schema
    return get_schema(table_name)


@tool
def mcp_search_value(term: str) -> str:
    """
    Recherche un mot-clé ou une valeur dans toutes les colonnes de type texte de la base de données.
    Utile pour localiser la bonne table et colonne quand la question contient un nom propre, une catégorie, ou un code textuel.
    
    Args:
        term (str): Le terme à rechercher (ex: 'Christophe', 'Blacksad', etc.).
    """
    from app.mcp.mcp_server import search_value
    return search_value(term)


@tool
def mcp_get_sample_data(table_name: str, limit: int = 3) -> str:
    """
    Récupère quelques lignes d'exemples d'une table pour voir le format des données réelles.
    
    Args:
        table_name (str): Le nom de la table.
        limit (int, optional): Nombre de lignes à récupérer (3 par défaut, maximum 10).
    """
    from app.mcp.mcp_server import get_sample_data
    return get_sample_data(table_name, limit)


@tool
def mcp_dry_run_query(sql: str) -> str:
    """
    Valide la syntaxe d'une requête SQL SELECT sans l'exécuter physiquement (simulation via EXPLAIN).
    Vous DEVEZ appeler cet outil pour valider votre SQL généré avant de soumettre la réponse finale.
    
    Args:
        sql (str): La requête SQL SELECT à valider.
    """
    from app.mcp.mcp_server import dry_run_query
    return dry_run_query(sql)


def node_agent_loop(state: AgentState) -> Dict[str, Any]:
    """
    Nœud principal de réflexion de l'agent. Appelle le LLM avec ses outils liés.
    """
    iteration = state["iteration_count"] + 1
    model_name = state.get("model") or settings.OLLAMA_MODEL
    
    print(f"\n[RÉFLEXION] Exécution de l'agent (itération {iteration})...")
    send_agent_event("log", f"[RÉFLEXION] Exécution de l'agent (itération {iteration})...")
    
    # 1. Préparer les messages initiaux si c'est la première itération
    messages = list(state.get("messages", []))
    if not messages:
        schema_context = state.get("schema_context") or get_database_schema_context()
        
        system_prompt = f"""Tu es un traducteur expert spécialisé en base de données PostgreSQL.
Ta mission est de convertir la question en français de l'utilisateur en une requête SQL SELECT valide, performante et sécurisée.

Voici la structure de la base de données et les relations entre les tables :
{schema_context}

Voici les outils à ta disposition :
- `mcp_list_tables` : Liste toutes les tables.
- `mcp_get_schema` : Donne le schéma et les relations d'une table.
- `mcp_search_value` : Recherche une valeur textuelle dans la base de données pour trouver sa colonne.
- `mcp_get_sample_data` : Donne des exemples de lignes d'une table.
- `mcp_dry_run_query` : Valide la syntaxe de ta requête SQL via EXPLAIN.

Règles impératives de résolution (Chain of Thought & Validation) :
1. PLANIFICATION : Réfléchis d'abord étape par étape avant d'appeler les outils ou d'écrire le SQL. Rédige ton plan de réflexion en français entouré de la balise <think>...</think> :
   - Quelles tables contiennent les informations nécessaires ?
   - Quelles sont les clés de jointures (regarde la section Relations / Clés Étrangères) ?
   - Quels tris ou regroupements (GROUP BY) sont demandés ?
2. LEVÉE DE DOUTE : Si la question contient un nom propre, une catégorie, ou une valeur textuelle (ex: 'Christophe', 'Blacksad'), n'assume rien ! Appelle d'abord `mcp_search_value` pour trouver la bonne table et colonne.
3. CONCEVOIR & TESTER : Écris la requête SQL SELECT. Avant de renvoyer le résultat final, tu DOIS obligatoirement appeler `mcp_dry_run_query` pour tester sa validité syntaxique auprès de PostgreSQL.
4. CORRECTION : Si le test échoue (retourne une erreur), analyse le problème et retente une autre version du SQL en la testant à nouveau via `mcp_dry_run_query`.
5. RÉPONSE FINALE : Une fois la requête validée avec succès via `mcp_dry_run_query`, écris ta réponse finale contenant la requête SQL finale enveloppée dans un bloc de code markdown ```sql ... ```. Tu dois obligatoirement COPIER-COLLER EXACTEMENT la requête SQL que tu as testée et validée avec succès via `mcp_dry_run_query`, sans modifier aucun caractère (ni alias, ni jointure, ni clause, ni table) pour éviter toute faute de frappe de dernière minute. Ne fais aucun autre appel d'outil après avoir fourni le SQL final.
6. CONCEVOIR ET NON RÉCUPÉRER : Tu ne dois JAMAIS tenter de récupérer la totalité des résultats ou de résoudre la question via les outils (comme appeler `mcp_get_sample_data` à répétition). Les outils servent uniquement à t'aider à comprendre la structure et à valider la syntaxe. C'est ta requête SQL finale générée qui extraira les résultats réels.
"""
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=state["question"])
        ]
        
    # 2. Configurer le LLM et bind les tools
    temp = state.get("temperature") if state.get("temperature") is not None else 0.0
    ctx_size = state.get("context_size") if state.get("context_size") is not None else 0
    llm = get_llm(model=model_name, temperature=temp, context_size=ctx_size)
    
    tools_list = [mcp_list_tables, mcp_get_schema, mcp_search_value, mcp_get_sample_data, mcp_dry_run_query]
    llm_with_tools = llm.bind_tools(tools_list)
    
    # 3. Estimer l'usage du contexte
    prompt_content = "\n".join(m.content if isinstance(m.content, str) else str(m.content) for m in messages)
    estimated_prompt_tokens = len(prompt_content) // 3
    reported_ctx_size = ctx_size
    if reported_ctx_size == 0:
        reported_ctx_size = get_model_context_length(model_name)
        
    send_agent_event("context_usage", {
        "prompt_tokens": estimated_prompt_tokens,
        "context_size": reported_ctx_size,
        "estimated": True
    })
    
    # 4. Invoquer le modèle
    start_time = time.time()
    callback = event_callback_var.get()
    
    if callback:
        content_parts = []
        full_metadata = {}
        has_started_thinking = False
        has_finished_thinking = False
        response = None
        
        for chunk in llm_with_tools.stream(messages):
            reasoning_content = chunk.additional_kwargs.get("reasoning_content", "")
            content = chunk.content
            
            if reasoning_content and not has_started_thinking:
                send_agent_event("token", "<think>")
                content_parts.append("<think>")
                has_started_thinking = True
                
            if content and has_started_thinking and not has_finished_thinking:
                send_agent_event("token", "</think>")
                content_parts.append("</think>")
                has_finished_thinking = True
                
            if reasoning_content:
                send_agent_event("token", reasoning_content)
                content_parts.append(reasoning_content)
            elif content:
                if has_started_thinking and not has_finished_thinking:
                    send_agent_event("token", "</think>")
                    content_parts.append("</think>")
                    has_finished_thinking = True
                send_agent_event("token", content)
                content_parts.append(content)
                
            if chunk.response_metadata:
                full_metadata.update(chunk.response_metadata)
                
            if response is None:
                response = chunk
            else:
                response += chunk
                
        if has_started_thinking and not has_finished_thinking:
            send_agent_event("token", "</think>")
            content_parts.append("</think>")
            
        if response is not None:
            response.content = "".join(content_parts)
    else:
        response = llm_with_tools.invoke(messages)
        reasoning_content = response.additional_kwargs.get("reasoning_content")
        if reasoning_content:
            response.content = f"<think>\n{reasoning_content}\n</think>\n{response.content}"

    elapsed = time.time() - start_time
    
    # 5. Métriques de performance
    metadata = getattr(response, "response_metadata", {})
    prompt_tokens = metadata.get("prompt_eval_count", 0) or estimated_prompt_tokens
    eval_tokens = metadata.get("eval_count", 0) or 0
    eval_duration = metadata.get("eval_duration", 0) or 0
    tokens_per_sec = 0.0
    if eval_tokens > 0 and eval_duration > 0:
        tokens_per_sec = round(eval_tokens / (eval_duration * 1e-9), 2)
        
    # Refresh context size dynamically from Ollama session now that the model is loaded and active
    active_ctx_len = get_model_context_length(model_name, force_refresh=True)
    if ctx_size == 0:
        reported_ctx_size = active_ctx_len
    elif active_ctx_len > 0 and active_ctx_len != 2048:
        reported_ctx_size = active_ctx_len
        
    send_agent_event("context_usage", {
        "prompt_tokens": prompt_tokens,
        "eval_tokens": eval_tokens,
        "context_size": reported_ctx_size,
        "estimated": False
    })
    
    print(f"  [RÉPONSE LLM] Fin de la réflexion en {elapsed:.2f}s (Tokens/s: {tokens_per_sec})")
    send_agent_event("log", f"  [RÉPONSE LLM] Fin de la réflexion en {elapsed:.2f}s (Tokens/s: {tokens_per_sec})")
    
    step_info = {
        "node": "agent_loop",
        "iteration": iteration,
        "elapsed": round(elapsed, 3),
        "prompt_tokens": prompt_tokens,
        "eval_tokens": eval_tokens,
        "tokens_per_second": tokens_per_sec,
        "model": model_name,
        "context_size": reported_ctx_size
    }
    
    return {
        "messages": [response],
        "steps": [step_info]
    }


def node_execute_tools(state: AgentState) -> Dict[str, Any]:
    """
    Nœud d'exécution des outils MCP requis par le LLM.
    """
    messages = state.get("messages", [])
    last_message = messages[-1]
    
    tool_messages = []
    steps_info = []
    
    print(f"\n[OUTILS] Invocations d'outils détectées...")
    send_agent_event("log", f"[OUTILS] Invocations d'outils détectées...")
    
    tools_map = {
        "mcp_list_tables": mcp_list_tables,
        "mcp_get_schema": mcp_get_schema,
        "mcp_search_value": mcp_search_value,
        "mcp_get_sample_data": mcp_get_sample_data,
        "mcp_dry_run_query": mcp_dry_run_query
    }
    
    for tool_call in last_message.tool_calls:
        name = tool_call["name"]
        args = tool_call["args"]
        call_id = tool_call["id"]
        
        print(f"  ➔ Appel de : {name}({args})")
        send_agent_event("log", f"  [APPEL OUTIL] {name}({args})")
        
        tool_start = time.time()
        
        if name in tools_map:
            try:
                result = tools_map[name].invoke(args)
                success = True
                error_msg = None
            except Exception as e:
                result = json.dumps({"error": str(e)})
                success = False
                error_msg = str(e)
        else:
            result = json.dumps({"error": f"Outil '{name}' inconnu."})
            success = False
            error_msg = f"Outil '{name}' inconnu."
            
        tool_elapsed = time.time() - tool_start
        print(f"  ➔ Résultat : {result} (en {tool_elapsed:.2f}s)")
        send_agent_event("log", f"  [OUTIL {"SUCCÈS" if success else "ERREUR"}] {name} complété en {tool_elapsed:.2f}s")
        
        from langchain_core.messages import ToolMessage
        tool_messages.append(
            ToolMessage(content=result, name=name, tool_call_id=call_id)
        )
        
        steps_info.append({
            "node": f"tool_{name}",
            "elapsed": round(tool_elapsed, 3),
            "success": success,
            "error": error_msg,
            "tool_call": tool_call,
            "tool_result": result
        })
        
    return {
        "messages": tool_messages,
        "steps": steps_info,
        "iteration_count": state["iteration_count"] + 1
    }


def node_force_loop_break(state: AgentState) -> Dict[str, Any]:
    """
    Nœud de sécurité en cas de dépassement de limite de boucle (30 appels d'outils).
    """
    print("\n[ERREUR] Garde-fou déclenché : limite d'appels d'outils atteinte (30 max).")
    send_agent_event("log", "[ERREUR] Garde-fou déclenché : limite d'appels d'outils atteinte (30 max).")
    
    return {
        "error_message": "Limite de sécurité d'appels d'outils atteinte (30 max). L'agent a été interrompu pour éviter une boucle de réflexion infinie.",
        "steps": [{
            "node": "force_loop_break",
            "elapsed": 0.0,
            "success": False,
            "error": "Limite d'appels d'outils atteinte (30 max)."
        }]
    }


def get_last_validated_query(messages: List[BaseMessage]) -> Optional[str]:
    """
    Parcourt l'historique des messages pour retrouver la dernière requête SQL
    ayant été validée avec succès par l'outil mcp_dry_run_query.
    """
    tool_results = {}
    for msg in messages:
        if msg.__class__.__name__ == "ToolMessage" or getattr(msg, "type", None) == "tool":
            tool_results[msg.tool_call_id] = msg.content
            
    for msg in reversed(messages):
        if msg.__class__.__name__ == "AIMessage" or getattr(msg, "type", None) == "ai":
            if hasattr(msg, "tool_calls") and msg.tool_calls:
                for tool_call in reversed(msg.tool_calls):
                    if tool_call.get("name") == "mcp_dry_run_query":
                        call_id = tool_call.get("id")
                        sql_arg = tool_call.get("args", {}).get("sql")
                        if sql_arg and call_id in tool_results:
                            try:
                                res_json = json.loads(tool_results[call_id])
                                if res_json.get("success") is True:
                                    return sql_arg
                            except Exception:
                                pass
    return None


def node_clean_and_finalize(state: AgentState) -> Dict[str, Any]:
    """
    Nœud final : extrait le SQL, le nettoie via regex, et l'exécute de manière sécurisée.
    """
    print("\n[FIN] Finalisation de la requête SQL...")
    send_agent_event("log", "[FIN] Finalisation de la requête SQL...")
    
    messages = state.get("messages", [])
    if not messages:
        return {
            "error_message": "Aucun message généré par l'agent.",
            "steps": [{
                "node": "clean_and_finalize",
                "elapsed": 0.0,
                "success": False,
                "error": "Aucun message généré."
            }]
        }
        
    last_text = ""
    for msg in reversed(messages):
        if msg.content:
            last_text = msg.content
            break
            
    raw_sql = extract_sql_query(last_text)
    cleaned_sql = clean_sql_query(raw_sql)
    
    print(f"  Requête finale nettoyée : {cleaned_sql}")
    send_agent_event("log", f"  Requête finale nettoyée : {cleaned_sql}")
    
    if not cleaned_sql:
        return {
            "error_message": "Aucune requête SQL n'a été générée ou la requête est vide.",
            "steps": [{
                "node": "clean_and_finalize",
                "elapsed": 0.0,
                "success": False,
                "error": "Requête SQL vide."
            }]
        }
        
    from app.services.agent.sql_utils import extract_tables_from_sql
    tables_involved = extract_tables_from_sql(cleaned_sql)
    last_validated = get_last_validated_query(messages)
    
    if state.get("simulate_only"):
        # En mode simulation, si la requête finale extraite échoue au dry_run, on tente le repli
        from app.mcp.mcp_server import dry_run_query
        dry_run_res = json.loads(dry_run_query(cleaned_sql))
        fallback_applied = False
        
        if not dry_run_res.get("success", False) and last_validated and last_validated != cleaned_sql:
            print(f"  [REPLI SIMULATION] La requête nettoyée a échoué au dry-run. Repli sur la requête validée : {last_validated}")
            send_agent_event("log", f"  [REPLI SIMULATION] La requête finale a échoué au dry-run. Repli sur la dernière requête validée : {last_validated}")
            cleaned_sql = clean_sql_query(last_validated)
            tables_involved = extract_tables_from_sql(cleaned_sql)
            fallback_applied = True
            
        return {
            "sql_query": cleaned_sql,
            "query_results": [],
            "error_message": None,
            "tables": tables_involved,
            "steps": [{
                "node": "clean_and_finalize",
                "elapsed": 0.0,
                "success": True,
                "simulation": True,
                "fallback_applied": fallback_applied
            }]
        }
        
    from app.mcp.mcp_server import execute_query
    print("  Exécution finale sur PostgreSQL...")
    send_agent_event("log", "  Exécution finale sur PostgreSQL...")
    
    start_time = time.time()
    exec_res_str = execute_query(cleaned_sql)
    exec_res = json.loads(exec_res_str)
    elapsed = time.time() - start_time
    
    if "security_error" in exec_res:
        err_msg = f"Alerte de Sécurité : {exec_res['security_error']}"
        print(f"  [ERROR] {err_msg}")
        send_agent_event("log", f"  [ERROR] {err_msg}")
        return {
            "sql_query": cleaned_sql,
            "error_message": err_msg,
            "tables": tables_involved,
            "steps": [{
                "node": "clean_and_finalize",
                "elapsed": round(elapsed, 3),
                "success": False,
                "error": err_msg
            }]
        }
        
    if not exec_res.get("success", False):
        db_err = exec_res.get("db_error", "Erreur d'exécution inconnue.")
        print(f"  [ERROR] Échec de l'exécution final : {db_err}")
        send_agent_event("log", f"  [ERROR] Échec de l'exécution final : {db_err}")
        
        # Tentative de repli vers la dernière requête validée par dry-run (Self-Healing Fallback)
        if last_validated:
            cleaned_fallback = clean_sql_query(last_validated)
            if cleaned_fallback and cleaned_fallback != cleaned_sql:
                print(f"  [REPLI] Tentative d'exécution de la dernière requête validée : {cleaned_fallback}")
                send_agent_event("log", f"  [REPLI] Échec de la requête finale. Tentative de repli sur la dernière requête validée : {cleaned_fallback}")
                
                fallback_start = time.time()
                fallback_res_str = execute_query(cleaned_fallback)
                fallback_res = json.loads(fallback_res_str)
                fallback_elapsed = time.time() - fallback_start
                
                if fallback_res.get("success", False) and "security_error" not in fallback_res:
                    print("  [REPLI OK] Exécution de repli réussie !")
                    send_agent_event("log", "  [REPLI OK] Exécution de repli réussie !")
                    
                    tables_involved = extract_tables_from_sql(cleaned_fallback)
                    data_rows = fallback_res.get("data", [])
                    return {
                        "sql_query": cleaned_fallback,
                        "query_results": data_rows,
                        "error_message": None,
                        "tables": tables_involved,
                        "steps": [{
                            "node": "clean_and_finalize",
                            "elapsed": round(elapsed + fallback_elapsed, 3),
                            "success": True,
                            "row_count": len(data_rows),
                            "fallback_applied": True
                        }]
                    }
                    
        return {
            "sql_query": cleaned_sql,
            "error_message": db_err,
            "tables": tables_involved,
            "steps": [{
                "node": "clean_and_finalize",
                "elapsed": round(elapsed, 3),
                "success": False,
                "error": db_err
            }]
        }
        
    data_rows = exec_res.get("data", [])
    print(f"  [OK] Exécution finale réussie : {len(data_rows)} ligne(s) retournée(s)")
    send_agent_event("log", f"  [OK] Exécution finale réussie : {len(data_rows)} ligne(s) retournée(s)")
    
    return {
        "sql_query": cleaned_sql,
        "query_results": data_rows,
        "error_message": None,
        "tables": tables_involved,
        "steps": [{
            "node": "clean_and_finalize",
            "elapsed": round(elapsed, 3),
            "success": True,
            "row_count": len(data_rows)
        }]
    }


def should_continue(state: AgentState) -> str:
    """
    Ancienne fonction de routage conditionnel conservée pour la compatibilité des tests.
    """
    if state.get("error_message") is None:
        return END
    if state.get("iteration_count", 0) >= 3:
        return END
    return "generate_sql"


def should_continue_react(state: AgentState) -> str:
    """
    Routage conditionnel. Décide si l'on continue les appels d'outils,
    si on lève une erreur de sécurité (Loop Guard) ou si on s'arrête.
    """
    messages = state.get("messages", [])
    if not messages:
        return "clean_and_finalize"
        
    last_message = messages[-1]
    
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        # Garde-fou (Loop Guard)
        if state.get("iteration_count", 0) >= 30:
            return "force_loop_break"
        return "execute_tools"
        
    return "clean_and_finalize"


def create_agent_graph() -> StateGraph:
    """
    Crée et compile le graphe LangGraph ReAct.
    """
    workflow = StateGraph(AgentState)
    
    workflow.add_node("agent_loop", node_agent_loop)
    workflow.add_node("execute_tools", node_execute_tools)
    workflow.add_node("force_loop_break", node_force_loop_break)
    workflow.add_node("clean_and_finalize", node_clean_and_finalize)
    
    workflow.set_entry_point("agent_loop")
    
    workflow.add_conditional_edges("agent_loop", should_continue_react, {
        "execute_tools": "execute_tools",
        "force_loop_break": "force_loop_break",
        "clean_and_finalize": "clean_and_finalize"
    })
    
    workflow.add_edge("execute_tools", "agent_loop")
    workflow.add_edge("force_loop_break", END)
    workflow.add_edge("clean_and_finalize", END)
    
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
