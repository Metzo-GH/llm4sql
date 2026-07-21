from typing import Dict, Any
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Configuration de l'application LLM4SQL.
    
    Cette classe charge automatiquement les variables d'environnement
    depuis le fichier .env présent à la racine du projet.
    
    Attributes:
        DB_HOST (str): L'adresse IP de l'hôte de la base de données PostgreSQL.
        DB_PORT (int): Le port d'écoute PostgreSQL.
        DB_NAME (str): Le nom de la base de données.
        DB_USER (str): L'identifiant de connexion de l'utilisateur.
        DB_PASSWORD (str): Le mot de passe de connexion.
        OLLAMA_BASE_URL (str): L'adresse URL de l'API Ollama locale.
        OLLAMA_MODEL (str): Le nom du modèle LLM local chargé dans Ollama.
        ENV (str): L'environnement courant (ex: 'development', 'production').
    """
    # Paramètres de connexion PostgreSQL
    DB_HOST: str = "127.0.0.1"
    DB_PORT: int = 5433
    DB_NAME: str = "llm4sql_db"
    DB_USER: str
    DB_PASSWORD: str

    # Paramètres Ollama
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = ""

    # Environnement
    ENV: str = "development"

    # Configuration Pydantic pour mapper le fichier .env
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    def get_db_params(self) -> Dict[str, Any]:
        """
        Retourne les paramètres de connexion sous forme de dictionnaire compatible avec psycopg2.
        
        Returns:
            Dict[str, Any]: Les paramètres de connexion avec clés converties.
        """
        return {
            "host": self.DB_HOST,
            "port": str(self.DB_PORT),
            "dbname": self.DB_NAME,
            "user": self.DB_USER,
            "password": self.DB_PASSWORD,
        }


# Instance globale de configuration accessible depuis toute l'application
settings = Settings()
