import re
import time
from typing import Dict, Any
from langchain_core.messages import SystemMessage, HumanMessage

from app.core.config import settings
from app.services.agent.state import AgentState, send_agent_event, event_callback_var
from app.services.agent.llm_provider import get_llm
from app.services.agent.schema import get_dynamic_schema_context
from app.services.agent.sql_utils import extract_sql_query


def node_generate_sql(state: AgentState) -> Dict[str, Any]:
    """
    Nœud de génération SQL. Reçoit la question et l'état actuel,
    et interroge le LLM Ollama local pour obtenir la requête PostgreSQL SELECT correspondante.
    """
    iteration = state["iteration_count"] + 1
    model_name = state.get("model") or settings.OLLAMA_MODEL
    send_agent_event("log", f"[ETAPE 1 - GENERATION SQL] (Essai #{iteration}) Réflexion du LLM ({model_name}) en cours...")
    print(f"\n[ETAPE 1 - GENERATION SQL] (Essai #{iteration})")
    print(f"  Réflexion du LLM ({model_name}) en cours...")
    
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

    temp = state.get("temperature") if state.get("temperature") is not None else 0.0
    ctx_size = state.get("context_size") if state.get("context_size") is not None else 0

    # Résoudre la taille de contexte réelle si 0 (Défaut Ollama)
    reported_ctx_size = ctx_size
    if reported_ctx_size == 0:
        from app.services.agent.llm_provider import get_model_context_length
        reported_ctx_size = get_model_context_length(model_name)

    # Estimer le nombre de tokens du prompt
    prompt_content = system_prompt + "\n" + "\n".join(m.content for m in messages[1:])
    estimated_prompt_tokens = len(prompt_content) // 3
    send_agent_event("context_usage", {
        "prompt_tokens": estimated_prompt_tokens,
        "context_size": reported_ctx_size,
        "estimated": True
    })

    llm = get_llm(model=model_name, temperature=temp, context_size=ctx_size)
    
    callback = event_callback_var.get()
    if callback:
        content_parts = []
        full_metadata = {}
        has_started_thinking = False
        has_finished_thinking = False
        
        for chunk in llm.stream(messages):
            reasoning_content = chunk.additional_kwargs.get("reasoning_content", "")
            content = chunk.content
            
            # Gérer le début de la réflexion
            if reasoning_content and not has_started_thinking:
                send_agent_event("token", "<think>")
                content_parts.append("<think>")
                has_started_thinking = True
                
            # Gérer la fin de la réflexion (transition vers le contenu normal)
            if content and has_started_thinking and not has_finished_thinking:
                send_agent_event("token", "</think>")
                content_parts.append("</think>")
                has_finished_thinking = True
                
            # Envoyer le token approprié
            if reasoning_content:
                send_agent_event("token", reasoning_content)
                content_parts.append(reasoning_content)
            elif content:
                if has_started_thinking and not has_finished_thinking:
                    send_agent_event("token", "</think>")
                    content_parts.append("</think>")
                    has_finished_thinking = True
                send_agent_event("token", content)
                content_parts.append(content)
                
            if chunk.response_metadata:
                full_metadata.update(chunk.response_metadata)
                
        if has_started_thinking and not has_finished_thinking:
            send_agent_event("token", "</think>")
            content_parts.append("</think>")
            
        generated_content = "".join(content_parts)
        from langchain_core.messages import AIMessage
        response = AIMessage(content=generated_content, response_metadata=full_metadata)
    else:
        response = llm.invoke(messages)
        reasoning_content = response.additional_kwargs.get("reasoning_content")
        if reasoning_content:
            response.content = f"<think>\n{reasoning_content}\n</think>\n{response.content}"
    
    print(f"  [REPONSE BRUTE DU LLM] :")
    print(f"  --- DEBUT REPONSE ---")
    print(response.content)
    print(f"  --- FIN REPONSE ---")
    
    metadata = getattr(response, "response_metadata", {})
    prompt_tokens = metadata.get("prompt_eval_count", 0) or estimated_prompt_tokens
    eval_tokens = metadata.get("eval_count", 0)
    eval_duration = metadata.get("eval_duration", 0)
    
    if not isinstance(prompt_tokens, (int, float)):
        prompt_tokens = estimated_prompt_tokens
    if not isinstance(eval_tokens, (int, float)):
        eval_tokens = 0
    if not isinstance(eval_duration, (int, float)):
        eval_duration = 0
        
    tokens_per_sec = 0.0
    if eval_tokens > 0 and eval_duration > 0:
        tokens_per_sec = round(eval_tokens / (eval_duration * 1e-9), 2)
        
    send_agent_event("context_usage", {
        "prompt_tokens": prompt_tokens,
        "eval_tokens": eval_tokens,
        "context_size": reported_ctx_size,
        "estimated": False
    })
    
    generated_sql = extract_sql_query(response.content)
    elapsed = time.time() - start_time
    print(f"  [OK] SQL généré en {elapsed:.2f}s (Tokens/s: {tokens_per_sec})")
    send_agent_event("log", f"  [REPONSE BRUTE DU LLM] :\n  --- DEBUT REPONSE ---\n{response.content}\n  --- FIN REPONSE ---")
    send_agent_event("log", f"  [OK] SQL généré en {elapsed:.2f}s (Tokens/s: {tokens_per_sec})")
    
    step_info = {
        "node": "generate_sql",
        "iteration": iteration,
        "elapsed": round(elapsed, 3),
        "sql_query": generated_sql,
        "prompt_tokens": prompt_tokens,
        "eval_tokens": eval_tokens,
        "tokens_per_second": tokens_per_sec,
        "model": model_name,
        "context_size": reported_ctx_size
    }
    
    return {
        "sql_query": generated_sql,
        "steps": [step_info]
    }
