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


@patch("app.main.run_agent")
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

    payload = {"question": "liste des ouvrages"}
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
        simulate_only=False
    )


def test_api_chat_empty_payload():
    """
    Vérifie que l'endpoint de chat rejette les questions vides ou invalides.
    """
    # Cas 1 : Question vide
    payload_empty = {"question": "   "}
    response = client.post("/api/chat", json=payload_empty)
    assert response.status_code == 400
    assert "ne peut pas être vide" in response.json()["detail"]

    # Cas 2 : Payload mal formé (absence du champ requis 'question')
    payload_malformed = {"requete_invalide": "test"}
    response = client.post("/api/chat", json=payload_malformed)
    assert response.status_code == 422  # Erreur d'entité non traitable de Pydantic
