# LLM4SQL - Interface Utilisateur Web (Vite + React + TS) 🎨

Ce dossier contient l'interface utilisateur web moderne et réactive de **LLM4SQL**, conçue pour offrir un tableau de bord de type "Chat-like" avec visualisation de données intégrée.

---

## 🏗️ Architecture Modulaire du Frontend

Le frontend utilise **React**, **TypeScript** et **Vite** pour fournir une application performante et typée. Le code est modulaire, respectant le principe de responsabilité unique (SRP) et optimisé pour le chargement paresseux (*Lazy Loading*).

### Organisation des Répertoires :

```text
frontend/
├── src/
│   ├── assets/                # Logos et icônes statiques
│   ├── components/            # Composants graphiques modulaires
│   │   ├── chat/              # Sous-composants liés au chat
│   │   │   ├── ChatMessage.tsx        # Message de chat unitaire (auteurs IA/Humain)
│   │   │   ├── PerformanceMetrics.tsx # Affichage des métriques de temps/Tokens du LLM
│   │   │   ├── SqlCodeBlock.tsx       # Composant d'affichage de code SQL colorisé
│   │   │   ├── StepsTracker.tsx       # Télémétrie en direct des appels d'outils (SSE)
│   │   │   └── ThinkingAccordion.tsx  # Accordéon affichant la pensée de l'agent
│   │   ├── explorer/          # Composants de navigation des données
│   │   │   └── DataExplorerPanel.tsx  # Panneau de visualisation des tables
│   │   ├── sandbox/           # Composants de gestion de l'environnement isolé
│   │   │   └── SandboxPanel.tsx       # Panneau de contrôle du bac à sable SQL
│   │   ├── settings/          # Composants de configuration de l'application
│   │   │   └── SettingsDropdown.tsx   # Liste de sélection du modèle et paramètres
│   │   ├── ChatInterface.tsx  # Conteneur principal du module de chat
│   │   ├── DataTable.tsx      # Table interactive de données paginée (export CSV)
│   │   ├── DataVisualization.tsx # Graphiques réactifs et dynamiques (Recharts)
│   │   └── SchemaVisualizer.tsx  # Moteur de rendu Mermaid et cartes DDL
│   ├── config/                # Fichiers de configuration transverses
│   ├── hooks/                 # Custom hooks React réutilisables
│   ├── types/                 # Fichiers de définitions de types TypeScript
│   │   └── chat.ts            # Interfaces strictes pour l'API de chat (ToolCall, Message, etc.)
│   ├── utils/                 # Fonctions utilitaires transversales (helpers)
│   │   ├── context.ts         # Contexte et helpers globaux
│   │   ├── logParser.ts       # Parser de logs asynchrones SSE
│   │   └── thinkingParser.ts  # Extracteur des blocs de pensée (<thinking>)
│   ├── App.tsx                # Composant racine orchestrateur (Lazy loading & Suspense)
│   ├── index.css              # Design System CSS moderne (thème Glassmorphism)
│   └── main.tsx               # Point d'entrée React / Vite
├── index.html                 # Point d'entrée HTML
├── package.json               # Scripts et dépendances npm
├── tsconfig.json              # Configuration TypeScript stricte
└── vite.config.ts             # Configuration du bundler Vite
```

### Optimisations & Bonnes Pratiques Frontend :
- **Code-Splitting (Chargement Différé)** : Chargement à la demande des panneaux complexes (`SandboxPanel`, `DataExplorerPanel`, `SettingsDropdown`) via `React.lazy()` et `Suspense`, permettant de réduire la taille du bundle JavaScript initial (gain de 1.4 Mo au chargement).
- **Accessibilité (a11y)** : Intégration d'attributs `aria-label` descriptifs sur la totalité des boutons de navigation de graphes, filtres, paginations de tables et exports pour assurer la compatibilité avec les lecteurs d'écran.
- **Typage TypeScript Strict** : Aucun recours au type `any`. Les réponses d'outils asynchrones, les états et les tooltips complexes de Recharts sont intégralement modélisés et typés via des interfaces stables.
- **Rendu Déterministe de Schéma** : La vue Mermaid.js utilise le parseur DDL du backend sans aucun appel au LLM, réduisant la latence à <1ms et prévenant les erreurs d'interprétation de graphes.

---

## 💎 Design System & Esthétique Premium

L'interface est construite avec du **CSS moderne natif** et propose une identité visuelle à fort impact :
- **Thème Spatial Glassmorphic** : Arrière-plans semi-transparents avec flous directionnels (`backdrop-filter: blur(16px)`), dégradés radiaux profonds et lueurs de bordure actives (`border: 1px solid var(--border-glow)`).
- **Typographies Modernes** : Intégration de *Outfit* pour les titres imposants et futuristes, et de *Inter* pour une lisibilité de lecture optimale.
- **Grille Desktop Plein Écran** : Agencement asymétrique rééquilibré sur 3 colonnes pour occuper 100% de la largeur d'écran :
  - **Colonne 1 (360px) : Laboratoire SQL (Sandbox)**. Permet de configurer le schéma, d'injecter des données de test et de visualiser le schéma de base.
  - **Colonne 2 (1.2fr) : Assistant SQL (Chat)**. Zone principale de messagerie, affichant le dialogue, la requête SQL générée (avec bouton interactif "Copier") et les métadonnées de correction.
  - **Colonne 3 (1fr) : Explorateur de Données**. Panneau multifonction permettant de parcourir les résultats sous forme de tableau interactif paginé (avec export CSV) ou de graphiques réactifs (Bar, Line, Area).

---

## 🛠️ Fonctionnalités Majeures de l'Interface

### 1. Laboratoire SQL (Sandbox)
Un espace de configuration locale dynamique composé de 3 onglets :
- **Onglet Schéma :** Permet de saisir son code de structure `CREATE TABLE`.
- **Onglet Données :** Permet d'insérer des données de simulation `INSERT INTO`.
- **Onglet Visuel (Double affichage) :**
  - **Vue Cartes Interactives 🎴 :** Analyse le code SQL DDL en temps réel (côté client) pour afficher des fiches de tables détaillant les noms, types SQL colorés thématiquement et badges d'identifiants (`🔑 PK` pour clé primaire, `🔗 FK` pour clé étrangère). Cliquer sur une table met en évidence ses dépendances relationnelles.
  - **Vue Diagramme ER 📊 :** Rendu graphique stable Mermaid.js qui trace le schéma relationnel de manière déterministe et instantanée (<1ms) grâce au parseur DDL Python du backend (endpoint `/api/sandbox/visualize`), garantissant une syntaxe Mermaid 100% valide et sans erreur.

### 2. Messagerie Agentique & Auto-Correction
- **Bulle de dialogue fluide** affichant les messages en temps réel.
- **Bloc SQL avec bouton "Copier"** : Permet de récupérer instantanément la requête SQL générée par l'IA d'un simple clic.
- **Badge d'état de Self-Healing** : Indique si la requête a été auto-corrigée en arrière-plan par le moteur LangGraph et en combien de tentatives.

### 3. Explorateur de Données
- **Vue Tableau :** Grille de résultats paginée avec filtrage local instantané et export CSV natif encodé en UTF-8 BOM pour une compatibilité parfaite avec Microsoft Excel.
- **Vue Graphique :** Rendu réactif propulsé par **Recharts** proposant 3 types de diagrammes (Histogramme, Courbe, Aire). Les axes X et Y s'adaptent automatiquement en détectant les types de données textuels et numériques.

---

## 🚀 Guide de Démarrage Rapide

### Prérequis
Assurez-vous d'avoir installé **Node.js (v18+)** et d'avoir démarré le backend FastAPI sur le port `8500` au préalable.

### Étape 1 : Installation des dépendances
Positionnez-vous dans le dossier `frontend` et installez les paquets requis :
```bash
npm install
```

### Étape 2 : Lancement en mode Développement
Démarrez le serveur de développement local de Vite :
```bash
npm run dev
```
L'interface est accessible instantanément à l'adresse suivante : [http://localhost:5173/](http://localhost:5173/).

### Étape 3 : Build de Production (TS & Bundle Check)
Pour compiler et optimiser l'application pour la production, exécutez :
```bash
npm run build
```
Le bundle compilé et minifié sera généré dans le dossier `/dist`.
