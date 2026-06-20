# MEMORY - Suivi des décisions et préférences

Ce fichier contient la mémoire à long terme du projet, les choix d'architecture clés et les préférences utilisateur pour les sessions futures.

## Préférences et Règles Globales
- **Modèle LLM Local** : `qwen3.5:4b` sous Ollama (Phase 5).
- **Framework & Backend** : FastAPI, LangGraph, PostgreSQL (Docker).
- **Frontend** : React, TypeScript, TailwindCSS v4, Vite.
- **Règles de style** : Zéro Legacy, Partial Diffs uniquement, typage strict TypeScript, TSDoc/JSDoc pour chaque fonction.
- **Persistance UI** : Sauvegarde locale automatique (Modèle, Température, Contexte) dans `localStorage`.

## Décisions d'Architecture Majeures
- **Base de données** : PostgreSQL v16+ via Docker (Port 5433 hôte).
- **Orchestration IA** : LangGraph (moteur agentique avec boucle de Self-Healing).
- **Intégration BDD** : MCP en lecture seule pour sécuriser la base.
- **Taille de contexte par défaut** : Utilisation de la taille native de chaque modèle (valeur `0` dans l'UI et backend), récupérée dynamiquement via l'API Ollama `/api/show` et mise en cache en mémoire, ce qui permet d'afficher la jauge de progression réelle sans forcer un num_ctx fixe.
- **Cache Sémantique** : En mémoire dans FastAPI avec Cosine Similarity (Ollama embed) et fallback Jaccard.
- **Thread-Safety** : Singleton global `get_llm()` sécurisé par verrou double-checked (`threading.Lock`).
- **Observabilité** : SSE (Server-Sent Events) pour le streaming de la réflexion `<think>`, jauge de contexte, logs et checklists.
- **Visualisation de Schéma déterministe** : Remplacement de la génération de diagramme ER Mermaid par IA par un parser SQL DDL écrit en Python dans `sandbox.py` (instantané, sans LLM et 100% correct).
