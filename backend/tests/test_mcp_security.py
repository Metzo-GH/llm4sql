import pytest
from app.core.security import validate_sql_query
from app.mcp.mcp_server import list_tables, get_schema, execute_query
import json


def test_sql_validation_success():
    """
    Vérifie que les requêtes SELECT valides et inoffensives passent.
    """
    valid_queries = [
        "SELECT * FROM ouvrage;",
        "SELECT titre, date_sortie FROM ouvrage WHERE dessinateur = 1 ORDER BY date_sortie DESC;",
        "SELECT o.titre, p.nom FROM ouvrage o JOIN personne p ON o.dessinateur = p.idp;",
        "SELECT COUNT(*), score FROM avis GROUP BY score HAVING score > 3;",
        "SELECT * FROM (SELECT idp, nom FROM personne) AS sub;",
        "SELECT idc, label FROM concept UNION SELECT ids, titre FROM serie;"
    ]
    for q in valid_queries:
        is_safe, message = validate_sql_query(q)
        assert is_safe is True, f"Devrait être valide : {q}. Erreur : {message}"


def test_sql_validation_blocked_mutations():
    """
    Vérifie que les requêtes de modification (INSERT, UPDATE, DELETE, Truncate)
    sont strictement bloquées.
    """
    dangerous_queries = [
        "INSERT INTO personne (idp, nom) VALUES (100, 'Test');",
        "UPDATE ouvrage SET titre = 'Nouveau' WHERE ido = 1;",
        "DELETE FROM avis WHERE score < 2;",
        "TRUNCATE TABLE personne CASCADE;",
    ]
    for q in dangerous_queries:
        is_safe, message = validate_sql_query(q)
        assert is_safe is False, f"Devrait être bloqué : {q}"
        assert "Sécurité" in message


def test_sql_validation_blocked_ddl():
    """
    Vérifie que les requêtes de définition de données (DROP, CREATE, ALTER)
    sont strictement bloquées.
    """
    dangerous_queries = [
        "DROP TABLE ouvrage;",
        "CREATE TABLE hack (id INT);",
        "ALTER TABLE personne ADD COLUMN hack_col VARCHAR(100);"
    ]
    for q in dangerous_queries:
        is_safe, message = validate_sql_query(q)
        assert is_safe is False, f"Devrait être bloqué : {q}"
        assert "Sécurité" in message


def test_sql_validation_blocked_multi_queries():
    """
    Vérifie que les attaques par injection via multi-requêtes (;) sont bloquées.
    """
    dangerous_queries = [
        "SELECT * FROM ouvrage; DROP TABLE personne;",
        "SELECT * FROM ouvrage; SELECT * FROM personne;"
    ]
    for q in dangerous_queries:
        is_safe, message = validate_sql_query(q)
        assert is_safe is False, f"Devrait être bloqué (multi-requêtes) : {q}"
        assert "plusieurs requêtes" in message or "syntaxe" in message


def test_sql_validation_syntax_error():
    """
    Vérifie que les requêtes mal formées provoquent une erreur.
    """
    invalid_query = "SELECT FROM WHERE;"
    is_safe, message = validate_sql_query(invalid_query)
    assert is_safe is False
    assert "syntaxe" in message.lower()


def test_mcp_list_tables():
    """
    Vérifie que list_tables retourne les tables au format JSON.
    """
    res = list_tables()
    data = json.loads(res)
    assert "tables" in data
    assert len(data["tables"]) > 0
    # Doit contenir nos tables de seed
    assert "ouvrage" in data["tables"]
    assert "personne" in data["tables"]


def test_mcp_get_schema_success():
    """
    Vérifie que get_schema retourne les informations de colonnes correctes.
    """
    res = get_schema("personne")
    data = json.loads(res)
    assert "table" in data
    assert data["table"] == "personne"
    assert "schema" in data
    assert len(data["schema"]) > 0
    
    # Doit contenir la colonne idp de type integer
    columns = [col["column"] for col in data["schema"]]
    assert "idp" in columns
    assert "nom" in columns


def test_mcp_get_schema_failure():
    """
    Vérifie get_schema pour une table inexistante.
    """
    res = get_schema("table_qui_n_existe_pas")
    data = json.loads(res)
    assert "error" in data


def test_mcp_execute_query_success():
    """
    Vérifie l'exécution d'une requête SELECT valide via l'outil MCP.
    """
    res = execute_query("SELECT COUNT(*) as nb FROM personne;")
    data = json.loads(res)
    assert data["success"] is True
    assert "data" in data
    assert len(data["data"]) == 1
    assert "nb" in data["data"][0]


def test_mcp_execute_query_security_block():
    """
    Vérifie que execute_query refuse d'exécuter une requête dangereuse.
    """
    res = execute_query("DELETE FROM personne;")
    data = json.loads(res)
    assert "security_error" in data


def test_sql_validation_blocked_system_functions():
    """
    Vérifie que les appels aux fonctions système PostgreSQL dangereuses (pg_sleep, pg_read_file)
    sont interceptés et bloqués par le moteur de sécurité.
    """
    malicious_queries = [
        "SELECT pg_sleep(5);",
        "SELECT pg_read_file('/etc/passwd');",
        "SELECT pg_ls_dir('.');",
        "SELECT * FROM ouvrage WHERE ido = (SELECT pg_sleep(10));"
    ]
    for q in malicious_queries:
        is_safe, message = validate_sql_query(q)
        assert is_safe is False, f"Devrait être bloqué (fonction système hostile) : {q}"
        assert "fonction système" in message or "Sécurité" in message
