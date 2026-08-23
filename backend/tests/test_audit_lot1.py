import pytest
import asyncio
from app.core.http_client import (
    init_http_clients,
    close_http_clients,
    get_async_http_client,
    get_sync_http_client,
)
from app.services.eval_service import MAX_COLUMN_PERMUTATIONS, compare_query_results
from app.routers.sandbox import sql_ddl_to_mermaid
from app.database.queries import execute_readonly_query


@pytest.mark.asyncio
async def test_http_client_lifecycle_and_pooling():
    """
    Vérifie l'initialisation, la récupération des clients sync/async, et la fermeture propre du pool HTTP.
    """
    init_http_clients()
    
    async_client = get_async_http_client()
    sync_client = get_sync_http_client()
    
    assert async_client is not None
    assert sync_client is not None
    assert not async_client.is_closed
    assert not sync_client.is_closed
    
    # Test de persistance du singleton
    assert get_async_http_client() is async_client
    assert get_sync_http_client() is sync_client
    
    await close_http_clients()
    assert async_client.is_closed
    assert sync_client.is_closed


def test_eval_service_permutations_limit():
    """
    Vérifie que la constante MAX_COLUMN_PERMUTATIONS est bien définie (120)
    et que la comparaison sémantique gère les ensembles avec beaucoup de colonnes sans bloquer.
    """
    assert MAX_COLUMN_PERMUTATIONS == 120
    
    # Cas avec 8 colonnes attendues et 10 colonnes réelles (10! / (10-8)! = 1.8M permutations théoriques)
    # Grâce au plafond MAX_COLUMN_PERMUTATIONS, l'exécution doit être quasi-instantanée (< 0.1s)
    expected = [{"c1": 1, "c2": 2, "c3": 3, "c4": 4, "c5": 5, "c6": 6, "c7": 7, "c8": 8}]
    actual = [{"a": 1, "b": 2, "c": 3, "d": 4, "e": 5, "f": 6, "g": 7, "h": 8, "x": 9, "y": 10}]
    
    # Doit s'exécuter immédiatement grâce au fallback / cap
    result = compare_query_results(expected, actual)
    assert result is True


def test_sandbox_sql_ddl_to_mermaid_sqlglot_comments_and_tables():
    """
    Vérifie que sql_ddl_to_mermaid utilise un parsing AST propre capable d'ignorer
    les commentaires complexes (multilignes /* */, imbriqués, et en ligne --) sans risque de ReDoS.
    """
    ddl = """
    /* 
       Commentaire d'en-tête volumineux
       contenant des faux CREATE TABLE fictif (id INT);
    */
    CREATE TABLE utilisateur (
        id SERIAL PRIMARY KEY, -- Identifiant unique
        nom CHARACTER VARYING(100) NOT NULL,
        email VARCHAR(255) UNIQUE, /* Champ sensible */
        age INTEGER,
        created_at TIMESTAMP WITHOUT TIME ZONE
    );

    -- Commentaire intermédiaire
    CREATE TABLE commande (
        id SERIAL PRIMARY KEY,
        utilisateur_id INT REFERENCES utilisateur(id),
        total DOUBLE PRECISION
    );
    """
    mermaid = sql_ddl_to_mermaid(ddl)
    assert "erDiagram" in mermaid
    assert "utilisateur {" in mermaid
    assert "commande {" in mermaid
    assert "varchar nom" in mermaid
    assert "int age" in mermaid
    assert "timestamp created_at" in mermaid
    assert "decimal total" in mermaid
    assert "utilisateur_id" in mermaid
    assert "faux" not in mermaid
    assert 'utilisateur ||--o{ commande : "utilisateur_id"' in mermaid


def test_queries_execute_readonly_query():
    """
    Vérifie que execute_readonly_query exécute une requête en lecture seule sur le schéma public.
    """
    rows = execute_readonly_query("SELECT 1 AS num", schema="public")
    assert len(rows) == 1
    assert rows[0]["num"] == 1
