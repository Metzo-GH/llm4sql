import pytest
import json
from unittest.mock import MagicMock, patch
from app.services.agent import extract_sql_query, get_database_schema_context, run_agent, node_generate_sql, node_execute_sql, should_continue, AgentState
from langgraph.graph import END

@pytest.fixture(autouse=True)
def reset_agent_globals():
    """
    Réinitialise les variables globales de l'agent (cache de schéma et instance LLM)
    avant chaque test pour éviter les effets de bord entre les tests mockés et réels.
    """
    import app.services.agent as agent_module
    agent_module._SCHEMA_CACHE = None
    agent_module._llm = None


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


@patch("app.services.agent.ChatOllama")
def test_node_generate_sql_success(mock_chat_ollama):
    """
    Vérifie que le nœud de génération SQL appelle correctement le LLM et renvoie la requête SQL.
    """
    # Mocker la réponse du LLM
    mock_response = MagicMock()
    mock_response.content = "```sql\nSELECT * FROM serie;\n```"
    
    mock_llm_instance = MagicMock()
    mock_llm_instance.invoke.return_value = mock_response
    mock_chat_ollama.return_value = mock_llm_instance

    # Définir un état initial
    state: AgentState = {
        "question": "liste des séries",
        "sql_query": None,
        "error_message": None,
        "query_results": None,
        "iteration_count": 0,
        "schema_context": "Table 'serie' : ids, titre"
    }

    result = node_generate_sql(state)
    assert result["sql_query"] == "SELECT * FROM serie;"
    
    # Vérifier que le LLM a bien été appelé
    mock_chat_ollama.assert_called_once()


def test_node_execute_sql_success():
    """
    Vérifie que le nœud d'exécution SQL exécute la requête avec succès.
    """
    state: AgentState = {
        "question": "Combien de personnes dans la base ?",
        "sql_query": "SELECT COUNT(*) as total FROM personne;",
        "error_message": None,
        "query_results": None,
        "iteration_count": 0,
        "schema_context": ""
    }

    result = node_execute_sql(state)
    assert result["error_message"] is None
    assert result["query_results"] is not None
    assert len(result["query_results"]) == 1
    assert "total" in result["query_results"][0]


def test_node_execute_sql_failure():
    """
    Vérifie que le nœud d'exécution capture correctement les erreurs PostgreSQL.
    """
    state: AgentState = {
        "question": "Test erreur",
        "sql_query": "SELECT colonne_inexistante FROM personne;",
        "error_message": None,
        "query_results": None,
        "iteration_count": 0,
        "schema_context": ""
    }

    result = node_execute_sql(state)
    assert result["error_message"] is not None
    assert "db_error" in result["error_message"] or "does not exist" in result["error_message"]
    assert result["iteration_count"] == 1


def test_should_continue():
    """
    Vérifie le routage conditionnel du graphe (Self-Healing).
    """
    # Cas 1 : Succès (pas d'erreur) -> END
    state_success: AgentState = {
        "question": "", "sql_query": "", "error_message": None, 
        "query_results": [], "iteration_count": 1, "schema_context": ""
    }
    assert should_continue(state_success) == END

    # Cas 2 : Erreur et essais restants -> generate_sql
    state_retry: AgentState = {
        "question": "", "sql_query": "", "error_message": "Erreur de jointure", 
        "query_results": None, "iteration_count": 1, "schema_context": ""
    }
    assert should_continue(state_retry) == "generate_sql"

    # Cas 3 : Erreur mais limite atteinte (3) -> END
    state_limit: AgentState = {
        "question": "", "sql_query": "", "error_message": "Erreur critique", 
        "query_results": None, "iteration_count": 3, "schema_context": ""
    }
    assert should_continue(state_limit) == END


@pytest.mark.asyncio
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
    titres = [row["titre"] for row in final_state["query_results"]]
    assert "Héraclès" in titres or "Ulysse" in titres
