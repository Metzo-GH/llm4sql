import sqlglot
from sqlglot import exp
from typing import Tuple


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
    # Nettoyer et valider que la requête n'est pas vide
    query = sql.strip()
    if not query:
        return False, "La requête SQL est vide."

    try:
        # sqlglot.parse renvoie une liste d'arbres de syntaxe (un par instruction SQL séparée par ';')
        parsed_statements = sqlglot.parse(query, read="postgres")
    except sqlglot.errors.ParseError as e:
        return False, f"Erreur de syntaxe SQL lors de l'analyse : {str(e)}"

    # Bloquer les multi-requêtes (SQL Injection par chaînage de requêtes)
    if len(parsed_statements) > 1:
        return False, "Sécurité : L'exécution de plusieurs requêtes SQL séparées par ';' est interdite."

    # Analyser l'unique instruction
    statement = parsed_statements[0]
    if statement is None:
        return False, "Instruction SQL invalide."

    # Définir les types autorisés (SELECT uniquement)
    allowed_types = (exp.Select, exp.Union, exp.Subquery)

    # Parcourir récursivement tous les nœuds de l'arbre pour détecter des instructions interdites
    forbidden_types = {"Insert", "Update", "Delete", "Drop", "Alter", "Create", "TruncateTable"}
    forbidden_functions = {
        "pg_sleep",
        "pg_read_file",
        "pg_write_file",
        "pg_ls_dir",
        "pg_execute_server_program"
    }
    for node in statement.walk():
        # Détecter explicitement les expressions de modification ou de destruction par leur nom de classe
        node_class = type(node).__name__
        if node_class in forbidden_types:
            return False, f"Sécurité : L'opération '{node_class}' est interdite sur cette base de données en lecture seule."
            
        # Détecter les fonctions système PostgreSQL suspectes
        if isinstance(node, exp.Func):
            func_name = node.name.lower() if isinstance(node, exp.Anonymous) else type(node).__name__.lower()
            if func_name in forbidden_functions:
                return False, f"Sécurité : L'appel à la fonction système '{func_name}' est interdit."
        
    # Vérifier que la racine ou la requête principale est bien une instruction de type SELECT ou UNION
    if not isinstance(statement, allowed_types):
        return False, f"Sécurité : L'instruction principale de type '{type(statement).__name__}' n'est pas autorisée. Seuls les SELECT sont permis."

    return True, "Requête validée avec succès."
