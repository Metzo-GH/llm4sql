# LLM4SQL - Assistant & Sandbox SQL Local Privé 🚀

**LLM4SQL** est une application locale et isolée, s'exécutant **à 100% en local**, conçue pour traduire des questions en langage naturel en requêtes PostgreSQL valides, les exécuter de manière isolée et restituer les données de façon interactive (Tableaux filtrés, Graphiques adaptatifs et Export CSV).

L'outil intègre un **bac à sable (Sandbox) dynamique** permettant de charger n'importe quelle structure de base de données à la volée, de modéliser les tables en direct sous forme de cartes relationnelles interactives ou de diagrammes ER Mermaid, et d'interroger cette base sur-mesure via une boucle d'auto-correction intelligente (*Self-Healing*).

---

## 🎨 Aperçu des Fonctionnalités Clés

- **Messagerie IA Locale & Self-Healing** : Moteur d'orchestration agentique basé sur **LangGraph** et **Qwen 3.5 (4B)**. Si une requête SQL générée échoue, l'agent capture l'erreur PostgreSQL et se corrige de façon autonome.
- **Sécurité Absolue (Defense in Depth)** : Validation syntaxique stricte des requêtes générées via l'arbre AST **SQLGlot** (interdit toute altération type `DROP`, `DELETE`, `UPDATE`), pilotes DB physiquement forcés en **Lecture Seule** (`readonly = True`) et isolation totale de la Sandbox.
- **Laboratoire Visuel de Schéma** :
  - **Vue Cartes 🎴 (Parsing temps réel)** : Modélisation dynamique du DDL (`CREATE TABLE`) affichant les attributs, types HSL colorés et badges de clés (`🔑 PK`, `🔗 FK`) avec détection de liens relationnels.
  - **Vue Diagramme ER 📊 (Mermaid)** : Diagramme de relations généré automatiquement par l'IA locale de manière stable et résiliente.
- **Visualisation & Exportation** : Rendu des données sous forme de grilles paginées avec export CSV compatible Excel (UTF-8 BOM), et tracés graphiques réactifs (Histogrammes, Courbes, Aires) avec **Recharts**.

---

## 📂 Organisation du Dépôt

Le projet est structuré de manière propre et modulaire, respectant les principes **SOLID** et **DRY** :

- **[`/backend`](backend)** : Moteur d'API FastAPI, serveur Model Context Protocol (MCP), agent intelligent LangGraph, et base de données PostgreSQL Dockerisée.
- **[`/frontend`](frontend)** : Interface utilisateur Web premium single-page sous Vite, React, TypeScript et CSS Glassmorphic.
- **[`Docs.md`](Docs.md)** : Cahier des charges global, spécifications fonctionnelles et jalons du projet (100% validé).
- **[`health_audit.md`](health_audit.md)** : Rapport complet d'audit de sécurité, de dette technique (violations SRP/DRY) et de conformité OWASP.

---

## 🛠️ Guide de Démarrage Ultra-Rapide

### 1. Démarrer l'infrastructure et le Backend
Un script d'automatisation PowerShell configure et lance tout le backend en une seule commande sous Windows :
```powershell
cd backend
.\start_backend.ps1
```
*(Inscrit les variables d'optimisation VRAM dans le profil utilisateur Windows, redémarre Ollama, lance PostgreSQL 16 dans Docker sur le port `5433`, peuple la base et lance le serveur FastAPI sur le port `8500` pour contourner les plages d'exclusions d'Hyper-V).*

### 2. Démarrer l'Interface Web (Vite + React)
```bash
cd frontend
npm install
npm run dev
```
L'interface est accessible instantanément sur : [http://localhost:5173/](http://localhost:5173/).

---

## 🧪 Suite de Validation et Tests

Pour exécuter la suite complète de 24 tests unitaires et d'intégration couvrant la sécurité, le self-healing et les routes d'API, positionnez-vous dans le dossier backend et lancez :
```bash
uv run pytest
```
