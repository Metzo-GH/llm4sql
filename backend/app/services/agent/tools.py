from langchain_core.tools import tool

@tool
def mcp_list_tables(target_schema: str = "public") -> str:
    """
    Liste toutes les tables utilisateur présentes dans le schéma de la base de données.
    """
    from app.mcp.mcp_server import list_tables
    return list_tables(schema=target_schema)


@tool
def mcp_get_schema(table_name: str, target_schema: str = "public") -> str:
    """
    Récupère le schéma détaillé d'une table spécifique (colonnes, types, contraintes null et clés étrangères).
    
    Args:
        table_name (str): Nom de la table.
        target_schema (str): Schéma PostgreSQL ('public' ou 'user_sandbox').
    """
    from app.mcp.mcp_server import get_schema
    return get_schema(table_name, schema=target_schema)


@tool
def mcp_search_value(term: str, target_schema: str = "public") -> str:
    """
    Recherche un mot-clé ou une valeur dans toutes les colonnes de type texte de la base de données.
    Utile pour localiser la bonne table et colonne quand la question contient un nom propre, une catégorie, ou un code textuel.
    
    Args:
        term (str): Le terme à rechercher (ex: 'Christophe', 'Blacksad', etc.).
        target_schema (str): Schéma PostgreSQL ('public' ou 'user_sandbox').
    """
    from app.mcp.mcp_server import search_value
    return search_value(term, schema=target_schema)


@tool
def mcp_get_sample_data(table_name: str, limit: int = 3, target_schema: str = "public") -> str:
    """
    Récupère quelques lignes d'exemples d'une table pour voir le format des données réelles.
    
    Args:
        table_name (str): Le nom de la table.
        limit (int, optional): Nombre de lignes à récupérer (3 par défaut, maximum 10).
        target_schema (str): Schéma PostgreSQL ('public' ou 'user_sandbox').
    """
    from app.mcp.mcp_server import get_sample_data
    return get_sample_data(table_name, limit, schema=target_schema)


@tool
def mcp_dry_run_query(sql: str, target_schema: str = "public") -> str:
    """
    Valide la syntaxe d'une requête SQL SELECT sans l'exécuter physiquement (simulation via EXPLAIN).
    Vous DEVEZ appeler cet outil pour valider votre SQL généré avant de soumettre la réponse finale.
    
    Args:
        sql (str): La requête SQL SELECT à valider.
        target_schema (str): Schéma PostgreSQL ('public' ou 'user_sandbox').
    """
    from app.mcp.mcp_server import dry_run_query
    return dry_run_query(sql, schema=target_schema)


# Liste ordonnée de tous les outils liés à l'agent
all_tools = [
    mcp_list_tables,
    mcp_get_schema,
    mcp_search_value,
    mcp_get_sample_data,
    mcp_dry_run_query
]
