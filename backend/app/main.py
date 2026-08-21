import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.database.pool import init_db_pool, close_db_pool
from app.routers import chat, schema, sandbox, monitoring, eval as eval_router

from app.core.limiter import limiter
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

logger = logging.getLogger("llm4sql.api")

# Silencer les requêtes HTTP internes d'Ollama (httpx / httpcore)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

# Filtre personnalisé pour masquer le polling répétitif du frontend dans uvicorn.access
class EndpointFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        return not any(endpoint in msg for endpoint in [
            "/api/ollama/status", 
            "/api/ollama/models", 
            "GET /?t=",
            "GET / HTTP"
        ])

logging.getLogger("uvicorn.access").addFilter(EndpointFilter())

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
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost",
        "http://127.0.0.1",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# Enregistrement des sous-routeurs
app.include_router(monitoring.router)
app.include_router(chat.router)
app.include_router(schema.router)
app.include_router(sandbox.router)
app.include_router(eval_router.router)

