import json
import re
from typing import TypedDict, List, Dict, Any, Optional
from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.graph import StateGraph, END

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


# =====================================================================
# 2. Fonctions d'aide (Helpers)
# =====================================================================

# Variable de cache globale en mémoire pour éviter les requêtes DB répétées en local
_SCHEMA_CACHE: Optional[str] = None


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
    conn = None
    cur = None
    try:
        conn = get_db_connection(readonly=True)
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
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


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

def node_generate_sql(state: AgentState) -> Dict[str, Any]:
    """
    Nœud de génération SQL. Reçoit la question et l'état actuel (y compris les erreurs passées),
    et interroge le LLM Ollama local pour obtenir la requête PostgreSQL SELECT correspondante.
    
    Args:
        state (AgentState): L'état courant du graphe.
        
    Returns:
        Dict[str, Any]: Dictionnaire de mise à jour de l'état (sql_query).
    """
    # Charger l'instance Ollama avec une température de 0 pour la précision et le déterminisme
    llm = ChatOllama(
        model=settings.OLLAMA_MODEL,
        base_url=settings.OLLAMA_BASE_URL,
        temperature=0.0,
        keep_alive=-1 # Force le maintien en RAM après la requête pour éviter les lenteurs
    )

    # Contextualisation Few-Shot (RAG statique ultra-performant)
    few_shot_examples = """
Voici des exemples de traduction de questions en français vers PostgreSQL :

Exemple 1 :
Question : "les ouvrages sortis en 2021"
SQL :
```sql
SELECT ido, titre FROM ouvrage WHERE EXTRACT(YEAR FROM date_sortie) = 2021;
```

Exemple 2 :
Question : "les ouvrages dessinés par Christophe Blain"
SQL :
```sql
SELECT o.ido, o.titre FROM ouvrage o JOIN personne p ON o.dessinateur = p.idp WHERE p.nom = 'Blain' AND p.prenom = 'Christophe';
```

Exemple 3 :
Question : "les ouvrages dessinés par Christophe Blain et scénarisés par Joann Sfar"
SQL :
```sql
SELECT o.ido, o.titre FROM ouvrage o JOIN personne p1 ON o.dessinateur = p1.idp JOIN personne p2 ON o.scenariste = p2.idp WHERE p1.nom = 'Blain' AND p1.prenom = 'Christophe' AND p2.nom = 'Sfar' AND p2.prenom = 'Joann';
```

Exemple 4 :
Question : "le nombre d'avis, le plus petit score, le plus grand score et le score moyen de chaque ouvrage"
SQL :
```sql
SELECT ido, titre, COUNT(score) AS nb_avis, MIN(score) AS score_min, MAX(score) AS score_max, ROUND(AVG(score), 2) AS score_moy FROM ouvrage LEFT JOIN avis USING (ido) GROUP BY ido, titre;
```
"""

    system_prompt = f"""Tu es un traducteur expert spécialisé en base de données PostgreSQL.
Ta mission est de convertir la question en français de l'utilisateur en une requête SQL SELECT valide, hautement performante et sécurisée.

Voici la structure de la base de données :
{state["schema_context"]}

{few_shot_examples}

Règles cruciales à respecter :
1. Génère UNIQUEMENT une instruction SELECT en lecture seule.
2. N'utilise jamais de requêtes d'altération ou de modification (DROP, UPDATE, DELETE, INSERT, CREATE, TRUNCATE) sous aucun prétexte.
3. Ne mets aucune explication, commentaire ou texte d'accompagnement. Retourne uniquement le code SQL.
4. Enveloppe impérativement ta requête SQL dans un bloc de code Markdown ```sql ... ```.
"""

    # Construire l'historique des messages pour la boucle de rétroaction (Self-Healing)
    messages = [SystemMessage(content=system_prompt)]
    
    if state["error_message"] and state["sql_query"]:
        # Si une erreur est survenue lors de l'essai précédent, on passe un message de correction
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

    # Appeler le LLM local
    response = llm.invoke(messages)
    
    # Extraire et nettoyer la requête SQL de la réponse
    generated_sql = extract_sql_query(response.content)
    
    return {
        "sql_query": generated_sql
    }


def node_execute_sql(state: AgentState) -> Dict[str, Any]:
    """
    Nœud d'exécution SQL. Prend la requête SQL générée par le nœud précédent,
    l'exécute de manière sécurisée via le serveur MCP, et stocke le résultat ou l'erreur.
    
    Args:
        state (AgentState): L'état courant du graphe.
        
    Returns:
        Dict[str, Any]: Dictionnaire de mise à jour de l'état (query_results, error_message, iteration_count).
    """
    sql = state["sql_query"]
    if not sql:
        return {
            "error_message": "Aucune requête SQL n'a été générée.",
            "iteration_count": state["iteration_count"] + 1
        }
        
    if state.get("simulate_only"):
        # Mode Simulation : Ne pas exécuter la requête
        return {
            "query_results": [],
            "error_message": None,
            "iteration_count": state["iteration_count"] + 1
        }
        
    # Exécuter la requête SQL via l'outil sécurisé du serveur MCP
    execution_result_str = execute_query(sql)
    execution_result = json.loads(execution_result_str)
    
    if "security_error" in execution_result:
        return {
            "error_message": f"Alerte de Sécurité : {execution_result['security_error']}",
            "iteration_count": state["iteration_count"] + 1
        }
        
    if not execution_result.get("success", False):
        return {
            "error_message": execution_result.get("db_error", "Erreur d'exécution inconnue."),
            "iteration_count": state["iteration_count"] + 1
        }
        
    # Succès
    return {
        "query_results": execution_result.get("data", []),
        "error_message": None, # Efface l'erreur
        "iteration_count": state["iteration_count"] + 1
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
        return END
        
    # Si on a atteint la limite de 3 tentatives de correction, on s'arrête aussi pour éviter une boucle infinie
    if state["iteration_count"] >= 3:
        return END
        
    # Sinon, on retourne au nœud de génération pour corriger
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
    workflow.add_node("generate_sql", node_generate_sql)
    workflow.add_node("execute_sql", node_execute_sql)
    
    # Définir l'entrée
    workflow.set_entry_point("generate_sql")
    
    # Définir les liens et transitions
    workflow.add_edge("generate_sql", "execute_sql")
    workflow.add_conditional_edges("execute_sql", should_continue)
    
    # Compiler le graphe
    return workflow.compile()


# Instance compilée prête à l'utilisation
agent_app = create_agent_graph()


# =====================================================================
# 5. Interface d'entrée simplifiée (API interne)
# =====================================================================

def run_agent(question: str, custom_schema: Optional[str] = None, simulate_only: bool = False) -> Dict[str, Any]:
    """
    Interface simple de haut niveau pour lancer l'agent sur une question utilisateur.
    Elle pré-remplit le schéma contextuel et gère l'état initial.
    
    Args:
        question (str): La question en français de l'utilisateur.
        custom_schema (Optional[str]): Schéma personnalisé fourni par l'utilisateur.
        simulate_only (bool): Si vrai, l'agent ne tente pas d'exécuter la requête SQL.
        
    Returns:
        Dict[str, Any]: L'état final après exécution complète du graphe.
    """
    # 1. Déterminer le schéma à utiliser
    schema_context = custom_schema if custom_schema else get_database_schema_context()
    
    # 2. Définir l'état de départ
    initial_state: AgentState = {
        "question": question,
        "sql_query": None,
        "error_message": None,
        "query_results": None,
        "iteration_count": 0,
        "schema_context": schema_context,
        "simulate_only": simulate_only
    }
    
    # 3. Exécuter le graphe
    final_state = agent_app.invoke(initial_state)
    return final_state
