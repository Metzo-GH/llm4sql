import psycopg2
from typing import Any
from app.core.config import settings


def get_db_connection(readonly: bool = False) -> Any:
    """
    Crée et retourne une nouvelle connexion à la base de données PostgreSQL.
    
    Cette méthode centralise la connexion en s'appuyant sur la configuration globale.
    Elle permet de forcer le mode lecture seule au niveau du pilote si spécifié.
    
    Args:
        readonly (bool): Si True, la connexion sera marquée en lecture seule.
        
    Returns:
        psycopg2.extensions.connection: L'objet connexion PostgreSQL.
        
    Raises:
        RuntimeError: En cas d'échec de la connexion à la base de données.
    """
    try:
        conn = psycopg2.connect(**settings.get_db_params())
        if readonly:
            conn.readonly = True
        return conn
    except Exception as e:
        raise RuntimeError(f"Échec de la connexion à PostgreSQL sur {settings.DB_HOST}:{settings.DB_PORT} - Erreur : {str(e)}")
