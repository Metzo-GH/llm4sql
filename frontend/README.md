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
│   ├── hooks/                 # Hooks de gestion d'état logique (Séparation Vue/Logique)
│   │   ├── useChat.ts         # Hook d'orchestration du chat et flux SSE
│   │   └── useSandbox.ts      # Hook de gestion de l'environnement isolé (Sandbox)
│   ├── components/            # Composants graphiques réutilisables et mémorisés
│   │   ├── chat/              # Sous-composants liés au chat intelligent
│   │   │   ├── ChatMessage.tsx        # Bulle de message unitaire
│   │   │   ├── PerformanceMetrics.tsx # Affichage des temps d'inférence (tokens/s)
│   │   │   ├── SqlCodeBlock.tsx       # Bloc SQL colorisé avec bouton de copie rapide
│   │   │   ├── StepsTracker.tsx       # Checklist animée des logs d'outils (SSE)
│   │   │   └── ThinkingAccordion.tsx  # Accordéon rétractable pour la pensée (<think>)
│   │   ├── explorer/          # Composants de navigation des données
│   │   │   └── DataExplorerPanel.tsx  # Panneau de l'explorateur (Tableau/Graphique)
│   │   ├── sandbox/           # Composants du laboratoire SQL
│   │   │   └── SandboxPanel.tsx       # Formulaire de structure DDL et d'insertions
│   │   ├── settings/          # Composants de configuration de l'application
│   │   │   └── SettingsDropdown.tsx   # Liste de sélection du modèle et paramètres
│   │   ├── ChatInterface.tsx  # Conteneur principal du chat
│   │   ├── DataTable.tsx      # Grille interactive paginée avec export CSV
│   │   ├── DataVisualization.tsx # Graphiques adaptatifs (Recharts)
│   │   └── SchemaVisualizer.tsx  # Rendu de diagramme Mermaid et cartes interactives
│   ├── types/                 # Typage strict TypeScript
│   │   └── chat.ts            # Modèles pour les messages, tool calls, logs SSE et lignes SQL
│   ├── utils/                 # Fonctions utilitaires
│   │   ├── context.ts         # Calcul de jauge de contexte Ollama
│   │   ├── logParser.ts       # Extraction des événements SSE du backend
│   │   └── thinkingParser.ts  # Parsing de la réflexion (<think>) jeton par jeton
│   ├── App.tsx                # Composant racine (Lazy Loading & Suspense)
│   ├── index.css              # Design System moderne et thémage Glassmorphic
│   └── main.tsx               # Point d'entrée de React
├── index.html                 # Index HTML (optimisé pour le SEO et le chargement des polices)
├── package.json               # Dépendances et scripts npm
├── tsconfig.json              # Configuration TypeScript strict
└── vite.config.ts             # Configuration du bundler Vite avec Tailwind v4
```

---

## ⚡ Guide de Démarrage et Installation

### Prérequis
- **Node.js (v22+)** : Requis pour faire tourner le frontend.
  - **Sur Windows** : [Télécharger l'installateur officiel Node.js](https://nodejs.org/).
  - **Sur Linux / WSL 2** : Vous devez impérativement installer Node.js **directement dans votre distribution Linux** (n'utilisez pas la version Windows depuis WSL pour éviter l'erreur de chemin UNC `\\wsl.localhost\`). Installez-le via `nvm` avec ces commandes :
    ```bash
    # 1. Installer nvm (Node Version Manager)
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    
    # 2. Recharger la configuration du terminal
    source ~/.bashrc
    
    # 3. Installer et activer Node.js v22
    nvm install 22 && nvm use 22
    ```
- Le backend de LLM4SQL configuré et actif sur le port `8000`.

### Étape 1 : Installation des dépendances
```bash
npm install
```
*(Note de dépannage pour WSL 2 : Si vous rencontrez une erreur du type `sh: 1: tsc: Permission denied` ou `vite: Permission denied` lors du build, cela signifie que le dossier `node_modules/` a été initialisé depuis Windows, ce qui bloque les droits d'exécution sous Linux. Supprimez-le et réinstallez proprement depuis votre terminal Linux/WSL : `rm -rf node_modules package-lock.json && npm install`).*

### Étape 2 : Lancement en mode développement (Vite)
```bash
npm run dev
```
L'interface est accessible instantanément sur : **[http://localhost:5173/](http://localhost:5173/)**.

*(Note pour les utilisateurs WSL 2 : Le port forwarding de WSL 2 lie automatiquement localhost. Vous pouvez donc accéder à l'application depuis Firefox sous Windows via cette même adresse. En cas de problème de connexion, lancez Vite sur toutes les interfaces réseau avec : `npm run dev -- --host`).*

### Étape 3 : Compilation de production (Strict Typecheck)
Pour générer les fichiers optimisés et minifiés dans le dossier `/dist`, lancez :
```bash
npm run build
```
*Le build exécute le compilateur TypeScript en mode strict avant de packager les fichiers. Aucune erreur de type n'est tolérée.*

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

---

## 🎨 Design System & Esthétique Glassmorphic

Le style visuel est centralisé dans **`index.css`** (sans CSS en ligne dans les composants) et s'appuie sur une esthétique haut de gamme :
- **Glassmorphism** : Arrière-plans semi-transparents (`backdrop-filter: blur(16px)`), bordures fines lumineuses et ombres portées floues.
- **Typographie premium** : Chargement asynchrone des polices Google Fonts (*Outfit* pour les titres futuristes et *Inter* pour le corps de texte).
- **Thème sombre persistant** : Dégradés radiaux profonds (nuances de gris bleuté spatial) et micro-animations fluides lors des hovers.

---

## 📊 Moteurs de Rendu et Visualisations

### Rendu de Schéma (`SchemaVisualizer.tsx`)
- **Vue Cartes** : Analyse les scripts DDL et génère des cartes interactives avec navigation au clavier (`tabIndex={0}`). Un système de surbrillance met en valeur les relations de clés étrangères au survol.
- **Vue Diagramme Mermaid** : Intègre `mermaid.js` de manière stable. Pour éviter les conflits de DOM lors des re-rendus React, le composant utilise un identifiant unique aléatoire (`key`) et bloque les mises à jour asynchrones concurrentes via un drapeau de cycle de vie (`active`).

### Tableau et Data Viz (`DataTable.tsx` & `DataVisualization.tsx`)
- **Tableau** : Affiche les résultats paginés, mémorise les colonnes calculées (`useMemo`) et intègre un bouton d'export CSV encodé avec un marqueur UTF-8 BOM (`\uFEFF`) pour une compatibilité Excel native.
- **Graphiques** : Rendu adaptatif propulsé par **Recharts** (Aires, Courbes, Barres) adaptant automatiquement ses axes en fonction des types de données détectés.

---

## ♿ Normes d'Accessibilité (a11y)

L'interface applique des pratiques d'accessibilité de niveau production :
- **Navigation Clavier** : Les cartes de schémas et boutons personnalisés sont focusables au clavier. L'activation se fait par appui sur `Entrée` ou `Espace`.
- **Rôles ARIA** : Utilisation de `role="tablist"`, `role="tab"` et `role="log"` pour structurer l'interface vis-à-vis des lecteurs d'écran.
- **États dynamiques** : Liaison d'attributs `aria-selected`, `aria-expanded` et `aria-live="polite"` sur les éléments interactifs et les conteneurs de logs asynchrones.
