from langgraph.graph import END
from app.services.agent.state import AgentState

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
