import json
import time
from typing import Dict, Any

from app.mcp.mcp_server import execute_query
from app.services.agent.state import AgentState, send_agent_event
from app.services.agent.sql_utils import extract_tables_from_sql


def node_execute_sql(state: AgentState) -> Dict[str, Any]:
    """
    Nœud d'exécution SQL. Prend la requête SQL générée par le nœud précédent,
    l'exécute de manière sécurisée via le serveur MCP, et stocke le résultat ou l'erreur.
    """
    sql = state["sql_query"]
    iteration = state["iteration_count"] + 1
    
    # Extraire les tables impliquées
    tables_involved = extract_tables_from_sql(sql) if sql else []
    
    if not sql:
        print("\n[ETAPE 2 - EXECUTION SQL] Aucune requete SQL a executer.")
        send_agent_event("log", "[ETAPE 2 - EXECUTION SQL] Aucune requete SQL a executer.")
        return {
            "error_message": "Aucune requete SQL n'a ete generee.",
            "iteration_count": iteration,
            "steps": [{
                "node": "execute_sql",
                "iteration": iteration,
                "elapsed": 0.0,
                "success": False,
                "error": "Aucune requête SQL n'a été générée."
            }],
            "tables": []
        }
        
    if state.get("simulate_only"):
        print("\n[ETAPE 2 - EXECUTION SQL] Mode simulation active. Pas d'execution physique.")
        send_agent_event("log", "[ETAPE 2 - EXECUTION SQL] Mode simulation active. Pas d'execution physique.")
        return {
            "query_results": [],
            "error_message": None,
            "iteration_count": iteration,
            "steps": [{
                "node": "execute_sql",
                "iteration": iteration,
                "elapsed": 0.0,
                "success": True,
                "row_count": 0,
                "simulation": True
            }],
            "tables": tables_involved
        }
        
    print(f"\n[ETAPE 2 - EXECUTION SQL] Execution de la requete sur PostgreSQL...")
    send_agent_event("log", "[ETAPE 2 - EXECUTION SQL] Execution de la requete sur PostgreSQL...")
    start_time = time.time()
    
    # Exécuter la requête SQL via l'outil sécurisé du serveur MCP
    execution_result_str = execute_query(sql)
    execution_result = json.loads(execution_result_str)
    
    elapsed = time.time() - start_time
    
    if "security_error" in execution_result:
        err_msg = f"Alerte de Securite : {execution_result['security_error']}"
        print(f"  [ERROR] Alerte Securite ({elapsed:.2f}s) : {execution_result['security_error']}")
        send_agent_event("log", f"  [ERROR] Alerte Securite ({elapsed:.2f}s) : {execution_result['security_error']}")
        return {
            "error_message": err_msg,
            "iteration_count": iteration,
            "steps": [{
                "node": "execute_sql",
                "iteration": iteration,
                "elapsed": round(elapsed, 3),
                "success": False,
                "error": err_msg
            }],
            "tables": tables_involved
        }
        
    if not execution_result.get("success", False):
        db_err = execution_result.get("db_error", "Erreur d'execution inconnue.")
        print(f"  [ERROR] Echec de l'execution ({elapsed:.2f}s) : {db_err}")
        send_agent_event("log", f"  [ERROR] Echec de l'execution ({elapsed:.2f}s) : {db_err}")
        return {
            "error_message": db_err,
            "iteration_count": iteration,
            "steps": [{
                "node": "execute_sql",
                "iteration": iteration,
                "elapsed": round(elapsed, 3),
                "success": False,
                "error": db_err
            }],
            "tables": tables_involved
        }
        
    # Succès
    data_rows = execution_result.get("data", [])
    print(f"  [OK] Requete executee avec succes en {elapsed:.2f}s ({len(data_rows)} ligne(s) retournee(s)).")
    send_agent_event("log", f"  [OK] Requete executee avec succes en {elapsed:.2f}s ({len(data_rows)} ligne(s) retournee(s)).")
    return {
        "query_results": data_rows,
        "error_message": None,
        "iteration_count": iteration,
        "steps": [{
            "node": "execute_sql",
            "iteration": iteration,
            "elapsed": round(elapsed, 3),
            "success": True,
            "row_count": len(data_rows)
        }],
        "tables": tables_involved
    }
