from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_api_health_endpoint():
    """
    Vérifie que la route /api/health répond avec un code HTTP 200 et un statut 'ok' pour le healthcheck Docker.
    """
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["app"] == "llm4sql"
