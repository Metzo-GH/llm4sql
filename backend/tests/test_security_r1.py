import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.security import validate_sandbox_sql, validate_sql_query, FORBIDDEN_PG_FUNCTIONS

client = TestClient(app)


def test_validate_sandbox_sql_success():
    """
    Vérifie que les instructions valides pour le bac à sable (CREATE TABLE, INSERT INTO, SELECT) passent.
    """
    valid_scripts = [
        "CREATE TABLE test_table (id SERIAL PRIMARY KEY, name VARCHAR(50));",
        "INSERT INTO test_table (name) VALUES ('Alice'), ('Bob');",
        "SELECT * FROM test_table;",
        """
        CREATE TABLE albums (
            id INT PRIMARY KEY,
            titre VARCHAR,
            annee INT
        );
        INSERT INTO albums VALUES (1, 'Le Lotus Bleu', 1936);
        """
    ]
    for script in valid_scripts:
        is_safe, message = validate_sandbox_sql(script)
        assert is_safe is True, f"Devrait être valide : {script}. Message : {message}"


def test_validate_sandbox_sql_blocked_ddl_dml():
    """
    Vérifie que les instructions destructrices ou non-sandbox (DROP, ALTER, DELETE, UPDATE, TRUNCATE, GRANT, REVOKE) sont rejetées.
    """
    invalid_scripts = [
        "DROP DATABASE postgres;",
        "DROP TABLE test_table;",
        "ALTER TABLE test_table ADD COLUMN hack VARCHAR;",
        "DELETE FROM test_table WHERE id = 1;",
        "UPDATE test_table SET name = 'Hack';",
        "TRUNCATE TABLE test_table;",
        "GRANT ALL PRIVILEGES ON DATABASE postgres ON HACKER;",
        "REVOKE SELECT ON test_table FROM PUBLIC;",
        "CREATE EXTENSION pg_buffercache;",
        "ALTER ROLE postgres WITH PASSWORD 'hack';"
    ]
    for script in invalid_scripts:
        is_safe, message = validate_sandbox_sql(script)
        assert is_safe is False, f"Devrait être rejeté : {script}. Message : {message}"
        assert "Sécurité" in message


def test_validate_sandbox_sql_forbidden_functions():
    """
    Vérifie que les fonctions système PostgreSQL interdites et critiques sont rejetées.
    """
    for func in FORBIDDEN_PG_FUNCTIONS:
        script = f"CREATE TABLE test (val TEXT DEFAULT {func}());"
        is_safe, message = validate_sandbox_sql(script)
        assert is_safe is False, f"La fonction '{func}' devrait être bloquée dans le bac à sable."
        assert "Sécurité" in message


def test_api_sandbox_init_security_rejection():
    """
    Vérifie que l'API /api/sandbox/init rejette les requêtes dangereuses (400 Bad Request)
    et affiche un message propre expliquant le rejet.
    """
    payload = {
        "schema_sql": "DROP DATABASE postgres;",
        "insert_sql": ""
    }
    response = client.post("/api/sandbox/init", json=payload)
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert "DDL rejeté par le moteur de securite" in detail


def test_api_sandbox_init_syntax_rejection():
    """
    Vérifie que l'API /api/sandbox/init rejette les requêtes syntaxiquement invalides.
    """
    payload = {
        "schema_sql": "CREATE TABLE test_table (id INVALID_TYPE);",
        "insert_sql": ""
    }
    response = client.post("/api/sandbox/init", json=payload)
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert "Erreur SQL" in detail


def test_api_cors_headers():
    """
    Vérifie que le middleware CORS n'autorise que GET et POST pour les requêtes cross-origin.
    """
    headers = {
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "DELETE",
        "Access-Control-Request-Headers": "Content-Type"
    }
    response = client.options("/api/schema", headers=headers)
    assert response.status_code == 400
    
    headers_allowed = {
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type"
    }
    response = client.options("/api/schema", headers=headers_allowed)
    assert response.status_code == 200
    assert "POST" in response.headers.get("access-control-allow-methods", "")
    assert "DELETE" not in response.headers.get("access-control-allow-methods", "")


def test_validate_sandbox_sql_comments():
    """
    Vérifie que les scripts SQL avec des commentaires de type -- et des points-virgules finaux sont acceptés par validate_sandbox_sql.
    """
    valid_comments = [
        "CREATE TABLE test (id INT); -- Commentaire",
        "CREATE TABLE test (id INT -- Commentaire\n);"
    ]
    for script in valid_comments:
        is_safe, message = validate_sandbox_sql(script)
        assert is_safe is True, f"Devrait être valide : {script}. Message : {message}"


def test_validate_sql_query_with_comment():
    """
    Vérifie qu'une requête avec un commentaire de type -- et un point-virgule final est acceptée.
    """
    query = "SELECT * FROM ouvrage; -- Commentaire"
    is_safe, message = validate_sql_query(query)
    assert is_safe is True, f"Devrait être valide : {query}. Message : {message}"

