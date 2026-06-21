# LLM4SQL - Assistant SQL & Sandbox Local Privé 🚀

**LLM4SQL** est une solution complète, privée et sécurisée conçue pour traduire des questions en langage naturel en requêtes SQL valides, les exécuter de manière isolée et restituer les résultats sous forme interactive (tableau de données, graphiques réactifs et export CSV).

L'application s'exécute **à 100% en local** sur votre machine pour garantir une confidentialité totale des données et du schéma de votre base. Elle intègre également un **bac à sable (Sandbox) SQL** dynamique pour modéliser instantanément n'importe quel code DDL (`CREATE TABLE`) sous forme de diagrammes ER Mermaid.js et tester des requêtes.

---

## 🏗️ Architecture Globale Conceptuelle

L'application est structurée selon un modèle modulaire moderne qui distribue les responsabilités de manière étanche :

```mermaid
graph TD
    subgraph Frontend [Client Web (Vite + React + TS)]
        UI[Interface Graphique]
        State[Gestion d'État & Hooks - useChat / useSandbox]
        Viz[Restitution - Recharts, DataTable, Mermaid]
    end

    subgraph Backend [Serveur API (FastAPI)]
        API[Routes REST /api/chat, /api/sandbox, /api/schema]
        Cache[Cache Sémantique & Cache Schéma Thread-Safe]
        Agent[Orchestrator Agentique - LangGraph]
        Parser[Analyseur DDL Mermaid déterministe]
    end

    subgraph Infrastructure [Services Locaux]
        Postgres[(PostgreSQL 16 en conteneur Docker - Port 5433)]
        Ollama[Ollama - Inférence LLM local & Embeddings]
    end

    %% Relations
    UI <-->|API REST / SSE Logs| API
    API <--> Cache
    API <--> Agent
    API <--> Parser
    Agent <-->|Modèle / Embeddings| Ollama
    Agent <-->|Requêtes / MCP Server| Postgres
    Parser <---|Code DDL| API
```

---

## 🧭 Guide d'Orientation & Documentation

Pour faciliter l'accès aux détails techniques et fonctionnels du projet, la documentation est structurée par domaine. Cliquez sur les liens ci-dessous selon votre besoin :

### 📘 Spécifications Fonctionnelles & Modèles Métiers
* Pour comprendre le cahier des charges, les fonctionnalités de chaque écran (Chat, Sandbox, Explorateur) ou la structure de la base de données d'exercice "Ouvrages BD", consultez le **[Cahier des Charges & Walkthrough (Docs.md)](./Docs.md)**.

### ⚙️ Guide Technique & Installation Backend
* Pour installer les prérequis, optimiser Ollama sous Windows, comprendre le graphe d'orchestration LangGraph, la sécurité par validation AST (SQLGlot) et l'accès thread-safe au pool de connexions PostgreSQL, consultez le **[Manuel Technique Backend (backend/README.md)](./backend/README.md)**.

### 🎨 Guide Technique & Conception Frontend
* Pour configurer l'environnement Node.js, analyser la décomposition modulaire des composants React, comprendre l'optimisation par *Code-Splitting* (lazy loading) et la mise en conformité d'accessibilité (a11y), consultez le **[Manuel Technique Frontend (frontend/README.md)](./frontend/README.md)**.

---

## 🎥 Démonstration Vidéo

Vous pouvez visualiser le fonctionnement complet de l'application (dialogue, self-healing et visualisation de données en temps réel) :

<video src="./Demo.mp4" width="100%" height="auto" controls alt="Vidéo de démonstration de LLM4SQL">
  Votre navigateur ne prend pas en charge la lecture de vidéos HTML5. Vous pouvez ouvrir la vidéo directement via ce lien : [Regarder la Démo Vidéo (Demo.mp4)](./Demo.mp4).
</video>

---

## ⚡ Démarrage Rapide

### 1. Démarrer le Backend & PostgreSQL
Depuis un terminal PowerShell sous Windows, lancez le script d'optimisation et d'initialisation automatique :
```powershell
cd backend
.\start_backend.ps1
```
*Ce script configure Ollama pour optimiser la mémoire VRAM, démarre PostgreSQL dans Docker, peuple la base et lance le serveur FastAPI.*

### 2. Démarrer le Frontend (Vite)
Depuis un second terminal :
```bash
cd frontend
npm install
npm run dev
```
L'application est disponible immédiatement sur **[http://localhost:5173](http://localhost:5173)**.
