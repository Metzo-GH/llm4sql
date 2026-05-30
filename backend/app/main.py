from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.core.config import settings
from app.services.agent import run_agent, get_database_schema_context

# Initialiser l'application FastAPI
app = FastAPI(
    title="LLM4SQL API",
    description="API REST locale pour l'assistant SQL intelligent LLM4SQL.",
    version="1.0.0"
)

# Configuration du middleware CORS (Cross-Origin Resource Sharing)
# Permet au frontend React (Vite) de communiquer de manière sécurisée en local
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Port par défaut de Vite
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =====================================================================
# 1. Modèles de requêtes et de réponses (Pydantic v2)
# =====================================================================

class ChatRequest(BaseModel):
    """
    Modèle de validation pour la requête de discussion SQL.
    """
    question: str = Field(
        ..., 
        description="La question en français formulée par l'utilisateur.",
        examples=["Donne-moi la liste des ouvrages dessinés par Christophe Blain."]
    )
    custom_schema: Optional[str] = Field(
        None,
        description="Schéma de base de données fourni par l'utilisateur (optionnel)."
    )
    simulate_only: bool = Field(
        False,
        description="Si vrai, l'agent générera le SQL mais ne l'exécutera pas."
    )


class ChatResponse(BaseModel):
    """
    Modèle de validation pour la réponse de discussion SQL.
    """
    question: str = Field(..., description="La question initiale de l'utilisateur.")
    sql_query: Optional[str] = Field(None, description="La requête SQL PostgreSQL SELECT générée.")
    error_message: Optional[str] = Field(None, description="Message d'erreur SQL ou de sécurité si échec.")
    query_results: Optional[List[Dict[str, Any]]] = Field(None, description="Résultats de l'exécution SQL (dictionnaire JSON).")
    iteration_count: int = Field(..., description="Le nombre d'itérations d'auto-correction réalisées.")


class SchemaResponse(BaseModel):
    """
    Modèle de validation pour le schéma de base de données.
    """
    schema_context: str = Field(..., description="Le schéma complet des tables et colonnes formaté en texte.")


class SandboxInitRequest(BaseModel):
    """
    Modèle pour l'initialisation du bac à sable (Sandbox).
    """
    schema_sql: str = Field(..., description="Le code SQL CREATE TABLE de l'utilisateur.")
    insert_sql: Optional[str] = Field(None, description="Le code SQL INSERT INTO optionnel.")


class SandboxInitResponse(BaseModel):
    """
    Modèle de réponse pour l'initialisation du bac à sable.
    """
    success: bool = Field(..., description="Indique si l'initialisation a réussi.")
    message: str = Field(..., description="Message de confirmation ou d'erreur.")


class VisualizeRequest(BaseModel):
    schema_sql: str = Field(..., description="Le code SQL CREATE TABLE.")

class VisualizeResponse(BaseModel):
    mermaid_code: str = Field(..., description="Le code du diagramme ER Mermaid.")


# =====================================================================
# 2. Endpoints de l'API (REST API Endpoints)
# =====================================================================

@app.get("/")
async def read_root() -> Dict[str, str]:
    """
    Point d'entrée racine retournant le statut de l'API.
    
    Returns:
        Dict[str, str]: Message de statut.
    """
    return {
        "status": "online",
        "message": "Bienvenue sur l'API LLM4SQL local !",
        "environment": settings.ENV
    }


@app.post("/api/sandbox/init", response_model=SandboxInitResponse)
async def init_sandbox(request: SandboxInitRequest) -> SandboxInitResponse:
    """
    Initialise un environnement isolé (sandbox) avec le schéma et les données fournis.
    """
    try:
        from app.database.connection import init_user_sandbox
        init_user_sandbox(schema_sql=request.schema_sql, insert_sql=request.insert_sql)
        
        # Mettre à jour le cache mémoire du schéma pour LangGraph
        import app.services.agent as agent_module
        agent_module._SCHEMA_CACHE = None
        
        return SandboxInitResponse(
            success=True, 
            message="Sandbox initialisée avec succès ! Vous pouvez maintenant interroger votre base."
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/sandbox/visualize", response_model=VisualizeResponse)
async def visualize_schema(request: VisualizeRequest) -> VisualizeResponse:
    """
    Convertit un schéma SQL DDL brut en diagramme Mermaid.js via l'IA locale.
    """
    try:
        from langchain_ollama import ChatOllama
        from langchain_core.messages import SystemMessage
        
        llm = ChatOllama(
            model=settings.OLLAMA_MODEL,
            base_url=settings.OLLAMA_BASE_URL,
            temperature=0.0
        )
        
        prompt = f"""Tu es un expert en modélisation de bases de données. 
Convertis le schéma SQL suivant en un diagramme Entité-Relation Mermaid (erDiagram).
Ne retourne AUCUN autre texte, aucune explication.
Retourne UNIQUEMENT le texte du diagramme (commençant par erDiagram).
Ne mets PAS de blocs ```mermaid.

Schéma SQL :
{request.schema_sql}
"""
        response = llm.invoke([SystemMessage(content=prompt)])
        
        code = response.content.strip()
        # Nettoyage de sécurité si le LLM ajoute des balises Markdown
        if code.startswith("```mermaid"):
            code = code[10:]
        elif code.startswith("```"):
            code = code[3:]
        if code.endswith("```"):
            code = code[:-3]
            
        return VisualizeResponse(mermaid_code=code.strip())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/schema", response_model=SchemaResponse)
async def get_schema() -> SchemaResponse:
    """
    Récupère le schéma complet et structuré de la base de données.
    
    Cette méthode est asynchrone et exploite la mise en cache mémoire de l'agent.
    
    Returns:
        SchemaResponse: Le schéma de base de données formaté.
    """
    try:
        schema = get_database_schema_context()
        return SchemaResponse(schema_context=schema)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la récupération du schéma : {str(e)}"
        )


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """
    Traduit une question en langage naturel en SQL, l'exécute de manière sécurisée,
    et applique une boucle de self-healing automatique en cas d'erreur.
    
    Args:
        request (ChatRequest): La requête contenant la question de l'utilisateur.
        
    Returns:
        ChatResponse: L'état final de la génération, de l'exécution et des résultats.
    """
    if not request.question.strip():
        raise HTTPException(
            status_code=400,
            detail="La question fournie ne peut pas être vide."
        )
        
    try:
        # Exécuter le graphe de l'agent de manière asynchrone (ou synchrone wrappé)
        # run_agent est synchrone mais effectue des requêtes réseau locales rapides
        final_state = run_agent(
            question=request.question,
            custom_schema=request.custom_schema,
            simulate_only=request.simulate_only
        )
        
        return ChatResponse(
            question=final_state["question"],
            sql_query=final_state["sql_query"],
            error_message=final_state["error_message"],
            query_results=final_state["query_results"],
            iteration_count=final_state["iteration_count"]
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Une erreur interne est survenue lors de l'exécution de l'agent : {str(e)}"
        )
