import asyncio
import logging
from fastapi import APIRouter, HTTPException
from app.schemas import SchemaResponse
from app.services.agent import get_database_schema_context

logger = logging.getLogger("llm4sql.schema")

router = APIRouter(prefix="/api/schema", tags=["Schema"])


@router.get("", response_model=SchemaResponse)
async def get_schema() -> SchemaResponse:
    """
    Récupère le schéma complet et structuré de la base de données.
    
    Cette méthode est asynchrone et exploite la mise en cache mémoire de l'agent.
    
    Returns:
        SchemaResponse: Le schéma de base de données formaté.
    """
    try:
        schema = await asyncio.to_thread(get_database_schema_context)
        return SchemaResponse(schema_context=schema)
    except Exception as e:
        logger.error(f"[Schema Error] {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Une erreur interne est survenue lors de la récupération du schéma."
        )
