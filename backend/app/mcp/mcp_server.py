import psycopg2
from psycopg2.extras import RealDictCursor
from mcp.server.fastmcp import FastMCP
import json
from typing import List, Dict, Any
from decimal import Decimal

from app.core.config import settings
from app.core.security import validate_sql_query
from app.database.pool import get_db_conn

# Initialiser l'instance FastMCP pour notre serveur Model Context Protocol
mcp = FastMCP("LLM4SQL-Secure-Postgres")


def _execute_readonly_db_query(query: str, params: tuple = None) -> List[Dict[str, Any]]:
    """
    Exécute une requête SQL SELECT interne pour récupérer les schémas et métadonnées.
    
    Cette méthode utilitaire privée se connecte en lecture seule et renvoie les résultats typés.
    
    Args:
        query (str): Requête SQL.
        params (tuple, optional): Paramètres de requête de type tuple.
        
    Returns:
        List[Dict[str, Any]]: Les résultats sous forme de dictionnaire.
        
    Raises:
        RuntimeError: En cas d'erreur de base de données.
    """
    try:
        with get_db_conn(readonly=True) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, params)
                return cur.fetchall()
    except Exception as e:
        raise RuntimeError(f"Erreur d'accès aux métadonnées : {str(e)}")


@mcp.tool()
def list_tables() -> str:
    """
    Liste toutes les tables utilisateur présentes dans le schéma public de la base de données.
    
    Returns:
        str: Liste formatée en JSON des tables existantes.
    """
    query = """
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema IN ('user_sandbox', 'public')
          AND table_type = 'BASE TABLE'
        ORDER BY table_name;
    """
    try:
        tables = _execute_readonly_db_query(query)
        table_names = [row["table_name"] for row in tables]
        return json.dumps({"tables": table_names}, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
def get_schema(table_name: str) -> str:
    """
    Récupère le schéma détaillé d'une table spécifique (colonnes, types, contraintes null et clés étrangères).
    
    Args:
        table_name (str): Nom de la table dont on veut obtenir le schéma.
        
    Returns:
        str: Schéma et relations formatés en JSON.
    """
    query = """
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_schema IN ('user_sandbox', 'public')
          AND table_name = %s
        ORDER BY ordinal_position;
    """
    fk_query = """
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
    try:
        columns = _execute_readonly_db_query(query, (table_name,))
        if not columns:
            return json.dumps({"error": f"La table '{table_name}' n'existe pas ou n'a pas de colonnes."}, indent=2)
        
        schema_info = []
        for col in columns:
            schema_info.append({
                "column": col["column_name"],
                "type": col["data_type"],
                "nullable": col["is_nullable"] == "YES"
            })
            
        relations = _execute_readonly_db_query(fk_query, (table_name,))
        relations_info = []
        for rel in relations:
            relations_info.append({
                "local_column": rel["local_column"],
                "foreign_table": rel["foreign_table"],
                "foreign_column": rel["foreign_column"]
            })
            
        return json.dumps({
            "table": table_name,
            "schema": schema_info,
            "relations": relations_info
        }, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
def search_value(term: str) -> str:
    """
    Recherche un mot-clé ou une valeur dans toutes les colonnes de type texte de la base de données.
    
    Args:
        term (str): Le terme à rechercher.
        
    Returns:
        str: Liste formatée en JSON des correspondances (table, colonne, valeur).
    """
    if not term or len(term.strip()) < 2:
        return json.dumps({"error": "Le terme de recherche doit faire au moins 2 caractères."})
        
    find_cols_query = """
        SELECT table_name, column_name 
        FROM information_schema.columns 
        WHERE table_schema IN ('user_sandbox', 'public')
          AND data_type IN ('character varying', 'text', 'character')
        ORDER BY table_name, column_name;
    """
    try:
        columns = _execute_readonly_db_query(find_cols_query)
        matches = []
        
        for col in columns:
            t_name = col["table_name"]
            c_name = col["column_name"]
            
            search_q = f'SELECT DISTINCT "{c_name}" FROM "{t_name}" WHERE "{c_name}"::text ILIKE %s LIMIT 3;'
            try:
                with get_db_conn(readonly=True) as conn:
                    with conn.cursor() as cur:
                        cur.execute(search_q, (f"%{term}%",))
                        rows = cur.fetchall()
                        for row in rows:
                            matches.append({
                                "table": t_name,
                                "column": c_name,
                                "matched_value": row[0]
                            })
            except Exception:
                continue
                
        return json.dumps({"matches": matches}, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
def get_sample_data(table_name: str, limit: int = 3) -> str:
    """
    Récupère quelques lignes d'exemples d'une table pour voir le format des données réelles.
    
    Args:
        table_name (str): Le nom de la table.
        limit (int, optional): Nombre de lignes à récupérer (3 par défaut, maximum 10).
        
    Returns:
        str: Lignes formatées en JSON.
    """
    tables_json = list_tables()
    try:
        all_tables = json.loads(tables_json).get("tables", [])
    except Exception:
        all_tables = []
        
    if table_name not in all_tables:
        return json.dumps({"error": f"La table '{table_name}' n'existe pas ou n'est pas accessible."})
        
    limit = min(max(1, limit), 10)
    query = f'SELECT * FROM "{table_name}" LIMIT %s;'
    
    try:
        with get_db_conn(readonly=True) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, (limit,))
                results = cur.fetchall()
                for row in results:
                    for key, val in row.items():
                        if hasattr(val, 'isoformat'):
                            row[key] = val.isoformat()
                        elif isinstance(val, Decimal):
                            row[key] = float(val)
                return json.dumps({"table": table_name, "sample_data": results}, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
def dry_run_query(sql: str) -> str:
    """
    Valide la syntaxe d'une requête SQL sans l'exécuter physiquement (simulation via EXPLAIN).
    
    Args:
        sql (str): La requête SQL SELECT à valider.
        
    Returns:
        str: Message de succès ou erreur détaillée.
    """
    is_safe, message = validate_sql_query(sql)
    if not is_safe:
        return json.dumps({"success": False, "security_error": message}, indent=2)
        
    explain_sql = f"EXPLAIN {sql}"
    try:
        with get_db_conn(readonly=True) as conn:
            with conn.cursor() as cur:
                cur.execute(explain_sql)
                return json.dumps({"success": True, "message": "SQL query is syntactically valid (EXPLAIN passed)."}, indent=2)
    except Exception as e:
        return json.dumps({"success": False, "db_error": str(e)}, indent=2)


@mcp.tool()
def execute_query(sql: str) -> str:
    """
    Exécute une requête SQL SELECT de manière hautement sécurisée sur la base de données.
    
    La requête subit des vérifications strictes (validation en lecture seule, 
    absence d'instructions de modification ou de chaînage) en amont.
    La connexion PostgreSQL est également forcée en mode lecture seule.
    
    Args:
        sql (str): La requête SQL SELECT à exécuter.
        
    Returns:
        str: Les résultats formatés en JSON en cas de succès, ou le message d'erreur.
    """
    # 1. Validation de sécurité
    is_safe, message = validate_sql_query(sql)
    if not is_safe:
        return json.dumps({"security_error": message}, indent=2)
        
    # 2. Exécution de la requête
    try:
        with get_db_conn(readonly=True) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql)
                results = cur.fetchall()
                
                # Traiter les valeurs temporelles et décimales pour qu'elles soient sérialisables en JSON
                for row in results:
                    for key, val in row.items():
                        if hasattr(val, 'isoformat'):
                            row[key] = val.isoformat()
                        elif isinstance(val, Decimal):
                            row[key] = float(val)
                            
                return json.dumps({
                    "success": True,
                    "row_count": len(results),
                    "data": results
                }, indent=2)
                
    except Exception as e:
        return json.dumps({
            "success": False,
            "db_error": str(e)
        }, indent=2)


if __name__ == "__main__":
    # Démarrage du serveur Model Context Protocol (STDIO)
    mcp.run()
