from typing import Dict, Any
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Configuration de l'application LLM4SQL.
    
    Cette classe charge automatiquement les variables d'environnement
    depuis le fichier .env présent dans le dossier d'exécution.
    """
    # PostgreSQL Connection Parameters
    DB_HOST: str = "127.0.0.1"
    DB_PORT: int = 5433
    DB_NAME: str = "llm4sql_db"
    DB_USER: str = "llm4sql_user"
    DB_PASSWORD: str = "llm4sql_password"

    # Ollama Configuration
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "qwen3.5:9b"

    # Env
    ENV: str = "development"

    # Config dict to specify the env file mapping
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    def get_db_params(self) -> Dict[str, Any]:
        """
        Retourne les paramètres de connexion sous forme de dictionnaire compatible avec psycopg2.
        
        Returns:
            Dict[str, Any]: Paramètres de connexion PostgreSQL.
        """
        return {
            "host": self.DB_HOST,
            "port": str(self.DB_PORT),
            "dbname": self.DB_NAME,
            "user": self.DB_USER,
            "password": self.DB_PASSWORD,
        }


# Instance globale de configuration
settings = Settings()
