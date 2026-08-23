"""
Façade de rétro-compatibilité pour le service d'évaluation.

Ce module réexporte l'ensemble des fonctions, structures de données et constantes
désormais réparties dans les modules spécialisés du package `app.services.eval` :
- `eval_repo` : Stockage JSON & CRUD
- `eval_comparator` : Comparaison sémantique SQL & Soft-Matching
- `eval_benchmark` : Orchestration du benchmark & Télémétrie SSE
"""

from app.services.eval.eval_repo import (
    DATASET_FILE,
    CANONICAL_EVAL_DATASET,
    EVAL_DATASET,
    save_dataset,
    load_dataset,
    add_eval_case,
    update_eval_case,
    delete_eval_case,
    reset_eval_dataset,
)
from app.services.eval.eval_comparator import (
    FALLBACK_NULL_STRINGS,
    MAX_COLUMN_PERMUTATIONS,
    normalize_cell_value,
    normalize_value,
    normalize_results,
    compare_query_results,
)
from app.services.eval.eval_benchmark import (
    _eval_cancel_event,
    request_benchmark_cancel,
    is_benchmark_cancelled,
    reset_benchmark_cancel,
    execute_raw_sql,
    run_benchmark_case,
    run_full_benchmark,
)

__all__ = [
    "DATASET_FILE",
    "CANONICAL_EVAL_DATASET",
    "EVAL_DATASET",
    "save_dataset",
    "load_dataset",
    "add_eval_case",
    "update_eval_case",
    "delete_eval_case",
    "reset_eval_dataset",
    "FALLBACK_NULL_STRINGS",
    "MAX_COLUMN_PERMUTATIONS",
    "normalize_cell_value",
    "normalize_value",
    "normalize_results",
    "compare_query_results",
    "_eval_cancel_event",
    "request_benchmark_cancel",
    "is_benchmark_cancelled",
    "reset_benchmark_cancel",
    "execute_raw_sql",
    "run_benchmark_case",
    "run_full_benchmark",
]

