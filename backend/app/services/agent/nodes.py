import time
import json
import logging
from typing import Dict, Any, Optional, List

logger = logging.getLogger("llm4sql.agent.nodes")

from langchain_core.messages import SystemMessage, HumanMessage, BaseMessage, ToolMessage
from app.core.config import settings
from app.services.agent.state import AgentState, send_agent_event, event_callback_var
from app.services.agent.llm_provider import get_llm, get_model_context_length
from app.services.agent.schema import get_database_schema_context
from app.services.agent.sql_utils import extract_sql_query, clean_sql_query, extract_tables_from_sql
from app.services.agent.prompts import SYSTEM_PROMPT_TEMPLATE
from app.services.agent.tools import (
    all_tools,
    mcp_list_tables,
    mcp_get_schema,
    mcp_search_value,
    mcp_get_sample_data,
    mcp_dry_run_query
)

def node_agent_loop(state: AgentState) -> Dict[str, Any]:
    """
    Nœud principal de réflexion de l'agent. Appelle le LLM avec ses outils liés.
    """
    iteration = state["iteration_count"] + 1
    model_name = state.get("model") or settings.OLLAMA_MODEL
    
    logger.info(f"[RÉFLEXION] Exécution de l'agent (itération {iteration})...")
    send_agent_event("log", f"[RÉFLEXION] Exécution de l'agent (itération {iteration})...")
    
    # 1. Préparer les messages initiaux si c'est la première itération
    messages = list(state.get("messages", []))
    if not messages:
        schema_context = state.get("schema_context") or get_database_schema_context()
        
        system_prompt = SYSTEM_PROMPT_TEMPLATE.format(schema_context=schema_context)
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=state["question"])
        ]
        
    # 2. Configurer le LLM et bind les tools
    temp = state.get("temperature") if state.get("temperature") is not None else 0.0
    ctx_size = state.get("context_size") if state.get("context_size") is not None else 0
    llm = get_llm(model=model_name, temperature=temp, context_size=ctx_size)
    llm_with_tools = llm.bind_tools(all_tools)
    
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
    
    # 4. Invoquer le modèle avec streaming
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
        
    # Refresh context size dynamically from Ollama session
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
    
    logger.info(f"  [RÉPONSE LLM] Fin de la réflexion en {elapsed:.2f}s (Tokens/s: {tokens_per_sec})")
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
    
    logger.info(f"[OUTILS] Invocations d'outils détectées...")
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
        
        logger.info(f"  -> Appel de : {name}({args})")
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
        logger.info(f"  -> Résultat : {result} (en {tool_elapsed:.2f}s)")
        send_agent_event("log", f"  [OUTIL {"SUCCÈS" if success else "ERREUR"}] {name} complété en {tool_elapsed:.2f}s")
        
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
    logger.error("[ERREUR] Garde-fou déclenché : limite d'appels d'outils atteinte (30 max).")
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


def _handle_simulation_mode(cleaned_sql: str, messages: List[BaseMessage], last_validated: Optional[str], state: AgentState) -> Dict[str, Any]:
    """
    Gère la finalisation en mode simulation pure.
    """
    from app.mcp.mcp_server import dry_run_query
    
    dry_run_res = json.loads(dry_run_query(cleaned_sql))
    fallback_applied = False
    tables_involved = extract_tables_from_sql(cleaned_sql)
    
    if not dry_run_res.get("success", False) and last_validated and last_validated != cleaned_sql:
        logger.info(f"  [REPLI SIMULATION] La requête nettoyée a échoué au dry-run. Repli sur la requête validée : {last_validated}")
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


def _attempt_fallback(cleaned_sql: str, last_validated: Optional[str], tables_involved: List[str], elapsed: float) -> Optional[Dict[str, Any]]:
    """
    Tente une exécution de repli (Self-Healing Fallback) vers la dernière requête validée au dry-run.
    """
    from app.mcp.mcp_server import execute_query
    
    if not last_validated:
        return None
        
    cleaned_fallback = clean_sql_query(last_validated)
    if not cleaned_fallback or cleaned_fallback == cleaned_sql:
        return None
        
    logger.info(f"  [REPLI] Tentative d'exécution de la dernière requête validée : {cleaned_fallback}")
    send_agent_event("log", f"  [REPLI] Échec de la requête finale. Tentative de repli sur la dernière requête validée : {cleaned_fallback}")
    
    fallback_start = time.time()
    fallback_res_str = execute_query(cleaned_fallback)
    fallback_res = json.loads(fallback_res_str)
    fallback_elapsed = time.time() - fallback_start
    
    if fallback_res.get("success", False) and "security_error" not in fallback_res:
        logger.info("  [REPLI OK] Exécution de repli réussie !")
        send_agent_event("log", "  [REPLI OK] Exécution de repli réussie !")
        
        tables_involved_fallback = extract_tables_from_sql(cleaned_fallback)
        data_rows = fallback_res.get("data", [])
        return {
            "sql_query": cleaned_fallback,
            "query_results": data_rows,
            "error_message": None,
            "tables": tables_involved_fallback,
            "steps": [{
                "node": "clean_and_finalize",
                "elapsed": round(elapsed + fallback_elapsed, 3),
                "success": True,
                "row_count": len(data_rows),
                "fallback_applied": True
            }]
        }
    return None


def _execute_and_handle(cleaned_sql: str, last_validated: Optional[str], tables_involved: List[str]) -> Dict[str, Any]:
    """
    Exécute la requête sur la BDD et traite les éventuelles erreurs ou replis de sécurité.
    """
    from app.mcp.mcp_server import execute_query
    
    logger.info("  Exécution finale sur PostgreSQL...")
    send_agent_event("log", "  Exécution finale sur PostgreSQL...")
    
    start_time = time.time()
    exec_res_str = execute_query(cleaned_sql)
    exec_res = json.loads(exec_res_str)
    elapsed = time.time() - start_time
    
    if "security_error" in exec_res:
        err_msg = f"Alerte de Sécurité : {exec_res['security_error']}"
        logger.error(f"  [ERROR] {err_msg}")
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
        logger.error(f"  [ERROR] Échec de l'exécution final : {db_err}")
        send_agent_event("log", f"  [ERROR] Échec de l'exécution final : {db_err}")
        
        # Tentative de repli
        fallback_state = _attempt_fallback(cleaned_sql, last_validated, tables_involved, elapsed)
        if fallback_state:
            return fallback_state
            
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
    logger.info(f"  [OK] Exécution finale réussie : {len(data_rows)} ligne(s) retournée(s)")
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


def node_clean_and_finalize(state: AgentState) -> Dict[str, Any]:
    """
    Nœud final : extrait le SQL, le nettoie via regex, et l'exécute de manière sécurisée.
    """
    logger.info("[FIN] Finalisation de la requête SQL...")
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
    
    logger.info(f"  Requête finale nettoyée : {cleaned_sql}")
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
        
    tables_involved = extract_tables_from_sql(cleaned_sql)
    last_validated = get_last_validated_query(messages)
    
    if state.get("simulate_only"):
        return _handle_simulation_mode(cleaned_sql, messages, last_validated, state)
        
    return _execute_and_handle(cleaned_sql, last_validated, tables_involved)
