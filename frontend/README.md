# LLM4SQL - Interface Utilisateur Web (Vite + React + TS) 🎨

Ce dossier contient l'interface utilisateur web moderne et réactive de **LLM4SQL**, conçue pour offrir un tableau de bord de type "Chat-like" avec visualisation de données intégrée.

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
  - **Vue Diagramme ER 📊 :** Rendu graphique stable Mermaid.js qui trace le schéma relationnel en s'appuyant sur le LLM local (FastAPI `/api/sandbox/visualize`).

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
Assurez-vous d'avoir installé **Node.js (v18+)** et d'avoir démarré le backend FastAPI sur le port `8000` au préalable.

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
