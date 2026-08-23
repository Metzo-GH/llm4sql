import pytest
from decimal import Decimal
from datetime import date

from app.services.eval.eval_repo import (
    load_dataset,
    save_dataset,
    add_eval_case,
    update_eval_case,
    delete_eval_case,
    reset_eval_dataset,
    CANONICAL_EVAL_DATASET
)
from app.services.eval.eval_comparator import (
    compare_query_results,
    normalize_cell_value,
    normalize_results,
    MAX_COLUMN_PERMUTATIONS
)
from app.services.eval.eval_benchmark import (
    request_benchmark_cancel,
    is_benchmark_cancelled,
    reset_benchmark_cancel,
    execute_raw_sql
)
from app.services.eval import (
    CANONICAL_EVAL_DATASET as PKG_CANONICAL,
    compare_query_results as pkg_compare_query_results
)
from app.services.eval_service import (
    CANONICAL_EVAL_DATASET as FACADE_CANONICAL,
    compare_query_results as facade_compare_query_results
)


def test_eval_repo_crud_and_canonical():
    """Vérifie les opérations CRUD isolées dans eval_repo."""
    dataset = reset_eval_dataset()
    assert len(dataset) == 18
    assert CANONICAL_EVAL_DATASET[0]["question"] == dataset[0]["question"]
    
    # Test d'ajout
    new_case = add_eval_case("Test Q", "Facile", "SELECT 1;")
    assert new_case["id"] == 19
    
    # Test de mise à jour
    updated = update_eval_case(19, {"question": "Updated Q"})
    assert updated["question"] == "Updated Q"
    
    # Test de suppression
    assert delete_eval_case(19) is True
    assert len(load_dataset()) == 18


def test_eval_comparator_pure_functions():
    """Vérifie la logique algorithmique pure de comparaison."""
    assert MAX_COLUMN_PERMUTATIONS == 120
    assert normalize_cell_value(Decimal("4.567")) == 4.57
    assert normalize_cell_value("  Pas de série  ") is None
    assert normalize_cell_value(date(2026, 8, 23)) == "2026-08-23"
    
    expected = [{"titre": "Tintin", "annee": 1950}]
    actual = [{"titre": "Tintin", "annee": 1950, "auteur": "Hergé"}]
    assert compare_query_results(expected, actual) is True


def test_eval_benchmark_cancellation_lifecycle():
    """Vérifie le cycle de vie thread-safe du drapeau d'annulation."""
    reset_benchmark_cancel()
    assert is_benchmark_cancelled() is False
    
    request_benchmark_cancel()
    assert is_benchmark_cancelled() is True
    
    reset_benchmark_cancel()
    assert is_benchmark_cancelled() is False


def test_eval_package_and_facade_backward_compatibility():
    """Vérifie que la façade eval_service et le package app.services.eval re-exportent parfaitement tous les symboles."""
    assert PKG_CANONICAL == CANONICAL_EVAL_DATASET
    assert FACADE_CANONICAL == CANONICAL_EVAL_DATASET
    assert pkg_compare_query_results is compare_query_results
    assert facade_compare_query_results is compare_query_results
