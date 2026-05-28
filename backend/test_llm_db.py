import json
import urllib.request
import urllib.error
import psycopg2

# Configuration de la base de données
DB_PARAMS = {
    "dbname": "llm4sql_db",
    "user": "llm4sql_user",
    "password": "llm4sql_password",
    "host": "127.0.0.1",
    "port": "5433"
}

# Configuration d'Ollama
OLLAMA_URL = "http://127.0.0.1:11434/api/generate"
MODEL_NAME = "qwen3.5:9b"

def get_db_schema() -> str:
    """
    Récupère le schéma simplifié des tables de la base de données PostgreSQL.
    
    Returns:
        str: Description textuelle du schéma.
    """
    schema_info = []
    try:
        conn = psycopg2.connect(**DB_PARAMS)
        cur = conn.cursor()
        
        # Récupération des tables
        cur.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public';
        """)
        tables = [row[0] for row in cur.fetchall()]
        
        for table in tables:
            # Récupération des colonnes et types pour chaque table
            cur.execute("""
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = %s;
            """, (table,))
            columns = cur.fetchall()
            col_desc = [f"  - {col[0]} ({col[1]})" for col in columns]
            schema_info.append(f"Table: {table}\n" + "\n".join(col_desc))
            
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Erreur lors de la lecture du schéma : {e}")
        
    return "\n\n".join(schema_info)

def generate_sql_query(prompt_question: str, schema: str) -> str:
    """
    Appelle le modèle Qwen 3.5 via Ollama pour traduire la question en requête SQL.
    
    Args:
        prompt_question (str): Question en langage naturel.
        schema (str): Schéma de la base de données.
        
    Returns:
        str: Requête SQL brute générée.
    """
    system_prompt = (
        "Tu es un expert SQL. Traduis la question en français de l'utilisateur en une requête PostgreSQL valide.\n"
        "Utilise UNIQUEMENT le schéma de base de données fourni ci-dessous.\n"
        "Ne donne AUCUNE explication, aucun texte d'introduction ni de conclusion.\n"
        "Retourne UNIQUEMENT la requête SQL brute, sans bloc de code markdown (pas de ```sql ... ```).\n\n"
        f"Schéma de la base de données :\n{schema}"
    )
    
    payload = {
        "model": MODEL_NAME,
        "prompt": f"{system_prompt}\n\nQuestion : {prompt_question}\nRequête SQL :",
        "stream": False
    }
    
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        OLLAMA_URL, 
        data=data, 
        headers={"Content-Type": "application/json"}
    )
    print(f"Appel d'Ollama ({MODEL_NAME})... Le premier chargement peut prendre du temps...")
    try:
        with urllib.request.urlopen(req, timeout=300) as response:
            res_body = response.read().decode("utf-8")
            res_json = json.loads(res_body)
            raw_sql = res_json.get("response", "").strip()
            # Nettoyage minimal au cas où le modèle ajoute des backticks markdown
            if raw_sql.startswith("```sql"):
                raw_sql = raw_sql[6:]
            if raw_sql.startswith("```"):
                raw_sql = raw_sql[3:]
            if raw_sql.endswith("```"):
                raw_sql = raw_sql[:-3]
            return raw_sql.strip()
    except urllib.error.URLError as e:
        print(f"Erreur de connexion à Ollama : {e}")
        return ""

def execute_query(query: str):
    """
    Exécute la requête SQL générée sur PostgreSQL et affiche les résultats.
    
    Args:
        query (str): La requête SQL à exécuter.
    """
    print(f"\nExécution de la requête :\n{query}\n")
    try:
        conn = psycopg2.connect(**DB_PARAMS)
        cur = conn.cursor()
        cur.execute(query)
        
        # Récupération des noms des colonnes
        colnames = [desc[0] for desc in cur.description]
        print(" | ".join(colnames))
        print("-" * (len(" | ".join(colnames)) + 4))
        
        rows = cur.fetchall()
        for row in rows:
            print(" | ".join(str(val) for val in row))
            
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Erreur d'exécution de la requête : {e}")

if __name__ == "__main__":
    print("--- DÉMARRAGE DU POC LLM4SQL ---")
    
    # 1. Lecture du schéma
    print("1. Récupération du schéma de la base de données...")
    db_schema = get_db_schema()
    print("Schéma trouvé :")
    print(db_schema)
    print("-" * 40)
    
    # 2. Définition de la question
    user_question = "Donne-moi la liste des ouvrages dessinés par Christophe Blain."
    print(f"2. Traduction de la question : '{user_question}'")
    
    # 3. Appel au LLM
    sql_query = generate_sql_query(user_question, db_schema)
    print(f"SQL Générée par le LLM : {sql_query}")
    
    # 4. Exécution sur la base de données
    if sql_query:
        print("\n3. Exécution de la requête générée...")
        execute_query(sql_query)
    else:
        print("Échec de la génération SQL.")
