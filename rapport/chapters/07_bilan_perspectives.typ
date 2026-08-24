// ==============================================================================
// CHAPITRE 7 : BILAN PERSONNEL, PERSPECTIVES & CONCLUSION
// ==============================================================================

= Bilan Personnel, Perspectives & Conclusion

== Retour d'Expérience et Difficultés Concrètes de Développement

Mener ce projet de fin d'études de bout en bout m'a confronté à des problématiques d'ingénierie logicielle bien plus complexes et formatrices que de simples exercices académiques. Loin de suivre une trajectoire linéaire et idéale, le développement de LLM4SQL a été jalonné de doutes, d'impasses techniques et de remises en question méthodologiques.

=== L'Impasse de l'Évaluation Sémantique par AST (Le Grand Pivot)
L'une des difficultés les plus marquantes a été la tentative initiale d'évaluer la qualité des requêtes générées sans toucher à la base de données. J'ai consacré près de deux semaines à concevoir un traducteur capable de transformer l'arbre syntaxique (`AST`) d'une requête SQL en une phrase en français, afin de calculer une similarité cosinus avec la question initiale de l'utilisateur.

Sur le papier, l'idée paraissait élégante et légère. Mais lors des premiers tests réels, les résultats ont été catastrophiques : des requêtes SQL parfaitement valides et renvoyant exactement les bonnes données obtenaient des scores de similarité de 0 % ou 20 % simplement parce que la formulation reconstruite différait du langage naturel de l'utilisateur. Cette approche était un nid à faux négatifs.

Accepter de jeter deux semaines de travail n'a pas été facile, mais cela a été l'un des arbitrages les plus formateurs du projet. J'ai alors pivoté vers une approche d'_Execution Accuracy_ sur base réelle avec un algorithme de correspondance souple par jetons (_soft-matching_). Ce choix s'est avéré déterminant pour la fiabilité de tout le reste du système.

=== L'Enquête sur le Cas #6 : Le Piège de la Clé Étrangère Optionnelle
Un autre moment marquant a été le blocage prolongé du banc de test à 94,4 % (17 cas sur 18 validés). Le Cas #6 (« Lister les ouvrages dessinés par Blain avec leur série ») échouait systématiquement, alors qu'aucune erreur de syntaxe n'apparaissait dans les logs et que PostgreSQL renvoyait un code de succès.

En inspectant ligne par ligne les données de la base `BD Ouvrages`, j'ai découvert que l'auteur Blain avait dessiné 4 albums : 3 tomes de la série *Gus* et 1 album indépendant (*Carnet d'un matelot*) dont le champ `ids` était `NULL`. Le modèle générait spontanément un `INNER JOIN serie`, ce qui éliminait silencieusement le quatrième album de la liste. Le mécanisme d'auto-correction (_Self-Healing_) ne pouvait pas détecter cette erreur car la requête s'exécutait sans accroc technique.

Ce problème m'a poussé à enrichir le serveur MCP en inspectant dynamiquement la nullabilité des colonnes dans le catalogue PostgreSQL (`is_nullable: true`), afin d'injecter des indices de jointure (_Join Hints_) guidant le LLM vers un `LEFT JOIN`. Résoudre ce cas m'a fait comprendre concrètement la différence entre une erreur de syntaxe et une erreur de modélisation relationnelle.

=== L'Échec du Dynamic Few-Shot par Gabarits Synthétiques
Une autre tentative documentée dans mon suivi de projet a été la conception d'un catalogue de gabarits SQL abstraits (`templates.json`). L'idée était de détecter des mots-clés dans la question de l'utilisateur pour instancier à la volée des exemples SQL sur-mesure et les injecter dans le prompt.

À l'usage, ce système s'est avéré contre-productif : deviner le rôle métier d'une colonne par des règles heuristiques échouait sur des schémas réels, et l'injection d'exemples approximatifs perturbait le modèle local en créant un effondrement d'attention (_Attention Collapse_). J'ai donc invalidé cette approche : le LLM fonctionne bien mieux en _Zero-Shot_ guidé par l'introspection dynamique du schéma via les outils MCP.

=== La Règle d'Or de l'Ingénierie : Ne pas solliciter l'IA pour ce que le code fait mieux
Au début, j'avais également confié la génération des diagrammes relationnels Mermaid au LLM lors de la création de tables dans le bac à sable. Cela prenait entre 4 et 8 secondes et le rendu plantait régulièrement à cause d'erreurs de syntaxe. J'ai réécrit cette brique en un simple parseur DDL en Python pur (`sandbox.py`) : le diagramme s'affiche désormais en moins d'une milliseconde, avec une fiabilité de 100 %. Cette expérience m'a appris une règle essentielle : l'IA ne doit intervenir que là où le code déterministe ne peut pas aller.

=== L'Apprivoisement des Petits Modèles Locaux (4B)
Au début du projet, ma première intuition a été de charger le prompt système avec de longs exemples détaillés (_Few-Shot Prompting_). Sur un modèle compact sous contrainte matérielle (comme le modèle 4B retenu pour nos tests sous 6 Go de VRAM), le résultat a été immédiat : saturation d'attention, hallucinations de colonnes et oubli des consignes de sécurité.

J'ai dû apprendre à faire l'inverse : épurer le prompt au maximum, supprimer le superflu, et déporter toute la complexité vers des outils MCP appelés à la demande étape par étape. C'est ce passage d'un prompt monolithique à une démarche agentique modulaire qui a permis au petit modèle de rivaliser en exactitude avec des modèles bien plus volumineux.

== Bilan des Compétences Développées

Ce travail de fin d'études m'a permis de mettre en pratique et d'approfondir la double compétence caractéristique de la formation MIAGE :

- *En Ingénierie Logicielle* : J'ai appris à concevoir une architecture distribuée et conteneurisée (Docker, FastAPI, React 19, TypeScript), à structurer des graphes d'états récursifs sous LangGraph, à formaliser des protocoles d'outils stricts (MCP) et à appliquer une discipline rigoureuse de tests automatisés (85 tests `pytest` et benchmark d'exécution).
- *En Systèmes d'Information et Gouvernance* : J'ai appris à évaluer les compromis réels entre solutions SaaS et déploiements locaux (analyse de TCO, contraintes de bande passante, risques de dépendance fournisseur) et à traiter les aspects juridiques et de sécurité (protection des métadonnées internes, conformité RGPD sur les transferts hors UE, gestion des droits en lecture seule).

== Perspectives d'Évolution

Plusieurs prolongements techniques peuvent être envisagés pour étendre les capacités de `LLM4SQL` :

- *Support multi-bases et entrepôts de données* : Adapter les connecteurs MCP pour interroger d'autres moteurs relationnels (`MySQL`, `SQLite`) ou des entrepôts décisionnels (`Snowflake`, `ClickHouse`).
- *Indexation vectorielle des métadonnées* : Pour les bases d'entreprise comprenant plusieurs centaines de tables, mettre en place un index vectoriel sur le dictionnaire de données pour assister l'étape de sélection de tables.
- *Génération de comptes-rendus décisionnels* : Permettre à l'agent d'enchaîner plusieurs requêtes et d'agréger les résultats pour produire automatiquement des synthèses périodiques commentées.

== Projet Professionnel

Ce projet de fin d'études conforte mon souhait d'évoluer vers les métiers de l'*Ingénierie Logicielle et de l'Architecture des Systèmes d'Information*, avec une spécialisation dans l'intégration de solutions d'IA appliquées et la valorisation des données d'entreprise. La maîtrise conjointe des architectures de données traditionnelles (SQL, modélisation relationnelle), des frameworks modernes (FastAPI, React, LangGraph) et des impératifs de sécurité me permet d'aborder les défis de transformation numérique avec un regard pragmatique et orienté produit.

== Conclusion Générale

Le projet `LLM4SQL` démontre qu'il est possible de concevoir un système d'interrogation de bases de données en langage naturel performant et souverain, sans dépendance vis-à-vis d'API distantes payantes. En combinant un modèle local compact, une orchestration par outils normalisés (MCP), des règles de sécurité logicielles strictes (AST `sqlglot`, sessions en lecture seule) et un moteur d'évaluation empirique, ce travail prouve que la valeur d'une application d'IA réside avant tout dans la rigueur de son ingénierie logicielle.
