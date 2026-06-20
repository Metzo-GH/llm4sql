import operator
import contextvars
from typing import TypedDict, List, Dict, Any, Optional, Annotated

# ContextVar pour diffuser des événements de télémétrie (logs, tokens, etc.) en temps réel
event_callback_var = contextvars.ContextVar("event_callback", default=None)


def send_agent_event(event_type: str, data: Any):
    """
    Diffuse un événement de télémétrie en temps réel (si un callback est enregistré).
    """
    callback = event_callback_var.get()
    if callback:
        try:
            callback({"type": event_type, "data": data})
        except Exception:
            pass


from langchain_core.messages import BaseMessage


class AgentState(TypedDict):
    """
    Représente l'état partagé tout au long de l'exécution du graphe LangGraph.
    """
    question: str
    sql_query: Optional[str]
    error_message: Optional[str]
    query_results: Optional[List[Dict[str, Any]]]
    iteration_count: int
    schema_context: str
    simulate_only: bool
    steps: Annotated[List[Dict[str, Any]], operator.add]
    tables: List[str]
    model: Optional[str]
    temperature: Optional[float]
    context_size: Optional[int]
    messages: Annotated[List[BaseMessage], operator.add]
