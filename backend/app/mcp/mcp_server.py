import re
import psycopg2
from psycopg2.extras import RealDictCursor
from mcp.server.fastmcp import FastMCP
import json
from typing import List, Dict, Any
from decimal import Decimal

from app.core.config import settings
from app.core.security import validate_sql_query
from app.database.pool import get_db_conn
from app.database.queries import GET_TABLE_FOREIGN_KEYS_QUERY, execute_readonly_query

def _serialize_row(row: dict) -> dict:
    """
    Formate les valeurs d'une ligne pour être sérialisables en JSON (dates, Decimals).
    """
    for key, val in row.items():
        if hasattr(val, 'isoformat'):
            row[key] = val.isoformat()
        elif isinstance(val, Decimal):
            row[key] = float(val)
    return row

# Initialiser l'instance FastMCP pour notre serveur Model Context Protocol
mcp = FastMCP("LLM4SQL-Secure-Postgres")

# Utilisation de la fonction centralisée dans app.database.queries
_execute_readonly_db_query = execute_readonly_query


@mcp.tool()
def list_tables(schema: str = "public") -> str:
    """
    Liste toutes les tables utilisateur présentes dans le schéma spécifié de la base de données.
    
    Returns:
        str: Liste formatée en JSON des tables existantes.
    """
    query = """
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = %s
          AND table_type = 'BASE TABLE'
        ORDER BY table_name;
    """
    try:
        tables = _execute_readonly_db_query(query, (schema,), schema=schema)
        table_names = [row["table_name"] for row in tables]
        return json.dumps({"tables": table_names}, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
def get_schema(table_name: str, schema: str = "public") -> str:
    """
    Récupère le schéma détaillé d'une table spécifique (colonnes, types, contraintes null et clés étrangères).
    
    Args:
        table_name (str): Nom de la table dont on veut obtenir le schéma.
        schema (str): Le schéma PostgreSQL cible.
        
    Returns:
        str: Schéma et relations formatés en JSON.
    """
    query = """
        SELECT column_name, data_type, is_nullable, ordinal_position
        FROM information_schema.columns 
        WHERE table_schema = %s AND table_name = %s
        ORDER BY ordinal_position;
    """

    try:
        columns = _execute_readonly_db_query(query, (schema, table_name), schema=schema)
        if not columns:
            return json.dumps({"error": f"La table '{table_name}' n'existe pas ou n'a pas de colonnes dans '{schema}'."}, indent=2)
        
        schema_info = []
        for col in columns:
            schema_info.append({
                "column": col["column_name"],
                "type": col["data_type"],
                "nullable": col["is_nullable"] == "YES"
            })
            
        relations = _execute_readonly_db_query(GET_TABLE_FOREIGN_KEYS_QUERY, (table_name,), schema=schema)
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
def search_value(term: str, schema: str = "public") -> str:
    """
    Recherche un mot-clé ou une valeur dans toutes les colonnes de type texte de la base de données.
    Consolidé via UNION ALL avec suggestions de clés étrangères associées.
    
    Args:
        term (str): Le terme à rechercher.
        schema (str): Le schéma PostgreSQL cible.
        
    Returns:
        str: Liste formatée en JSON des correspondances (table, column, matched_value, foreign_key_suggestion).
    """
    if not term or len(term.strip()) < 2:
        return json.dumps({"matches": []}, indent=2)
        
    find_cols_query = """
        SELECT table_name, column_name 
        FROM information_schema.columns 
        WHERE table_schema = %s
          AND data_type IN ('character varying', 'text', 'character')
        ORDER BY table_name, column_name;
    """
    try:
        columns = _execute_readonly_db_query(find_cols_query, (schema,), schema=schema)
        if not columns:
            return json.dumps({"matches": []}, indent=2)

        select_clauses = []
        params = []
        term_pattern = f"%{term.strip()}%"

        for col in columns:
            t_name = col["table_name"]
            c_name = col["column_name"]
            select_clauses.append(
                f'SELECT \'{t_name}\' AS table_name, \'{c_name}\' AS column_name, "{c_name}"::text AS matched_value '
                f'FROM "{t_name}" WHERE "{c_name}"::text ILIKE %s'
            )
            params.append(term_pattern)

        union_query = f"SELECT DISTINCT table_name, column_name, matched_value FROM ({' UNION ALL '.join(select_clauses)}) AS search_union LIMIT 20;"

        with get_db_conn(schema=schema, readonly=True) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(union_query, tuple(params))
                raw_matches = cur.fetchall()

        fk_cache = {}
        matches = []
        for m in raw_matches:
            t_name = m["table_name"]
            if t_name not in fk_cache:
                fk_relations = _execute_readonly_db_query(GET_TABLE_FOREIGN_KEYS_QUERY, (t_name,), schema=schema)
                fk_cache[t_name] = [
                    {
                        "local_column": rel["local_column"],
                        "foreign_table": rel["foreign_table"],
                        "foreign_column": rel["foreign_column"]
                    }
                    for rel in fk_relations
                ]

            matches.append({
                "table": t_name,
                "column": m["column_name"],
                "matched_value": m["matched_value"],
                "foreign_key_suggestion": fk_cache[t_name]
            })

        return json.dumps({"matches": matches}, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, indent=2)


@mcp.tool()
def get_sample_data(table_name: str, limit: int = 3, schema: str = "public") -> str:
    """
    Récupère quelques lignes d'exemples d'une table pour voir le format des données réelles.
    
    Args:
        table_name (str): Le nom de la table.
        limit (int, optional): Nombre de lignes à récupérer (3 par défaut, maximum 10).
        schema (str): Le schéma PostgreSQL cible.
        
    Returns:
        str: Lignes formatées en JSON.
    """
    tables_json = list_tables(schema=schema)
    try:
        all_tables = json.loads(tables_json).get("tables", [])
    except Exception:
        all_tables = []
        
    if table_name not in all_tables:
        return json.dumps({"error": f"La table '{table_name}' n'existe pas ou n'est pas accessible."})
        
    limit = min(max(1, limit), 10)
    query = f'SELECT * FROM "{table_name}" LIMIT %s;'
    
    try:
        with get_db_conn(schema=schema, readonly=True) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, (limit,))
                results = cur.fetchall()
                for row in results:
                    _serialize_row(row)
                return json.dumps({"table": table_name, "sample_data": results}, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
def dry_run_query(sql: str, schema: str = "public") -> str:
    """
    Valide la syntaxe d'une requête SQL sans l'exécuter physiquement (simulation EXPLAIN et dry-run LIMIT 0).
    
    Args:
        sql (str): La requête SQL SELECT à valider.
        schema (str): Le schéma PostgreSQL cible.
        
    Returns:
        str: Message de succès avec colonnes et lignes estimées, ou erreur PostgreSQL détaillée.
    """
    is_safe, message = validate_sql_query(sql)
    if not is_safe:
        return json.dumps({"success": False, "security_error": message}, indent=2)
        
    sql_clean = sql.strip().rstrip(';')
    try:
        with get_db_conn(schema=schema, readonly=True) as conn:
            # 1. EXPLAIN pour valider et extraire estimated_rows
            estimated_rows = 0
            with conn.cursor() as cur:
                cur.execute(f"EXPLAIN {sql_clean}")
                explain_lines = cur.fetchall()
                for line_tuple in explain_lines:
                    line_str = str(line_tuple[0]) if line_tuple else ""
                    m = re.search(r"rows=(\d+)", line_str)
                    if m:
                        estimated_rows = int(m.group(1))
                        break

            # 2. SELECT * FROM (...) AS _dry_run LIMIT 0 pour inspecter cur.description
            with conn.cursor() as cur:
                cur.execute(f"SELECT * FROM ({sql_clean}) AS _dry_run LIMIT 0;")
                description = cur.description or []
                columns_info = []
                if description:
                    type_oids = tuple(set(col.type_code for col in description))
                    cur.execute("SELECT oid, typname FROM pg_type WHERE oid IN %s;", (type_oids,))
                    type_rows = cur.fetchall()
                    type_map = {r[0]: r[1] for r in type_rows}
                    columns_info = [
                        {
                            "name": col.name,
                            "type": type_map.get(col.type_code, str(col.type_code))
                        }
                        for col in description
                    ]

            return json.dumps({
                "success": True,
                "columns": columns_info,
                "estimated_rows": estimated_rows
            }, indent=2)
            
    except psycopg2.Error as e:
        db_err = e.pgerror.strip() if e.pgerror else str(e)
        diag = getattr(e, 'diag', None)
        detail = getattr(diag, 'message_detail', None) if diag else None
        hint = getattr(diag, 'message_hint', None) if diag else None
        
        err_res = {
            "success": False,
            "db_error": db_err
        }
        if detail:
            err_res["detail"] = detail
        if hint:
            err_res["hint"] = hint
        return json.dumps(err_res, indent=2)
    except Exception as e:
        return json.dumps({"success": False, "db_error": str(e)}, indent=2)


@mcp.tool()
def execute_query(sql: str, schema: str = "public") -> str:
    """
    Exécute une requête SQL SELECT de manière hautement sécurisée sur la base de données.
    
    La requête subit des vérifications strictes (validation en lecture seule, 
    absence d'instructions de modification ou de chaînage) en amont.
    La connexion PostgreSQL est également forcée en mode lecture seule.
    
    Args:
        sql (str): La requête SQL SELECT à exécuter.
        schema (str): Le schéma PostgreSQL cible ("public" ou "user_sandbox").
        
    Returns:
        str: Les résultats formatés en JSON en cas de succès, ou le message d'erreur.
    """
    # 1. Validation de sécurité
    is_safe, message = validate_sql_query(sql)
    if not is_safe:
        return json.dumps({"security_error": message}, indent=2)
        
    # 2. Exécution de la requête
    try:
        with get_db_conn(schema=schema, readonly=True) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql)
                results = cur.fetchall()
                
                # Traiter les valeurs temporelles et décimales pour qu'elles soient sérialisables en JSON
                for row in results:
                    _serialize_row(row)
                            
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
