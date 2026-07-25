# 📊 Synthèse Globale du Plan d'Évolution Ingénierie & Architecture — LLM4SQL

Ce document résume le plan d'évolution d'architecture pour le projet **LLM4SQL**. Son but est de fiabiliser, sécuriser et mesurer l'efficacité de notre assistant SQL via une approche orientée **Ingénierie Système**.

---

## 🎯 Vision Globale
Plutôt que de compter uniquement sur la capacité brute d'un LLM, l'application est repensée pour lui fournir des **outils MCP enrichis**, un **prompt épuré de toute contradiction**, un **guidage dynamique par gabarits**, et une **mesure scientifique automatisée** de son taux de réussite.

---

## 🏛️ Les 5 Piliers d'Évolution Technique

### 🧪 1. Le Benchmark d'Évaluation Automatisé (`run_eval.py` & UI Web) — [x] COMPLÉTÉ (Phase 1 Validée à 100%)
* **Le Problème** : Évaluation empirique et manuelle des requêtes, avec risque élevé de régression lors de la modification des prompts ou des outils.
  * **Service d'Évaluation Backend (`app/services/eval_service.py`)** : Dataset dynamique avec persistance JSON (`app/data/eval_dataset.json`) contenant **18 cas d'évaluation** (14 canoniques du TP `semaine1.pdf` + 4 variantes explicites contextualisées).
  * **Évaluation par Pertinence Métier (*Execution Accuracy & Soft-Matching par Jetons*)** : Comparaison robuste des ensembles de résultats BDD PostgreSQL : Sub-set Column Projection, Soft-Matching par jetons métiers (tolérance aux colonnes concaténées `nom || ' ' || prenom` sans chercher les valeurs `NULL`/`None`), Multiset Matching, tolérance aux arrondis `ROUND(..., 2)` et normalisation sémantique des indicateurs d'absence (`FALLBACK_NULL_STRINGS` : `'Pas de série'`, `'N/A'`, `'Inconnu'`, `''` équivalents à `None`).
  * **Sélecteur Explicite de Base de Données (`target_schema`)** : Propagation explicite du schéma (`public` BDD Ouvrages vs `user_sandbox` Bac à Sable) dans l'interface, le backend et les outils MCP, éliminant tout conflit d'homonymie de tables.
  * **Exécution LangGraph Réelle & Télémétrie** : Garantie que le benchmark exécute la vraie boucle agentique LangGraph ReAct complète (`run_agent`). Capture et exposition du tableau des étapes (`steps` : Outils MCP appelés, réflexions, temps par étape).
  * **Mécanisme d'Arrêt Propre (`POST /api/eval/stop`)** : Interruption sécurisée des runs de benchmark en cours via l'API et bouton rouge **"Arrêter le Benchmark 🛑"** dans l'UI avec fermeture propre de l'EventSource SSE.
  * **Fenêtre de Contexte Optimisée (`context_size = 8192`)** : Configuration à 8k tokens par défaut pour le benchmark, évitant la tronquature d'Ollama tout en optimisant la vitesse.
  * **API REST & Streaming SSE (`app/routers/eval.py`)** : Endpoints REST `/api/eval/cases` (CRUD : Ajout, Modification, Suppression, Réinitialisation), `/api/eval/run`, `/api/eval/stream` (suivi temps réel cas par cas), `/api/eval/stop` et `/api/eval/history`.
  * **Interface Web React (`BenchmarkPanel.tsx`)** : Onglet **"Benchmark 🧪"** dans l'UI avec sélection dynamique du modèle Ollama local (aucun modèle imposé en dur), jauges de score synthétiques par niveau de difficulté, modal **"➕ Ajouter une question"**, boutons d'édition/suppression, bouton **"🔄 Réinitialiser"**, bouton d'arrêt 🛑, et accordéon dépliable de télémétrie des étapes LangGraph.
  * **Script CLI Autonome (`scripts/run_eval.py`)** : Exécution headless en ligne de commande avec export des rapports au format `eval_report_soft_matching.json`.
  * **Qualité & TDD** : Suite de 65 tests pytest backend validés à 100% (0 échec, 0 régression), build Vite/TypeScript 100% propre et loggers FastAPI/httpx silencieux sur le polling.
* **Bénéfice** : Mesure scientifique objective et personnalisable du taux de réussite (Score porté de 61.1% à **83.3% sur Qwen 3.5 4B — 15/18 cas passés avec succès**).

---

### ⚡ 2. Ingénierie des Outils MCP (`mcp_server.py`) — [x] COMPLÉTÉ (Phase 2 Validée à 100%)
* **Le Problème** : 
  1. `mcp_search_value` effectuait des requêtes `ILIKE` séquentielles lentes et n'indiquait pas comment joindre la table.
  2. `mcp_dry_run_query` validait la syntaxe via `EXPLAIN` mais ne renvoyait pas la structure des colonnes de sortie ni les détails d'erreurs PostgreSQL natifs.
* **La Solution Implémentée** :
  * **`mcp_search_value` ultra-rapide** : Exécution d'une requête dynamique unique (`UNION ALL`). L'outil retourne les correspondances ET suggère les clés étrangères de jointure (`foreign_key_suggestion`).
  * **`mcp_dry_run_query` enrichi** : Validation `EXPLAIN` + renvoi de la **structure des colonnes de sortie** (`name`, `type`) + **estimation du nombre de lignes** (`estimated_rows`) + transmission intégrale du message d'erreur PostgreSQL natif (`db_error`, `detail`, `hint`).
  * **Validation & Qualité** : Suite TDD de 65 tests pytest validés à 100% (0 échec, 0 régression) et génération du rapport de benchmark `eval_report_soft_matching.json` avec un taux de réussite de **83.3%**.
* **Bénéfice** : Le LLM dispose de toutes les clés de jointure et de la structure de sortie directement dans les retours d'outils avec un temps d'exécution < 0.03s.

---éfice** : Le LLM dispose de toutes les clés de jointure et de la structure de sortie directement dans les retours d'outils avec un temps d'exécution < 0.03s.

---

### 🧹 3. Refonte Épurée & Naturelle du Prompt (`prompts.py`) — [ ] EN ATTENTE
* **Le Problème** : Obligation rigide des CTE (`WITH ... AS`), balise `<think>` secondaire forcée dans le texte, répétition excessive de consignes négatives ("NEVER / DO NOT"), et interdiction stricte du filtrage par ID.
* **La Solution** :
  * **Raisonnement naturel** : Suppression du second bloc `<think>` forcé. Le modèle utilise son flux de réflexion natif (`reasoning_content`).
  * **Flexibilité SQL** : Autorisation des `SELECT ... FROM ... JOIN` directs pour les requêtes simples/moyennes.
  * **Directives positively-framed** : Consignes claires et directes sans sur-répétition d'interdictions.
* **Bénéfice** : Allègement de la charge cognitive du modèle et suppression des blocages UI.

---

### 🧩 4. RAG par Gabarits Abstraits (`templates.json` + `templates.py`) — [ ] EN ATTENTE
* **Le Problème** : L'exemple Few-Shot statique actuel utilise des tables fictives (`orders`, `customers`) qui polluent l'attention du modèle et génèrent des hallucinations.
* **La Solution** :
  * Suppression définitive de l'exemple fictif `orders`/`customers`.
  * Catalogue JSON de gabarits logiques abstraits (ex: *Top N avec agrégation*, *Auto-jointure*, *Sous-requête*).
  * Module Python `templates.py` qui contextualise le gabarit en remplaçant dynamiquement les variables par les **vraies tables de la Sandbox active**.
* **Bénéfice** : Exemples Few-Shot 100% conformes au schéma réel de la base active.

---

### 💡 5. La Double-Validation Sémantique (`node_explain_sql` + UI) — [ ] EN ATTENTE
* **Le Problème** : L'utilisateur reçoit un tableau SQL sans moyen simple de vérifier si l'IA a bien compris l'intention de la question.
* **La Solution** :
  * Nœud d'inversion LangGraph `node_explain_sql` exécuté dès la validation SQL.
  * Re-traduction de la requête en une phrase explicative en français (*"Ce que l'assistant va chercher : ..."*).
  * Affichage sous la requête dans l'interface React.
* **Bénéfice** : Boucle de rétroaction visuelle instantanée (*Human-in-the-loop*).

---

## 📌 Détails Techniques & Recommandations pour les Phases Restantes

Pour l'équipe / les agents qui prendront en charge les phases 2 à 5, voici les constats et directives clés issus de la Phase 1 :

### 1. Exploitation du Moteur de Benchmark (`eval_service.py` & UI)
- **Point de départ systématique** : Avant de démarrer le Pilier 2 ou Pilier 3, exécuter un benchmark baseline depuis l'onglet **"Benchmark 🧪"** de l'UI Web ou via `uv run python scripts/run_eval.py`.
- **Validation TDD du gain** : Après chaque modification dans `mcp_server.py` (Pilier 2) ou `prompts.py` (Pilier 3), relancer le benchmark pour vérifier si l'Execution Accuracy s'améliorer sur les catégories **Difficile** et **Avancé**.

### 2. Retours sur les Échecs Fréquents Observés (Aide pour le Pilier 2 - Outils MCP)
- **Jointures & Clés Étrangères** : Plusieurs requêtes de niveau Moyen/Difficile échouent car le LLM ne devine pas immédiatement le nom de la clé étrangère (ex: `dessinateur` vs `idp` dans `personne`). L'enrichissement de `mcp_search_value` préconisé au **Pilier 2** (avec le champ `foreign_key_suggestion`) résoudra directement ce goulot d'étranglement cognitive.
- **Retour d'erreur PostgreSQL brut dans `mcp_dry_run_query`** : Transmettre l'erreur PostgreSQL native exacte à l'agent lors du dry-run permettra au LLM de s'auto-corriger en 1 seule étape au lieu de tourner en boucle.

### 3. Retours sur les Prompt Directives (Aide pour le Pilier 3 - Refonte Prompt)
- Les requêtes complexes récursives ou à sous-requêtes imbriquées (ex: `Q2-Bonus` sur les concepts hiérarchiques) échouent actuellement lorsque le prompt force une syntaxe CTE rigide. Autoriser des jointures et sous-requêtes simples permettra au modèle de générer du SQL idiomatique et correct plus facilement.

---

## 🧭 Plan d'Exécution Global Mis à Jour

```
[x] Étape 1 (Pilier 1 - Benchmark & UI) ➔ 100% Implémenté & Validé (Phase 1)
   ↓
[x] Étape 2 (Pilier 2 - Outils MCP Enrichis) ➔ 100% Implémenté & Validé (Phase 2)
   ↓
[ ] Étape 3 (Pilier 3 - Refonte Prompt Naturel) ➔ Prochaine étape (Mesure de l'impact via Benchmark)
   ↓
[ ] Étape 4 (Pilier 4 - Gabarits Abstraits RAG) ➔ Mesure de l'impact via Benchmark
   ↓
[ ] Étape 5 (Pilier 5 - Double-Validation UI) ➔ Intégration Finale
```
