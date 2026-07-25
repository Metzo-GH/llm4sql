import json
from typing import Optional, List, Dict
from app.database.pool import get_db_conn
from app.mcp.mcp_server import get_schema
from app.database.queries import GET_ALL_FOREIGN_KEYS_QUERY

import threading

# Cache du schéma en mémoire par nom de schéma
_SCHEMA_CACHE: Dict[str, str] = {}
_schema_lock = threading.Lock()


def invalidate_schema_cache() -> None:
    """
    Invalide le cache du schéma de base de données pour forcer sa reconstruction.
    """
    global _SCHEMA_CACHE
    with _schema_lock:
        _SCHEMA_CACHE.clear()


def get_database_schema_context(schema: str = "public") -> str:
    """
    Récupère le schéma de toutes les tables pour le schéma spécifié en une seule requête
    ainsi que les contraintes de relations (clés étrangères),
    et le met en cache en mémoire pour accélérer les appels futurs.
    
    Args:
        schema (str): Le schéma PostgreSQL cible ("public" ou "user_sandbox").
        
    Returns:
        str: Description structurée du schéma et des relations de la base de données.
    """
    global _SCHEMA_CACHE
    with _schema_lock:
        if schema in _SCHEMA_CACHE:
            return _SCHEMA_CACHE[schema]

    query = """
        SELECT 
            table_name, 
            column_name, 
            data_type, 
            is_nullable
        FROM 
            information_schema.columns 
        WHERE 
            table_schema = %s
        ORDER BY 
            table_name, 
            ordinal_position;
    """

    try:
        with get_db_conn(schema=schema, readonly=True) as conn:
            with conn.cursor() as cur:
                # 1. Charger les colonnes
                cur.execute(query, (schema,))
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
                
                # 2. Charger les relations (clés étrangères)
                cur.execute(GET_ALL_FOREIGN_KEYS_QUERY)
                fk_rows = cur.fetchall()
                
                relations_block = []
                if fk_rows:
                    relations_block.append("Relations (Clés Étrangères) :")
                    for fk in fk_rows:
                        f_table, f_col, p_table, p_col = fk
                        relations_block.append(f"  - Table '{f_table}' colonne '{f_col}' référence '{p_table}({p_col})'")
                
                # Assembler le tout
                schema_str = "\n\n".join(schema_blocks)
                if relations_block:
                    schema_str += "\n\n" + "\n".join(relations_block)
                
                with _schema_lock:
                    _SCHEMA_CACHE[schema] = schema_str
                return _SCHEMA_CACHE[schema]
    except Exception as e:
        return f"Erreur lors de la récupération du schéma : {str(e)}"


def get_dynamic_schema_context(selected_tables: List[str]) -> str:
    """
    Récupère le schéma détaillé et les relations uniquement pour les tables sélectionnées.
    Si la liste est vide, récupère le schéma de toutes les tables en fallback.
    """
    if not selected_tables:
        return get_database_schema_context()
        
    schema_blocks = []
    relations_info = []
    
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
                
                # Ajouter les relations de cette table si elles existent
                if "relations" in schema_data:
                    for rel in schema_data["relations"]:
                        relations_info.append(
                            f"  - Table '{t_name}' colonne '{rel['local_column']}' référence '{rel['foreign_table']}({rel['foreign_column']})'"
                        )
            else:
                print(f"  [WARNING] get_schema pour '{t_name}' a retourné : {schema_str}")
        except Exception as e:
            print(f"  [ERROR] Erreur lors de la récupération du schéma pour '{t_name}' : {e}")
            
    if not schema_blocks:
        return get_database_schema_context()
        
    final_context = "\n\n".join(schema_blocks)
    if relations_info:
        # Dédoublonner
        relations_info = list(dict.fromkeys(relations_info))
        final_context += "\n\nRelations (Clés Étrangères) :\n" + "\n".join(relations_info)
        
    return final_context
