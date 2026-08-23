import time
import logging
import threading
from datetime import datetime
from typing import List, Dict, Any, Optional, Callable

from app.database.pool import get_db_conn
from app.services.agent.graph import run_agent
from app.services.eval.eval_repo import load_dataset
from app.services.eval.eval_comparator import compare_query_results

logger = logging.getLogger("llm4sql.eval_benchmark")

# Événement global thread-safe pour annuler le benchmark en cours
_eval_cancel_event = threading.Event()


def request_benchmark_cancel() -> None:
    """
    Demande l'annulation du benchmark d'évaluation en cours de déroulement.
    """
    logger.info("Demande d'annulation du benchmark reçue.")
    _eval_cancel_event.set()


def is_benchmark_cancelled() -> bool:
    """
    Vérifie si le drapeau d'annulation du benchmark est activé.
    
    Returns:
        True si l'annulation a été demandée, False sinon.
    """
    return _eval_cancel_event.is_set()


def reset_benchmark_cancel() -> None:
    """
    Réinitialise le drapeau d'annulation du benchmark.
    """
    _eval_cancel_event.clear()


def execute_raw_sql(sql_query: str, target_schema: str = "public") -> List[Dict[str, Any]]:
    """
    Exécute une requête SQL brute de manière sécurisée (lecture seule) sur PostgreSQL via le pool.
    
    Args:
        sql_query (str): La requête SQL brute à exécuter.
        target_schema (str): Le schéma PostgreSQL cible ('public' ou 'user_sandbox').
        
    Returns:
        List[Dict[str, Any]]: Liste des lignes retournées sous forme de dictionnaires {colonne: valeur}.
        
    Raises:
        RuntimeError: En cas d'erreur lors de l'exécution SQL.
    """
    try:
        with get_db_conn(schema=target_schema, readonly=True) as conn:
            with conn.cursor() as cur:
                cur.execute(sql_query)
                if cur.description:
                    columns = [desc[0] for desc in cur.description]
                    rows = cur.fetchall()
                    return [dict(zip(columns, row)) for row in rows]
                return []
    except Exception as e:
        logger.error(f"Erreur d'exécution SQL dans eval_benchmark : {str(e)}")
        raise RuntimeError(f"SQL Execution Error: {str(e)}")


def run_benchmark_case(case_input: Any, model: Optional[str] = None, target_schema: str = "public") -> Dict[str, Any]:
    """
    Exécute un cas d'évaluation individuel.
    
    Args:
        case_input: ID du cas ou dictionnaire complet du cas.
        model: Modèle LLM optionnel pour l'inférence.
        target_schema: Schéma PostgreSQL cible ("public" par défaut).
        
    Returns:
        Dictionnaire détaillant le résultat de l'exécution, du test d'équivalence SQL et de la télémétrie agentique.
    """
    dataset = load_dataset()
    if isinstance(case_input, int):
        case = next((c for c in dataset if c["id"] == case_input), None)
        if not case:
            raise ValueError(f"Cas d'évaluation avec id={case_input} non trouvé.")
    else:
        case = case_input

    question = case["question"]
    gt_sql = case["ground_truth_sql"]
    difficulty = case["difficulty"]

    # 1. Exécuter le SQL Ground Truth
    expected_results = []
    gt_error = None
    try:
        expected_results = execute_raw_sql(gt_sql, target_schema=target_schema)
    except Exception as e:
        gt_error = str(e)
        logger.error(f"[Eval Case {case['id']}] Erreur lors de l'exécution Ground Truth : {gt_error}")

    # 2. Exécuter l'agent
    start_time = time.time()
    generated_sql = None
    actual_results = None
    agent_error = None
    steps = []
    
    try:
        final_state = run_agent(
            question=question,
            model=model,
            context_size=8192,
            bypass_semantic_cache=True,
            target_schema=target_schema
        )
        generated_sql = final_state.get("sql_query")
        actual_results = final_state.get("query_results")
        agent_error = final_state.get("error_message")
        steps = final_state.get("steps", [])

        # Si l'agent a renvoyé un SQL mais que les résultats n'étaient pas enregistrés dans le state, tenter l'exécution
        if generated_sql and actual_results is None and not agent_error:
            try:
                actual_results = execute_raw_sql(generated_sql, target_schema=target_schema)
            except Exception as ex:
                agent_error = f"Erreur d'exécution du SQL généré : {str(ex)}"
    except Exception as e:
        agent_error = f"Crash agent : {str(e)}"

    elapsed_time = time.time() - start_time

    # 3. Comparer
    passed = False
    if gt_error is None and agent_error is None and actual_results is not None:
        passed = compare_query_results(expected_results, actual_results)

    return {
        "id": case["id"],
        "question": question,
        "difficulty": difficulty,
        "passed": passed,
        "execution_time": round(elapsed_time, 2),
        "ground_truth_sql": gt_sql,
        "generated_sql": generated_sql,
        "error": agent_error or gt_error,
        "expected_count": len(expected_results) if expected_results else 0,
        "actual_count": len(actual_results) if actual_results is not None else 0,
        "steps": steps
    }


def run_full_benchmark(model: Optional[str] = None, progress_callback: Optional[Callable] = None, target_schema: str = "public") -> Dict[str, Any]:
    """
    Exécute le benchmark complet sur l'ensemble des cas d'évaluation.
    
    Args:
        model: Nom du modèle Ollama optionnel.
        progress_callback: Callback optionnel appelé après chaque cas (index, total, res).
        target_schema: Schéma PostgreSQL cible ("public" par défaut).
        
    Returns:
        Dictionnaire de rapport global avec synthèses et scores par difficulté.
    """
    logger.info(f"Démarrage du benchmark d'évaluation complet pour le modèle : {model or 'Défaut'} (Schéma: {target_schema})")
    reset_benchmark_cancel()
    start_total_time = time.time()

    dataset = load_dataset()
    results = []
    total_cases = len(dataset)
    passed_cases = 0

    difficulty_stats = {
        "Facile": {"total": 0, "passed": 0},
        "Moyen": {"total": 0, "passed": 0},
        "Difficile": {"total": 0, "passed": 0},
        "Avancé": {"total": 0, "passed": 0}
    }

    was_cancelled = False

    for idx, case in enumerate(dataset):
        if is_benchmark_cancelled():
            logger.info("Benchmark interrompu suite à une demande d'annulation utilisateur.")
            was_cancelled = True
            break

        diff = case.get("difficulty", "Facile")
        if diff not in difficulty_stats:
            difficulty_stats[diff] = {"total": 0, "passed": 0}
        difficulty_stats[diff]["total"] += 1

        import app.services.eval.eval_benchmark as _bench
        case_res = _bench.run_benchmark_case(case, model=model, target_schema=target_schema)
        results.append(case_res)

        if case_res["passed"]:
            passed_cases += 1
            if diff in difficulty_stats:
                difficulty_stats[diff]["passed"] += 1

        if progress_callback:
            try:
                progress_callback(idx + 1, total_cases, case_res)
            except Exception as cb_err:
                logger.warning(f"Erreur dans le callback de progression : {str(cb_err)}")

    total_elapsed = round(time.time() - start_total_time, 2)
    global_score = round((passed_cases / total_cases) * 100, 1) if total_cases > 0 else 0.0

    difficulty_breakdown = {}
    for diff, stat in difficulty_stats.items():
        tot = stat["total"]
        pas = stat["passed"]
        acc = round((pas / tot) * 100, 1) if tot > 0 else 0.0
        difficulty_breakdown[diff] = {
            "total": tot,
            "passed": pas,
            "accuracy": acc
        }

    summary = {
        "timestamp": datetime.now().isoformat(),
        "model": model or "default",
        "total_cases": total_cases,
        "passed_cases": passed_cases,
        "global_score": global_score,
        "total_execution_time": total_elapsed,
        "difficulty_breakdown": difficulty_breakdown,
        "results": results,
        "cancelled": was_cancelled
    }

    if was_cancelled:
        logger.info(f"Benchmark annulé après {len(results)}/{total_cases} cas en {total_elapsed}s")
    else:
        logger.info(f"Benchmark terminé : Score Global = {global_score}% ({passed_cases}/{total_cases}) en {total_elapsed}s")
    return summary
