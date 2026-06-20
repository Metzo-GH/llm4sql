import asyncio
import re
from fastapi import APIRouter, HTTPException
from langchain_core.messages import SystemMessage
from app.services.agent import get_llm
from app.database.pool import init_user_sandbox
from app.schemas import (
    SandboxInitRequest,
    SandboxInitResponse,
    VisualizeRequest,
    VisualizeResponse
)

router = APIRouter(prefix="/api/sandbox", tags=["Sandbox"])


@router.post("/init", response_model=SandboxInitResponse)
async def init_sandbox(request: SandboxInitRequest) -> SandboxInitResponse:
    """
    Initialise un environnement isolé (sandbox) avec le schéma et les données fournis.
    """
    try:
        # Exécuter l'initialisation synchrone de la sandbox dans un thread pool pour éviter de bloquer l'event-loop
        await asyncio.to_thread(
            init_user_sandbox,
            schema_sql=request.schema_sql,
            insert_sql=request.insert_sql
        )
        
        # Mettre à jour le cache mémoire du schéma pour LangGraph
        import app.services.agent as agent_module
        agent_module.invalidate_schema_cache()
        
        return SandboxInitResponse(
            success=True, 
            message="Sandbox initialisée avec succès ! Vous pouvez maintenant interroger votre base."
        )
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[Sandbox Init Error] {str(e)}")
        raise HTTPException(status_code=500, detail="Une erreur interne est survenue lors de l'initialisation de la sandbox.")


@router.post("/visualize", response_model=VisualizeResponse)
async def visualize_schema(request: VisualizeRequest) -> VisualizeResponse:
    """
    Convertit un schéma SQL DDL brut en diagramme Mermaid.js via l'IA locale.
    """
    try:
        llm = get_llm()
        
        prompt = f"""Tu es un expert en modélisation de bases de données. 
Convertis le schéma SQL suivant en un diagramme Entité-Relation Mermaid (erDiagram).

Règles de syntaxe Mermaid cruciales :
1. N'écris JAMAIS de parenthèses ou de virgules pour spécifier les types de colonnes (écris `varchar` au lieu de `varchar(50)` et `decimal` au lieu de `decimal(10,2)`).
2. Ne sépare pas les lignes de colonnes par des virgules ou des points-virgules dans les définitions de tables.
3. Ne retourne AUCUN autre texte, aucune explication.
4. Retourne UNIQUEMENT le texte du diagramme (commençant par erDiagram).
5. Ne mets PAS de blocs ```mermaid.

Schéma SQL :
{request.schema_sql}
"""
        # Utiliser l'appel asynchrone natif ainvoke pour ne pas bloquer l'event-loop
        response = await llm.ainvoke([SystemMessage(content=prompt)])
        
        code = response.content.strip()
        # 1. Nettoyage de sécurité si le LLM ajoute des balises Markdown
        if code.startswith("```mermaid"):
            code = code[10:]
        elif code.startswith("```"):
            code = code[3:]
        if code.endswith("```"):
            code = code[:-3]
        code = code.strip()
        
        # 2. Correction automatique de la syntaxe des types (suppression des paramètres)
        # Exemple : varchar(50) -> varchar, decimal(10, 2) -> decimal
        code = re.sub(r'(\w+)\([\d\s,]+\)', r'\1', code)
        
        # 3. Suppression des virgules et points-virgules de fin de ligne dans les définitions
        code = re.sub(r',\s*$', '', code, flags=re.MULTILINE)
        code = re.sub(r';\s*$', '', code, flags=re.MULTILINE)
            
        return VisualizeResponse(mermaid_code=code.strip())
    except Exception as e:
        print(f"[Visualize Error] {str(e)}")
        raise HTTPException(status_code=500, detail="Une erreur interne est survenue lors de la génération du diagramme ER.")
