# Cahier des Charges : Assistant SQL Local via LLM (local)

## 1. Contexte et Objectifs

L'interrogation de bases de données relationnelles nécessite aujourd'hui des compétences techniques spécifiques (maîtrise du langage SQL). Dans un contexte professionnel ou académique, les administrateurs et décideurs ont besoin d'accéder rapidement aux données sans passer par des requêtes manuelles complexes.

Cependant, l'utilisation d'Intelligences Artificielles génératives cloud pose un risque majeur de confidentialité, car elle implique d'exposer le schéma des bases de données et potentiellement des données sensibles à des serveurs tiers.

**L'objectif de ce projet (LLM4SQL)** est de développer une application souveraine, tournant à 100% en local, permettant d'interroger une base de données en langage naturel. L'outil garantit une sécurité totale des données tout en offrant une interface utilisateur moderne et accessible, avec une boucle d'auto-correction pour garantir la fiabilité des requêtes générées.

## 2. Périmètre Fonctionnel

- **Interface Utilisateur (UI) :** Application web de type "Chat" (historique conversationnel) permettant la saisie itérative de questions en langage naturel.
- **Traduction Naturel -> SQL :** Génération automatique de requêtes SQL pertinentes via LLM local.
- **Boucle d'Auto-correction (Self-Healing) :** Si le code SQL généré est invalide, l'erreur est renvoyée au LLM pour qu'il la corrige de manière autonome avant de présenter le résultat à l'utilisateur.
- **Sécurité "Human-in-the-loop" :** Affichage de la requête SQL générée pour validation par l'utilisateur avant son exécution réelle sur la base de données.
- **Restitution des données :** 
  - Affichage des résultats sous forme de tableau.
  - Visualisation de données (Data Viz) automatique via des graphiques adaptés au type de résultat (ex: Recharts).
  - Bouton d'export CSV pour une exploitation métier immédiate.
- **Architecture Souveraine :** Aucune donnée ou métadonnée ne quitte la machine locale.

## 3. Architecture Technique Cible

Le projet s'articule autour d'une architecture modulaire moderne respectant les principes SOLID/DRY :

- **Frontend :** `React` propulsé par `Vite`, implémentant une UI moderne (composants Shadcn ou similaires), avec typage strict (TypeScript) et documentation TSDoc.
- **Backend / API :** `Python (FastAPI)` géré via `uv` (le standard moderne de gestion de dépendances et d'environnement virtuel Python, ultra-rapide).
- **Orchestration IA :** `LangGraph` (écosystème LangChain) pour orchestrer la boucle de rétroaction complexe et la gestion d'état de l'agent.
- **RAG / Few-Shot Prompting :** Intégration d'une petite base vectorielle locale (ex: Chroma) pour fournir dynamiquement les exemples de requêtes les plus pertinents (Few-Shot Prompting).
- **Moteur LLM Local :** `Ollama` exécutant le modèle **Qwen 3.5 (9B)** sur GPU (8 Go VRAM minimum).
- **Connexion Données :** Intégration via le standard MCP (Model Context Protocol) pour une exposition sécurisée et dynamique du schéma SQL au LLM.

## 4. Les 4 Phases du Projet & État d'Avancement

### Phase 1 : Le POC, le Moteur et l'Environnement (100% VALIDÉE)
- **Objectif :** Valider l'environnement d'exécution local (LLM + Python + PostgreSQL).
- **État :** Terminé avec succès.
- **Tâches et Checklist :** 
  - [x] **Initialiser l'environnement de développement Python avec `uv`** (création du `.venv`, gestionnaire ultra-rapide validé dans `backend/`).
  - [x] **Configurer Ollama et valider le modèle local** (utilisation avec succès du modèle `qwen3.5:9b` en local).
  - [x] **Créer une base de données relationnelle locale robuste sous Docker Compose** (PostgreSQL 16 configuré et lancé sur le port **5433** pour éviter tout conflit avec un service PostgreSQL Windows natif).
  - [x] **Initialiser le schéma et peupler le jeu de données cible** (jeu de données de Bandes Dessinées "ouvrages" avec tables `personne`, `serie`, `ouvrage`, `concept`, `a_pour_mot_cle` et `avis`, peuplé via `seed_db.py`).
  - [x] **Développer le script POC d'intégration complète (`test_llm_db.py`)** (connexion à PostgreSQL, lecture automatique du schéma SQL de façon dynamique, sollicitation d'Ollama/Qwen 3.5 en français, génération de la requête SQL valide, et exécution en base pour en afficher les résultats).

### Phase 2 : Le Cœur (Agent LangGraph & MCP) (EN ATTENTE)
- **Objectif :** Rendre l'IA robuste face aux erreurs SQL grâce à l'orchestration.
- **Tâches :** 
  - [ ] **Mettre en place un serveur MCP Python sur-mesure (Option B)** (serveur souverain sécurisé en lecture seule, bloquant les requêtes d'écriture/destruction comme `DROP`, `DELETE` ou `UPDATE`).
  - [ ] **Implémenter l'agent intelligent avec LangGraph** (boucle génération SQL -> exécution -> détection d'erreur -> feedback d'auto-correction).
  - [ ] **Implémenter le RAG de Few-Shot Prompting** (vectorisation et injection dynamique d'exemples de requêtes pertinents pour guider le modèle).

### Phase 3 : L'Écosystème Web (FastAPI + React/Vite) (EN ATTENTE)
- **Objectif :** Fournir une interface métier exploitable et agréable.
- **Tâches :** 
  - [ ] **Encapsuler l'agent dans FastAPI** (routes d'exécution de requêtes, flux SSE pour le streaming, historique).
  - [ ] **Initialiser le frontend moderne Vite + React + TypeScript** (mise en place de la stack, JSDoc/TSDoc).
  - [ ] **Développer l'UI conversationnelle** (Chat fluide avec affichage du SQL généré, bouton de validation Human-in-the-loop).
  - [ ] **Concevoir la visualisation de données** (rendu tabulaire dynamique, graphiques intelligents auto-adaptés avec Recharts et export CSV).

### Phase 4 : Tests, Ajustements & Clôture (EN ATTENTE)
- **Objectif :** Garantir la solidité de la solution et préparer le livrable final.
- **Tâches :** 
  - [ ] **Faire passer des tests avancés** (stress-test du self-healing avec des questions complexes, y compris des requêtes récursives standard).
  - [ ] **Vérifier la robustesse globale** (sécurité anti-injection SQL basique, gestion d'erreurs d'infrastructure).
  - [ ] **Finaliser la documentation** (JSDoc/TSDoc sur l'ensemble du projet, README complets).

## 5. Contraintes et Prérequis

- **Matériel cible :** Carte Graphique dédiée avec minimum 8 Go de VRAM.
- **Dépendances :** React (Frontend), Python 3.10+ (Backend), Ollama en service d'arrière-plan.
- **Règles de Code (Globaux) :** "Zéro Legacy", architecture SOLID/DRY, utilisation systématique d'outils d'année en cours.
