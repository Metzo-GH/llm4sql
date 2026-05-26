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
- **Moteur LLM Local :** `Ollama` exécutant le modèle **Qwen 3.5 (9B)** sur GPU (RTX 4070 - 8 Go VRAM).
- **Connexion Données :** Intégration via le standard MCP (Model Context Protocol) pour une exposition sécurisée et dynamique du schéma SQL au LLM.

## 4. Les 4 Phases du Projet

### Phase 1 : Le POC, le Moteur et l'Environnement
- **Objectif :** Valider l'environnement d'exécution local (LLM + Python).
- **Tâches :** 
  - Initialiser l'environnement de développement Python avec `uv`.
  - Installer Ollama et télécharger le modèle Qwen 3.5 (9B).
  - Créer une base de données relationnelle de test avec PostgreSQL.
  - Écrire un script Python basique qui valide que le modèle parvient à générer une requête SQL valide à partir du schéma.

### Phase 2 : Le Cœur (Agent LangGraph & MCP)
- **Objectif :** Rendre l'IA robuste face aux erreurs SQL grâce à l'orchestration.
- **Tâches :** 
  - Mettre en place un serveur/client MCP pour exposer la base de données de test au LLM.
  - Implémenter l'agent intelligent avec **LangGraph** :
    1. Le LLM génère le SQL.
    2. Exécution du SQL.
    3. Si erreur, retour à l'état de génération avec l'erreur comme feedback.
  - Implémenter le système de **RAG dynamique** : base vectorielle stockant des exemples (Few-shot) pour améliorer la génération initiale.

### Phase 3 : L'Écosystème Web (FastAPI + React/Vite)
- **Objectif :** Fournir une interface métier exploitable et agréable.
- **Tâches :** 
  - Packer le script d'orchestration dans une API REST avec **FastAPI**.
  - Initialiser un frontend moderne avec **Vite + React (TypeScript)**.
  - Développer l'interface de "Chat" conversationnel.
  - Intégrer l'affichage du tableau de résultats.
  - Implémenter la **Data Visualisation** (graphiques intelligents selon les données) et l'**Export CSV**.

### Phase 4 : Tests, Ajustements
- **Objectif :** Garantir la solidité de la solution et préparer le livrable final.
- **Tâches :** 
  - Mettre la boucle de rétroaction à l'épreuve avec des questions métier "tordues".
  - Vérifier la robustesse (Edge cases, sécurité basique).
  - Rédiger la documentation (JSDoc/TSDoc, README).

## 5. Contraintes et Prérequis

- **Matériel cible :** Carte Graphique dédiée avec minimum 8 Go de VRAM.
- **Dépendances :** React (Frontend), Python 3.10+ (Backend), Ollama en service d'arrière-plan.
- **Règles de Code (Globaux) :** "Zéro Legacy", architecture SOLID/DRY, utilisation systématique d'outils d'année en cours.
