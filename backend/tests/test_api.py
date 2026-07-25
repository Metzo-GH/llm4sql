import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from app.main import app

# Créer un client de test FastAPI
client = TestClient(app)


def test_api_read_root():
    """
    Vérifie que la route racine de l'API répond correctement et est en ligne.
    """
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"
    assert "LLM4SQL" in data["message"]


def test_api_get_schema_success():
    """
    Vérifie que l'endpoint /api/schema retourne le schéma de la base.
    """
    response = client.get("/api/schema")
    assert response.status_code == 200
    data = response.json()
    assert "schema_context" in data
    # Le schéma doit mentionner nos tables du seed
    assert "ouvrage" in data["schema_context"].lower()
    assert "personne" in data["schema_context"].lower()


def test_api_get_sandbox_schema_success():
    """
    Vérifie que l'endpoint /api/sandbox/schema retourne le schéma de la sandbox ou public.
    """
    response = client.get("/api/sandbox/schema")
    assert response.status_code == 200
    data = response.json()
    assert "schema_sql" in data
    assert "mermaid_code" in data
    assert "active_schema" in data
    assert data["active_schema"] in ["user_sandbox", "public"]



@patch("app.routers.chat.run_agent")
def test_api_chat_success(mock_run_agent):
    """
    Vérifie que l'endpoint de chat retourne la bonne structure de réponse validée par Pydantic.
    """
    # Configurer le mock pour simuler un retour de l'agent
    mock_run_agent.return_value = {
        "question": "liste des ouvrages",
        "sql_query": "SELECT * FROM ouvrage;",
        "error_message": None,
        "query_results": [{"ido": 1, "titre": "BD Test"}],
        "iteration_count": 1,
        "schema_context": "Table 'ouvrage'..."
    }

    payload = {"question": "liste des ouvrages", "model": "test-model"}
    response = client.post("/api/chat", json=payload)
    
    assert response.status_code == 200
    data = response.json()
    assert data["question"] == "liste des ouvrages"
    assert data["sql_query"] == "SELECT * FROM ouvrage;"
    assert data["error_message"] is None
    assert len(data["query_results"]) == 1
    assert data["query_results"][0]["titre"] == "BD Test"
    assert data["iteration_count"] == 1

    # S'assurer que le service sous-jacent a été appelé
    mock_run_agent.assert_called_once_with(
        question="liste des ouvrages",
        custom_schema=None,
        simulate_only=False,
        model="test-model",
        temperature=None,
        context_size=None,
        bypass_semantic_cache=False,
        target_schema="public"
    )


@patch("app.routers.chat.run_agent")
def test_api_chat_bypass_cache(mock_run_agent):
    """
    Vérifie que le flag bypass_semantic_cache est correctement propagé à run_agent.
    """
    mock_run_agent.return_value = {
        "question": "liste des ouvrages",
        "sql_query": "SELECT * FROM ouvrage;",
        "error_message": None,
        "query_results": [],
        "iteration_count": 1,
        "schema_context": ""
    }

    payload = {
        "question": "liste des ouvrages",
        "model": "test-model",
        "bypass_semantic_cache": True
    }
    response = client.post("/api/chat", json=payload)
    
    assert response.status_code == 200
    mock_run_agent.assert_called_once_with(
        question="liste des ouvrages",
        custom_schema=None,
        simulate_only=False,
        model="test-model",
        temperature=None,
        context_size=None,
        bypass_semantic_cache=True,
        target_schema="public"
    )


def test_api_chat_empty_payload():
    """
    Vérifie que l'endpoint de chat rejette les questions vides ou invalides.
    """
    # Cas 1 : Question vide
    payload_empty = {"question": "   ", "model": "test-model"}
    response = client.post("/api/chat", json=payload_empty)
    assert response.status_code == 400
    assert "ne peut pas être vide" in response.json()["detail"]

    # Cas 2 : Payload mal formé (absence du champ requis 'question')
    payload_malformed = {"requete_invalide": "test", "model": "test-model"}
    response = client.post("/api/chat", json=payload_malformed)
    assert response.status_code == 422  # Erreur d'entité non traitable de Pydantic


def test_api_chat_no_model_returns_400():
    """
    Vérifie que /api/chat renvoie un code 400 Bad Request si aucun modèle n'est fourni.
    """
    # Cas 1 : Champ model absent
    payload_no_model = {"question": "liste des ouvrages"}
    response = client.post("/api/chat", json=payload_no_model)
    assert response.status_code == 400
    assert "Aucun modèle LLM sélectionné" in response.json()["detail"]

    # Cas 2 : Champ model vide ou constitué d'espaces
    payload_empty_model = {"question": "liste des ouvrages", "model": "   "}
    response = client.post("/api/chat", json=payload_empty_model)
    assert response.status_code == 400
    assert "Aucun modèle LLM sélectionné" in response.json()["detail"]


def test_api_chat_stream_no_model_returns_400():
    """
    Vérifie que /api/chat/stream renvoie un code 400 Bad Request si aucun modèle n'est fourni.
    """
    # Cas 1 : Champ model absent
    payload_no_model = {"question": "liste des ouvrages"}
    response = client.post("/api/chat/stream", json=payload_no_model)
    assert response.status_code == 400
    assert "Aucun modèle LLM sélectionné" in response.json()["detail"]

    # Cas 2 : Champ model vide
    payload_empty_model = {"question": "liste des ouvrages", "model": ""}
    response = client.post("/api/chat/stream", json=payload_empty_model)
    assert response.status_code == 400
    assert "Aucun modèle LLM sélectionné" in response.json()["detail"]
