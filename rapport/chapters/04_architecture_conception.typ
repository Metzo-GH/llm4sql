// ==============================================================================
// CHAPITRE 4 : CONCEPTION ARCHITECTURALE & MODÉLISATION DU SYSTÈME
// ==============================================================================

= Conception Architecturale & Modélisation du Système

== Topologie Globale et Découpage en Couches

L'architecture logicielle de `LLM4SQL` est structurée en quatre couches bien séparées afin de découpler l'interface utilisateur, l'API d'exposition, l'orchestration de l'agent et la persistance des données :

#v(0.3cm)

#figure(
  image("../Images/architecture_globale.svg", width: 100%),
  caption: [Topologie globale en couches et flux de données de la plateforme LLM4SQL],
)

#v(0.3cm)

Chaque couche assure un rôle précis au sein de l'application :

1. *Couche Présentation (SPA React 19 & TypeScript)* : Interface web développée avec `Vite` et `Tailwind CSS v4`. Elle intègre la réception du flux d'événements serveur (`SSE`), la modélisation relationnelle de schémas, le bac à sable DDL (_Sandbox_) et la virtualisation des jeux de données volumineux via `@tanstack/react-virtual`.
2. *Couche Exposition API & Sécurité (FastAPI)* : Serveur web asynchrone en Python 3.12. Il assure la validation stricte des données entrantes/sortantes via `Pydantic v2`, le filtrage syntaxique par arbre abstrait (`AST`), le rate-limiting avec `slowapi` et le partitionnement du cache sémantique vectoriel.
3. *Couche Agentique & Gouvernance (LangGraph & Serveur MCP)* : Moteur de décision structurant la boucle ReAct @yao2022react et l'auto-correction en cas d'erreur. Les accès à la base de données sont gérés par un serveur d'outils conforme au standard ouvert *Model Context Protocol (MCP)* @anthropic2024mcp.
4. *Couche Persistance & Inférence Locale (PostgreSQL 16 & Ollama)* : Infrastructure locale conteneurisée sous `Docker Compose`. Le serveur `Ollama` exécute le modèle de langage local sélectionné (Mistral, Llama, DeepSeek, Qwen), tandis que la base de données `PostgreSQL 16` est interrogée via un pool asynchrone `psycopg` v3 avec des transactions en lecture seule (`readonly=True`).

== Le Moteur Agentique : Cycle de Décision ReAct et Auto-Correction (Self-Healing)

Plutôt que d'envoyer le schéma complet dans une invite unique (_Zero-shot_), ce qui surcharge la mémoire du modèle et provoque des hallucinations, `LLM4SQL` découpe le raisonnement sous la forme d'un graphe d'états récursif sous `LangGraph` :

#v(0.3cm)

#figure(
  image("../Images/langgraph_decision_flow.svg", width: 100%),
  caption: [Cycle de décision cognitive ReAct et boucle d'auto-correction (Self-Healing) sous LangGraph],
)

#v(0.3cm)

Le graphe orchestre quatre étapes successives :

- *Étape 1 : Introspection ciblée du schéma (_Schema Pruning_)* : L'agent appelle `mcp_get_schema` pour récupérer uniquement les tables nécessaires à la question. Cette sélection préalable évite de saturer la fenêtre de contexte du modèle.
- *Étape 2 : Résolution des entités et valeurs textuelles* : Pour les requêtes comportant des critères textuels sur des noms propres ou des concepts ("ouvrages dessinés par Uderzo"), l'outil `mcp_search_value` effectue une recherche `ILIKE` en base et transmet au modèle la casse exacte et les clés étrangères associées.
- *Étape 3 : Validation protégée par exécution à blanc (_Dry-Run_)* : Avant de renvoyer le résultat à l'utilisateur, la requête SQL est testée dans une transaction isolée via `mcp_dry_run_query` pour vérifier l'exactitude syntaxique et la cohérence des types.
- *Étape 4 : Boucle d'Auto-Correction (_Self-Healing_)* : Si PostgreSQL signale une erreur (ex. `UndefinedColumn`, alias ambigu), le message d'erreur et les indications fournies par la base (`message_hint`) sont réinjectés dans le graphe. Le modèle génère alors une version corrigée (jusqu'à 3 itérations). En cas d'échec persistant, un mécanisme de repli bascule automatiquement sur le dernier état valide du dry-run.

== Le Standard MCP comme Couche de Gouvernance

L'adoption du standard *Model Context Protocol (MCP)* @anthropic2024mcp permet de séparer proprement le modèle de langage de la couche d'accès à la base de données. Le serveur MCP expose quatre outils spécialisés :

1. `mcp_get_schema(table_name, target_schema)` : Renvoie la structure des colonnes, types PostgreSQL, contraintes PK/FK, statut de nullabilité et indices de jointures relationnelles (_Join Hints_).
2. `mcp_search_value(query, target_table, target_schema)` : Recherche les correspondances textuelles via `ILIKE` et fournit des suggestions automatiques de jointures sur clés étrangères (`foreign_key_suggestion`).
3. `mcp_get_sample_data(table_name, limit=3)` : Fournit un extrait restreint de 3 enregistrements pour permettre au modèle d'appréhender le formatage réel des données sans surcharger le contexte.
4. `mcp_dry_run_query(sql, target_schema)` : Exécute une validation à blanc en transaction fermée et renvoie le statut de réussite, la liste des colonnes résultantes et les diagnostics PostgreSQL (`message_primary`, `message_detail`, `message_hint`).

== Contrôles de Sécurité à Trois Niveaux

Pour préserver l'intégrité de la base de données et empêcher l'exécution de requêtes destructrices (volontaires ou accidentelles), `LLM4SQL` applique un contrôle à trois niveaux complémentaires :

=== Niveau 1 : Analyse Syntaxique par Arbre Abstrait (AST)
Toute requête produite par l'agent ou saisie manuellement par l'utilisateur est analysée par la bibliothèque `sqlglot` @sqlglot2024 avant d'atteindre la base de données. Si l'arbre syntaxique contient une commande de modification (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `GRANT`), la requête est immédiatement rejetée :

```python
# Extrait du validateur de sécurité (app/services/agent/security.py)
import sqlglot
from sqlglot import exp

FORBIDDEN_EXPRESSIONS = (
    exp.Insert, exp.Update, exp.Delete, exp.Drop,
    exp.Alter, exp.Create, exp.Command, exp.TruncateTable
)

def validate_sql_query(sql: str) -> None:
    """Analyse l'arbre syntaxique (AST) et bloque toute commande non-SELECT."""
    try:
        parsed_statements = sqlglot.parse(sql, read="postgres")
    except Exception as e:
        raise ValueError(f"Syntaxe SQL invalide : {str(e)}")

    for statement in parsed_statements:
        if statement is None:
            continue
        # Vérifie récursivement l'absence d'expressions mutatrices dans l'AST
        for forbidden in FORBIDDEN_EXPRESSIONS:
            if statement.find(forbidden):
                raise PermissionError("Sécurité : Seules les requêtes SELECT en lecture seule sont autorisées.")
        if not isinstance(statement, (exp.Select, exp.Union)):
            raise PermissionError("Sécurité : La commande racine doit être un SELECT ou un UNION.")
```

=== Niveau 2 : Isolation Transactionnelle au Niveau du Pilote PostgreSQL
Au niveau de la connexion réseau avec le moteur PostgreSQL, le pool `psycopg` v3 est configuré avec l'attribut `readonly=True`. Le moteur de base de données lui-même refuse les écritures sur la session de transaction, constituant un verrou matériel direct.

=== Niveau 3 : Partitionnement Mémoire du Cache Sémantique (OWASP LLM08)
Conformément aux recommandations de sécurité pour les applications intégrant des LLMs (vulnérabilité OWASP LLM08 @owasp2025llm relative à l'isolation vectorielle), les entrées du cache sémantique sont partitionnées par schéma (`target_schema`). Cela garantit l'étanchéité entre la base principale (`public`) et les tables créées temporairement dans le bac à sable (`user_sandbox`).

== Architecture du Frontend et Optimisations de Rendu

L'application web React 19 a été conçue pour maintenir une interface réactive lors de l'affichage de données volumineuses :

- *Génération Instantanée de Schémas (< 1 ms)* : Plutôt que de confier la génération de diagrammes relationnels au LLM (source de latence et d'erreurs de syntaxe), un parseur DDL en Python pur analyse le schéma et produit le code de diagramme relationnel instantanément.
- *Virtualisation de l'Affichage Tabulaire* : Pour maintenir une navigation fluide même sur des requêtes retournant des milliers de lignes, le composant `DataTable` utilise `@tanstack/react-virtual` au-delà de 500 enregistrements, ne conservant dans le DOM que les éléments visibles à l'écran.
- *Streaming Asynchrone SSE & Transparence Cognitive* : Le protocole _Server-Sent Events_ diffuse en continu la chaîne de pensée de l'agent (`<think>`) jeton par jeton, permettant à l'utilisateur de suivre le raisonnement pas à pas.
