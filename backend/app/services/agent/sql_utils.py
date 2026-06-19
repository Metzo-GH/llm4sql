import re
from typing import List
import sqlglot
from sqlglot import exp


def extract_sql_query(text: str) -> str:
    """
    Extrait la requête SQL brute d'une réponse de LLM.
    Gère les blocs de code Markdown de type ```sql ... ``` ou ``` ... ```.
    """
    # Retirer le bloc de réflexion s'il est présent (gère le bloc fermé ou non)
    clean_text = text
    if "<think>" in clean_text.lower():
        clean_text = re.sub(r"<think>.*?</think>", "", clean_text, flags=re.DOTALL | re.IGNORECASE)
        clean_text = re.sub(r"<think>.*", "", clean_text, flags=re.DOTALL | re.IGNORECASE)
        
    # Chercher les blocs ```sql ... ``` sur le texte nettoyé
    match = re.search(r"```sql(.*?)```", clean_text, re.DOTALL | re.IGNORECASE)
    if match:
        return match.group(1).strip()
    
    # Chercher des blocs ``` ... ``` génériques
    match_generic = re.search(r"```(.*?)```", clean_text, re.DOTALL)
    if match_generic:
        return match_generic.group(1).strip()
        
    return clean_text.strip()


def extract_tables_from_sql(sql: str) -> List[str]:
    """
    Extrait la liste des tables impliquées dans une requête SQL via sqlglot.
    """
    if not sql:
        return []
    try:
        parsed = sqlglot.parse_one(sql.strip(), read="postgres")
        tables = [t.name.lower() for t in parsed.find_all(exp.Table)]
        return list(set(tables))
    except Exception:
        matches = re.findall(r'\b(?:from|join)\s+(\w+)', sql, re.IGNORECASE)
        return list(set(m.lower() for m in matches))
