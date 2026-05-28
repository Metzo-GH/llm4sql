import json
import re
from typing import TypedDict, List, Dict, Any, Optional
from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.graph import StateGraph, END

from config import settings
from mcp_server import list_tables, get_schema, execute_query


# =====================================================================
# 1. Définition de l'état de l'agent (LangGraph State)
# =====================================================================

class AgentState(TypedDict):
    """
    Représente l'état partagé tout au long de l'exécution du graphe LangGraph.
    """
    question: str
    sql_query: Optional[str]
    error_message: Optional[str]
    query_results: Optional[List[Dict[str, Any]]]
    iteration_count: int
    schema_context: str


# =====================================================================
# 2. Fonctions d'aide (Helpers)
# =====================================================================

def get_database_schema_context() -> str:
    """
    Interroge les outils MCP locaux pour récupérer le schéma de toutes les tables 
    et formater un texte clair pour le prompt du LLM.
    
    Returns:
        str: Description structurée du schéma de base de données.
    """
    tables_json = list_tables()
    tables_data = json.loads(tables_json)
    
    if "error" in tables_data:
        return "Impossible de récupérer le schéma de la base de données."
        
    schema_blocks = []
    for table_name in tables_data["tables"]:
        schema_json = get_schema(table_name)
        schema_data = json.loads(schema_json)
        
        if "error" in schema_data:
            continue
            
        columns_desc = []
        for col in schema_data["schema"]:
            null_status = "NULL" if col["nullable"] else "NOT NULL"
            columns_desc.append(f"  - {col['column']} ({col['type']}) {null_status}")
            
        columns_text = "\n".join(columns_desc)
        schema_blocks.append(f"Table '{table_name}' :\n{columns_text}")
        
    return "\n\n".join(schema_blocks)


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
    """
    # Charger l'instance Ollama avec une température de 0 pour la précision et le déterminisme
    llm = ChatOllama(
        model=settings.OLLAMA_MODEL,
        base_url=settings.OLLAMA_BASE_URL,
        temperature=0.0
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
    """
    sql = state["sql_query"]
    if not sql:
        return {
            "error_message": "Aucune requête SQL n'a été générée.",
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

def run_agent(question: str) -> Dict[str, Any]:
    """
    Interface simple pour lancer l'agent sur une question utilisateur.
    Elle pré-remplit le schéma contextuel et gère l'état initial.
    
    Args:
        question (str): La question de l'utilisateur.
        
    Returns:
        Dict[str, Any]: L'état final après exécution du graphe.
    """
    # 1. Récupérer dynamiquement le schéma de la base
    schema_context = get_database_schema_context()
    
    # 2. Définir l'état de départ
    initial_state: AgentState = {
        "question": question,
        "sql_query": None,
        "error_message": None,
        "query_results": None,
        "iteration_count": 0,
        "schema_context": schema_context
    }
    
    # 3. Exécuter le graphe
    final_state = agent_app.invoke(initial_state)
    return final_state
