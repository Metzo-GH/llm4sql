// ==============================================================================
// 00. RÉSUMÉS EXÉCUTIFS (EXECUTIVE SUMMARIES)
// ==============================================================================

#heading(level: 1, numbering: none)[Résumé]

#v(0.5cm)

L'accès aux données décisionnelles stockées dans les bases relationnelles d'entreprise reste difficile pour les profils non techniques, qui dépendent des équipes informatiques pour rédiger leurs requêtes SQL. Si les modèles de langage actuels permettent de traduire des questions en langage naturel vers du SQL (_Text-to-SQL_), leur utilisation via des API cloud pose deux problèmes concrets : la fuite potentielle de schémas et de données confidentielles vers des serveurs tiers, et la difficulté de garantir l'exactitude d'un code généré de manière probabiliste.

Ce mémoire présente la conception et la réalisation de *LLM4SQL*, une application d'interrogation de bases de données en langage naturel exécutée intégralement en local sur l'infrastructure de l'entreprise.

Plutôt que d'envoyer directement le schéma complet dans une invite simple (_Zero-shot_), le système s'appuie sur une architecture agentique sous *LangGraph* respectant le protocole ouvert *Model Context Protocol (MCP)*. Conçue pour être agnostique du modèle sous-jacent (Mistral, Llama, Qwen, DeepSeek), la plateforme a été validée avec un modèle local compact (Qwen 3.5:4b servant d'étalon expérimental sobre) qui explore la base étape par étape via quatre outils dédiés : lecture ciblée du schéma, recherche de valeurs textuelles exactes, exécution protégée à blanc (_dry-run_) et boucle de correction en cas d'erreur retournée par PostgreSQL (_Self-Healing_). La sécurité est assurée en amont par l'analyse syntaxique de l'arbre abstrait (AST `sqlglot`), qui bloque toute commande autre qu'un `SELECT`, et par l'usage de sessions transactionnelles en lecture seule.

Évaluée sur un banc d'essai de 18 requêtes représentatives sur une base de référence (`BD Ouvrages`), la démarche d'ingénierie a permis de faire progresser le taux de succès réel (_Execution Accuracy_) de 44,4 % en invite brute à 83,3 % avec l'auto-correction, pour atteindre 100 % grâce à la détection automatique de la nullabilité des clés étrangères et l'injection d'indices de jointures externes (_LEFT JOIN_). L'ensemble fonctionne sur un poste de travail standard sans coût récurrent d'API et dans le respect du confinement des données internes.

#v(0.8cm)

*Mots-clés :* Text-to-SQL, Intelligence Artificielle Locale, LangGraph, Model Context Protocol (MCP), Auto-Correction (Self-Healing), Sécurité des SI, PostgreSQL, Master MIAGE.

#pagebreak()

#heading(level: 1, numbering: none)[Abstract]

#v(0.5cm)

Accessing business data stored in relational databases remains a bottleneck for non-technical stakeholders who rely on IT teams to write SQL queries. While modern Large Language Models can translate natural language into SQL (_Text-to-SQL_), querying external cloud APIs introduces two critical challenges: the exposure of proprietary database schemas and records to third-party providers, and the difficulty of ensuring the reliability of probabilistically generated code.

This Master's thesis presents the design and implementation of *LLM4SQL*, a natural language database querying platform running entirely locally on on-premise infrastructure.

Rather than injecting entire database schemas into a naive prompt, the system relies on an agentic workflow using *LangGraph* and the open *Model Context Protocol (MCP)* standard. Designed to be model-agnostic (supporting any local LLM such as Llama, Mistral, Qwen, or DeepSeek), the system was benchmarked using a compact local model (Qwen 3.5:4b as an experimental baseline) exploring the database progressively through four specialized tools: targeted schema inspection, categorical text search, non-destructive validation (dry-run), and recursive error recovery driven by PostgreSQL error feedback (_Self-Healing_). Security is strictly verified prior to execution through Abstract Syntax Tree (AST) validation with `sqlglot`, which rejects any non-`SELECT` statement, combined with read-only database transaction scopes.

Evaluated on an 18-query benchmark covering multi-table joins, recursive hierarchies, and aggregations on a reference schema (`BD Ouvrages`), this engineering approach increased the benchmark execution accuracy from 44.4% in zero-shot prompting to 83.3% with self-healing, ultimately reaching 100% through dynamic foreign key nullability inspection and relation-aware join hints (_LEFT JOIN_). The platform runs on standard commodity hardware with zero external API fees while ensuring internal data confinement.

#v(0.8cm)

*Keywords:* Text-to-SQL, Local Artificial Intelligence, LangGraph, Model Context Protocol (MCP), Self-Healing, Information System Security, PostgreSQL, Master MIAGE.

#pagebreak()
