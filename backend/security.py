import sqlglot
from sqlglot import exp
from typing import Tuple


def validate_sql_query(sql: str) -> Tuple[bool, str]:
    """
    Analyse une requête SQL et valide si elle est strictement sécurisée et en lecture seule.
    
    Cette fonction utilise la bibliothèque robuste sqlglot pour s'assurer que :
    1. La requête est syntaxiquement valide.
    2. La requête contient uniquement des instructions SELECT de lecture.
    3. Il n'y a pas d'attaques par injection ou de multi-requêtes dangereuses.
    
    Args:
        sql (str): La requête SQL à valider.
        
    Returns:
        Tuple[bool, str]: Un tuple contenant (est_valide, message_de_statut).
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
    # sqlglot.exp.Select est le type pour les requêtes SELECT standard.
    # On autorise aussi les UNION et autres opérations ensemblistes de sélection.
    allowed_types = (exp.Select, exp.Union, exp.Subquery)

    # Parcourir récursivement tous les nœuds de l'arbre pour détecter des instructions interdites
    forbidden_types = {"Insert", "Update", "Delete", "Drop", "Alter", "Create", "TruncateTable"}
    for node in statement.walk():
        # Détecter explicitement les expressions de modification ou de destruction par leur nom de classe
        node_class = type(node).__name__
        if node_class in forbidden_types:
            return False, f"Sécurité : L'opération '{node_class}' est interdite sur cette base de données en lecture seule."
        
    # Vérifier que la racine ou la requête principale est bien une instruction de type SELECT ou UNION
    if not isinstance(statement, allowed_types):
        return False, f"Sécurité : L'instruction principale de type '{type(statement).__name__}' n'est pas autorisée. Seuls les SELECT sont permis."

    return True, "Requête validée avec succès."
