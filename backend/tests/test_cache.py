import pytest
from unittest.mock import patch
from app.services.cache import SemanticCache


@pytest.fixture
def cache():
    """Crée une instance isolée de SemanticCache pour chaque test."""
    return SemanticCache()


def test_cache_exact_hit_same_schema(cache):
    """Vérifie le hit exact lorsque le target_schema correspond."""
    cache.set(
        question="Combien de clients ?",
        model="qwen2.5-coder:7b",
        sql_query="SELECT COUNT(*) FROM clients",
        query_results=[{"count": 42}],
        iteration_count=1,
        tables=["clients"],
        target_schema="public"
    )

    res = cache.check("Combien de clients ?", model="qwen2.5-coder:7b", target_schema="public")
    assert res is not None
    assert res["sql_query"] == "SELECT COUNT(*) FROM clients"
    assert res["query_results"] == [{"count": 42}]


def test_cache_isolation_different_schema(cache):
    """Vérifie qu'une entrée dans 'public' n'est pas retournée pour 'user_sandbox'."""
    cache.set(
        question="Combien de clients ?",
        model="qwen2.5-coder:7b",
        sql_query="SELECT COUNT(*) FROM public.clients",
        query_results=[{"count": 42}],
        iteration_count=1,
        tables=["clients"],
        target_schema="public"
    )

    # Même question mais schéma différent => cache miss
    res_sandbox = cache.check("Combien de clients ?", model="qwen2.5-coder:7b", target_schema="user_sandbox")
    assert res_sandbox is None

    # Ajout d'une entrée sur 'user_sandbox'
    cache.set(
        question="Combien de clients ?",
        model="qwen2.5-coder:7b",
        sql_query="SELECT COUNT(*) FROM user_sandbox.clients",
        query_results=[{"count": 5}],
        iteration_count=1,
        tables=["clients"],
        target_schema="user_sandbox"
    )

    # Vérifie que chaque schéma renvoie son propre résultat
    res_public = cache.check("Combien de clients ?", model="qwen2.5-coder:7b", target_schema="public")
    res_sandbox = cache.check("Combien de clients ?", model="qwen2.5-coder:7b", target_schema="user_sandbox")

    assert res_public is not None
    assert res_public["sql_query"] == "SELECT COUNT(*) FROM public.clients"
    assert res_sandbox is not None
    assert res_sandbox["sql_query"] == "SELECT COUNT(*) FROM user_sandbox.clients"


def test_cache_cosine_similarity_with_schema_isolation(cache):
    """Vérifie la recherche sémantique par cosinus avec isolation par schéma."""
    with patch.object(cache, "_get_embedding") as mock_embed:
        # Vecteurs pour simuler une grande similarité (cosinus proche de 1.0)
        def side_effect(text, model):
            if "total" in text:
                return [0.99, 0.05]
            return [1.0, 0.0]
        mock_embed.side_effect = side_effect

        cache.set(
            question="Donne-moi le nombre de commandes",
            model="qwen2.5-coder:7b",
            sql_query="SELECT COUNT(*) FROM orders",
            query_results=[{"count": 100}],
            iteration_count=1,
            tables=["orders"],
            target_schema="public"
        )

        # Hit sémantique sur le même schéma
        res = cache.check("Donne le total de commandes", model="qwen2.5-coder:7b", threshold=0.85, target_schema="public")
        assert res is not None
        assert res["sql_query"] == "SELECT COUNT(*) FROM orders"

        # Miss sémantique sur un schéma différent
        res_diff = cache.check("Donne le total de commandes", model="qwen2.5-coder:7b", threshold=0.85, target_schema="user_sandbox")
        assert res_diff is None


def test_cache_jaccard_fallback_with_schema_isolation(cache):
    """Vérifie le repli Jaccard avec isolation par schéma."""
    with patch.object(cache, "_get_embedding", return_value=None):
        cache.set(
            question="liste des produits en stock",
            model="qwen2.5-coder:7b",
            sql_query="SELECT * FROM products WHERE stock > 0",
            query_results=[{"id": 1, "name": "A"}],
            iteration_count=1,
            tables=["products"],
            target_schema="public"
        )

        # Hit Jaccard sur 'public' avec un seuil adapté
        res = cache.check("liste des produits en stock disponibles", model="qwen2.5-coder:7b", threshold=0.6, target_schema="public")
        assert res is not None
        assert res["sql_query"] == "SELECT * FROM products WHERE stock > 0"

        # Miss sur 'user_sandbox'
        res_diff = cache.check("liste des produits en stock disponibles", model="qwen2.5-coder:7b", threshold=0.6, target_schema="user_sandbox")
        assert res_diff is None


def test_cache_threshold_rejection(cache):
    """Vérifie que les questions en dessous du seuil sont rejetées."""
    with patch.object(cache, "_get_embedding", return_value=None):
        cache.set(
            question="liste des produits",
            model="qwen2.5-coder:7b",
            sql_query="SELECT * FROM products",
            query_results=[],
            iteration_count=1,
            tables=["products"],
            target_schema="public"
        )

        # Question avec faible overlap Jaccard
        res = cache.check("quel est le chiffre d'affaires", model="qwen2.5-coder:7b", threshold=0.85, target_schema="public")
        assert res is None


def test_cache_clear_by_schema_and_global(cache):
    """Vérifie le vidage ciblé par schéma et global."""
    cache.set(
        question="Q1",
        model="m",
        sql_query="S1",
        query_results=[],
        iteration_count=1,
        tables=[],
        target_schema="public"
    )
    cache.set(
        question="Q2",
        model="m",
        sql_query="S2",
        query_results=[],
        iteration_count=1,
        tables=[],
        target_schema="user_sandbox"
    )

    # Nettoyer uniquement 'public'
    cache.clear(target_schema="public")
    assert cache.check("Q1", model="m", target_schema="public") is None
    assert cache.check("Q2", model="m", target_schema="user_sandbox") is not None

    # Nettoyage global
    cache.clear()
    assert cache.check("Q2", model="m", target_schema="user_sandbox") is None
