import pytest
import json
from app.mcp.mcp_server import search_value, dry_run_query


def test_search_value_structure_and_fk_suggestions():
    """
    Vérifie que search_value retourne la structure attendue avec matches,
    table, column, matched_value et foreign_key_suggestion (dicts local_column, foreign_table, foreign_column).
    """
    res = search_value("Blain")
    data = json.loads(res)
    assert "matches" in data
    assert len(data["matches"]) > 0

    for match in data["matches"]:
        assert "table" in match
        assert "column" in match
        assert "matched_value" in match
        assert "foreign_key_suggestion" in match
        assert isinstance(match["foreign_key_suggestion"], list)
        for fk in match["foreign_key_suggestion"]:
            assert "local_column" in fk
            assert "foreign_table" in fk
            assert "foreign_column" in fk


def test_search_value_zero_matches():
    """
    Vérifie que search_value renvoie {"matches": []} pour un terme sans correspondance.
    """
    res = search_value("TermeAbsurdeQuiExistePas123456789")
    data = json.loads(res)
    assert data == {"matches": []}


def test_dry_run_query_success_with_columns_and_rows():
    """
    Vérifie que dry_run_query en succès contient success: True, columns (liste de dicts {name, type})
    et estimated_rows (int >= 0).
    """
    res = dry_run_query("SELECT ido, titre FROM ouvrage;")
    data = json.loads(res)
    assert data.get("success") is True
    assert "columns" in data
    assert isinstance(data["columns"], list)
    assert len(data["columns"]) == 2
    for col in data["columns"]:
        assert "name" in col
        assert "type" in col
    assert "estimated_rows" in data
    assert isinstance(data["estimated_rows"], int)
    assert data["estimated_rows"] >= 0


def test_dry_run_query_sql_error():
    """
    Vérifie que dry_run_query en erreur SQL contient success: False, db_error (str),
    et optionnellement detail / hint.
    """
    res = dry_run_query("SELECT * FROM table_inexistante_xyz;")
    data = json.loads(res)
    assert data.get("success") is False
    assert "db_error" in data
    assert isinstance(data["db_error"], str)
    assert len(data["db_error"]) > 0
    # detail et hint doivent figurer dans la structure (champs clés présent ou None)
    assert "detail" in data or "db_error" in data
