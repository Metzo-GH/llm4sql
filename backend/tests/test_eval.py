import pytest
from decimal import Decimal
from datetime import date, datetime
from unittest.mock import patch
from fastapi.testclient import TestClient

from app.main import app
from app.services.eval_service import (
    load_dataset,
    save_dataset,
    add_eval_case,
    update_eval_case,
    delete_eval_case,
    reset_eval_dataset,
    run_benchmark_case,
    normalize_results,
    compare_query_results,
)

client = TestClient(app)


def test_eval_dataset_structure():
    """Vérifie la structure et la présence des cas d'évaluation canoniques."""
    dataset = reset_eval_dataset()
    assert len(dataset) == 18
    difficulties = {"Facile", "Moyen", "Difficile", "Avancé"}
    
    for case in dataset:
        assert "id" in case
        assert "question" in case
        assert "difficulty" in case
        assert "ground_truth_sql" in case
        assert case["difficulty"] in difficulties


def test_normalize_results():
    """Vérifie la normalisation correcte des types Python (Decimal, date, datetime, None)."""
    raw_data = [
        {"val": Decimal("15.50"), "dt": date(2024, 5, 10), "name": "Test", "none_val": None},
        {"val": 42, "dt": datetime(2024, 5, 10, 12, 0, 0), "name": None, "none_val": None}
    ]
    normalized = normalize_results(raw_data)
    assert len(normalized) == 2
    assert normalized[0]["val"] == 15.5
    assert normalized[0]["dt"] == "2024-05-10"
    assert normalized[0]["name"] == "Test"
    assert normalized[0]["none_val"] is None
    assert normalized[1]["val"] == 42
    assert normalized[1]["dt"] == "2024-05-10T12:00:00"


def test_compare_query_results_exact():
    """Vérifie la comparaison sur des données identiques."""
    res1 = [{"col1": "A", "col2": 10}]
    res2 = [{"col1": "A", "col2": 10}]
    assert compare_query_results(res1, res2) is True


def test_compare_query_results_alias_tolerance():
    """Vérifie l'insensibilité au nommage des alias de colonnes."""
    expected = [{"nom_auteur": "Blain", "total": 5}]
    actual = [{"author": "Blain", "count_val": 5}]
    assert compare_query_results(expected, actual) is True


def test_compare_query_results_type_tolerance():
    """Vérifie la tolérance aux types Decimal et date vs string/float."""
    expected = [{"val": Decimal("4.5"), "d": date(2020, 1, 1)}]
    actual = [{"val": 4.5, "d": "2020-01-01"}]
    assert compare_query_results(expected, actual) is True


def test_compare_query_results_order_tolerance():
    """Vérifie la comparaison non ordonnée par défaut."""
    res1 = [{"id": 1, "v": "a"}, {"id": 2, "v": "b"}]
    res2 = [{"id": 2, "v": "b"}, {"id": 1, "v": "a"}]
    assert compare_query_results(res1, res2, check_order=False) is True
    assert compare_query_results(res1, res2, check_order=True) is False


def test_compare_query_results_mismatch():
    """Vérifie la détection de différences de résultats."""
    res1 = [{"col": "X"}]
    res2 = [{"col": "Y"}]
    assert compare_query_results(res1, res2) is False


def test_crud_dataset_service():
    """Vérifie la logique CRUD JSON dans eval_service."""
    reset_eval_dataset()
    
    # Add case
    new_case = add_eval_case(
        question="Combien de personnes ?",
        difficulty="Facile",
        ground_truth_sql="SELECT COUNT(*) FROM personne;"
    )
    assert new_case["id"] > 0
    assert new_case["question"] == "Combien de personnes ?"
    
    # Check dataset updated
    dataset = load_dataset()
    assert len(dataset) == 19
    
    # Update case
    updated = update_eval_case(new_case["id"], {"question": "Compter personnes"})
    assert updated["question"] == "Compter personnes"
    
    # Delete case
    deleted = delete_eval_case(new_case["id"])
    assert deleted is True
    assert len(load_dataset()) == 18
    
    # Reset case
    reset_eval_dataset()
    assert len(load_dataset()) == 18


def test_api_eval_crud_endpoints():
    """Vérifie l'ensemble des routes API REST CRUD de /api/eval/cases."""
    reset_eval_dataset()
    
    # GET cases
    response = client.get("/api/eval/cases")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 18

    # POST case
    payload = {
        "question": "Quel est le titre du premier ouvrage ?",
        "difficulty": "Moyen",
        "ground_truth_sql": "SELECT titre FROM ouvrage ORDER BY date_sortie LIMIT 1;"
    }
    res_post = client.post("/api/eval/cases", json=payload)
    assert res_post.status_code == 201
    created_case = res_post.json()
    assert created_case["id"] > 0
    assert created_case["question"] == payload["question"]

    # PUT case
    case_id = created_case["id"]
    res_put = client.put(f"/api/eval/cases/{case_id}", json={"question": "Question modifiée"})
    assert res_put.status_code == 200
    assert res_put.json()["question"] == "Question modifiée"

    # DELETE case
    res_del = client.delete(f"/api/eval/cases/{case_id}")
    assert res_del.status_code == 200
    assert res_del.json()["message"] == f"Cas id={case_id} supprimé avec succès."

    # POST reset
    res_reset = client.post("/api/eval/cases/reset")
    assert res_reset.status_code == 200
    assert len(res_reset.json()) == 18


def test_run_benchmark_case_telemetry():
    """Vérifie la capture et l'exposition des étapes agentiques (steps) dans le résultat du benchmark."""
    mock_state = {
        "sql_query": "SELECT COUNT(*) FROM serie;",
        "query_results": [{"count": 10}],
        "error_message": None,
        "steps": [
            {"node": "node_select_tables", "status": "success", "mcp_tool": "get_tables", "elapsed_time": 0.12},
            {"node": "node_generate_sql", "status": "success", "mcp_tool": "dry_run_query", "elapsed_time": 0.45}
        ]
    }
    
    case_test = {
        "id": 999,
        "question": "Combien y a-t-il de séries ?",
        "difficulty": "Facile",
        "ground_truth_sql": "SELECT COUNT(*) FROM serie;"
    }

    with patch("app.services.eval_service.run_agent", return_value=mock_state):
        with patch("app.services.eval_service.execute_raw_sql", return_value=[{"count": 10}]):
            res = run_benchmark_case(case_test)
            assert res["passed"] is True
            assert "steps" in res
            assert len(res["steps"]) == 2
            assert res["steps"][0]["node"] == "node_select_tables"
            assert res["steps"][1]["mcp_tool"] == "dry_run_query"


def test_compare_query_results_bonus_columns():
    """Vérifie qu'une réponse de l'IA avec des colonnes bonus (ex: id, count) est validée."""
    expected = [
        {"titre": "Incal", "note": 4.5},
        {"titre": "Blacksad", "note": 4.8}
    ]
    actual = [
        {"id": 101, "titre": "Incal", "note": 4.5, "count": 12},
        {"id": 102, "titre": "Blacksad", "note": 4.8, "count": 15}
    ]
    assert compare_query_results(expected, actual) is True


def test_compare_query_results_coalesce_null_equivalence():
    """Vérifie l'équivalence sémantique métier entre NULL et chaîne vide (COALESCE)."""
    expected = [
        {"nom": "Titeuf", "prenom": None},
        {"nom": "Asterix", "prenom": "   "}
    ]
    actual = [
        {"nom": "Titeuf", "prenom": ""},
        {"nom": "Asterix", "prenom": None}
    ]
    assert compare_query_results(expected, actual) is True


def test_compare_query_results_round_decimals():
    """Vérifie que l'arrondi à 2 décimales (ROUND(val, 2)) est toléré et comparé avec succès."""
    expected = [{"avg_score": Decimal("4.5555")}]
    actual = [{"score": 4.56}]
    assert compare_query_results(expected, actual) is True


def test_benchmark_cancel_service():
    """Vérifie le drapeau et la logique d'annulation du benchmark dans eval_service."""
    from app.services.eval_service import (
        request_benchmark_cancel,
        is_benchmark_cancelled,
        reset_benchmark_cancel,
        run_full_benchmark,
    )

    reset_benchmark_cancel()
    assert is_benchmark_cancelled() is False

    request_benchmark_cancel()
    assert is_benchmark_cancelled() is True

    reset_benchmark_cancel()
    assert is_benchmark_cancelled() is False

    # Tester l'interruption précoce de run_full_benchmark()
    call_count = 0

    def mock_case(case_input, model=None, target_schema="public"):
        nonlocal call_count
        call_count += 1
        if call_count >= 1:
            request_benchmark_cancel()
        return {
            "id": case_input if isinstance(case_input, int) else case_input["id"],
            "question": "test",
            "difficulty": "Facile",
            "passed": True,
            "execution_time": 0.1,
            "ground_truth_sql": "SELECT 1;",
            "generated_sql": "SELECT 1;",
            "error": None,
            "expected_count": 1,
            "actual_count": 1,
            "steps": []
        }

    with patch("app.services.eval_service.run_benchmark_case", side_effect=mock_case):
        res = run_full_benchmark()
        assert res.get("cancelled") is True
        assert len(res["results"]) == 1
        assert call_count == 1


def test_api_eval_stop_endpoint():
    """Vérifie l'endpoint API POST /api/eval/stop pour annuler le benchmark."""
    from app.services.eval_service import is_benchmark_cancelled, reset_benchmark_cancel

    reset_benchmark_cancel()
    response = client.post("/api/eval/stop")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "stopped"
    assert "arrêté avec succès" in data["message"]
    assert is_benchmark_cancelled() is True


def test_compare_query_results_fallback_null_strings():
    """Vérifie l'équivalence sémantique entre None et 'Pas de série', 'N/A', 'Inconnu'."""
    expected = [
        {"titre": "Album 1", "serie": None},
        {"titre": "Album 2", "serie": "N/A"},
        {"titre": "Album 3", "serie": "Inconnu"}
    ]
    actual = [
        {"titre": "Album 1", "serie": "Pas de série"},
        {"titre": "Album 2", "serie": None},
        {"titre": "Album 3", "serie": "Pas de série"}
    ]
    assert compare_query_results(expected, actual) is True


def test_compare_query_results_soft_matching_concatenated():
    """Vérifie que la comparaison réussit si les colonnes attendues sont concaténées dans une seule colonne de la réponse."""
    expected = [{"nom": "Blain", "prenom": "Christophe"}]
    actual = [{"auteur": "Blain (Christophe)"}]
    assert compare_query_results(expected, actual) is True


def test_compare_query_results_soft_matching_ignores_nulls():
    """Vérifie que le soft-matching ignore les valeurs None et ne cherche pas la chaîne 'None' ou 'null'."""
    expected = [{"nom": "Blain", "prenom": "Christophe", "coloriste": None}]
    actual = [{"auteur": "Blain (Christophe)"}]
    assert compare_query_results(expected, actual) is True




