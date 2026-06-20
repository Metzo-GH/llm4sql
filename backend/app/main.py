import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.database.pool import init_db_pool, close_db_pool
from app.routers import chat, schema, sandbox, monitoring

from app.core.limiter import limiter
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

logger = logging.getLogger("llm4sql.api")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Gestionnaire de cycle de vie de l'application FastAPI.
    Initialise le pool de connexions PostgreSQL au démarrage et le ferme proprement à l'extinction.
    """
    logger.info("[FastAPI Startup] Initialisation du pool de connexion PostgreSQL...")
    init_db_pool()
    yield
    logger.info("[FastAPI Shutdown] Fermeture du pool de connexion PostgreSQL...")
    close_db_pool()


app = FastAPI(
    title="LLM4SQL API",
    description="API REST locale pour l'assistant SQL intelligent LLM4SQL.",
    version="1.0.0",
    lifespan=lifespan
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Configuration du middleware CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)

# Enregistrement des sous-routeurs
app.include_router(monitoring.router)
app.include_router(chat.router)
app.include_router(schema.router)
app.include_router(sandbox.router)
