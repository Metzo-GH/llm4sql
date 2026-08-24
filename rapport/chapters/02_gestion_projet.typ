// ==============================================================================
// CHAPITRE 2 : ORGANISATION DU PROJET, GOUVERNANCE & ENVIRONNEMENT TECHNIQUE
// ==============================================================================

= Organisation du Projet, Gouvernance & Environnement Technique

== Cadre Organisationnel et Rôles (MOA / MOE)

Bien que mené dans le cadre académique d'un projet de fin d'études de Master MIAGE, le projet LLM4SQL a été structuré selon une gouvernance professionnelle formalisant la séparation stricte entre la maîtrise d'ouvrage (MOA) et la maîtrise d'œuvre (MOE) :

- *Maîtrise d'ouvrage (Cadrage stratégique et validation)* : Les encadrantes universitaires de projet (Mme Anne-Cécile CARON et Mme Julie JACQUES) ont fixé les exigences scientifiques et fonctionnelles, défini les critères d'acceptabilité de l'évaluation et fourni le schéma relationnel de référence (`BD Ouvrages`) représentatif des difficultés d'interrogation en entreprise.
- *Maîtrise d'œuvre (Conception, réalisation et tests)* : Nous avons assuré la responsabilité intégrale de la chaîne d'ingénierie logicielle : étude de l'état de l'art, arbitrages d'architecture, implémentation full-stack (FastAPI, React 19, LangGraph, serveur MCP), sécurisation applicative et industrialisation des bancs de test automatisés.

Des jalons réguliers de revue de sprint ont permis de valider les incréments logiciels, tandis que les résultats empiriques des premières expérimentations ont guidé les choix d'architecture (notamment l'abandon de l'évaluation syntaxique au profit d'un moteur d'_Execution Accuracy_ sur base réelle).

== Démarche Méthodologique et Discipline Qualité (TDD)

Afin d'éviter les régressions et d'assurer une robustesse logicielle continue, le projet a appliqué une méthodologie itérative et incrémentale couplée à une discipline rigoureuse de développement piloté par les tests (_Test-Driven Development_) :

1. *Établissement d'une référence (_Baseline_)* : Avant tout refactoring ou ajout de fonctionnalité, la suite complète de vérification (tests unitaires backend sous `pytest` et contrôle de compilation TypeScript strict) est exécutée pour figer l'état nominal.
2. *Développement chirurgical et modulaire* : Les modifications sont appliquées selon le principe de responsabilité unique (_Single Responsibility Principle_ - SRP), isolant les couches API, moteur agentique, serveur d'outils et composants graphiques.
3. *Vérification de non-régression* : La suite de tests est immédiatement réexécutée. Un incrément n'est accepté que si $100\%$ des tests précédemment validés restent au vert et que les nouveaux cas de test d'acceptation sont couverts.
4. *Validation statique continue* : Le code frontend est soumis à une configuration TypeScript en mode strict (`strict: true`) combinée à ESLint pour bannir les types permissifs (`any`) et prévenir les fuites de mémoire.

== Matrice de Gestion des Risques Projet & Plans de Continuité

Conformément aux pratiques d'alignement stratégique des systèmes d'information, nous avons formalisé une matrice des risques techniques et organisationnels, assortie de mesures de mitigation concrètes :

#figure(
  table(
    columns: (1.8fr, 1.2fr, 1fr, 3fr),
    align: (left, center, center, left),
    table.header([*Risque identifié*], [*Probabilité*], [*Impact*], [*Mesure de mitigation appliquée dans LLM4SQL*]),
    [Hallucinations de tables/colonnes par le LLM],
    [Élevée],
    [Critique],
    [Introspection dynamique via `mcp_get_schema` (_schema pruning_) et injection stricte des métadonnées DDL réelles dans le contexte.],

    [Exécution de commandes destructives (`DROP`, `DELETE`)],
    [Moyenne],
    [Critique],
    [Défense en profondeur à 2 barrières : rejet syntaxique par AST `sqlglot` (SELECT-only) et sessions verrouillées en `readonly=True` sous `psycopg` v3.],

    [Saturation mémoire / effondrement d'attention du 4B],
    [Élevée],
    [Majeur],
    [Prompt système condensé en anglais technique, suppression du few-shot verbeux et transmission d'échantillons bornés (`limit=3`).],

    [Indisponibilité ou plantage du serveur LLM local],
    [Faible],
    [Majeur],
    [Détection temps réel de santé de l'API Ollama avec indicateur de statut visuel dans l'interface et gestion d'exceptions réseau non bloquantes.],

    [Pollution de données entre schémas Sandbox et Prod],
    [Moyenne],
    [Majeur],
    [Partitionnement strict du cache sémantique vectoriel par `target_schema` conformément au standard OWASP LLM08 @owasp2025llm.],
  ),
  caption: [Matrice des risques projet et mesures de mitigation du système d'information],
)

== Environnement Technique et Outillage Retenu

Le tableau ci-dessous synthétise la pile technologique mise en œuvre pour assurer des performances maximales et une reproductibilité totale du déploiement :

#figure(
  table(
    columns: (1.5fr, 1.8fr, 3.2fr),
    align: (left, left, left),
    table.header([*Composant*], [*Technologie*], [*Rôle et justification technique*]),
    [Gestionnaire Python],
    [`uv`],
    [Gestionnaire de paquets ultra-rapide en Rust, garantissant la reproductibilité des environnements via un fichier de verrouillage strict (`uv.lock`).],

    [Backend & API],
    [`FastAPI` / `Uvicorn`],
    [Serveur asynchrone Python haute performance avec validation automatique des schémas via `Pydantic v2` et streaming d'événements `SSE`.],

    [Moteur Agentique],
    [`LangGraph`],
    [Framework de graphes d'états récursifs modélisant le cycle de raisonnement ReAct @yao2022react et les conditions de branchement d'auto-correction.],

    [Serveur d'Outils],
    [Standard `MCP`],
    [Protocole ouvert de gouvernance @anthropic2024mcp isolant les accès à la base de données à travers 4 outils strictement typés.],

    [Moteur LLM Local],
    [`Ollama`],
    [Serveur d'inférence open-source exécutant le modèle quantifié avec accélération GPU et calcul d'embeddings vectoriels.],

    [Base de Données],
    [`PostgreSQL 16`],
    [SGBD relationnel robuste conteneurisé sous `Docker` avec pilote `psycopg` v3 en mode pool de connexions asynchrone.],

    [Frontend SPA],
    [`React 19` / `Vite`],
    [Interface utilisateur moderne en `TypeScript` strict avec virtualisation de données `@tanstack/react-virtual` et styles `Tailwind CSS v4`.],

    [Assurance Qualité],
    [`pytest`, `ESLint`],
    [Suite de 85 tests automatisés backend et validation statique rigoureuse du code source frontend.],
  ),
  caption: [Environnement technique et outillage de la plateforme LLM4SQL],
)

== Découpage et Chronologie des Sprints

Le développement du projet s'est déroulé en cinq phases méthodologiques :
1. *Phase 1 : Cadrage, BDD et Conteneurisation* : Initialisation du conteneur PostgreSQL Docker, création du script de peuplement `seed_db.py` et validation des premières connexions avec Ollama.
2. *Phase 2 : Serveur MCP et Moteur Agentique* : Implémentation du serveur d'outils sécurisé, développement du graphe d'états LangGraph et boucle de Self-Healing.
3. *Phase 3 : Interface Utilisateur et Restitution* : Conception de la SPA React 19, bac à sable DDL (Sandbox), parser de diagrammes Mermaid et explorateur tabulaire avec export CSV.
4. *Phase 4 : Sécurité AST et Banc d'Évaluation* : Intégration du parseur syntaxique SQLGlot @sqlglot2024, développement du service d'Execution Accuracy et du soft-matching.
5. *Phase 5 : Optimisations, Join Hints et Industrialisation* : Résolution du Lossy Join (indices de nullabilité MCP), virtualisation des tableaux volumineux et conteneurisation Docker Compose unifiée.

