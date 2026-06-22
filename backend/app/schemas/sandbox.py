from pydantic import BaseModel, Field
from typing import Optional

class SchemaResponse(BaseModel):
    """
    Modèle de validation pour le schéma de base de données.
    """
    schema_context: str = Field(..., description="Le schéma complet des tables et colonnes formaté en texte.")


class SandboxInitRequest(BaseModel):
    """
    Modèle pour l'initialisation du bac à sable (Sandbox).
    """
    schema_sql: str = Field(..., max_length=100000, description="Le code SQL CREATE TABLE de l'utilisateur.")
    insert_sql: Optional[str] = Field(None, max_length=500000, description="Le code SQL INSERT INTO optionnel.")


class SandboxInitResponse(BaseModel):
    """
    Modèle de réponse pour l'initialisation du bac à sable.
    """
    success: bool = Field(..., description="Indique si l'initialisation a réussi.")
    message: str = Field(..., description="Message de confirmation ou d'erreur.")


class VisualizeRequest(BaseModel):
    schema_sql: str = Field(..., max_length=100000, description="Le code SQL CREATE TABLE.")


class VisualizeResponse(BaseModel):
    mermaid_code: str = Field(..., description="Le code du diagramme ER Mermaid.")


class SandboxSchemaResponse(BaseModel):
    schema_sql: str = Field(..., description="Le code SQL DDL généré à partir de la base de données réelle.")
    mermaid_code: str = Field(..., description="Le diagramme ER Mermaid correspondant.")
    active_schema: str = Field(..., description="Le schéma actif de la base de données (user_sandbox ou public).")
