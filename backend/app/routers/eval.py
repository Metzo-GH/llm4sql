import asyncio
import json
import logging
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.services.eval_service import (
    load_dataset,
    add_eval_case,
    update_eval_case,
    delete_eval_case,
    reset_eval_dataset,
    run_full_benchmark,
    run_benchmark_case,
    request_benchmark_cancel
)
from app.core.limiter import limiter

logger = logging.getLogger("llm4sql.eval_router")

router = APIRouter(prefix="/api/eval", tags=["Evaluation & Benchmark"])

# Historique en mémoire des derniers runs de benchmark
BENCHMARK_HISTORY: List[Dict[str, Any]] = []


class EvalRunRequest(BaseModel):
    model: Optional[str] = Field(default=None, description="Nom du modèle Ollama à évaluer.")
    target_schema: Optional[str] = Field(default="public", description="Schéma PostgreSQL cible ('public' ou 'user_sandbox').")


class EvalCaseCreate(BaseModel):
    question: str = Field(..., min_length=3, description="Question en langage naturel.")
    difficulty: str = Field(default="Moyen", description="Niveau de difficulté (Facile, Moyen, Difficile, Avancé).")
    ground_truth_sql: str = Field(..., min_length=5, description="Requête SQL de référence.")


class EvalCaseUpdate(BaseModel):
    question: Optional[str] = Field(default=None, min_length=3)
    difficulty: Optional[str] = Field(default=None)
    ground_truth_sql: Optional[str] = Field(default=None, min_length=5)


@router.get("/cases", response_model=List[Dict[str, Any]])
def get_eval_cases() -> List[Dict[str, Any]]:
    """Renvoie la liste des cas d'évaluation du benchmark."""
    return load_dataset()


@router.post("/cases", response_model=Dict[str, Any], status_code=201)
def create_eval_case(case_in: EvalCaseCreate) -> Dict[str, Any]:
    """Ajoute un nouveau cas d'évaluation personnalisé."""
    try:
        new_case = add_eval_case(
            question=case_in.question,
            difficulty=case_in.difficulty,
            ground_truth_sql=case_in.ground_truth_sql
        )
        return new_case
    except Exception as e:
        logger.error(f"[API EVAL] Erreur lors de l'ajout d'un cas : {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'ajout : {str(e)}")


@router.put("/cases/{case_id}", response_model=Dict[str, Any])
def update_eval_case_endpoint(case_id: int, case_in: EvalCaseUpdate) -> Dict[str, Any]:
    """Modifie un cas d'évaluation existant."""
    try:
        updated = update_eval_case(case_id, case_in.model_dump(exclude_unset=True))
        return updated
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        logger.error(f"[API EVAL] Erreur modification cas {case_id} : {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de la modification : {str(e)}")


@router.delete("/cases/{case_id}")
def delete_eval_case_endpoint(case_id: int) -> Dict[str, str]:
    """Supprime un cas d'évaluation."""
    success = delete_eval_case(case_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Cas avec id={case_id} non trouvé.")
    return {"message": f"Cas id={case_id} supprimé avec succès."}


@router.post("/cases/reset", response_model=List[Dict[str, Any]])
def reset_eval_cases_endpoint() -> List[Dict[str, Any]]:
    """Réinitialise le dataset d'évaluation aux 18 cas canoniques par défaut."""
    try:
        return reset_eval_dataset()
    except Exception as e:
        logger.error(f"[API EVAL] Erreur réinitialisation dataset : {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur réinitialisation : {str(e)}")


@router.post("/run")
@limiter.limit("5/minute")
async def run_eval_benchmark(request: Request, body: Optional[EvalRunRequest] = None) -> Dict[str, Any]:
    """Exécute le benchmark complet de manière asynchrone pour un modèle et un schéma donnés."""
    selected_model = body.model if body else None
    schema = body.target_schema if (body and body.target_schema) else "public"
    logger.info(f"[API EVAL] Lancement du benchmark pour le modèle : {selected_model} (Schéma: {schema})")
    
    try:
        report = await asyncio.to_thread(run_full_benchmark, model=selected_model, target_schema=schema)
        BENCHMARK_HISTORY.insert(0, report)
        if len(BENCHMARK_HISTORY) > 20:
            BENCHMARK_HISTORY.pop()
        return report
    except Exception as e:
        logger.error(f"[API EVAL ERR] Erreur lors de l'exécution du benchmark : {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de l'exécution du benchmark : {str(e)}"
        )


@router.get("/stream")
@limiter.limit("5/minute")
async def stream_eval_benchmark(
    request: Request,
    model: Optional[str] = Query(default=None),
    target_schema: Optional[str] = Query(default="public")
):
    """
    Endpoint SSE transmettant la progression du benchmark en temps réel cas par cas.
    """
    async_queue = asyncio.Queue()
    loop = asyncio.get_running_loop()

    def progress_callback(current: int, total: int, case_res: Dict[str, Any]):
        event = {
            "type": "progress",
            "current": current,
            "total": total,
            "case": case_res
        }
        loop.call_soon_threadsafe(async_queue.put_nowait, event)

    def run_eval_in_thread():
        try:
            dataset = load_dataset()
            loop.call_soon_threadsafe(
                async_queue.put_nowait,
                {"type": "start", "total": len(dataset), "model": model or "default"}
            )
            
            report = run_full_benchmark(
                model=model,
                progress_callback=progress_callback,
                target_schema=target_schema or "public"
            )
            
            BENCHMARK_HISTORY.insert(0, report)
            if len(BENCHMARK_HISTORY) > 20:
                BENCHMARK_HISTORY.pop()

            loop.call_soon_threadsafe(
                async_queue.put_nowait,
                {"type": "complete", "report": report}
            )
        except Exception as e:
            logger.error(f"[Eval Stream Error] {str(e)}")
            loop.call_soon_threadsafe(
                async_queue.put_nowait,
                {"type": "error", "message": f"Erreur benchmark : {str(e)}"}
            )
        finally:
            loop.call_soon_threadsafe(async_queue.put_nowait, None)

    async def event_generator():
        task = asyncio.create_task(asyncio.to_thread(run_eval_in_thread))
        try:
            while True:
                event = await async_queue.get()
                if event is None:
                    break
                yield f"data: {json.dumps(event)}\n\n"
        except asyncio.CancelledError:
            logger.info("[Eval Stream] Flux annule par le client.")
        finally:
            await task

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.get("/history", response_model=List[Dict[str, Any]])
def get_eval_history() -> List[Dict[str, Any]]:
    """Renvoie l'historique des derniers runs de benchmark en mémoire."""
    return BENCHMARK_HISTORY


@router.post("/stop")
@router.post("/cancel")
def stop_eval_benchmark() -> Dict[str, str]:
    """
    Arrête et annule le benchmark d'évaluation en cours.
    """
    request_benchmark_cancel()
    return {
        "status": "stopped",
        "message": "Le benchmark a été arrêté avec succès."
    }

