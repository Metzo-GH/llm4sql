import json
from typing import Optional, List
from app.database.pool import get_db_conn
from app.mcp.mcp_server import get_schema

# Cache du schéma en mémoire
_SCHEMA_CACHE: Optional[str] = None


def invalidate_schema_cache() -> None:
    """
    Invalide le cache du schéma de base de données pour forcer sa reconstruction.
    """
    global _SCHEMA_CACHE
    _SCHEMA_CACHE = None


def get_database_schema_context() -> str:
    """
    Récupère le schéma de toutes les tables en une seule requête (résout le pattern N+1)
    et le met en cache en mémoire pour accélérer les appels futurs.
    
    Returns:
        str: Description structurée du schéma de la base de données.
    """
    global _SCHEMA_CACHE
    if _SCHEMA_CACHE is not None:
        return _SCHEMA_CACHE

    query = """
        SELECT 
            table_name, 
            column_name, 
            data_type, 
            is_nullable
        FROM 
            information_schema.columns 
        WHERE 
            table_schema IN ('user_sandbox', 'public')
        ORDER BY 
            table_name, 
            ordinal_position;
    """
    try:
        with get_db_conn(readonly=True) as conn:
            with conn.cursor() as cur:
                cur.execute(query)
                rows = cur.fetchall()
                
                # Organiser par table
                tables = {}
                for row in rows:
                    t_name, c_name, d_type, is_null = row
                    if t_name not in tables:
                        tables[t_name] = []
                    null_status = "NULL" if is_null == "YES" else "NOT NULL"
                    tables[t_name].append(f"  - {c_name} ({d_type}) {null_status}")
                
                schema_blocks = []
                for t_name, columns in sorted(tables.items()):
                    columns_text = "\n".join(columns)
                    schema_blocks.append(f"Table '{t_name}' :\n{columns_text}")
                    
                _SCHEMA_CACHE = "\n\n".join(schema_blocks)
                return _SCHEMA_CACHE
    except Exception as e:
        return f"Erreur lors de la récupération du schéma : {str(e)}"


def get_dynamic_schema_context(selected_tables: List[str]) -> str:
    """
    Récupère le schéma détaillé uniquement pour les tables sélectionnées.
    Si la liste est vide, récupère le schéma de toutes les tables en fallback.
    """
    if not selected_tables:
        return get_database_schema_context()
        
    schema_blocks = []
    for t_name in selected_tables:
        try:
            schema_str = get_schema(t_name)
            schema_data = json.loads(schema_str)
            if "schema" in schema_data:
                columns = []
                for col in schema_data["schema"]:
                    c_name = col["column"]
                    d_type = col["type"]
                    null_status = "NULL" if col["nullable"] else "NOT NULL"
                    columns.append(f"  - {c_name} ({d_type}) {null_status}")
                columns_text = "\n".join(columns)
                schema_blocks.append(f"Table '{t_name}' :\n{columns_text}")
            else:
                print(f"  [WARNING] get_schema pour '{t_name}' a retourné : {schema_str}")
        except Exception as e:
            print(f"  [ERROR] Erreur lors de la récupération du schéma pour '{t_name}' : {e}")
            
    if not schema_blocks:
        return get_database_schema_context()
        
    return "\n\n".join(schema_blocks)
