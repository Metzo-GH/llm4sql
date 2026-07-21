# LLM4SQL - AI MAP & Architecture 

## 1. Vision du Projet
Application 100% locale (privée) permettant de traduire du langage naturel en requêtes SQL via un LLM (Qwen 3.5 9B) orchestré par LangGraph. 
L'application comprend une boucle d'auto-correction ("Self-Healing"), une connexion via le standard MCP, une API FastAPI, et un frontend React (Vite) avec Data Viz. La base de données PostgreSQL tourne dans un conteneur Docker pour une flexibilité maximale (ajout futur d'autres services / bases NoSQL).

## 2. Architecture Technique (Stack 2026)
### 2.1 Backend (Python) & BDD
- **Gestionnaire d'environnement & dépendances** : `uv` (remplace pip/poetry pour des performances maximales).
- **Conteneurisation BDD** : `Docker` & `Docker Compose` exécutant une base `PostgreSQL v16+`.
- **Framework Web** : `FastAPI` (pour exposer l'agent via une API REST rapide).
- **Orchestration IA** : `LangGraph` (pour gérer les cycles complexes comme la boucle d'erreur SQL).
- **Intégration BDD** : Client `MCP` (Model Context Protocol) pour lire le schéma de la base de données.
- **RAG** : VectorDB légère (ex: `Chroma`) pour le Few-Shot Prompting.
- **LLM Local** : `Ollama` avec `Qwen 3.5 9B`.

### 2.2 Frontend (Web)
- **Build Tool** : `Vite`.
- **Framework UI** : `React` avec `TypeScript` strict.
- **Styling & Composants** : `TailwindCSS` + `Shadcn/ui` (ou équivalent moderne) pour une UI premium "Chat-like".
- **Data Visualisation** : `Recharts` pour générer des graphes à partir des résultats SQL.
- **Rigueur** : TSDoc obligatoire pour chaque fonction métier/composant.

## 3. Plan d'Implémentation (Phases)

### Phase 1 : Initialisation & POC (Validée)
- [x] Initialisation du conteneur PostgreSQL via `docker-compose.yml` (Port 5433 hôte).
- [x] Création du script de peuplement/seed (`seed_db.py`) avec le schéma personnalisé "BD Ouvrages" (BD, albums, séries, concepts).
- [x] Initialisation de l'environnement Python avec `uv` et installation des dépendances.
- [x] Configuration du cadre de tests (`pytest` & `pytest-asyncio`).
- [x] Réalisation de l'audit de santé technique & sécurité (`health_audit.md`) et résolution complète des points critiques.
- [x] Validation de la connexion PostgreSQL locale et de la génération SQL avec Ollama (Qwen 3.5 9B).
- [x] Automatisation de la configuration avec `start_backend.ps1` (Windows) et `start_backend.sh` (Linux), avec documentation complète des optimisations (Turbo Quant KV Cache 4-bit & Flash Attention).

### Phase 2 : Moteur Agentique (LangGraph & MCP) (En cours)
- [x] Implémentation d'un serveur MCP Python sur-mesure (Option B - sécurisé en lecture seule, bloquant toute altération).
- [x] Développement du graphe LangGraph :
    - [x] Nœud 1 : Compréhension & Génération SQL (avec RAG Few-Shot).
    - [x] Nœud 2 : Exécution sécurisée sur PostgreSQL.
    - [x] Edge conditionnel : Si erreur SQL -> Retour Nœud 1 avec l'erreur.
- [x] Validation de la boucle de correction (Self-healing).
- [x] Implémentation d'un système de Cache Sémantique ultra-léger (RAG Mémoire) dans le backend FastAPI (`main.py` et `cache.py`) pour intercepter et accélérer les requêtes SQL similaires.

### Phase 3 : L'Écosystème API & Web (Validée)
- [x] Encapsulation du moteur LangGraph dans des routes `FastAPI`.
- [x] Initialisation du projet Vite/React/TS.
- [x] Implémentation de l'interface Chat (historique, requêtes itératives).
- [x] Affichage des données (Tableaux dynamiques + Graphiques Recharts + Export CSV).

### Phase 4 : Consolidation & Qualité (Validée)
- [x] Validation des principes SOLID/DRY sur l'ensemble du codebase.
- [x] Ajout de tests unitaires/intégrations clés (24 tests passés avec succès).
- [x] Mise à jour du README et finalisation des commentaires JSDoc/TSDoc.

### Phase 5 : Optimisations & Dette Technique (Validée)
- [x] Résolution de l'appel bloquant synchrone de `run_agent()` dans FastAPI avec `asyncio.to_thread`.
- [x] Refonte de l'instanciation de `ChatOllama` en singleton global avec initialisation paresseuse (lazy loading) dans `agent.py`.
- [x] Sécurisation de la gestion des curseurs et connexions PostgreSQL (Context Managers imbriqués).
- [x] Lancement automatique du serveur FastAPI à la fin de `start_backend.ps1`.
- [x] Ajout d'avertissements de sécurité explicites dans le Sandbox SQL côté frontend.
- [x] Implémentation du suivi en temps réel de la progression de l'agent (télémétrie de l'exécution, étapes LangGraph, temps de réponse, affichage des prompts et réponses brutes du LLM) dans la console backend.
- [x] Suppression de la limitation num_ctx=3072 pour restaurer la taille de contexte par défaut (8k) et uniformiser les configurations Ollama.
- [x] Configuration de `OLLAMA_NUM_PARALLEL=1` dans `start_backend.ps1` pour réduire la consommation VRAM globale en local.
- [x] Passage au modèle LLM local par défaut `qwen3.5:4b` pour accélérer significativement l'inférence et réduire l'empreinte RAM/VRAM à ~3.4 Go.
- [x] Résolution du bug de sérialisation JSON pour les colonnes PostgreSQL de type `numeric/decimal` (conversion automatique des objets `Decimal` en `float` par le serveur MCP).
- [x] Optimisation de l'onglet Laboratoire SQL : Découplage de la configuration PostgreSQL (instantanée, < 0.1s) et de la génération de diagramme ER Mermaid.
- [x] Rendu Mermaid déterministe : Remplacement du générateur LLM par un parser SQL DDL écrit en Python pur dans `sandbox.py` pour un rendu instantané (<1ms) sans appel d'IA, assurant une syntaxe Mermaid 100% valide et sans erreur.
- [x] Sécurisation thread-safe du singleton global `get_llm()` via un verrou double-checked (`threading.Lock`) dans `agent.py` pour éviter des initialisations concurrentes.
- [x] Unification du client LLM (DRY) : Réutilisation du singleton global `get_llm()` pour la route de visualisation Mermaid dans `main.py`, optimisant l'empreinte mémoire d'Ollama.
- [x] Résolution de l'erreur d'encodage CP1252 : Remplacement de tous les caractères unicode/emojis non-ASCII dans les impressions console et les logs du backend par des balises ASCII afin d'éviter tout plantage sur les terminaux Windows.
- [x] Refonte "Diviser pour Régner" de l'agent : introduction de `node_select_tables` pour lister et filtrer les tables requises via MCP, réduisant la taille du prompt de génération.
- [x] Condensation du few-shot à 2 exemples d'or complets pour maximiser l'attention du modèle local `qwen3.5:4b` et éviter le collapse de réflexion.
- [x] Cache sémantique en mémoire (RAG Mémoire) avec vecteur cosinus (Ollama `/api/embed`) et algorithme textuel de Jaccard en fallback (temps de réponse instantané de 0ms).
- [x] Observabilité en direct : intégration dans l'interface graphique de badges pour les tables impliquées, d'une console terminal glassmorphic dynamique pour les logs backend SSE en temps réel, de la visualisation du taux de contexte en direct, et d'un accordéon rétractable pour le streaming de la réflexion du modèle (`<think>`) jeton par jeton.
- [x] Tiroir de paramètres d'agent dans l'interface (Modèle, Température, Taille du contexte) transmis de manière dynamique au backend à chaque requête.
- [x] UI Premium & Minimaliste : Remplacement du terminal de logs brut par une checklist d'étapes animées en temps réel dans la bulle de chargement de l'assistant. Déplacement de la console de logs détaillés dans un tiroir pliable au bas du chat activable depuis l'en-tête, et intégration constante de la jauge d'utilisation du contexte.
- [x] Support complet de la réflexion textuelle en temps réel (Ollama) : Activation du paramètre `reasoning=True` dans `ChatOllama`, reconstruction à la volée des balises `<think>...</think>` dans le flux SSE du backend, nettoyage robuste de l'extracteur SQL, et amélioration esthétique de l'UI (boîte de réflexion limitée à 150px maximum avec barre de défilement discrète et défilement automatique vers le bas pendant la génération).
- [x] Retouches UI majeures : Intégration en temps réel du statut de connexion FastAPI, de la charge GPU/CPU et de la VRAM d'Ollama (via `/api/ps`), affichage dynamique de la liste des modèles locaux (via `/api/tags`), sélection restrictive de la taille de contexte (4k à 256k), suppression du badge statique "BD Ouvrages" et correction du positionnement de l'icône de recherche (loupe) dans le filtre de l'explorateur de données.
- [x] Correction du bug de décalage de la réflexion : ajustement de `thinkingParser.ts` pour cibler la dernière occurrence via `lastIndexOf('<think>')` en cas de boucle d'auto-correction (Self-Healing), et intégration DRY dans `useChat.ts` pour supprimer le décalage et l'affichage brut de la réflexion dans le bloc SQL généré.
- [x] Persistance des paramètres UI : sauvegarde et rechargement de la configuration de l'agent (Modèle, Température, Taille du Contexte) dans le `localStorage` du navigateur pour conserver les choix après rechargement.
- [x] Support de la taille de contexte par défaut d'Ollama : ajout de l'option "Défaut Ollama" (valeur `0`) et correction côté backend (`llm_provider.py` et nœuds d'agent) pour omettre le paramètre `num_ctx` si la taille vaut `0`. Récupération dynamique et mise en cache de la taille de contexte native du modèle via l'API Ollama `/api/show` pour un affichage exact et en temps réel de la jauge dans l'interface utilisateur.
- [x] Consolidation du prompt système : Remplacement des exemples SQL complexes bruts (sans CTEs et contredisant les consignes) par des directives architecturales SQL explicites et concises. Cela réduit la taille du prompt, évite les hallucinations de tables imaginaires et améliore la directivité de `qwen3.5:4b`.
- [x] Correction du calcul de la taille de contexte utilisé : Utilisation de la valeur maximale entre `prompt_eval_count` d'Ollama (qui ne reflète que les tokens évalués par tour) et la taille estimée cumulative de l'historique complet des messages. Cela évite que la jauge de contexte ne chute de manière erronée à cause de la mise en cache KV d'Ollama.

### Phase R3 — Architecture Frontend & TypeScript Strict Mode (Validée)
- [x] Décomposition du God Component `ChatInterface.tsx` (allègement de 74%).
- [x] Passage au mode strict TypeScript (`strict: true`) et résolution de tous les types `any`.
- [x] Centralisation de l'API de base dans `config/api.ts` (port 8000).

### Phase R4 — Performance & Mémorisations ⚡ (Validée)
- [x] Utilisation de `useMemo` dans `SchemaVisualizer.tsx` (`parsedTables`, `filteredTables`).
- [x] Utilisation de `useMemo` dans `DataTable.tsx` (`columns`, `filteredData`).
- [x] Utilisation de `useMemo` dans `ChatMessage.tsx` (`parsedSteps`).
- [x] Mémorisations côté hook `useSandbox` et `useChat` (`useCallback` sur tous les handlers).
- [x] Optimisations backend : taille max du Cache Sémantique à 100, LRU sur le cache LLM, verrous asynchrones.
- [x] Intégration de `document.visibilityState` sur les polling intervals.

### Phase R5 — Nettoyage & Qualité 🧹 (Validée)
- [x] Suppression de `frontend/src/App.css` (legacy Vite).
- [x] Suppression de `backend/main.py` (stub mort).
- [x] Retrait de la dépendance inutilisée `react-markdown` de `package.json`.
- [x] Unification CSS complète dans `index.css` (suppression de tous les styles en ligne `style={{}}`).
- [x] Remplacement des `alert()` natifs par un Toast UI customisé.
- [x] Correction i18n & SEO dans `index.html` (`lang="fr"`, titre explicite).
- [x] Intégration d'écritures JSDoc/TSDoc complètes.

### Phase R6 — Accessibilité (a11y) ♿ (Validée)
- [x] Rôles ARIA (`tablist`, `tab`, `log`) et états d'activation (`aria-selected`, `aria-live="polite"`).
- [x] Navigation clavier complète sur les cartes du visualiseur de schéma (`tabIndex={0}` + handler `onKeyDown` pour `Enter`/`Espace`).
- [x] Attributs descriptifs `aria-label` et `aria-expanded` pour les lecteurs d'écran.

### Phase R7 — Sécurité, Modularité Backend & Optimisations Rendu (Validée)
- [x] Résolution des classes Tailwind orphelines : installation propre et intégration de Tailwind CSS v4 avec le compilateur `@tailwindcss/vite`.
- [x] Correction du bug `borderRadius: 8px` en syntaxe standard `border-radius: 8px` dans `index.css`.
- [x] Déplacement de la police Google Fonts de `@import` bloquant CSS vers les balises `<link rel="preconnect">` de `index.html`.
- [x] Protection XSS : assainissement des messages d'erreur Mermaid injectés par `innerHTML` dans `SchemaVisualizer.tsx` avec `DOMPurify.sanitize()`.
- [x] Découpage complet de `main.py` : structuration en APIRouters distincts (`chat.py`, `schema.py`, `sandbox.py`, `monitoring.py`) pour éliminer la responsabilité multiple.
- [x] Unification de la couche base de données : suppression de `connection.py` standalone au profit du pool de connexions global dans `pool.py`.
- [x] Amélioration du cycle de vie serveur : configuration d'un lifespan FastAPI asynchrone pour initialiser et fermer proprement le pool de connexions PostgreSQL.
- [x] Remplacement de `Record<string, any>` par l'interface typée stricte `SqlResultRow` dans toute la chaîne de transmission des données SQL.
- [x] Modularité du chat : extraction de `ChatMessage.tsx` en sous-composants dédiés (`SqlCodeBlock`, `StepsTracker`, `ThinkingAccordion`, `PerformanceMetrics`).
- [x] Résolution de la violation des Rules of Hooks dans `DataTable.tsx` (déplacement des useMemo en début de fonction check).
- [x] Mémorisations et performances : application systématique de `React.memo` sur les composants clés (`ChatMessage`, `DataTable`, `DataVisualization`, `SchemaVisualizer`).
- [x] Résolution des problèmes du visualiseur de schéma : correction de la visibilité des textes de diagrammes Mermaid en mode sombre par des styles CSS ciblés de haute précision, et élimination de la superposition du diagramme en arrière-plan de la vue cartes via l'ajout de `key` React uniques et d'un drapeau de cycle de vie asynchrone (`active`) empêchant la réutilisation de nœuds DOM.
- [x] Résolution des bugs de débordement UI (Bloc SQL & Tableaux de données) : Ajout de contraintes `min-width: 0` et `max-width: 100%` sur le panel du chat, la bulle de message, le panel de données, le wrapper et le container de tableau. Cela empêche le bloc de code SQL ou les tables à colonnes multiples d'étirer de manière incontrôlée la grille de l'application, en forçant proprement l'activation de barres de défilement horizontal.

### Phase R8 : Moteur Agentique avec Tool Calling & Outils MCP Étendus (Validée)
- [x] Extension du serveur MCP (`search_value`, `get_sample_data`, `dry_run_query`).
- [x] Refonte de l'orchestration LangGraph (`graph.py`) sous forme de boucle ReAct avec `bind_tools` de ChatOllama.
- [x] Adaptation des prompts et guidage de l'agent (démarche d'enquête sémantique et validation dry-run).
- [x] Nettoyage des fichiers de nœuds linéaires obsolètes (`select_tables.py`, `generate_sql.py`, `execute_sql.py`).
- [x] Mise à jour et validation des tests automatisés (`pytest`).

### Phase R9 : Auto-correction & Repli SQL (Self-Healing Fallback) (Validée)
- [x] Implémentation du mécanisme de repli (fallback) automatique vers la dernière requête valide de `mcp_dry_run_query` en cas d'erreur de la requête finale extraite.
- [x] Renforcement cognitif du prompt de l'agent pour le contraindre à copier-coller exactement la requête validée avec succès.
- [x] Ajout des tests unitaires `test_get_last_validated_query` et `test_node_clean_and_finalize_fallback` dans `test_agent.py`.
- [x] Validation et passage au vert de l'intégralité des 33 tests pytest.

### Phase R10 : Résolution des Failles de Sécurité Critiques de l'Audit (Validée)
- [x] Externalisation et sécurisation des identifiants PostgreSQL de [docker-compose.yml](file:///c:/Users/Metzo/Documents/projet%20ia/llm4sql/backend/docker-compose.yml) et [config.py](file:///c:/Users/Metzo/Documents/projet%20ia/llm4sql/backend/app/core/config.py) vers `.env`.
- [x] Remplacement des mots de passe réalistes dans [.env.example](file:///c:/Users/Metzo/Documents/projet%20ia/llm4sql/backend/.env.example) par des placeholders neutres.
- [x] Nettoyage et suppression définitive du script POC obsolète `test_llm_db.py` contenant des identifiants en dur.
- [x] Sécurisation XSS par assainissement de l'injection statique `innerHTML` dans [SchemaVisualizer.tsx](file:///c:/Users/Metzo/Documents/projet%20ia/llm4sql/frontend/src/components/SchemaVisualizer.tsx) avec `DOMPurify.sanitize`.
- [x] Résolution de la fragilité (flakiness) du test d'intégration `test_integration_run_agent_real` face aux alias de colonnes SQL générés par le LLM.
- [x] Validation générale par passage au vert des 33 tests et test de démarrage de Docker.

### Phase R11 : Architecture & Performance - Sprint 2 (Validée)
- [x] Ajout du Rate Limiting `slowapi` sur `/api/chat` et `/api/sandbox`.
- [x] Décomposition de `graph.py` en `tools.py`, `nodes.py`, `routing.py` et `prompts.py`.
- [x] Décomposition de la "God Function" `node_clean_and_finalize`.
- [x] Allègement et modularisation de `App.tsx` en extrayant les sous-panneaux (`SettingsDropdown`, `SandboxPanel`, `DataExplorerPanel`).
- [x] Implémentation du Code Splitting via `React.lazy` & `Suspense` sur le frontend.
- [x] Utilisation de `asyncio.to_thread()` dans `app/routers/schema.py` pour libérer l'Event Loop.
- [x] Centralisation de la requête FK dans `app/database/queries.py` et mutualisation.
- [x] Déduplication de la sérialisation des lignes MCP dans `mcp_server.py`.

### Phase R12 : Qualité, DRY & Refactoring Frontend - Sprint 3 (Validée)
- [x] Sécurisation thread-safe du cache schéma via `threading.Lock`.
- [x] Ajout de contraintes `max_length` sur les schémas Pydantic.
- [x] Centralisation du calcul du `contextLimit` frontend dans `utils/context.ts`.
- [x] Remplacement des IIFE JSX par des méthodes/composants nommés.
- [x] Limitation de taille sur `liveLogs` pour empêcher le débordement mémoire.
- [x] Typages stricts TypeScript restants (`tool_call`, `error: unknown`).

### Phase R13 : Accessibilité & Nettoyage - Sprint 4 (Validée)
- [x] Ajout des attributs `aria-label` manquants dans DataTable et DataVisualization.
- [x] Nettoyage des imports morts et migration des `print()` du backend vers `logging`.

### Phase R14 : Efficacité LLM & Alignement Cognitif (Validée)
- [x] Intégration du prompt structuré en anglais pour le raisonnement technique (CTEs, granularité) et validation sémantique multi-étapes.
- [x] Résolution définitive du bug de boucle infinie sur la récupération des données (interdiction stricte du loop de `mcp_get_sample_data`).
- [x] Rationalisation et consolidation des patrons de raisonnement complexes dans le prompt sous forme de directives architecturales directes (self-joins, récursivité, LEFT JOIN défensif, CASE WHEN conditionnels) éliminant la redondance avec l'exemple complet et évitant le non-respect des règles de CTE.
- [x] Résolution de la faille de robustesse dans `validate_sql_query` (gestion des exceptions `SqlglotError` et `Exception` pour éviter tout crash de tokenisation).
- [x] Validation générale par le passage au vert de l'intégralité des 33 tests pytest.

### Phase R15 : Bypass Dynamique de Cache & Refonte Épurée du Prompt (Validée)
- [x] Application réactive immédiate du bypass de cache sémantique côté frontend et propagation sans closure figée.
- [x] Intégration de logs API et de télémétries SSE backend sur le statut du bypass de cache sémantique (visible dans la console de logs en direct).
- [x] Refonte et allègement global de [prompts.py](file:///c:/Users/Metzo/Documents/projet%20ia/llm4sql/backend/app/services/agent/prompts.py) pour réduire la charge cognitive sur le modèle local (suppression du bruit, condensation des directives SQL en 1-2 lignes).
- [x] Ajout de consignes absolues et d'avertissements explicites interdisant à l'IA d'utiliser les outils pour lister les données de résultats finals et d'inclure des tableaux Markdown dans le chat (l'UI se chargeant seule de l'exécution et de l'affichage).
- [x] Résolution de l'amnésie de l'agent : Correction d'une fuite de mémoire critique dans LangGraph (réinjection du contexte initial) et renforcement cognitif (ancrage ⭐ ALIGNMENT) évitant l'effondrement de l'attention (Attention Collapse).
- [x] Validation par le passage au vert de la suite de tests complète (35 tests validés).

### Phase R16 : Double Validation & Gabarits Abstraits (Planifiée)
- [ ] Conception et enregistrement du nœud de double validation sémantique (`node_explain_sql`).
- [ ] Propagation de l'explication dans le schéma `ChatResponse`, le cache sémantique et le flux SSE.
- [ ] Affichage premium de la description comprise de la requête dans l'interface utilisateur.
- [ ] Création du catalogue de gabarits abstraits JSON (`templates.json`) et du module de substitution (`templates.py`).
- [ ] Intégration du routage d'intention LangGraph pour alimenter les prompts avec des few-shot contextualisés dynamiques.
- [ ] Validation générale par des tests unitaires et intégrations pytest.

### Phase R17 : Correction Sandbox, Actualisation LLMs & Arrêt Rapide (Validée)
- [x] Correction de l'analyse SQL du Sandbox face aux commentaires avec tirets (filtration des nœuds `Semicolon` et désactivation des commentaires lors de la reconstruction).
- [x] Actualisation temps réel de la liste des LLMs dans le menu déroulant (suppression du cache navigateur sur les routes `/api/ollama/models` et `/api/ollama/status` et actualisation automatique à l'ouverture du menu).
- [x] Optimisation de la durée d'arrêt du backend (propagation rapide des signaux avec le paramètre uvicorn `--timeout-graceful-shutdown 2`).

### Phase R18 : Suppression des Modèles par Défaut & Sélection Dynamique Ollama (Validée)
- [x] Suppression du modèle par défaut codé en dur dans `config.py` (`OLLAMA_MODEL=""`).
- [x] Retrait des listes de modèles fictifs en fallback dans `monitoring.py` et `useChat.ts`.
- [x] Contrôle strict du modèle sélectionné avant l'envoi d'une requête (messages explicites dans l'UI si aucun modèle n'est sélectionné ou installé).
- [x] Mise à jour du menu déroulant de paramètres avec l'option `-- Choisir un modèle --` et validation des types.

## 4. Règles d'Or du Projet (Rappels)
- **Zéro Legacy** : Utiliser les syntaxes modernes.
- **Partial Diffs** : Les modifications de fichiers existants se feront de manière chirurgicale.
- **Source de Vérité** : Ce fichier `#AI_MAP.md` est la seule référence de l'état du projet et doit être mis à jour après chaque complétion.
