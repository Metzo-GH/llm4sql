import json
import time
import logging
import threading
from pathlib import Path
from datetime import date, datetime
from decimal import Decimal
from typing import List, Dict, Any, Optional, Callable
import itertools
from collections import Counter

from app.database.pool import get_db_connection
from app.services.agent.graph import run_agent

logger = logging.getLogger("llm4sql.eval_service")

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


# Chemin vers la persistance JSON
DATASET_FILE = Path(__file__).parent.parent / "data" / "eval_dataset.json"

# Dataset canonique par défaut de 18 cas d'évaluation
CANONICAL_EVAL_DATASET: List[Dict[str, Any]] = [
    {
        "id": 1,
        "question": "Lister le nom et le prénom de tous les auteurs de la table personne.",
        "difficulty": "Facile",
        "ground_truth_sql": "SELECT nom, prenom FROM personne ORDER BY nom, prenom;"
    },
    {
        "id": 2,
        "question": "Combien y a-t-il de séries enregistrées dans la base de données ?",
        "difficulty": "Facile",
        "ground_truth_sql": "SELECT COUNT(*) FROM serie;"
    },
    {
        "id": 3,
        "question": "Donner les titres des ouvrages sortis après l'année 2010.",
        "difficulty": "Facile",
        "ground_truth_sql": "SELECT titre FROM ouvrage WHERE date_sortie > '2010-12-31' ORDER BY titre;"
    },
    {
        "id": 4,
        "question": "Quel est le score moyen des avis attribués à l'album 'Les Indes Fourbes' ?",
        "difficulty": "Facile",
        "ground_truth_sql": "SELECT AVG(score) FROM avis a JOIN ouvrage o ON a.ido = o.ido WHERE o.titre = 'Les Indes Fourbes';"
    },
    {
        "id": 5,
        "question": "Donner le titre et le numéro d'ordre des albums appartenant à la série 'Blacksad'.",
        "difficulty": "Facile",
        "ground_truth_sql": "SELECT o.titre, o.num_ordre FROM ouvrage o JOIN serie s ON o.ids = s.ids WHERE s.titre = 'Blacksad' ORDER BY o.num_ordre;"
    },
    {
        "id": 6,
        "question": "Lister les ouvrages dessinés par 'Blain' avec le titre de leur série associée.",
        "difficulty": "Moyen",
        "ground_truth_sql": "SELECT o.titre, s.titre FROM ouvrage o JOIN personne p ON o.dessinateur = p.idp LEFT JOIN serie s ON o.ids = s.ids WHERE p.nom = 'Blain' ORDER BY o.titre;"
    },
    {
        "id": 7,
        "question": "Quels sont les 3 ouvrages ayant la meilleure note moyenne avec au moins 2 avis ?",
        "difficulty": "Moyen",
        "ground_truth_sql": "SELECT o.titre, AVG(a.score) FROM ouvrage o JOIN avis a ON o.ido = a.ido GROUP BY o.ido, o.titre HAVING COUNT(a.score) >= 2 ORDER BY AVG(a.score) DESC LIMIT 3;"
    },
    {
        "id": 8,
        "question": "Compter le nombre d'ouvrages associés à chaque mot-clé conceptuel.",
        "difficulty": "Moyen",
        "ground_truth_sql": "SELECT c.label, COUNT(ap.ido) FROM concept c JOIN a_pour_mot_cle ap ON c.idc = ap.idc GROUP BY c.idc, c.label ORDER BY COUNT(ap.ido) DESC, c.label;"
    },
    {
        "id": 9,
        "question": "Quels sont les auteurs qui sont à la fois dessinateurs et scénaristes d'un même ouvrage ?",
        "difficulty": "Moyen",
        "ground_truth_sql": "SELECT DISTINCT p.nom, p.prenom FROM personne p JOIN ouvrage o ON p.idp = o.dessinateur WHERE o.dessinateur = o.scenariste ORDER BY p.nom;"
    },
    {
        "id": 10,
        "question": "Quels sont les utilisateurs (pseudos) ayant donné des notes supérieures à la moyenne globale ?",
        "difficulty": "Difficile",
        "ground_truth_sql": "SELECT DISTINCT pseudo FROM avis WHERE score > (SELECT AVG(score) FROM avis) ORDER BY pseudo;"
    },
    {
        "id": 11,
        "question": "Trouver les paires d'auteurs (dessinateur et scénariste) ayant réalisé plus d'un album ensemble.",
        "difficulty": "Difficile",
        "ground_truth_sql": "SELECT p1.nom, p2.nom FROM ouvrage o JOIN personne p1 ON o.dessinateur = p1.idp JOIN personne p2 ON o.scenariste = p2.idp GROUP BY p1.idp, p1.nom, p2.idp, p2.nom HAVING COUNT(*) > 1 ORDER BY p1.nom;"
    },
    {
        "id": 12,
        "question": "Donner la liste des ouvrages associés au concept père 'histoire' ou à ses sous-concepts.",
        "difficulty": "Difficile",
        "ground_truth_sql": "WITH RECURSIVE me AS (SELECT idc FROM concept WHERE label = 'histoire' UNION ALL SELECT c.idc FROM concept c JOIN me ON c.concept_pere = me.idc) SELECT DISTINCT o.titre FROM ouvrage o JOIN a_pour_mot_cle ap ON o.ido = ap.ido JOIN me ON ap.idc = me.idc ORDER BY o.titre;"
    },
    {
        "id": 13,
        "question": "Calculer la note moyenne par série et classer les séries de la mieux notée à la moins bien notée.",
        "difficulty": "Avancé",
        "ground_truth_sql": "SELECT s.titre, AVG(a.score) FROM serie s JOIN ouvrage o ON s.ids = o.ids JOIN avis a ON o.ido = a.ido GROUP BY s.ids, s.titre ORDER BY AVG(a.score) DESC;"
    },
    {
        "id": 14,
        "question": "Pour chaque série, trouver le titre de la série, son nombre d'albums et la date de sortie du premier album.",
        "difficulty": "Avancé",
        "ground_truth_sql": "SELECT s.titre, COUNT(o.ido), MIN(o.date_sortie) FROM serie s JOIN ouvrage o ON s.ids = o.ids GROUP BY s.ids, s.titre ORDER BY s.titre;"
    },
    {
        "id": 15,
        "question": "Peux-tu me donner la liste de tous les dessinateurs uniques enregistrés dans la table ouvrage ?",
        "difficulty": "Facile",
        "ground_truth_sql": "SELECT DISTINCT p.nom, p.prenom FROM ouvrage o JOIN personne p ON o.dessinateur = p.idp ORDER BY p.nom;"
    },
    {
        "id": 16,
        "question": "Affiche pour chaque album son titre, le nom de son scénariste, et le nom de son dessinateur.",
        "difficulty": "Moyen",
        "ground_truth_sql": "SELECT o.titre, ps.nom, pd.nom FROM ouvrage o JOIN personne pd ON o.dessinateur = pd.idp JOIN personne ps ON o.scenariste = ps.idp ORDER BY o.titre;"
    },
    {
        "id": 17,
        "question": "Donner la liste des ouvrages n'ayant reçu aucun avis de lecteur.",
        "difficulty": "Difficile",
        "ground_truth_sql": "SELECT o.titre FROM ouvrage o LEFT JOIN avis a ON o.ido = a.ido WHERE a.ido IS NULL ORDER BY o.titre;"
    },
    {
        "id": 18,
        "question": "Lister les concepts n'ayant aucun concept père et compter combien d'ouvrages y sont associés.",
        "difficulty": "Avancé",
        "ground_truth_sql": "SELECT c.label, COUNT(ap.ido) FROM concept c LEFT JOIN a_pour_mot_cle ap ON c.idc = ap.idc WHERE c.concept_pere IS NULL GROUP BY c.idc, c.label ORDER BY c.label;"
    }
]

# Collection dynamique en mémoire synchronisée avec eval_dataset.json
EVAL_DATASET: List[Dict[str, Any]] = []


def save_dataset(dataset: List[Dict[str, Any]]) -> None:
    """Sauvegarde le jeu de données d'évaluation dans backend/app/data/eval_dataset.json."""
    DATASET_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(DATASET_FILE, "w", encoding="utf-8") as f:
        json.dump(dataset, f, indent=2, ensure_ascii=False)
    EVAL_DATASET.clear()
    EVAL_DATASET.extend(dataset)


def load_dataset() -> List[Dict[str, Any]]:
    """
    Charge le jeu de données d'évaluation depuis backend/app/data/eval_dataset.json.
    Crée le fichier s'il n'existe pas avec les 18 cas canoniques.
    """
    DATASET_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not DATASET_FILE.exists():
        save_dataset(CANONICAL_EVAL_DATASET)

    try:
        with open(DATASET_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            EVAL_DATASET.clear()
            EVAL_DATASET.extend(data)
            return EVAL_DATASET
    except Exception as e:
        logger.error(f"Erreur de lecture de eval_dataset.json: {str(e)}")
        EVAL_DATASET.clear()
        EVAL_DATASET.extend(CANONICAL_EVAL_DATASET)
        return EVAL_DATASET


def add_eval_case(question: str, difficulty: str, ground_truth_sql: str) -> Dict[str, Any]:
    """Ajoute un nouveau cas d'évaluation et persiste dans le JSON."""
    ds = load_dataset()
    new_id = max([c["id"] for c in ds], default=0) + 1
    new_case = {
        "id": new_id,
        "question": question,
        "difficulty": difficulty,
        "ground_truth_sql": ground_truth_sql
    }
    ds.append(new_case)
    save_dataset(ds)
    return new_case


def update_eval_case(case_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
    """Modifie un cas d'évaluation existant par son ID et persiste dans le JSON."""
    ds = load_dataset()
    target = next((c for c in ds if c["id"] == case_id), None)
    if not target:
        raise ValueError(f"Cas d'évaluation id={case_id} non trouvé.")

    if "question" in data and data["question"] is not None:
        target["question"] = data["question"]
    if "difficulty" in data and data["difficulty"] is not None:
        target["difficulty"] = data["difficulty"]
    if "ground_truth_sql" in data and data["ground_truth_sql"] is not None:
        target["ground_truth_sql"] = data["ground_truth_sql"]

    save_dataset(ds)
    return target


def delete_eval_case(case_id: int) -> bool:
    """Supprime un cas d'évaluation par son ID et persiste dans le JSON."""
    ds = load_dataset()
    new_ds = [c for c in ds if c["id"] != case_id]
    if len(new_ds) == len(ds):
        return False
    save_dataset(new_ds)
    return True


def reset_eval_dataset() -> List[Dict[str, Any]]:
    """Réinitialise le dataset JSON aux 18 cas canoniques par défaut."""
    save_dataset(CANONICAL_EVAL_DATASET)
    return load_dataset()


# Charger le dataset au chargement du module
load_dataset()


FALLBACK_NULL_STRINGS = {
    "", "none", "null", "n/a", "na", "inconnu", "unknown",
    "pas de serie", "pas de série", "sans serie", "sans série",
    "non renseigne", "non renseigné", "non specifie", "non spécifié"
}


def normalize_cell_value(val: Any) -> Any:
    """
    Normalise une valeur de cellule pour l'évaluation sémantique métier.
    - None/NULL, chaînes vides et indicateurs d'absence (FALLBACK_NULL_STRINGS) sont équivalents (normalisés en None).
    - Decimal et float sont arrondis à 2 décimales pour absorber les ROUND(..., 2).
    - date et datetime sont convertis au format ISO (chaîne).
    - Chaînes de caractères non vides sont dépouillées des espaces superflus (strip).
    """
    if val is None:
        return None
    if isinstance(val, str):
        cleaned = val.strip()
        if cleaned.lower() in FALLBACK_NULL_STRINGS:
            return None
        return cleaned
    if isinstance(val, Decimal):
        return round(float(val), 2)
    if isinstance(val, float):
        return round(val, 2)
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    return val


def normalize_value(val: Any) -> Any:
    """Alias pour rétrocompatibilité avec la suite de tests et modules existants."""
    return normalize_cell_value(val)


def normalize_results(rows: Any) -> List[Any]:
    """
    Normalise une liste de résultats SQL (liste de dicts ou liste de tuples).
    
    Args:
        rows: Données brutes retournées par l'exécution de la requête.
        
    Returns:
        Liste structurée avec des types Python de base normalisés.
    """
    if not rows:
        return []

    normalized = []
    for row in rows:
        if isinstance(row, dict):
            normalized_row = {k: normalize_cell_value(v) for k, v in row.items()}
        elif isinstance(row, (list, tuple)):
            normalized_row = [normalize_cell_value(v) for v in row]
        else:
            normalized_row = normalize_cell_value(row)
        normalized.append(normalized_row)

    return normalized


def _row_to_tuple(row: Any) -> tuple:
    """Convertit une ligne (dict, liste, tuple, valeur) en un tuple de valeurs."""
    if isinstance(row, dict):
        return tuple(row.values())
    elif isinstance(row, (list, tuple)):
        return tuple(row)
    else:
        return (row,)


def _check_tuple_match(exp_tuples: List[tuple], proj_tuples: List[tuple], exp_counter: Counter, check_order: bool) -> bool:
    """Vérifie l'inclusion des lignes (Multiset Matching) et le respect optionnel de l'ordre."""
    if check_order:
        if len(exp_tuples) == len(proj_tuples):
            return exp_tuples == proj_tuples
        # Sous-séquence ordonnée
        it = iter(proj_tuples)
        return all(item in it for item in exp_tuples)
    else:
        proj_counter = Counter(proj_tuples)
        return all(proj_counter[t] >= count for t, count in exp_counter.items())


def compare_query_results(expected: Any, actual: Any, check_order: bool = False) -> bool:
    """
    Compare deux ensembles de résultats SQL de manière sémantique métier (Sub-set Column Projection et Multiset Matching).
    
    Args:
        expected: Résultats attendus de la requête Ground Truth (K colonnes).
        actual: Résultats produits par la requête générée par l'agent (M >= K colonnes).
        check_order: Si True, exige que l'ordre des lignes concorde.
        
    Returns:
        True si les résultats correspondent (sémantique métier), False sinon.
    """
    if expected is None and actual is None:
        return True
    if expected is None or actual is None:
        return False

    norm_expected = normalize_results(expected)
    norm_actual = normalize_results(actual)

    if not norm_expected and not norm_actual:
        return True
    if not norm_expected or not norm_actual:
        return False

    exp_tuples = [_row_to_tuple(r) for r in norm_expected]
    act_tuples = [_row_to_tuple(r) for r in norm_actual]

    if not exp_tuples or not act_tuples:
        return exp_tuples == act_tuples

    K = len(exp_tuples[0])
    M = len(act_tuples[0])

    if M < K or len(act_tuples) < len(exp_tuples):
        return False

    exp_counter = Counter(exp_tuples)

    # 1. Alignement direct des colonnes si dictionnaire et clés strictement identiques/incluses
    if isinstance(norm_expected[0], dict) and isinstance(norm_actual[0], dict):
        exp_keys = list(norm_expected[0].keys())
        act_keys = list(norm_actual[0].keys())
        if all(k in act_keys for k in exp_keys):
            matching_indices = tuple(act_keys.index(k) for k in exp_keys)
            proj_tuples = [tuple(r[i] for i in matching_indices) for r in act_tuples]
            if _check_tuple_match(exp_tuples, proj_tuples, exp_counter, check_order):
                return True

    # 2. Permutations des indices de colonnes pour trouver la projection de K colonnes parmi M
    col_indices = range(M)
    for combination in itertools.permutations(col_indices, K):
        proj_tuples = [tuple(r[i] for i in combination) for r in act_tuples]
        if _check_tuple_match(exp_tuples, proj_tuples, exp_counter, check_order):
            return True

    return False


def execute_raw_sql(sql_query: str, target_schema: str = "public") -> List[Dict[str, Any]]:
    """Exécute une requête SQL brute sur PostgreSQL et retourne le résultat sous forme de liste de dicts."""
    conn = None
    cur = None
    try:
        conn = get_db_connection(schema=target_schema)
        cur = conn.cursor()
        cur.execute(sql_query)
        if cur.description:
            columns = [desc[0] for desc in cur.description]
            rows = cur.fetchall()
            return [dict(zip(columns, row)) for row in rows]
        conn.commit()
        return []
    except Exception as e:
        logger.error(f"Erreur d'exécution SQL dans eval_service : {str(e)}")
        raise RuntimeError(f"SQL Execution Error: {str(e)}")
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


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

        case_res = run_benchmark_case(case, model=model, target_schema=target_schema)
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
