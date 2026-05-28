import psycopg2
from psycopg2.extras import RealDictCursor
from mcp.server.fastmcp import FastMCP
from config import settings
from security import validate_sql_query
import json
from typing import List, Dict, Any

# Initialiser le serveur FastMCP avec un nom explicite
mcp = FastMCP("LLM4SQL-Secure-Postgres")


def _execute_readonly_db_query(query: str, params: tuple = None) -> List[Dict[str, Any]]:
    """
    Exécute une requête SQL interne en lecture seule sur PostgreSQL et retourne les résultats.
    
    Cette méthode est à usage interne pour récupérer les schémas et métadonnées.
    
    Args:
        query (str): Requête SQL.
        params (tuple): Paramètres optionnels de la requête.
        
    Returns:
        List[Dict[str, Any]]: Les lignes sous forme de dictionnaires.
    """
    conn = None
    try:
        conn = psycopg2.connect(**settings.get_db_params())
        # Utiliser RealDictCursor pour récupérer les résultats typés sous forme de dict
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params)
            return cur.fetchall()
    except Exception as e:
        raise RuntimeError(f"Erreur d'accès à la base de données : {str(e)}")
    finally:
        if conn:
            conn.close()


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
        WHERE table_schema = 'public' 
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
    Récupère le schéma détaillé d'une table spécifique (colonnes, types et contraintes null).
    
    Args:
        table_name (str): Nom de la table dont on veut obtenir le schéma.
        
    Returns:
        str: Schéma formaté en JSON.
    """
    query = """
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = %s
        ORDER BY ordinal_position;
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
            
        return json.dumps({"table": table_name, "schema": schema_info}, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
def execute_query(sql: str) -> str:
    """
    Exécute une requête SQL SELECT sécurisée sur la base de données.
    
    La requête subit un contrôle de sécurité strict en amont pour interdire
    les opérations d'altération, de modification ou de destruction (Read-Only).
    
    Args:
        sql (str): La requête SQL SELECT à exécuter.
        
    Returns:
        str: Les résultats formatés en JSON en cas de succès, ou un message d'erreur.
    """
    # 1. Vérification de sécurité avec notre module de sécurité
    is_safe, message = validate_sql_query(sql)
    if not is_safe:
        return json.dumps({"security_error": message}, indent=2)
        
    # 2. Exécution de la requête
    conn = None
    try:
        conn = psycopg2.connect(**settings.get_db_params())
        # Définir explicitement la connexion en lecture seule au niveau pilote pour une sécurité renforcée
        conn.readonly = True
        
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql)
            results = cur.fetchall()
            
            # Traiter les valeurs temporelles pour qu'elles soient sérialisables en JSON
            for row in results:
                for key, val in row.items():
                    if hasattr(val, 'isoformat'): # Traitement de date, datetime, etc.
                        row[key] = val.isoformat()
                        
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
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    # Permet de démarrer le serveur en mode StdIO par défaut
    mcp.run()
