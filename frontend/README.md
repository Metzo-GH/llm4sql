# LLM4SQL - Manuel de Référence Technique du Frontend 🎨

Ce dossier contient l'interface utilisateur de **LLM4SQL**, conçue comme une application monopage (SPA) réactive sous **React**, **TypeScript** et **Vite**. L'interface propose un tableau de bord en trois colonnes, offrant un chat-like intelligent, un éditeur de schéma et des visualisations de données.

---

## 🏗️ Architecture Modulaire du Frontend

Le code est modulaire, fortement typé, respecte le principe de responsabilité unique (SRP) et évite l'utilisation du type `any` ou des IIFE de rendu JSX complexes au profit de composants d'affichage isolés.

### Organisation des Répertoires :

```text
frontend/
├── src/
│   ├── assets/                # Logos et icônes statiques
│   ├── config/                # Configurations transverses
│   │   └── api.ts             # Centralisation des ports et endpoints (Port 8000 backend)
│   ├── hooks/                 # Hooks de gestion d'état logique (Séparation Vue/Logique SRP)
│   │   ├── useChat.ts         # Hook d'orchestration du chat et flux SSE allégé
│   │   ├── useChatConfig.ts   # Paramètres LLM (modèle, temp, ctx) et persistance localStorage
│   │   ├── useOllamaStatus.ts # Sondes de disponibilité API & métriques VRAM/GPU Ollama
│   │   └── useSandbox.ts      # Hook de gestion de l'environnement isolé (Sandbox)
│   ├── components/            # Composants graphiques réutilisables et mémorisés
│   │   ├── benchmark/         # Sous-composants du banc d'évaluation (SRP)
│   │   │   ├── BenchmarkCaseItem.tsx      # Ligne de cas de test avec accordéon télémétrique
│   │   │   ├── BenchmarkCaseModal.tsx     # Dialogue modal d'ajout/édition de question
│   │   │   └── BenchmarkSummaryCards.tsx  # Cartes de synthèse des scores d'exactitude
│   │   ├── chat/              # Sous-composants liés au chat intelligent
│   │   │   ├── ChatMessage.tsx        # Bulle de message unitaire
│   │   │   ├── PerformanceMetrics.tsx # Affichage des temps d'inférence (tokens/s)
│   │   │   ├── SqlCodeBlock.tsx       # Bloc SQL colorisé avec édition et copie
│   │   │   ├── StepsTracker.tsx       # Checklist animée des logs d'outils (SSE)
│   │   │   └── ThinkingAccordion.tsx  # Accordéon rétractable pour la pensée (<think>)
│   │   ├── explorer/          # Composants de navigation des données
│   │   │   └── DataExplorerPanel.tsx  # Panneau de l'explorateur (Tableau/Graphique)
│   │   ├── layout/            # Composants de structure et mise en page
│   │   │   └── AppHeader.tsx          # Bandeau d'en-tête et navigation principale
│   │   ├── sandbox/           # Composants du laboratoire SQL
│   │   │   └── SandboxPanel.tsx       # Formulaire de structure DDL et d'insertions
│   │   ├── settings/          # Composants de configuration de l'application
│   │   │   └── SettingsDropdown.tsx   # Liste de sélection du modèle et paramètres
│   │   ├── BenchmarkPanel.tsx # Panneau du banc d'évaluation et télémétrie de benchmark
│   │   ├── ChatInterface.tsx  # Conteneur principal du chat
│   │   ├── DataTable.tsx      # Grille interactive paginée avec export CSV
│   │   ├── DataVisualization.tsx # Graphiques adaptatifs (Recharts)
│   │   └── SchemaVisualizer.tsx  # Rendu de diagramme Mermaid (Thème Papier/Sombre) et cartes
│   ├── types/                 # Typage strict TypeScript
│   │   └── chat.ts            # Modèles pour les messages, tool calls, logs SSE et lignes SQL
│   ├── utils/                 # Fonctions utilitaires
│   │   ├── context.ts         # Calcul de jauge de contexte Ollama
│   │   ├── logParser.ts       # Extraction des événements SSE du backend
│   │   ├── sqlParser.ts       # Parser DDL & simplificateur universel de types SQL
│   │   └── thinkingParser.ts  # Parsing de la réflexion (<think>) jeton par jeton
│   ├── App.tsx                # Composant racine (Lazy Loading & Suspense)
│   ├── index.css              # Design System moderne, thèmes Papier/Onyx et Glassmorphism
│   └── main.tsx               # Point d'entrée de React
├── Dockerfile                 # Image de production multi-stage (Node 22 -> Nginx Alpine)
├── nginx.conf                 # Configuration Nginx avec reverse proxy SSE (/api) et SPA
├── index.html                 # Index HTML (optimisé pour le SEO et le chargement des polices)
├── package.json               # Dépendances et scripts npm
├── tsconfig.json              # Configuration TypeScript strict
└── vite.config.ts             # Configuration du bundler Vite avec Tailwind v4
```

---

## ⚡ Modes d'Exécution & Déploiement

### Option A : Déploiement Conteneurisé Nginx (Production / Orchestration)
Le frontend est conteneurisé via une image multi-stage (`Node 22 build` ➔ `Nginx Alpine`) intégrant le reverse proxy `/api/` avec support du streaming SSE sans mise en mémoire tampon :
```bash
# Construction et lancement via Docker Compose (à la racine)
docker compose up frontend --build -d
```

### Option B : Mode Développement Local (Vite HMR)
Pour développer avec rechargement à chaud instantané :

1. **Installation des dépendances** :
   ```bash
   npm install
   ```

2. **Lancement du serveur de développement** :
   ```bash
   npm run dev
   ```
   L'interface est accessible sur **[http://localhost:5173/](http://localhost:5173/)**.

3. **Validation & Compilation de Production** :
   ```bash
   npm run build
   ```
   *Exécute la vérification TypeScript en mode strict (`tsc -b`) puis le bundler Vite.*

---

## 🔄 Gestion d'État & Hooks Personnalisés

Pour conserver des composants graphiques purs et maintenables, la logique métier est déportée dans des hooks personnalisés :

### Hook `useChat.ts`
- **Flux SSE (Server-Sent Events)** : Intercepte les événements asynchrones du backend et les convertit en flux de messages.
- **Extraction sémantique** : Parse en continu la pensée de l'agent (`<think>`) et les blocs SQL générés pour éviter les décalages de rendu.
- **Persistance locale** : Enregistre automatiquement les réglages de l'utilisateur (température, modèle sélectionné, taille de contexte) dans le `localStorage` du navigateur.
- **Mémorisation** : Utilise `useCallback` pour stabiliser les gestionnaires de soumission de formulaires et éviter des rendus inutiles.

### Hook `useSandbox.ts`
- **Gestion Sandbox** : Gère l'initialisation du schéma isolé et l'exécution de requêtes personnalisées.
- **Optimisation** : Émet des alertes toast personnalisées lors du succès ou de l'échec de la création du schéma sans recourir à des boîtes de dialogue bloquantes.

### Navigation Bi-Modale & Architecture Racine (`App.tsx`)
Le composant racine orchestre le basculement instantané entre deux modes principaux via un système d'onglets ARIA et le chargement paresseux (`React.lazy` + `Suspense`) :
- **Mode Chat & Exploration (`chat`)** : Grille modulaire à 3 colonnes réunissant le Laboratoire Sandbox (`SandboxPanel`), le Chat ReAct (`ChatInterface`), et l'Explorateur analytique (`DataExplorerPanel`).
- **Mode Banc d'Évaluation (`benchmark`)** : Espace dédié plein écran piloté par `BenchmarkPanel` pour l'évaluation automatisée de modèles LLM.

---

## 🎨 Design System & Esthétique Glassmorphic

Le style visuel est centralisé dans **`index.css`** (sans CSS en ligne dans les composants) et s'appuie sur une esthétique haut de gamme :
- **Glassmorphism** : Arrière-plans semi-transparents (`backdrop-filter: blur(16px)`), bordures fines lumineuses et ombres portées floues.
- **Typographie premium** : Chargement asynchrone des polices Google Fonts (*Outfit* pour les titres futuristes et *Inter* pour le corps de texte).
- **Thème sombre persistant** : Dégradés radiaux profonds (nuances de gris bleuté spatial) et micro-animations fluides lors des hovers.

---

## 📊 Moteurs de Rendu et Visualisations

### Banc d'Évaluation & Télémétrie (`BenchmarkPanel.tsx`)
- **Streaming SSE Temps Réel** : Consommation de l'endpoint `/api/eval/stream` via `EventSource`, avec affichage progressif de la jauge et des cartes de résultats au fil de l'évaluation.
- **Gestionnaire d'Arrêt Réactif** : Bouton d'interruption immédiat déclenchant `POST /api/eval/stop` avec fermeture propre de la connexion réseau.
- **CRUD Dataset & Télémétrie LangGraph** : Formulaire d'ajout/modification/suppression de cas de test (`/api/eval/cases`) et accordéons dépliables dévoilant la chaîne de pensée (`<think>`), les outils MCP appelés et la comparaison en miroir Ground Truth vs SQL IA.

### Rendu de Schéma (`SchemaVisualizer.tsx`)
- **Vue Cartes** : Analyse les scripts DDL et génère des cartes interactives avec navigation au clavier (`tabIndex={0}`). Un système de surbrillance met en valeur les relations de clés étrangères au survol.
- **Vue Diagramme Mermaid ERD** : Intègre `mermaid.js` de manière stable et sécurisée (`DOMPurify.sanitize`).
  - **Thème Papier (Clair) 📄 & Sombre 🖤** : Rendu classique d'ingénierie type Workbench/dbdiagram (fond blanc millimétré, bordures noires nettes, typographie contrastée) avec bascule instantanée.
  - **Types SQL Universels et Compacts** : Simplification automatique des types de données (`varchar`, `int`, `decimal`, `timestamp`, `bool`) sans chaînes verbeuses.
  - **Mode Plein Écran Immersif & Zoom Centré** : Navigation grand format avec centrage géométrique vectoriel et échelle adaptative (100%, 135%, +/-).

### Tableau et Data Viz (`DataTable.tsx` & `DataVisualization.tsx`)
- **Tableau & Virtualisation** : Affiche les résultats paginés ou virtualisés avec `@tanstack/react-virtual` (activation automatique conditionnelle au-delà de 500 lignes en mode « Tout afficher »), mémorise les colonnes et KPIs calculés (`useMemo`) et intègre un bouton d'export CSV encodé avec un marqueur UTF-8 BOM (`\uFEFF`) pour une compatibilité Excel native.
- **Graphiques** : Rendu adaptatif propulsé par **Recharts** (Aires, Courbes, Barres) adaptant automatiquement ses axes en fonction des types de données détectés.


---

## ♿ Normes d'Accessibilité (a11y)

L'interface applique des pratiques d'accessibilité de niveau production :
- **Navigation Clavier** : Les cartes de schémas et boutons personnalisés sont focusables au clavier. L'activation se fait par appui sur `Entrée` ou `Espace`.
- **Rôles ARIA** : Utilisation de `role="tablist"`, `role="tab"` et `role="log"` pour structurer l'interface vis-à-vis des lecteurs d'écran.
- **États dynamiques** : Liaison d'attributs `aria-selected`, `aria-expanded` et `aria-live="polite"` sur les éléments interactifs et les conteneurs de logs asynchrones.
