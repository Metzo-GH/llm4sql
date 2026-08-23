import pytest
from unittest.mock import patch, MagicMock
from app.database.pool import get_db_conn, get_db_connection
from app.schemas.chat import ChatRequest
from app.routers.eval import EvalRunRequest
from app.services.eval_service import run_benchmark_case

def test_get_db_connection_strict_schema_validation():
    """
    Vérifie que get_db_connection accepte uniquement 'public' et 'user_sandbox',
    et rejette toute autre valeur avec un ValueError.
    """
    conn_pub = get_db_connection(schema="public")
    assert conn_pub is not None
    conn_pub.close()

    conn_sb = get_db_connection(schema="user_sandbox")
    assert conn_sb is not None
    conn_sb.close()

    with pytest.raises(ValueError, match="Schéma non autorisé"):
        get_db_connection(schema="invalid_schema")

    with pytest.raises(ValueError, match="Schéma non autorisé"):
        get_db_connection(schema="public; DROP TABLE --")


def test_get_db_conn_strict_schema_validation():
    """
    Vérifie que get_db_conn accepte uniquement 'public' et 'user_sandbox',
    et rejette toute autre valeur avec un ValueError.
    """
    with get_db_conn(schema="public") as conn:
        assert conn is not None

    with get_db_conn(schema="user_sandbox") as conn:
        assert conn is not None

    with pytest.raises(ValueError, match="Schéma non autorisé"):
        with get_db_conn(schema="pg_catalog"):
            pass


def test_chat_request_target_schema_default_and_custom():
    """
    Vérifie que ChatRequest contient target_schema avec 'public' par défaut et accepte 'user_sandbox'.
    """
    req_default = ChatRequest(question="Affiche les livres", model="test-model")
    assert req_default.target_schema == "public"

    req_sandbox = ChatRequest(question="Affiche les livres", model="test-model", target_schema="user_sandbox")
    assert req_sandbox.target_schema == "user_sandbox"


def test_eval_run_request_target_schema():
    """
    Vérifie que EvalRunRequest accepte target_schema ('public' par défaut).
    """
    req_default = EvalRunRequest()
    assert req_default.target_schema == "public"

    req_sb = EvalRunRequest(target_schema="user_sandbox")
    assert req_sb.target_schema == "user_sandbox"


@patch("app.services.eval.eval_benchmark.execute_raw_sql")
@patch("app.services.eval.eval_benchmark.run_agent")
def test_run_benchmark_case_uses_target_schema(mock_run_agent, mock_execute_raw_sql):
    """
    Vérifie que run_benchmark_case transmet target_schema à run_agent et execute_raw_sql.
    """
    mock_execute_raw_sql.return_value = [{"col": 1}]
    mock_run_agent.return_value = {
        "sql_query": "SELECT 1;",
        "query_results": [{"col": 1}],
        "error_message": None,
        "steps": []
    }

    case = {
        "id": 99,
        "question": "Test question",
        "ground_truth_sql": "SELECT 1;",
        "difficulty": "Facile"
    }

    res = run_benchmark_case(case, model="test-model", target_schema="public")
    assert res["passed"] is True
    mock_run_agent.assert_called_once()
    assert mock_run_agent.call_args.kwargs.get("target_schema") == "public"
