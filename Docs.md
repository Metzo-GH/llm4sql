# Cahier des Charges : Assistant SQL Local via LLM (local)

## 1. Contexte et Objectifs

L'interrogation de bases de données relationnelles nécessite aujourd'hui des compétences techniques spécifiques (maîtrise du langage SQL). Dans un contexte professionnel ou académique, les administrateurs et décideurs ont besoin d'accéder rapidement aux données sans passer par des requêtes manuelles complexes.

Cependant, l'utilisation d'Intelligences Artificielles génératives cloud pose un risque majeur de confidentialité, car elle implique d'exposer le schéma des bases de données et potentiellement des données sensibles à des serveurs tiers.

**L'objectif de ce projet (LLM4SQL)** est de développer une application locale privée, tournant à 100% en local, permettant d'interroger une base de données en langage naturel. L'outil garantit une sécurité totale des données tout en offrant une interface utilisateur moderne et accessible, avec une boucle d'auto-correction pour garantir la fiabilité des requêtes générées.

## 2. Périmètre Fonctionnel

- **Interface Utilisateur (UI) :** Application web de type "Chat" (historique conversationnel) permettant la saisie itérative de questions en langage naturel.
- **Traduction Naturel -> SQL :** Génération automatique de requêtes SQL pertinentes via LLM local.
- **Boucle d'Auto-correction (Self-Healing) :** Si le code SQL généré est invalide, l'erreur est renvoyée au LLM pour qu'il la corrige de manière autonome avant de présenter le résultat à l'utilisateur.
- **Sécurité "Human-in-the-loop" :** Affichage de la requête SQL générée pour validation par l'utilisateur avant son exécution réelle sur la base de données.
- **Restitution des données :** 
  - Affichage des résultats sous forme de tableau.
  - Visualisation de données (Data Viz) automatique via des graphiques adaptés au type de résultat (ex: Recharts).
  - Bouton d'export CSV pour une exploitation métier immédiate.
- **Architecture Locale Privée :** Aucune donnée ou métadonnée ne quitte la machine locale.

## 3. Architecture Technique Cible

Le projet s'articule autour d'une architecture modulaire moderne respectant les principes SOLID/DRY :

- **Frontend :** `React` propulsé par `Vite`, implémentant une UI moderne (composants Shadcn ou similaires), avec typage strict (TypeScript) et documentation TSDoc.
- **Backend / API :** `Python (FastAPI)` géré via `uv` (le standard moderne de gestion de dépendances et d'environnement virtuel Python, ultra-rapide).
- **Orchestration IA :** `LangGraph` (écosystème LangChain) pour orchestrer la boucle de rétroaction complexe et la gestion d'état de l'agent.
- **RAG / Few-Shot Prompting :** Intégration d'une petite base vectorielle locale (ex: Chroma) pour fournir dynamiquement les exemples de requêtes les plus pertinents (Few-Shot Prompting).
- **Moteur LLM Local :** `Ollama` exécutant le modèle **Qwen 3.5 (9B)** sur GPU (8 Go VRAM minimum).
- **Connexion Données :** Intégration via le standard MCP (Model Context Protocol) pour une exposition sécurisée et dynamique du schéma SQL au LLM.

## 4. Les 5 Phases du Projet & État d'Avancement (100% Réalisé) 🎉

### Phase 1 : Le POC, le Moteur et l'Environnement (100% VALIDÉE)
- **État :** Terminé avec succès.
- **Réalisations :** Configuration `uv`, déploiement de PostgreSQL sous Docker (Port 5433), et validation initiale d'Ollama avec `qwen3.5:9b`.

### Phase 2 : Le Cœur (Agent LangGraph & MCP) (100% VALIDÉE)
- **État :** Terminé avec succès.
- **Réalisations :** 
  - Implémentation d'un serveur MCP Python sécurisé avec validation syntaxique stricte de sécurité via AST `sqlglot` et pilotes DB configurés en Lecture Seule.
  - Développement du graphe LangGraph d'auto-correction (*Self-Healing*) avec boucles de rétroaction d'erreurs (limité à 3 essais pour éviter la récursion infinie).

### Phase 3 : L'Écosystème Web & Bac à Sable Dynamique (100% VALIDÉE)
- **État :** Terminé avec succès.
- **Réalisations :**
  - Route d'API FastAPI pour l'agent (`/api/chat`), l'extraction du schéma (`/api/schema`), et l'initialisation isolée de Sandbox (`/api/sandbox/init`).
  - Développement de l'UI conversationnelle sous React + TypeScript + Vite avec design Spatial Glassmorphism.
  - Rendu des données en Tableaux dynamiques paginés avec export CSV natif UTF-8 BOM (compatible Excel).
  - Intégration de graphiques réactifs adaptatifs (Barres, Aires, Courbes) avec **Recharts**.

### Phase 4 : Consolidation & Laboratoire Visuel (100% VALIDÉE)
- **État :** Terminé avec succès.
- **Réalisations :**
  - **Vue Cartes Interactives 🎴** : Parsing SQL DDL en temps réel (côté client) de vos scripts de création de tables, avec badges de type SQL colorés, et détection de contraintes clés (`🔑 PK`, `🔗 FK`) pour tracer les dépendances.
  - **Rendu Diagramme ER Mermaid Déterministe** : Visualiseur basé sur un parseur de syntaxe DDL SQL écrit en Python pur, s'exécutant instantanément (<1ms) de façon déterministe pour générer des diagrammes Mermaid 100% valides sans solliciter le LLM ni la VRAM.
  - Suite de **33 tests unitaires et d'intégration** entièrement validée par `pytest`.
  - Documentation exhaustive JSDoc/TSDoc sur l'ensemble des modules frontend et backend.

### Phase 5 : Optimisations, Cache Sémantique & Diviser pour Régner (100% VALIDÉE)
- **État :** Terminé avec succès.
- **Réalisations :**
  - **Refonte "Diviser pour Régner"** : Ajout du nœud de sélection de tables (`select_tables`) qui interroge les fonctions MCP et restreint la taille du prompt de génération.
  - **Consolidation du Few-Shot** : Réduction du prompt à 2 exemples d'or complets pour éviter le collapse du modèle local `qwen3.5:4b`.
  - **Cache sémantique (RAG Mémoire)** : Système de cache basé sur des embeddings Ollama (Cosinus) avec repli Jaccard résilient.
  - **Télémétrie & Observabilité** : Suivi des métriques de performance, vitesse d'inférence en tokens/s, badges des tables interrogées et accordéon pliable pour la réflexion du modèle (`<think>`).
  - **Interface de Configuration** : Tiroir déroulant d'options de configuration (Modèle, Température, Contexte).

### Phase R8 : Moteur Agentique avec Tool Calling & Outils MCP Étendus (100% VALIDÉE)
- **État :** Terminé avec succès.
- **Réalisations :**
  - **Extension du serveur MCP** : Ajout des fonctions d'enquête sémantique (`search_value`), d'exploration d'exemples de données (`get_sample_data`), et de validation syntaxique (`dry_run_query` avec `EXPLAIN` PostgreSQL et sécurité AST stricte).
  - **Refonte de l'orchestration LangGraph** : Transition vers une boucle ReAct tool-calling autonome dans `graph.py` avec `bind_tools` de ChatOllama et un **Garde-fou (Loop Guard)** fixé à 5 itérations maximum pour empêcher les récursions infinies.
  - **Post-traitement SQL Regex** : Implémentation d'un post-traitement Regex Python (`sql_utils.py`) pour corriger les erreurs de syntaxe mineures générées par le modèle (ex: points-virgules de fin ou mal positionnés avant un ORDER BY).
  - **Raffinement UI & Télémétrie SSE** : Intégration en temps réel des logs SSE des appels d'outils et animations fluides dans un `StepsTracker` soigné.

### Phase R11 : Architecture & Performance - Sprint 2 (100% VALIDÉE)
- **État :** Terminé avec succès.
- **Réalisations :**
  - **Modularisation du Backend** : Découpage du fichier monolithique `graph.py` en modules SRP (`tools.py`, `nodes.py`, `routing.py`, `prompts.py`) et décomposition de la fonction de finalisation de nœud.
  - **Rate Limiting** : Intégration globale et par route de la bibliothèque `slowapi` pour intercepter les requêtes excessives (/minute).
  - **Code-Splitting Frontend** : Extraction de composants volumineux (`SandboxPanel`, `DataExplorerPanel`, `SettingsDropdown`) et chargement à la demande (`React.lazy()` + `Suspense`), réduisant la taille du bundle initial de 1.4 Mo.
  - **Event Loop asynchrone** : Wrapping de la récupération synchrone de schéma dans `asyncio.to_thread` pour conserver la fluidité du serveur FastAPI.

### Phase R12 : Qualité, DRY & Refactoring Frontend - Sprint 3 (100% VALIDÉE)
- **État :** Terminé avec succès.
- **Réalisations :**
  - **Thread Safety** : Protection contre les conditions de concurrence sur la mise en cache de schéma via `threading.Lock`.
  - **Validation d'Entrées** : Limites `max_length` strictes sur les modèles de requêtes d'API Pydantic.
  - **Suppression des IIFE JSX** : Élimination complète de tout bloc de rendu IIFE JSX dans `ChatMessage` et `PerformanceMetrics` au profit de sous-composants typés et documentés.
  - **Robustesse & Typage TypeScript** : Typage strict du type `tool_call`, des infobulles Recharts, limitation mémoire du tableau de logs en temps réel (`slice(-200)`) et typage des captures d'erreurs `catch (error: unknown)`.

### Phase R13 : Accessibilité & Nettoyage - Sprint 4 (100% VALIDÉE)
- **État :** Terminé avec succès.
- **Réalisations :**
  - **Accessibilité (a11y)** : Ajout d'attributs `aria-label` explicites et descriptifs sur la totalité des boutons de pagination, de barre de recherche, d'export CSV, de choix d'axes de données et de types de graphes.
  - **Migration Logging** : Remplacement des appels `print()` par l'utilisation standardisée de la bibliothèque `logging` dans le backend.
  - **Sécurité Encodage** : Substitution des caractères unicode/emojis non-ASCII provoquant des plantages d'encodage CP1252 sous Windows par des équivalents ASCII standard.
  - **Nettoyage des Imports** : Retrait d'imports orphelins et inutilisés (`psycopg2`, `SystemMessage`, `get_llm`).

## 5. Contraintes et Prérequis

- **Matériel cible :** Carte Graphique dédiée avec minimum 8 Go de VRAM.
- **Dépendances :** React (Vite/TS), Python 3.12 (uv), PostgreSQL 16 (Docker), Ollama (local).
- **Règles d'or appliquées :** Zéro Legacy, respect strict du SOLID et du DRY, typage TypeScript strict.
- **Règles de Code (Globaux) :** "Zéro Legacy", architecture SOLID/DRY, utilisation systématique d'outils d'année en cours.
