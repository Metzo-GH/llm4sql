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
  - **Rendu Diagramme ER Mermaid stable** : Intégration graphique Mermaid.js résistant aux conflits de DOM et d'identifiants.
  - Suite de **24 tests unitaires et d'intégration** entièrement validée par `pytest`.
  - Documentation exhaustive JSDoc/TSDoc sur l'ensemble des modules frontend et backend.

### Phase 5 : Optimisations, Cache Sémantique & Diviser pour Régner (100% VALIDÉE)
- **État :** Terminé avec succès.
- **Réalisations :**
  - **Refonte "Diviser pour Régner"** : Ajout du nœud de sélection de tables (`select_tables`) qui interroge les fonctions MCP et restreint la taille du prompt de génération.
  - **Consolidation du Few-Shot** : Réduction du prompt à 2 exemples d'or complets pour éviter le collapse du modèle local `qwen3.5:4b`.
  - **Cache sémantique (RAG Mémoire)** : Système de cache basé sur des embeddings Ollama (Cosinus) avec repli Jaccard résilient.
  - **Télémétrie & Observabilité** : Suivi des métriques de performance, vitesse d'inférence en tokens/s, badges des tables interrogées et accordéon pliable pour la réflexion du modèle (`<think>`).
  - **Interface de Configuration** : Tiroir déroulant d'options de configuration (Modèle, Température, Contexte).

## 5. Contraintes et Prérequis

- **Matériel cible :** Carte Graphique dédiée avec minimum 8 Go de VRAM.
- **Dépendances :** React (Vite/TS), Python 3.12 (uv), PostgreSQL 16 (Docker), Ollama (local).
- **Règles d'or appliquées :** Zéro Legacy, respect strict du SOLID et du DRY, typage TypeScript strict.
- **Règles de Code (Globaux) :** "Zéro Legacy", architecture SOLID/DRY, utilisation systématique d'outils d'année en cours.
