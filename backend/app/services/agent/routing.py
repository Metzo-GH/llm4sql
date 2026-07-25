import json
import logging
from langgraph.graph import END
from app.services.agent.state import AgentState

logger = logging.getLogger("llm4sql.agent.routing")

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
    
    # 1. Si le dernier message est un ToolMessage de mcp_dry_run_query et qu'il a réussi, finaliser immédiatement !
    if last_message.__class__.__name__ == "ToolMessage" or getattr(last_message, "type", None) == "tool":
        if getattr(last_message, "name", None) == "mcp_dry_run_query":
            try:
                res_json = json.loads(last_message.content)
                if res_json.get("success") is True:
                    logger.info("  [ROUTING] mcp_dry_run_query a réussi avec succès. Passage immédiat à clean_and_finalize !")
                    return "clean_and_finalize"
            except Exception:
                pass
    
    # 2. Si l'IA demande d'exécuter des outils
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        # Garde-fou (Loop Guard)
        if state.get("iteration_count", 0) >= 30:
            return "force_loop_break"
        return "execute_tools"
        
    return "clean_and_finalize"
