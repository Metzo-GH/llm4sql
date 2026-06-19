import json
import re
import time
from typing import Dict, Any

from app.core.config import settings
from app.mcp.mcp_server import list_tables
from app.services.agent.state import AgentState, send_agent_event
from app.services.agent.llm_provider import get_llm


def node_select_tables(state: AgentState) -> Dict[str, Any]:
    """
    Nœud de sélection des tables. Identifie les tables pertinentes pour la question
    afin de réduire la taille du prompt.
    """
    send_agent_event("log", "[ETAPE 0 - SELECTION TABLES] Identification des tables requises...")
    print(f"\n[ETAPE 0 - SELECTION TABLES]")
    print(f"  Identification des tables requises...")
    
    start_time = time.time()
    
    try:
        tables_json = list_tables()
        all_tables = json.loads(tables_json).get("tables", [])
    except Exception as e:
        print(f"  [ERROR] Échec de la récupération des tables via MCP : {e}")
        all_tables = []
        
    if not all_tables:
        return {
            "tables": [],
            "steps": [{
                "node": "select_tables",
                "elapsed": round(time.time() - start_time, 3),
                "success": False,
                "error": "Aucune table disponible"
            }]
        }
        
    system_prompt = f"""Tu es un assistant expert en base de données PostgreSQL.
Ta tâche est de lister UNIQUEMENT les noms des tables nécessaires pour répondre à la question de l'utilisateur.

Voici la liste de toutes les tables disponibles :
{json.dumps(all_tables)}

Règles à respecter strictement :
1. Réponds UNIQUEMENT avec un tableau JSON valide contenant les noms des tables sélectionnées (ex: ["ouvrage", "personne"]).
2. Ne mets aucune explication, aucun texte d'accompagnement.
3. Si aucune table n'est nécessaire ou si la question ne concerne pas la base de données, réponds avec un tableau vide `[]`.
"""

    from langchain_core.messages import SystemMessage, HumanMessage
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=f"Question de l'utilisateur : {state['question']}")
    ]
    
    model_name = state.get("model") or settings.OLLAMA_MODEL
    temp = state.get("temperature") if state.get("temperature") is not None else 0.0
    ctx_size = state.get("context_size") or 4096

    llm = get_llm(model=model_name, temperature=temp, context_size=ctx_size)
    response = llm.invoke(messages)
    
    # Nettoyage et parsing du JSON
    content = response.content.strip()
    if "```" in content:
        match = re.search(r"```(?:json)?\s*(.*?)\s*```", content, re.DOTALL | re.IGNORECASE)
        if match:
            content = match.group(1).strip()
            
    selected_tables = []
    try:
        parsed = json.loads(content)
        if isinstance(parsed, list):
            all_tables_lower = {t.lower(): t for t in all_tables}
            for t in parsed:
                if isinstance(t, str) and t.lower() in all_tables_lower:
                    selected_tables.append(all_tables_lower[t.lower()])
    except Exception:
        # Fallback regex simple
        content_lower = content.lower()
        for t in all_tables:
            if t.lower() in content_lower:
                selected_tables.append(t)
                
    # Déduplication
    selected_tables = list(dict.fromkeys(selected_tables))
    
    # Si vide, fallback sur toutes les tables
    if not selected_tables:
        print("  [WARNING] Aucune table sélectionnée. Utilisation du fallback (toutes les tables).")
        selected_tables = all_tables

    elapsed = time.time() - start_time
    print(f"  [OK] Tables sélectionnées en {elapsed:.2f}s : {selected_tables}")
    send_agent_event("log", f"  [OK] Tables sélectionnées en {elapsed:.2f}s : {selected_tables}")
    
    step_info = {
        "node": "select_tables",
        "elapsed": round(elapsed, 3),
        "selected_tables": selected_tables,
        "model": model_name
    }
    
    return {
        "tables": selected_tables,
        "steps": [step_info]
    }
