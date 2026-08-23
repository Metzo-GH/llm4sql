import re
from datetime import date, datetime
from decimal import Decimal
from typing import List, Dict, Any
import itertools
from collections import Counter

# Plafond combinatoire pour la projection de colonnes (élimine le risque d'explosion CPU O(M!/(M-K)!))
MAX_COLUMN_PERMUTATIONS = 120

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


def _extract_row_tokens(row: Any) -> set:
    """
    Extrait l'ensemble des jetons significatifs (mots textuels en minuscules de longueur >= 2 et nombres)
    d'une ligne normalisée, en EXCLUANT STRICTEMENT les valeurs None, null, chaînes vides
    ou présentes dans FALLBACK_NULL_STRINGS.
    """
    tokens = set()
    if row is None:
        return tokens

    if isinstance(row, dict):
        values = row.values()
    elif isinstance(row, (list, tuple)):
        values = row
    else:
        values = [row]

    for val in values:
        if val is None:
            continue
        val_str = str(val).strip().lower()
        if not val_str or val_str in FALLBACK_NULL_STRINGS:
            continue

        raw_tokens = re.findall(r'\w+', val_str)
        for t in raw_tokens:
            if not t or t in FALLBACK_NULL_STRINGS or t in {"none", "null"}:
                continue
            if t.isdigit() or len(t) >= 2:
                tokens.add(t)

    return tokens


def _find_distinct_token_matching(exp_rows: List[Any], act_rows: List[Any], check_order: bool = False) -> bool:
    """
    Vérifie que chaque ligne de exp_rows trouve une correspondance distincte dans act_rows
    telle que exp_tokens.issubset(act_tokens).
    
    Si check_order=True, l'ordre des correspondances dans act_rows doit être strictement croissant.
    """
    exp_tokens_list = [_extract_row_tokens(r) for r in exp_rows]
    act_tokens_list = [_extract_row_tokens(r) for r in act_rows]

    # Une ligne attendue sans aucun jeton valide ne peut pas être validée par soft-matching
    if any(not exp_toks for exp_toks in exp_tokens_list):
        return False

    candidates = []
    for exp_toks in exp_tokens_list:
        matched_indices = []
        for j, act_toks in enumerate(act_tokens_list):
            if exp_toks.issubset(act_toks):
                matched_indices.append(j)
        candidates.append(matched_indices)

    if check_order:
        def find_increasing_sequence(exp_idx: int, last_act_idx: int) -> bool:
            if exp_idx == len(exp_rows):
                return True
            for act_idx in candidates[exp_idx]:
                if act_idx > last_act_idx:
                    if find_increasing_sequence(exp_idx + 1, act_idx):
                        return True
            return False

        return find_increasing_sequence(0, -1)
    else:
        match_actual = {}  # act_j -> exp_i

        def dfs(exp_idx: int, visited: set) -> bool:
            for act_idx in candidates[exp_idx]:
                if act_idx not in visited:
                    visited.add(act_idx)
                    if act_idx not in match_actual or dfs(match_actual[act_idx], visited):
                        match_actual[act_idx] = exp_idx
                        return True
            return False

        for exp_idx in range(len(exp_rows)):
            visited = set()
            if not dfs(exp_idx, visited):
                return False

        return True


def compare_query_results(expected: Any, actual: Any, check_order: bool = False) -> bool:
    """
    Compare deux ensembles de résultats SQL de manière sémantique métier (Sub-set Column Projection, Multiset Matching, et Soft-Matching par jetons).
    
    Args:
        expected: Résultats attendus de la requête Ground Truth (K colonnes).
        actual: Résultats produits par la requête générée par l'agent (M colonnes).
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

    if len(norm_actual) < len(norm_expected):
        return False

    exp_tuples = [_row_to_tuple(r) for r in norm_expected]
    act_tuples = [_row_to_tuple(r) for r in norm_actual]

    if exp_tuples and act_tuples:
        K = len(exp_tuples[0])
        M = len(act_tuples[0])

        if M >= K:
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
            perm_count = 0
            for combination in itertools.permutations(col_indices, K):
                perm_count += 1
                if perm_count > MAX_COLUMN_PERMUTATIONS:
                    # En cas de combinatoire excessive (ex: M >= 8, K >= 6), basculer sur le soft-matching
                    break
                proj_tuples = [tuple(r[i] for i in combination) for r in act_tuples]
                if _check_tuple_match(exp_tuples, proj_tuples, exp_counter, check_order):
                    return True

    # 3. Soft-Matching par jetons en cas d'échec de la comparaison stricte (ex: colonnes concaténées, M < K)
    return _find_distinct_token_matching(norm_expected, norm_actual, check_order=check_order)
