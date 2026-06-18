import json
import re
import time
import threading
import operator
from typing import TypedDict, List, Dict, Any, Optional, Annotated
from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.graph import StateGraph, END
import sqlglot
from sqlglot import exp

from app.core.config import settings
from app.database.connection import get_db_connection
from app.mcp.mcp_server import list_tables, get_schema, execute_query


# =====================================================================
# 1. Définition de l'état de l'agent (LangGraph State)
# =====================================================================

class AgentState(TypedDict):
    """
    Représente l'état partagé tout au long de l'exécution du graphe LangGraph.
    
    Attributes:
        question (str): La question posée par l'utilisateur en français.
        sql_query (Optional[str]): La requête SQL générée par le nœud SQL_Generator.
        error_message (Optional[str]): Message d'erreur SQL ou de sécurité si l'exécution échoue.
        query_results (Optional[List[Dict[str, Any]]]): Données retournées par PostgreSQL si succès.
        iteration_count (int): Compteur d'itérations pour limiter les essais de correction.
        schema_context (str): Description structurée du schéma injectée dans le prompt.
    """
    question: str
    sql_query: Optional[str]
    error_message: Optional[str]
    query_results: Optional[List[Dict[str, Any]]]
    iteration_count: int
    schema_context: str
    simulate_only: bool
    steps: Annotated[List[Dict[str, Any]], operator.add]
    tables: List[str]
    model: Optional[str]
    temperature: Optional[float]
    context_size: Optional[int]


# =====================================================================
# 2. Fonctions d'aide (Helpers)
# =====================================================================

# Variable de cache globale en mémoire pour éviter les requêtes DB répétées en local
_SCHEMA_CACHE: Optional[str] = None

# Verrou et cache des singletons LLM pour garantir la flexibilité et de bonnes performances
_llm_lock = threading.Lock()
_llm_cache: Dict[str, ChatOllama] = {}

def get_llm(model: Optional[str] = None, temperature: float = 0.0, context_size: int = 4096) -> ChatOllama:
    """
    Récupère ou initialise de manière paresseuse un singleton ChatOllama pour une configuration donnée.
    Cette méthode est thread-safe pour éviter les instanciations concurrentes.
    
    Returns:
        ChatOllama: L'instance unique du client LLM local.
    """
    global _llm_cache
    if not model:
        model = settings.OLLAMA_MODEL
        
    cache_key = f"{model}_{temperature}_{context_size}"
    
    if cache_key not in _llm_cache:
        with _llm_lock:
            if cache_key not in _llm_cache:
                _llm_cache[cache_key] = ChatOllama(
                    model=model,
                    base_url=settings.OLLAMA_BASE_URL,
                    temperature=temperature,
                    num_ctx=context_size,
                    keep_alive=-1
                )
    return _llm_cache[cache_key]


def get_database_schema_context() -> str:
    """
    Récupère le schéma de toutes les tables en une seule requête (résout le pattern N+1)
    et le met en cache en mémoire pour accélérer les appels futurs.
    
    Returns:
        str: Description structurée du schéma de la base de données.
    """
    global _SCHEMA_CACHE
    if _SCHEMA_CACHE is not None:
        return _SCHEMA_CACHE

    query = """
        SELECT 
            table_name, 
            column_name, 
            data_type, 
            is_nullable
        FROM 
            information_schema.columns 
        WHERE 
            table_schema IN ('user_sandbox', 'public')
        ORDER BY 
            table_name, 
            ordinal_position;
    """
    try:
        # Utilisation de context managers imbriqués pour garantir une fermeture propre et déterministe
        with get_db_connection(readonly=True) as conn:
            with conn.cursor() as cur:
                cur.execute("SET search_path TO user_sandbox, public;")
                cur.execute(query)
                rows = cur.fetchall()
                
                # Organiser par table
                tables = {}
                for row in rows:
                    t_name, c_name, d_type, is_null = row
                    if t_name not in tables:
                        tables[t_name] = []
                    null_status = "NULL" if is_null == "YES" else "NOT NULL"
                    tables[t_name].append(f"  - {c_name} ({d_type}) {null_status}")
                
                schema_blocks = []
                for t_name, columns in sorted(tables.items()):
                    columns_text = "\n".join(columns)
                    schema_blocks.append(f"Table '{t_name}' :\n{columns_text}")
                    
                _SCHEMA_CACHE = "\n\n".join(schema_blocks)
                return _SCHEMA_CACHE
    except Exception as e:
        return f"Erreur lors de la récupération du schéma : {str(e)}"


def extract_sql_query(text: str) -> str:
    """
    Extrait la requête SQL brute d'une réponse de LLM.
    Gère les blocs de code Markdown de type ```sql ... ``` ou ``` ... ```.
    
    Args:
        text (str): La réponse textuelle brute du LLM.
        
    Returns:
        str: La requête SQL nettoyée.
    """
    # Chercher les blocs ```sql ... ```
    match = re.search(r"```sql(.*?)```", text, re.DOTALL | re.IGNORECASE)
    if match:
        return match.group(1).strip()
    
    # Chercher des blocs ``` ... ``` génériques
    match_generic = re.search(r"```(.*?)```", text, re.DOTALL)
    if match_generic:
        return match_generic.group(1).strip()
        
    return text.strip()


# =====================================================================
# 3. Construction des Nœuds du Graphe (Graph Nodes)
# =====================================================================

def extract_tables_from_sql(sql: str) -> List[str]:
    """
    Extrait la liste des tables impliquées dans une requête SQL via sqlglot.
    
    Args:
        sql (str): Requête SQL.
        
    Returns:
        List[str]: Liste des noms de tables en minuscules.
    """
    if not sql:
        return []
    try:
        parsed = sqlglot.parse_one(sql.strip(), read="postgres")
        tables = [t.name.lower() for t in parsed.find_all(exp.Table)]
        return list(set(tables))
    except Exception:
        import re
        matches = re.findall(r'\b(?:from|join)\s+(\w+)', sql, re.IGNORECASE)
        return list(set(m.lower() for m in matches))


def get_dynamic_schema_context(selected_tables: List[str]) -> str:
    """
    Récupère le schéma détaillé uniquement pour les tables sélectionnées.
    Si la liste est vide, récupère le schéma de toutes les tables en fallback.
    """
    if not selected_tables:
        return get_database_schema_context()
        
    schema_blocks = []
    for t_name in selected_tables:
        try:
            schema_str = get_schema(t_name)
            schema_data = json.loads(schema_str)
            if "schema" in schema_data:
                columns = []
                for col in schema_data["schema"]:
                    c_name = col["column"]
                    d_type = col["type"]
                    null_status = "NULL" if col["nullable"] else "NOT NULL"
                    columns.append(f"  - {c_name} ({d_type}) {null_status}")
                columns_text = "\n".join(columns)
                schema_blocks.append(f"Table '{t_name}' :\n{columns_text}")
            else:
                print(f"  [WARNING] get_schema pour '{t_name}' a retourné : {schema_str}")
        except Exception as e:
            print(f"  [ERROR] Erreur lors de la récupération du schéma pour '{t_name}' : {e}")
            
    if not schema_blocks:
        return get_database_schema_context()
        
    return "\n\n".join(schema_blocks)


def node_select_tables(state: AgentState) -> Dict[str, Any]:
    """
    Nœud de sélection des tables. Identifie les tables pertinentes pour la question
    afin de réduire la taille du prompt.
    """
    print(f"\n[ETAPE 0 - SELECTION TABLES]")
    print(f"  Identification des tables requises...")
    
    start_time = time.time()
    
    try:
        tables_json = list_tables()
        all_tables = json.loads(tables_json).get("tables", [])
    except Exception as e:
        print(f"  [ERROR] Échec de la récupération des tables via MCP : {e}")
        all_tables = []
        
    if not all_tables:
        return {
            "tables": [],
            "steps": [{
                "node": "select_tables",
                "elapsed": round(time.time() - start_time, 3),
                "success": False,
                "error": "Aucune table disponible"
            }]
        }
        
    system_prompt = f"""Tu es un assistant expert en base de données PostgreSQL.
Ta tâche est de lister UNIQUEMENT les noms des tables nécessaires pour répondre à la question de l'utilisateur.

Voici la liste de toutes les tables disponibles :
{json.dumps(all_tables)}

Règles à respecter strictement :
1. Réponds UNIQUEMENT avec un tableau JSON valide contenant les noms des tables sélectionnées (ex: ["ouvrage", "personne"]).
2. Ne mets aucune explication, aucun texte d'accompagnement.
3. Si aucune table n'est nécessaire ou si la question ne concerne pas la base de données, réponds avec un tableau vide `[]`.
"""

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=f"Question de l'utilisateur : {state['question']}")
    ]
    
    model_name = state.get("model") or settings.OLLAMA_MODEL
    temp = state.get("temperature") if state.get("temperature") is not None else 0.0
    ctx_size = state.get("context_size") or 4096

    llm = get_llm(model=model_name, temperature=temp, context_size=ctx_size)
    response = llm.invoke(messages)
    
    # Nettoyage et parsing du JSON
    content = response.content.strip()
    if "```" in content:
        match = re.search(r"```(?:json)?\s*(.*?)\s*```", content, re.DOTALL | re.IGNORECASE)
        if match:
            content = match.group(1).strip()
            
    selected_tables = []
    try:
        parsed = json.loads(content)
        if isinstance(parsed, list):
            all_tables_lower = {t.lower(): t for t in all_tables}
            for t in parsed:
                if isinstance(t, str) and t.lower() in all_tables_lower:
                    selected_tables.append(all_tables_lower[t.lower()])
    except Exception:
        # Fallback regex simple
        content_lower = content.lower()
        for t in all_tables:
            if t.lower() in content_lower:
                selected_tables.append(t)
                
    # Déduplication
    selected_tables = list(dict.fromkeys(selected_tables))
    
    # Si vide, fallback sur toutes les tables
    if not selected_tables:
        print("  [WARNING] Aucune table sélectionnée. Utilisation du fallback (toutes les tables).")
        selected_tables = all_tables

    elapsed = time.time() - start_time
    print(f"  [OK] Tables sélectionnées en {elapsed:.2f}s : {selected_tables}")
    
    step_info = {
        "node": "select_tables",
        "elapsed": round(elapsed, 3),
        "selected_tables": selected_tables,
        "model": model_name
    }
    
    return {
        "tables": selected_tables,
        "steps": [step_info]
    }


def node_generate_sql(state: AgentState) -> Dict[str, Any]:
    """
    Nœud de génération SQL. Reçoit la question et l'état actuel,
    et interroge le LLM Ollama local pour obtenir la requête PostgreSQL SELECT correspondante.
    """
    iteration = state["iteration_count"] + 1
    print(f"\n[ETAPE 1 - GENERATION SQL] (Essai #{iteration})")
    print(f"  Réflexion du LLM ({settings.OLLAMA_MODEL}) en cours...")
    
    start_time = time.time()

    # Déterminer le schéma à utiliser : personnalisé ou dynamique
    if state.get("schema_context"):
        schema_context = state["schema_context"]
    else:
        schema_context = get_dynamic_schema_context(state.get("tables", []))

    # Exemples Few-Shot condensés (2 exemples d'or complets)
    few_shot_examples = """
Voici des exemples illustrant le style d'écriture SQL, la syntaxe PostgreSQL et le formatage attendus :

Exemple 1 (Jointures, Filtres temporels, Agrégations et Histogramme/Pivot) :
Question : "Donner pour chaque produit créé en 2024 le total des ventes et le nombre de ventes à prix fort (>= 50) ou promo (< 50)"
SQL :
```sql
SELECT 
    p.id_produit, 
    p.nom_produit,
    COUNT(v.id_vente) AS nb_ventes,
    SUM(CASE WHEN v.prix_unitaire >= 50 THEN 1 ELSE 0 END) AS ventes_prix_fort,
    SUM(CASE WHEN v.prix_unitaire < 50 THEN 1 ELSE 0 END) AS ventes_promo
FROM produits p
LEFT JOIN ventes v ON p.id_produit = v.id_produit
WHERE EXTRACT(YEAR FROM p.date_creation) = 2024
GROUP BY p.id_produit, p.nom_produit;
```

Exemple 2 (Hiérarchie récursive via CTE) :
Question : "récupérer récursivement toutes les sous-catégories de la catégorie 'Électronique'"
SQL :
```sql
WITH RECURSIVE hierar_categories AS (
    SELECT id_categorie, nom_categorie, id_categorie_parente
    FROM categories
    WHERE nom_categorie = 'Électronique'
    UNION ALL
    SELECT c.id_categorie, c.nom_categorie, c.id_categorie_parente
    FROM categories c
    JOIN hierar_categories hc ON c.id_categorie_parente = hc.id_categorie
)
SELECT id_categorie, nom_categorie, id_categorie_parente 
FROM hierar_categories;
```
"""

    system_prompt = f"""Tu es un traducteur expert spécialisé en base de données PostgreSQL.
Ta mission est de convertir la question en français de l'utilisateur en une requête SQL SELECT valide, performante et sécurisée.

Voici la structure de la base de données :
{schema_context}

{few_shot_examples}

Règles à respecter strictement :
1. Génère UNIQUEMENT une instruction SELECT en lecture seule.
2. N'utilise jamais de requêtes d'altération ou de modification (DROP, UPDATE, DELETE, INSERT, CREATE, TRUNCATE) sous aucun prétexte.
3. Ne mets aucune explication, commentaire ou texte d'accompagnement. Retourne uniquement le code SQL.
4. Enveloppe impérativement ta requête SQL dans un bloc de code Markdown ```sql ... ```.
"""

    messages = [SystemMessage(content=system_prompt)]
    
    if state.get("error_message") and state.get("sql_query"):
        correction_message = f"""Lors de ta précédente tentative, tu as généré cette requête SQL :
```sql
{state["sql_query"]}
```

Mais cette requête a échoué avec l'erreur suivante retournée par PostgreSQL :
{state["error_message"]}

Analyse cette erreur et le schéma fourni, puis génère une requête SQL corrigée et valide.
"""
        messages.append(HumanMessage(content=f"Question initiale : {state['question']}"))
        messages.append(HumanMessage(content=correction_message))
    else:
        messages.append(HumanMessage(content=f"Question à traduire : {state['question']}"))

    model_name = state.get("model") or settings.OLLAMA_MODEL
    temp = state.get("temperature") if state.get("temperature") is not None else 0.0
    ctx_size = state.get("context_size") or 4096

    llm = get_llm(model=model_name, temperature=temp, context_size=ctx_size)
    response = llm.invoke(messages)
    
    print(f"  [REPONSE BRUTE DU LLM] :")
    print(f"  --- DEBUT REPONSE ---")
    print(response.content)
    print(f"  --- FIN REPONSE ---")
    
    metadata = getattr(response, "response_metadata", {})
    prompt_tokens = metadata.get("prompt_eval_count", 0)
    eval_tokens = metadata.get("eval_count", 0)
    eval_duration = metadata.get("eval_duration", 0)
    
    if not isinstance(prompt_tokens, (int, float)):
        prompt_tokens = 0
    if not isinstance(eval_tokens, (int, float)):
        eval_tokens = 0
    if not isinstance(eval_duration, (int, float)):
        eval_duration = 0
        
    tokens_per_sec = 0.0
    if eval_tokens > 0 and eval_duration > 0:
        tokens_per_sec = round(eval_tokens / (eval_duration * 1e-9), 2)
        
    generated_sql = extract_sql_query(response.content)
    elapsed = time.time() - start_time
    print(f"  [OK] SQL généré en {elapsed:.2f}s (Tokens/s: {tokens_per_sec})")
    
    step_info = {
        "node": "generate_sql",
        "iteration": iteration,
        "elapsed": round(elapsed, 3),
        "sql_query": generated_sql,
        "prompt_tokens": prompt_tokens,
        "eval_tokens": eval_tokens,
        "tokens_per_second": tokens_per_sec,
        "model": model_name,
        "context_size": ctx_size
    }
    
    return {
        "sql_query": generated_sql,
        "steps": [step_info]
    }


def node_execute_sql(state: AgentState) -> Dict[str, Any]:
    """
    Nœud d'exécution SQL. Prend la requête SQL générée par le nœud précédent,
    l'exécute de manière sécurisée via le serveur MCP, et stocke le résultat ou l'erreur.
    """
    sql = state["sql_query"]
    iteration = state["iteration_count"] + 1
    
    # Extraire les tables impliquées
    tables_involved = extract_tables_from_sql(sql) if sql else []
    
    if not sql:
        print("\n[ETAPE 2 - EXECUTION SQL] Aucune requete SQL a executer.")
        return {
            "error_message": "Aucune requete SQL n'a ete generee.",
            "iteration_count": iteration,
            "steps": [{
                "node": "execute_sql",
                "iteration": iteration,
                "elapsed": 0.0,
                "success": False,
                "error": "Aucune requête SQL n'a été générée."
            }],
            "tables": []
        }
        
    if state.get("simulate_only"):
        print("\n[ETAPE 2 - EXECUTION SQL] Mode simulation active. Pas d'execution physique.")
        return {
            "query_results": [],
            "error_message": None,
            "iteration_count": iteration,
            "steps": [{
                "node": "execute_sql",
                "iteration": iteration,
                "elapsed": 0.0,
                "success": True,
                "row_count": 0,
                "simulation": True
            }],
            "tables": tables_involved
        }
        
    print(f"\n[ETAPE 2 - EXECUTION SQL] Execution de la requete sur PostgreSQL...")
    start_time = time.time()
    
    # Exécuter la requête SQL via l'outil sécurisé du serveur MCP
    execution_result_str = execute_query(sql)
    execution_result = json.loads(execution_result_str)
    
    elapsed = time.time() - start_time
    
    if "security_error" in execution_result:
        err_msg = f"Alerte de Securite : {execution_result['security_error']}"
        print(f"  [ERROR] Alerte Securite ({elapsed:.2f}s) : {execution_result['security_error']}")
        return {
            "error_message": err_msg,
            "iteration_count": iteration,
            "steps": [{
                "node": "execute_sql",
                "iteration": iteration,
                "elapsed": round(elapsed, 3),
                "success": False,
                "error": err_msg
            }],
            "tables": tables_involved
        }
        
    if not execution_result.get("success", False):
        db_err = execution_result.get("db_error", "Erreur d'execution inconnue.")
        print(f"  [ERROR] Echec de l'execution ({elapsed:.2f}s) : {db_err}")
        return {
            "error_message": db_err,
            "iteration_count": iteration,
            "steps": [{
                "node": "execute_sql",
                "iteration": iteration,
                "elapsed": round(elapsed, 3),
                "success": False,
                "error": db_err
            }],
            "tables": tables_involved
        }
        
    # Succès
    data_rows = execution_result.get("data", [])
    print(f"  [OK] Requete executee avec succes en {elapsed:.2f}s ({len(data_rows)} ligne(s) retournee(s)).")
    return {
        "query_results": data_rows,
        "error_message": None,
        "iteration_count": iteration,
        "steps": [{
            "node": "execute_sql",
            "iteration": iteration,
            "elapsed": round(elapsed, 3),
            "success": True,
            "row_count": len(data_rows)
        }],
        "tables": tables_involved
    }


# =====================================================================
# 4. Construction et Compilation du Graphe (LangGraph Workflow)
# =====================================================================

def should_continue(state: AgentState) -> str:
    """
    Edge conditionnel pour décider si on continue la boucle d'auto-correction (Self-Healing)
    ou si on s'arrête (succès ou limite d'itérations atteinte).
    
    Args:
        state (AgentState): L'état courant.
        
    Returns:
        str: Le nom du nœud cible ("generate_sql" ou END).
    """
    # S'il n'y a pas d'erreur, on s'arrête
    if state["error_message"] is None:
        print("\n[FIN] Requete resolue avec succes et validee !")
        return END
        
    # Si on a atteint la limite de 3 tentatives de correction, on s'arrête aussi pour éviter une boucle infinie
    if state["iteration_count"] >= 3:
        print(f"\n[FIN] Limite d'iterations d'auto-correction atteinte ({state['iteration_count']}/3). Abandon.")
        return END
        
    # Sinon, on retourne au nœud de génération pour corriger
    print(f"\n[AUTO-CORRECTION] Une erreur est survenue. Lancement de la correction automatique (Tentative #{state['iteration_count'] + 1}/3)...")
    return "generate_sql"


def create_agent_graph() -> StateGraph:
    """
    Crée et compile le graphe LangGraph.
    
    Returns:
        StateGraph: Le graphe compilé et exécutable.
    """
    # Initialiser le constructeur de graphe d'état
    workflow = StateGraph(AgentState)
    
    # Ajouter nos nœuds logiques
    workflow.add_node("select_tables", node_select_tables)
    workflow.add_node("generate_sql", node_generate_sql)
    workflow.add_node("execute_sql", node_execute_sql)
    
    # Définir l'entrée
    workflow.set_entry_point("select_tables")
    
    # Définir les liens et transitions
    workflow.add_edge("select_tables", "generate_sql")
    workflow.add_edge("generate_sql", "execute_sql")
    workflow.add_conditional_edges("execute_sql", should_continue)
    
    # Compiler le graphe
    return workflow.compile()


# Instance compilée prête à l'utilisation
agent_app = create_agent_graph()


# =====================================================================
# 5. Interface d'entrée simplifiée (API interne)
# =====================================================================

def run_agent(
    question: str, 
    custom_schema: Optional[str] = None, 
    simulate_only: bool = False,
    model: Optional[str] = None,
    temperature: Optional[float] = None,
    context_size: Optional[int] = None
) -> Dict[str, Any]:
    """
    Interface simple de haut niveau pour lancer l'agent sur une question utilisateur.
    Elle intègre la vérification du cache sémantique et la mise en cache des réponses.
    """
    print(f"\n[DEBUT AGENT] Lancement du moteur LangGraph pour la question : '{question}'")
    start_time = time.time()
    
    # 1. Vérification du cache sémantique (RAG Mémoire)
    from app.services.cache import semantic_cache
    active_model = model or settings.OLLAMA_MODEL
    
    cached_res = semantic_cache.check(question, model=active_model)
    if cached_res:
        print(f"[CACHE HIT] Résultat sémantique trouvé pour : '{question}'")
        return {
            "question": question,
            "sql_query": cached_res["sql_query"],
            "error_message": None,
            "query_results": cached_res["query_results"],
            "iteration_count": cached_res["iteration_count"],
            "schema_context": custom_schema or "",
            "simulate_only": simulate_only,
            "steps": [{
                "node": "semantic_cache",
                "elapsed": 0.0,
                "success": True,
                "message": "Récupéré du cache sémantique local (0ms)"
            }],
            "tables": cached_res.get("tables", []),
            "cache_hit": True
        }
    # 2. Déterminer le schéma à utiliser
    schema_context = custom_schema if custom_schema else ""
    
    # 3. Définir l'état de départ
    initial_state: AgentState = {
        "question": question,
        "sql_query": None,
        "error_message": None,
        "query_results": None,
        "iteration_count": 0,
        "schema_context": schema_context,
        "simulate_only": simulate_only,
        "steps": [],
        "tables": [],
        "model": model,
        "temperature": temperature,
        "context_size": context_size
    }
    
    # 4. Exécuter le graphe
    final_state = agent_app.invoke(initial_state)
    
    # 5. Mettre en cache si exécution réussie
    if final_state.get("query_results") is not None and not final_state.get("error_message"):
        semantic_cache.set(
            question=question,
            model=active_model,
            sql_query=final_state["sql_query"],
            query_results=final_state["query_results"],
            iteration_count=final_state["iteration_count"],
            tables=final_state.get("tables", [])
        )
        
    elapsed = time.time() - start_time
    print(f"[FIN AGENT] Cycle complet execute en {elapsed:.2f}s (Auto-corrections : {max(0, final_state['iteration_count'] - 1)}).")
    final_state["cache_hit"] = False
    return final_state
