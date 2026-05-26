# LLM4SQL - AI MAP & Architecture 

## 1. Vision du Projet
Application 100% locale (souveraine) permettant de traduire du langage naturel en requêtes SQL via un LLM (Qwen 3.5 9B) orchestré par LangGraph. 
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

### Phase 1 : Initialisation & POC
- [ ] Initialisation du conteneur PostgreSQL via `docker-compose.yml`.
- [ ] Création du script de peuplement/seed (`seed_db.py`) avec un schéma universitaire d'exemple.
- [ ] Initialisation de l'environnement Python avec `uv`.
- [ ] Script basique validant que Ollama + Qwen 3.5 arrive à se connecter à PostgreSQL et générer un "SELECT" simple.

### Phase 2 : Moteur Agentique (LangGraph & MCP)
- [ ] Implémentation du serveur/client MCP local pour exposer le schéma SQL PostgreSQL.
- [ ] Développement du graphe LangGraph :
    - Nœud 1 : Compréhension & Génération SQL (avec RAG Few-Shot).
    - Nœud 2 : Exécution sécurisée sur PostgreSQL (Human-in-the-loop simulée ou réelle).
    - Edge conditionnel : Si erreur SQL -> Retour Nœud 1 avec l'erreur.
- [ ] Validation de la boucle de correction (Self-healing).

### Phase 3 : L'Écosystème API & Web
- [ ] Encapsulation du moteur LangGraph dans des routes `FastAPI`.
- [ ] Initialisation du projet Vite/React/TS.
- [ ] Implémentation de l'interface Chat (historique, requêtes itératives).
- [ ] Affichage des données (Tableaux dynamiques + Graphiques Recharts + Export CSV).

### Phase 4 : Consolidation & Qualité
- [ ] Validation des principes SOLID/DRY sur l'ensemble du codebase.
- [ ] Ajout de tests unitaires/intégrations clés.
- [ ] Mise à jour du README et finalisation des commentaires JSDoc/TSDoc.

## 4. Règles d'Or du Projet (Rappels)
- **Zéro Legacy** : Utiliser les syntaxes modernes.
- **Partial Diffs** : Les modifications de fichiers existants se feront de manière chirurgicale.
- **Source de Vérité** : Ce fichier `#AI_MAP.md` est la seule référence de l'état du projet et doit être mis à jour après chaque complétion.
