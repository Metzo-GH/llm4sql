import asyncio
import time
import json
import logging
from typing import Dict, Any
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from app.schemas import ChatRequest, ChatResponse
from app.core.limiter import limiter

logger = logging.getLogger("llm4sql.chat")

router = APIRouter(prefix="/api/chat", tags=["Chat & Agent"])


@router.post("", response_model=ChatResponse)
@limiter.limit("20/minute")
async def chat(request: Request, chat_request: ChatRequest) -> ChatResponse:
    """
    Traduit une question en langage naturel en SQL, l'exécute de manière sécurisée,
    et applique une boucle de self-healing automatique en cas d'erreur.
    
    Args:
        request (Request): L'objet requête FastAPI.
        chat_request (ChatRequest): La requête contenant la question de l'utilisateur.
        
    Returns:
        ChatResponse: L'état final de la génération, de l'exécution et des résultats.
    """
    if not chat_request.question.strip():
        raise HTTPException(
            status_code=400,
            detail="La question fournie ne peut pas être vide."
        )
        
    logger.info("="*60)
    logger.info(f"[API IN] REQUÊTE REÇUE : '{chat_request.question}' (Bypass Cache: {chat_request.bypass_semantic_cache})")
    logger.info("="*60)
    start_time = time.time()
        
    try:
        # Exécuter le graphe de l'agent synchrone dans un thread séparé de manière non-bloquante via asyncio.to_thread
        final_state = await asyncio.to_thread(
            run_agent,
            question=chat_request.question,
            custom_schema=chat_request.custom_schema,
            simulate_only=chat_request.simulate_only,
            model=chat_request.model,
            temperature=chat_request.temperature,
            context_size=chat_request.context_size,
            bypass_semantic_cache=chat_request.bypass_semantic_cache
        )
        
        total_time = time.time() - start_time
        logger.info("="*60)
        logger.info(f"[API OUT] RÉPONSE PRÊTE en {total_time:.2f}s (Itérations: {final_state['iteration_count']})")
        logger.info("="*60)
        
        return ChatResponse(
            question=final_state["question"],
            sql_query=final_state["sql_query"],
            error_message=final_state["error_message"],
            query_results=final_state["query_results"],
            iteration_count=final_state["iteration_count"],
            steps=final_state.get("steps", []),
            cache_hit=final_state.get("cache_hit", False),
            tables=final_state.get("tables", [])
        )
    except Exception as e:
        total_time = time.time() - start_time
        logger.error("="*60)
        logger.error(f"[API ERR] ERREUR INTERNE en {total_time:.2f}s : {str(e)}")
        logger.error("="*60)
        raise HTTPException(
            status_code=500,
            detail="Une erreur interne est survenue lors de l'exécution de l'agent."
        )


@router.post("/stream")
@limiter.limit("20/minute")
async def chat_stream(request: Request, chat_request: ChatRequest):
    """
    Traduit une question en langage naturel en SQL sous forme de flux Server-Sent Events (SSE)
    permettant de suivre la réflexion et les étapes pas-à-pas en temps réel.
    """
    if not chat_request.question.strip():
        raise HTTPException(
            status_code=400,
            detail="La question fournie ne peut pas être vide."
        )

    logger.info("="*60)
    logger.info(f"[API IN] REQUÊTE STREAMING REÇUE : '{chat_request.question}' (Bypass Cache: {chat_request.bypass_semantic_cache})")
    logger.info("="*60)
    
    async_queue = asyncio.Queue()
    loop = asyncio.get_running_loop()

    def event_callback(event: Dict[str, Any]):
        # Pousser l'événement de manière thread-safe dans la file d'attente asyncio
        loop.call_soon_threadsafe(async_queue.put_nowait, event)

    def run_with_callback():
        from app.services.agent import event_callback_var, run_agent
        # Configurer le callback d'événement dans le ContextVar pour ce thread
        token = event_callback_var.set(event_callback)
        try:
            event_callback({"type": "log", "data": f"[API IN] REQUÊTE REÇUE : '{chat_request.question}'"})
            
            final_state = run_agent(
                question=chat_request.question,
                custom_schema=chat_request.custom_schema,
                simulate_only=chat_request.simulate_only,
                model=chat_request.model,
                temperature=chat_request.temperature,
                context_size=chat_request.context_size,
                bypass_semantic_cache=chat_request.bypass_semantic_cache
            )
            
            # Envoyer le résultat final consolidé
            event_callback({
                "type": "result",
                "data": {
                    "question": final_state["question"],
                    "sql_query": final_state["sql_query"],
                    "error_message": final_state["error_message"],
                    "query_results": final_state["query_results"],
                    "iteration_count": final_state["iteration_count"],
                    "steps": final_state.get("steps", []),
                    "cache_hit": final_state.get("cache_hit", False),
                    "tables": final_state.get("tables", [])
                }
            })
        except Exception as e:
            logger.error(f"[Chat Stream Error] {str(e)}")
            event_callback({"type": "error", "data": "Une erreur interne est survenue lors de l'exécution de l'agent."})
        finally:
            event_callback_var.reset(token)
            # Indiquer à la boucle asynchrone la fin de l'exécution
            loop.call_soon_threadsafe(async_queue.put_nowait, None)

    async def event_generator():
        # Lancer l'exécution de l'agent dans le pool de threads
        agent_task = asyncio.create_task(asyncio.to_thread(run_with_callback))
        
        try:
            while True:
                event = await async_queue.get()
                if event is None:
                    break
                yield f"data: {json.dumps(event)}\n\n"
        except asyncio.CancelledError:
            logger.info("  [API OUT] Le flux de streaming a été annulé par l'utilisateur.")
        finally:
            await agent_task

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


# Pour permettre l'importation de run_agent tardivement
from app.services.agent import run_agent
