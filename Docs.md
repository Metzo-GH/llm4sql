# Cahier des Charges : Assistant SQL Local via LLM (local)

## 1. Contexte et Objectifs

L'interrogation de bases de données relationnelles nécessite aujourd'hui des compétences techniques spécifiques (maîtrise du langage SQL). Dans un contexte professionnel ou académique, les administrateurs et décideurs ont besoin d'accéder rapidement aux données sans passer par des requêtes manuelles complexes.

Cependant, l'utilisation d'Intelligences Artificielles génératives cloud pose un risque majeur de confidentialité, car elle implique d'exposer le schéma des bases de données et potentiellement des données sensibles à des serveurs tiers.

**L'objectif de ce projet** est de développer une application souveraine, tournant à 100% en local, permettant d'interroger une base de données en langage naturel. L'outil garantit une sécurité totale des données tout en offrant une interface utilisateur moderne et accessible.

## 2. Périmètre Fonctionnel

- **Interface Utilisateur (UI) :** Application web permettant la saisie de questions en langage naturel (ex: _"Affiche-moi la liste des étudiants en alternance"_).
- **Traduction Naturel -> SQL :** Génération automatique de requêtes SQL.
- **Sécurité "Human-in-the-loop" :** Affichage de la requête SQL générée pour validation par l'utilisateur avant son exécution réelle sur la base de données.
- **Restitution des données :** Affichage des résultats sous forme de tableau.
- **Architecture Souveraine :** Aucune donnée ou métadonnée ne quitte la machine locale.

## 3. Architecture Technique

Le projet s'articule autour d'une architecture modulaire moderne :

- **Frontend :** `React` (Interface utilisateur réactive et gestion de l'état).
- **Backend / API :** `Python (FastAPI)` (Création de l'API REST, rapidité d'exécution et documentation auto-générée).
- **Orchestration IA :** `LangChain` (Gestion du prompt engineering, du RAG et du cycle de vie de la requête).
- **Moteur LLM Local :** `Ollama` exécutant le modèle **Qwen 3.5 (9B)** sur GPU (RTX 4070 - 8 Go VRAM).
- **Connexion Données :** Intégration via le standard MCP (Model Context Protocol) pour une exposition sécurisée du schéma SQL au LLM.

## 4. Contraintes et Prérequis

- **Matériel cible :** 16 Go de RAM système, Carte Graphique dédiée avec minimum 8 Go de VRAM.
- **Dépendances :** React (Frontend), Python 3.10+ (Backend), Ollama en service d'arrière-plan.
