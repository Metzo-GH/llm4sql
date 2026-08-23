# Requêtes SQL réutilisables pour le schéma et les clés étrangères

GET_TABLE_FOREIGN_KEYS_QUERY = """
    SELECT
        kcu.column_name AS local_column,
        ccu.table_name AS foreign_table,
        ccu.column_name AS foreign_column
    FROM
        information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = %s
      AND tc.table_schema IN ('user_sandbox', 'public');
"""

GET_ALL_FOREIGN_KEYS_QUERY = """
    SELECT
        kcu.table_name AS foreign_table,
        kcu.column_name AS foreign_column,
        ccu.table_name AS primary_table,
        ccu.column_name AS primary_column
    FROM
        information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema IN ('user_sandbox', 'public')
    ORDER BY foreign_table, foreign_column;
"""

from typing import List, Dict, Any, Optional
from psycopg2.extras import RealDictCursor
from app.database.pool import get_db_conn


def execute_readonly_query(
    query: str,
    params: Optional[tuple] = None,
    schema: str = "public"
) -> List[Dict[str, Any]]:
    """
    Exécute une requête SQL SELECT interne pour récupérer les schémas et métadonnées.
    
    Se connecte au pool en lecture seule et renvoie les résultats sous forme de dictionnaires typés.
    
    Args:
        query (str): Requête SQL à exécuter.
        params (tuple, optional): Paramètres de requête de type tuple.
        schema (str): Le schéma PostgreSQL cible ("public" ou "user_sandbox").
        
    Returns:
        List[Dict[str, Any]]: Les résultats sous forme de dictionnaire.
        
    Raises:
        RuntimeError: En cas d'erreur de base de données.
    """
    try:
        with get_db_conn(schema=schema, readonly=True) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, params)
                return [dict(row) for row in cur.fetchall()]
    except Exception as e:
        raise RuntimeError(f"Erreur d'accès aux métadonnées : {str(e)}")

