import re
import sqlglot
from sqlglot import exp
from typing import Tuple, Set, Optional


# =====================================================================
# Constantes de sécurité centralisées
# =====================================================================

FORBIDDEN_SQL_TYPES: Set[str] = {
    "Insert", "Update", "Delete", "Drop", "Alter", "Create", "TruncateTable"
}
"""Types de nœuds AST interdits (opérations de mutation)."""

FORBIDDEN_PG_FUNCTIONS: Set[str] = {
    "pg_sleep",
    "pg_read_file",
    "pg_write_file",
    "pg_ls_dir",
    "pg_execute_server_program",
    "lo_import",
    "lo_export",
    "dblink_exec",
    "dblink_connect",
    "pg_stat_file",
    "pg_terminate_backend",
    "copy_to",
    "copy_from",
}
"""Fonctions PostgreSQL système dangereuses interdites dans toutes les requêtes."""

ALLOWED_SANDBOX_DDL_TYPES: Set[str] = {"Create", "Insert"}
"""Types de nœuds AST autorisés dans le sandbox DDL/DML (en plus de SELECT)."""


def _is_dangerous_function(node: exp.Expression) -> Tuple[bool, Optional[str]]:
    """
    Vérifie si un nœud AST correspond à une fonction PostgreSQL interdite.
    
    Returns:
        Tuple[bool, Optional[str]]: (est_interdit, nom_de_la_fonction)
    """
    if isinstance(node, exp.Func):
        func_name = node.name.lower() if isinstance(node, exp.Anonymous) else type(node).__name__.lower()
        if func_name in FORBIDDEN_PG_FUNCTIONS:
            return True, func_name
    return False, None


def validate_sql_query(sql: str) -> Tuple[bool, str]:
    """
    Analyse une requête SQL et valide si elle est strictement sécurisée et en lecture seule.
    
    Cette fonction utilise la bibliothèque de parsing AST sqlglot pour s'assurer que :
    1. La requête est syntaxiquement valide.
    2. La requête contient uniquement des instructions SELECT de lecture.
    3. Il n'y a pas d'attaques par injection ou de multi-requêtes dangereuses (séparées par ';').
    
    Args:
        sql (str): La requête SQL brute à valider.
        
    Returns:
        Tuple[bool, str]: Un tuple contenant :
            - (bool) : True si la requête est validée, False si elle présente un risque ou une erreur.
            - (str) : Un message descriptif du statut (succès ou motif du rejet).
    """
    query = sql.strip()
    if not query:
        return False, "La requête SQL est vide."

    try:
        parsed_statements = sqlglot.parse(query, read="postgres")
    except sqlglot.errors.ParseError as e:
        return False, f"Erreur de syntaxe SQL lors de l'analyse : {str(e)}"

    if len(parsed_statements) > 1:
        return False, "Sécurité : L'exécution de plusieurs requêtes SQL séparées par ';' est interdite."

    statement = parsed_statements[0]
    if statement is None:
        return False, "Instruction SQL invalide."

    allowed_types = (exp.Select, exp.Union, exp.Subquery)

    for node in statement.walk():
        node_class = type(node).__name__
        if node_class in FORBIDDEN_SQL_TYPES:
            return False, f"Sécurité : L'opération '{node_class}' est interdite sur cette base de données en lecture seule."
            
        is_danger, func_name = _is_dangerous_function(node)
        if is_danger and func_name:
            return False, f"Sécurité : L'appel à la fonction système '{func_name}' est interdit."
        
    if not isinstance(statement, allowed_types):
        return False, f"Sécurité : L'instruction principale de type '{type(statement).__name__}' n'est pas autorisée. Seuls les SELECT sont permis."

    return True, "Requête validée avec succès."


def validate_sandbox_sql(sql: str) -> Tuple[bool, str]:
    """
    Valide le SQL fourni pour l'initialisation du bac à sable (sandbox).
    
    Autorise uniquement les instructions CREATE TABLE et INSERT INTO.
    Bloque toute opération destructrice (DROP DATABASE, GRANT, ALTER ROLE, etc.)
    et tout appel à des fonctions système dangereuses.
    
    Args:
        sql (str): Le script SQL DDL/DML brut à valider.
        
    Returns:
        Tuple[bool, str]: Un tuple contenant :
            - (bool) : True si le script est sûr, False s'il présente un risque.
            - (str) : Un message descriptif du statut (succès ou motif du rejet).
    """
    query = sql.strip()
    if not query:
        return False, "Le script SQL est vide."

    try:
        parsed_statements = sqlglot.parse(query, read="postgres")
    except sqlglot.errors.ParseError as e:
        return False, f"Erreur de syntaxe SQL lors de l'analyse : {str(e)}"

    if not parsed_statements:
        return False, "Aucune instruction SQL valide détectée."

    sandbox_allowed_types = (exp.Create, exp.Insert, exp.Select)
    sandbox_forbidden_types = {
        "Drop", "Alter", "Delete", "Update", "TruncateTable",
        "Grant", "Revoke",
    }
    dangerous_patterns = [
        r"\bDROP\s+DATABASE\b",
        r"\bDROP\s+SCHEMA\b",
        r"\bCREATE\s+EXTENSION\b",
        r"\bALTER\s+ROLE\b",
        r"\bALTER\s+USER\b",
        r"\bGRANT\b",
        r"\bREVOKE\b",
        r"\bCOPY\b",
        r"\bCREATE\s+FUNCTION\b",
        r"\bCREATE\s+TRIGGER\b",
        r"\bCREATE\s+RULE\b",
    ]

    upper_query = query.upper()
    for pattern in dangerous_patterns:
        if re.search(pattern, upper_query):
            return False, f"Sécurité : L'opération correspondant au pattern '{pattern}' est interdite dans le bac à sable."

    for statement in parsed_statements:
        if statement is None:
            continue

        if not isinstance(statement, sandbox_allowed_types):
            stmt_type = type(statement).__name__
            if stmt_type in sandbox_forbidden_types:
                return False, f"Sécurité : L'opération '{stmt_type}' est interdite dans le bac à sable."
            return False, f"Sécurité : L'instruction de type '{stmt_type}' n'est pas autorisée. Seuls CREATE TABLE et INSERT INTO sont permis."

        for node in statement.walk():
            is_danger, func_name = _is_dangerous_function(node)
            if is_danger and func_name:
                return False, f"Sécurité : L'appel à la fonction système '{func_name}' est interdit dans le bac à sable."

    return True, "Script sandbox validé avec succès."
