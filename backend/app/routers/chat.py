import asyncio
import time
import json
from typing import Dict, Any
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from app.schemas import ChatRequest, ChatResponse

router = APIRouter(prefix="/api/chat", tags=["Chat & Agent"])


@router.post("", response_model=ChatResponse)
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
        
    print("\n" + "="*60)
    print(f"[API IN] REQUÊTE REÇUE : '{request.question}'")
    print("="*60)
    start_time = time.time()
        
    try:
        # Exécuter le graphe de l'agent synchrone dans un thread séparé de manière non-bloquante via asyncio.to_thread
        final_state = await asyncio.to_thread(
            run_agent,
            question=request.question,
            custom_schema=request.custom_schema,
            simulate_only=request.simulate_only,
            model=request.model,
            temperature=request.temperature,
            context_size=request.context_size
        )
        
        total_time = time.time() - start_time
        print("\n" + "="*60)
        print(f"[API OUT] RÉPONSE PRÊTE en {total_time:.2f}s (Itérations: {final_state['iteration_count']})")
        print("="*60 + "\n")
        
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
        print("\n" + "="*60)
        print(f"[API ERR] ERREUR INTERNE en {total_time:.2f}s : {str(e)}")
        print("="*60 + "\n")
        raise HTTPException(
            status_code=500,
            detail="Une erreur interne est survenue lors de l'exécution de l'agent."
        )


@router.post("/stream")
async def chat_stream(request: ChatRequest):
    """
    Traduit une question en langage naturel en SQL sous forme de flux Server-Sent Events (SSE)
    permettant de suivre la réflexion et les étapes pas-à-pas en temps réel.
    """
    if not request.question.strip():
        raise HTTPException(
            status_code=400,
            detail="La question fournie ne peut pas être vide."
        )

    print("\n" + "="*60)
    print(f"[API IN] REQUÊTE STREAMING REÇUE : '{request.question}'")
    print("="*60)
    
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
            event_callback({"type": "log", "data": f"[API IN] REQUÊTE REÇUE : '{request.question}'"})
            
            final_state = run_agent(
                question=request.question,
                custom_schema=request.custom_schema,
                simulate_only=request.simulate_only,
                model=request.model,
                temperature=request.temperature,
                context_size=request.context_size
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
            print(f"[Chat Stream Error] {str(e)}")
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
            print("  [API OUT] Le flux de streaming a été annulé par l'utilisateur.")
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
