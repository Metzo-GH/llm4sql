import pytest
import json
from unittest.mock import MagicMock, patch
from app.services.agent import (
    extract_sql_query,
    clean_sql_query,
    get_database_schema_context,
    run_agent,
    AgentState
)
from app.services.agent.routing import should_continue_react
from app.services.agent.nodes import (
    node_execute_tools,
    node_clean_and_finalize
)
from langgraph.graph import END
import urllib.request

def _is_ollama_running():
    try:
        urllib.request.urlopen("http://localhost:11434/api/tags", timeout=1)
        return True
    except Exception:
        return False

@pytest.fixture(autouse=True)
def reset_agent_globals():
    """
    Réinitialise les variables globales de l'agent (cache de schéma et instance LLM)
    avant chaque test pour éviter les effets de bord entre les tests mockés et réels.
    """
    from app.services.agent.schema import invalidate_schema_cache
    from app.services.agent.llm_provider import _llm_cache
    invalidate_schema_cache()
    _llm_cache.clear()


def test_extract_sql_query_markdown_sql():
    """
    Vérifie l'extraction d'une requête SQL d'un bloc ```sql ... ```.
    """
    raw_response = "Voici la requête demandée :\n```sql\nSELECT * FROM ouvrage WHERE ido = 1;\n```\nEn espérant que cela vous aide."
    extracted = extract_sql_query(raw_response)
    assert extracted == "SELECT * FROM ouvrage WHERE ido = 1;"


def test_extract_sql_query_markdown_generic():
    """
    Vérifie l'extraction d'une requête SQL d'un bloc ``` ... ``` générique.
    """
    raw_response = "```\nSELECT titre FROM ouvrage;\n```"
    extracted = extract_sql_query(raw_response)
    assert extracted == "SELECT titre FROM ouvrage;"


def test_extract_sql_query_raw():
    """
    Vérifie le traitement d'une requête renvoyée brute sans markdown.
    """
    raw_response = "  SELECT COUNT(*) FROM personne;  "
    extracted = extract_sql_query(raw_response)
    assert extracted == "SELECT COUNT(*) FROM personne;"


def test_get_database_schema_context():
    """
    Vérifie que la construction du contexte de schéma retourne les tables attendues.
    """
    context = get_database_schema_context()
    assert "Table 'ouvrage'" in context
    assert "Table 'personne'" in context
    assert "Table 'avis'" in context
    assert "ido" in context
    assert "dessinateur" in context


def test_get_dynamic_schema_context_empty():
    """
    Vérifie que get_dynamic_schema_context avec une liste vide retourne le schéma complet.
    """
    from app.services.agent import get_dynamic_schema_context
    context = get_dynamic_schema_context([])
    assert "Table 'ouvrage'" in context
    assert "Table 'personne'" in context


def test_get_dynamic_schema_context_specific():
    """
    Vérifie que get_dynamic_schema_context retourne uniquement les schémas demandés.
    """
    from app.services.agent import get_dynamic_schema_context
    context = get_dynamic_schema_context(["personne"])
    assert "Table 'personne'" in context
    assert "Table 'ouvrage'" not in context
    assert "idp" in context


def test_clean_sql_query():
    """
    Vérifie que clean_sql_query nettoie correctement les points-virgules mal placés.
    """
    assert clean_sql_query("SELECT * FROM ouvrage; ORDER BY titre;") == "SELECT * FROM ouvrage ORDER BY titre"
    assert clean_sql_query("SELECT * FROM personne;;") == "SELECT * FROM personne"
    assert clean_sql_query("  SELECT * FROM serie;  ") == "SELECT * FROM serie"


def test_should_continue_react():
    """
    Vérifie les décisions de routage du graphe ReAct.
    """
    from langchain_core.messages import AIMessage
    # Cas 1 : Appels d'outils détectés -> execute_tools
    msg_tools = AIMessage(content="", tool_calls=[{"name": "mcp_search_value", "args": {"term": "test"}, "id": "1"}])
    state_tools = {"messages": [msg_tools], "iteration_count": 0}
    assert should_continue_react(state_tools) == "execute_tools"

    # Cas 2 : Appels d'outils mais limite de garde-fou atteinte (30) -> force_loop_break
    state_limit = {"messages": [msg_tools], "iteration_count": 30}
    assert should_continue_react(state_limit) == "force_loop_break"

    # Cas 3 : Pas d'appels d'outils -> clean_and_finalize
    msg_text = AIMessage(content="```sql\nSELECT * FROM ouvrage;\n```")
    state_text = {"messages": [msg_text], "iteration_count": 1}
    assert should_continue_react(state_text) == "clean_and_finalize"


@patch("app.mcp.mcp_server.execute_query")
def test_node_clean_and_finalize_success(mock_execute):
    """
    Vérifie que le nœud de finalisation extrait, nettoie et exécute la requête SQL.
    """
    mock_execute.return_value = json.dumps({
        "success": True,
        "data": [{"ido": 1, "titre": "Test BD"}]
    })
    
    from langchain_core.messages import AIMessage
    state = {
        "messages": [AIMessage(content="Voici le SQL :\n```sql\nSELECT * FROM ouvrage; ORDER BY ido;\n```")],
        "iteration_count": 1,
        "simulate_only": False
    }
    
    res = node_clean_and_finalize(state)
    assert res["sql_query"] == "SELECT * FROM ouvrage ORDER BY ido"
    assert res["query_results"] == [{"ido": 1, "titre": "Test BD"}]
    assert res["error_message"] is None
    assert res["steps"][0]["node"] == "clean_and_finalize"


@pytest.mark.asyncio
@pytest.mark.skipif(not _is_ollama_running(), reason="Ollama server is not running")
async def test_integration_run_agent_real():
    """
    Test d'intégration complet qui interroge l'agent avec une question réelle.
    Vérifie que le graphe effectue sa tâche complète et retourne des données.
    """
    question = "Donne-moi la liste des ouvrages dessinés par Christophe Blain."
    
    # Exécuter l'agent
    final_state = run_agent(question)
    
    # Vérifications sur le résultat final
    assert final_state["question"] == question
    assert final_state["sql_query"] is not None
    assert final_state["error_message"] is None
    assert final_state["query_results"] is not None
    
    # Doit retourner des ouvrages (nous avons inséré des données réelles de Blain lors du seed)
    assert len(final_state["query_results"]) > 0
    # Rechercher de manière robuste la colonne titre (qui peut être aliasée ex: titre_ouvrage)
    titres = []
    for row in final_state["query_results"]:
        titre_key = next((k for k in row.keys() if "titre" in k.lower()), None)
        if titre_key:
            titres.append(row[titre_key])
        else:
            # Repli sur toutes les valeurs textuelles de la ligne
            titres.extend([str(v) for v in row.values() if isinstance(v, str)])
            
    assert any("Héraclès" in t or "Ulysse" in t for t in titres)


def test_get_last_validated_query():
    """
    Vérifie que get_last_validated_query extrait correctement la dernière requête SQL validée.
    """
    from langchain_core.messages import AIMessage, ToolMessage
    from app.services.agent.nodes import get_last_validated_query
    
    messages = [
        AIMessage(
            content="",
            tool_calls=[{"name": "mcp_dry_run_query", "args": {"sql": "SELECT * FROM bad;"}, "id": "call_1"}]
        ),
        ToolMessage(
            content=json.dumps({"success": False, "db_error": "table not found"}),
            name="mcp_dry_run_query",
            tool_call_id="call_1"
        ),
        AIMessage(
            content="",
            tool_calls=[{"name": "mcp_dry_run_query", "args": {"sql": "SELECT * FROM good;"}, "id": "call_2"}]
        ),
        ToolMessage(
            content=json.dumps({"success": True}),
            name="mcp_dry_run_query",
            tool_call_id="call_2"
        ),
        AIMessage(content="Voici le SQL final :\n```sql\nSELECT * FROM goood;\n```")
    ]
    
    sql = get_last_validated_query(messages)
    assert sql == "SELECT * FROM good;"


@patch("app.mcp.mcp_server.execute_query")
def test_node_clean_and_finalize_fallback(mock_execute):
    """
    Vérifie que node_clean_and_finalize retombe sur la dernière requête validée en cas d'erreur de la finale.
    """
    from langchain_core.messages import AIMessage, ToolMessage
    
    # Mock de l'exécution : la première (broken) échoue, la seconde (fallback) réussit
    def side_effect(sql):
        if "goood" in sql:
            return json.dumps({"success": False, "db_error": "table 'goood' does not exist"})
        elif "good" in sql:
            return json.dumps({"success": True, "data": [{"id": 1, "name": "Success"}]})
        return json.dumps({"success": False, "db_error": "unknown"})
        
    mock_execute.side_effect = side_effect
    
    messages = [
        AIMessage(
            content="",
            tool_calls=[{"name": "mcp_dry_run_query", "args": {"sql": "SELECT * FROM good;"}, "id": "call_2"}]
        ),
        ToolMessage(
            content=json.dumps({"success": True}),
            name="mcp_dry_run_query",
            tool_call_id="call_2"
        ),
        AIMessage(content="Voici le SQL final :\n```sql\nSELECT * FROM goood;\n```")
    ]
    
    state = {
        "messages": messages,
        "iteration_count": 2,
        "simulate_only": False
    }
    
    res = node_clean_and_finalize(state)
    assert res["sql_query"] == "SELECT * FROM good"
    assert res["query_results"] == [{"id": 1, "name": "Success"}]
    assert res["error_message"] is None
    assert res["steps"][0].get("fallback_applied") is True
