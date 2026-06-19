# 🏥 Audit de Santé — LLM4SQL

> Audit effectué le 19/06/2026. Couvre l'intégralité du backend Python (15 fichiers, ~2200 LOC) et du frontend React/TS (15 fichiers, ~2800 LOC).

---

## Tableau de Bord

| Domaine | Score | Verdict |
|---|---|---|
| 🔒 Sécurité (OWASP) | **3/10** | 🔴 Critique |
| 🏛️ Architecture (SOLID) | **4/10** | 🔴 Préoccupant |
| ♻️ Duplication (DRY) | **3/10** | 🔴 Systémique |
| ⚡ Performance | **5/10** | 🟡 Améliourable |
| 📝 Qualité de code | **6/10** | 🟡 Acceptable |
| ♿ Accessibilité (a11y) | **1/10** | 🔴 Critique |

---

## 🔴 Findings Critiques (P0)

### 1. Exécution SQL brute sans aucune validation — `connection.py:51,55`

> [!CAUTION]
> `cur.execute(schema_sql)` et `cur.execute(insert_sql)` exécutent du DDL/DML fourni par l'utilisateur **sans aucune sanitization**. Un utilisateur peut envoyer `DROP DATABASE`, `GRANT ALL`, `CREATE EXTENSION`, ou n'importe quel SQL arbitraire via l'endpoint `/api/sandbox/init`.

**Fichier** : [connection.py](file:///c:/Users/Metzo/Documents/projet%20ia/llm4sql/backend/app/database/connection.py#L51-L55)

---

### 2. Zéro authentification sur toutes les routes API — `main.py`

> [!CAUTION]
> Aucun endpoint n'est protégé. L'endpoint `/api/sandbox/init` (L186-209) permet à n'importe qui de détruire et recréer le schéma de la BDD. Les routes `/api/chat` et `/api/chat/stream` sont également ouvertes.

**Fichier** : [main.py](file:///c:/Users/Metzo/Documents/projet%20ia/llm4sql/backend/app/main.py#L186-L430)

---

### 3. Blocklist de fonctions SQL dangereuses incomplète — `security.py:48-54`

> [!WARNING]
> La liste noire omet des fonctions PostgreSQL critiques : `lo_import`, `lo_export`, `dblink_exec`, `dblink_connect`, `pg_stat_file`, `pg_terminate_backend`, `copy_to`, `copy_from`.

**Fichier** : [security.py](file:///c:/Users/Metzo/Documents/projet%20ia/llm4sql/backend/app/core/security.py#L48-L54)

---

### 4. XSS via `innerHTML` avec SVG Mermaid — `SchemaVisualizer.tsx:216`

> [!WARNING]
> `containerRef.current.innerHTML = result.svg` — Le SVG provient de `mermaid.render()` qui traite du code Mermaid généré par le LLM. Si le LLM injecte du JavaScript dans le code Mermaid, il sera exécuté dans le navigateur. XSS indirect par injection LLM.

**Fichier** : [SchemaVisualizer.tsx](file:///c:/Users/Metzo/Documents/projet%20ia/llm4sql/frontend/src/components/SchemaVisualizer.tsx#L216)

---

### 5. God Component `ChatInterface.tsx` — 971 lignes, 44 KB

> [!IMPORTANT]
> Ce fichier viole massivement le SRP. Il contient : 2 interfaces TypeScript, 2 fonctions utilitaires de parsing (120+ lignes), un sous-composant `ChatMessage` de 535 lignes, le composant principal, et un terminal complet inline. Impossible à tester, maintenir, ou étendre.

**Fichier** : [ChatInterface.tsx](file:///c:/Users/Metzo/Documents/projet%20ia/llm4sql/frontend/src/components/ChatInterface.tsx)

---

### 6. God Module `agent.py` — 811 lignes

> [!IMPORTANT]
> Contient : état, singleton LLM, schéma BDD, extraction SQL, nœud de sélection de tables, nœud de génération, nœud d'exécution, construction du graphe, point d'entrée `run_agent`, et intégration cache. Devrait être au minimum 3 modules.

**Fichier** : [agent.py](file:///c:/Users/Metzo/Documents/projet%20ia/llm4sql/backend/app/services/agent.py)

---

### 7. Zéro memoization React dans toute la codebase

> [!IMPORTANT]
> **Aucun** `useCallback`, `useMemo`, ou `React.memo`. Avec le streaming SSE token-par-token, `setMessages()` crée un nouveau tableau à chaque micro-update → **centaines de setState/seconde** → tous les `ChatMessage` sont re-rendus en cascade.

**Fichiers affectés** : [useChat.ts](file:///c:/Users/Metzo/Documents/projet%20ia/llm4sql/frontend/src/hooks/useChat.ts#L223-L234), [ChatInterface.tsx](file:///c:/Users/Metzo/Documents/projet%20ia/llm4sql/frontend/src/components/ChatInterface.tsx#L842-L851)

---

### 8. `strict: true` manquant dans TypeScript — `tsconfig.app.json`

> [!WARNING]
> `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes` sont tous **désactivés par défaut**. Seuls `noUnusedLocals` et `noUnusedParameters` sont actifs.

**Fichier** : [tsconfig.app.json](file:///c:/Users/Metzo/Documents/projet%20ia/llm4sql/frontend/tsconfig.app.json)

---

## 🟡 Findings Majeurs (P1)

### 9. Fuites mémoire — Backend

| Fichier | Ligne | Problème |
|---|---|---|
| [agent.py](file:///c:/Users/Metzo/Documents/projet%20ia/llm4sql/backend/app/services/agent.py#L72) | L72 | `_llm_cache: Dict` croît sans limite — chaque combinaison `(model, temp, ctx)` crée une instance permanente |
| [cache.py](file:///c:/Users/Metzo/Documents/projet%20ia/llm4sql/backend/app/services/cache.py#L23) | L23 | `self._cache: List` sans taille max — croissance mémoire indéfinie |

### 10. Lock tenu pendant appel HTTP — `cache.py:106-153`

Le verrou `self._lock` est maintenu pendant toute la durée de `check()`, y compris l'appel HTTP synchrone à Ollama pour l'embedding (~100-500ms). Un seul thread peut faire un lookup cache à la fois → **goulot d'étranglement**.

### 11. Double système de styles : className + `style={{}}` inline

**Problème le plus omniprésent du frontend.** Presque chaque élément JSX utilise **simultanément** des `className` ET des objets `style={{}}` inline qui dupliquent les mêmes propriétés CSS. Cela est présent dans :
- `App.tsx` : ~20 occurrences
- `ChatInterface.tsx` : ~30 occurrences  
- `DataTable.tsx`, `DataVisualization.tsx`, `SchemaVisualizer.tsx` : ~15 occurrences

### 12. Pas de connection pooling PostgreSQL

Chaque appel crée une nouvelle connexion TCP. Devrait utiliser `psycopg2.pool.ThreadedConnectionPool`.

**Fichier** : [connection.py](file:///c:/Users/Metzo/Documents/projet%20ia/llm4sql/backend/app/database/connection.py#L6-L28)

### 13. `search_path` dupliqué dans 4 fichiers

`cur.execute("SET search_path TO user_sandbox, public;")` est répété dans : `connection.py`, `agent.py:132`, `mcp_server.py:37`, `mcp_server.py:134`.

### 14. Zéro accessibilité (a11y) — Frontend

- Aucun attribut `aria-*` dans tout le code
- Boutons icon-only sans `aria-label`
- Zone de chat sans `role="log"` ni `aria-live`
- Champs sans `<label>` associé
- Pas de navigation clavier (tabIndex, onKeyDown)
- Pas de focus-trap dans le dropdown Settings

### 15. Prompt injection LLM — `main.py:234`, `agent.py:402-431`

Le schéma SQL utilisateur et les messages d'erreur PostgreSQL sont injectés directement dans les prompts LLM sans sanitization. Un schéma malveillant pourrait manipuler les instructions du LLM.

### 16. Exceptions brutes exposées au client — `main.py:259,279,340`

`HTTPException(detail=str(e))` expose les messages d'erreur internes (stack traces, erreurs DB) au client.

---

## 🟢 Findings Mineurs (P2)

| # | Problème | Fichier(s) |
|---|---|---|
| 17 | 8 occurrences de `any` TypeScript | ChatInterface, DataTable, DataVisualization, useChat |
| 18 | `API_BASE_URL` hardcodé en double | [useChat.ts:4](file:///c:/Users/Metzo/Documents/projet%20ia/llm4sql/frontend/src/hooks/useChat.ts#L4), [useSandbox.ts:3](file:///c:/Users/Metzo/Documents/projet%20ia/llm4sql/frontend/src/hooks/useSandbox.ts#L3) |
| 19 | `react-markdown` dans `package.json` mais jamais importé | Dead dependency |
| 20 | `App.css` : 185 lignes de CSS Vite scaffold inutilisées | Legacy |
| 21 | `backend/main.py` (racine) : dead code `print("Hello")` | À supprimer |
| 22 | `pyproject.toml` : description placeholder, test deps en prod, pas de version max | Config |
| 23 | `alert()` natif × 3 dans `useSandbox.ts` | UX |
| 24 | Polling sans `document.visibilityState` | Performance |
| 25 | `index.html` : `<title>frontend</title>`, `lang="en"` au lieu de `"fr"` | SEO/i18n |
| 26 | `start_backend.ps1` : modifie les variables d'env User-level de façon permanente | Config |
| 27 | Imports lazy dans les corps de fonction (5 occurrences backend) | Style |
| 28 | `useChat()` retourne **19 valeurs** — signe de surcharge | Architecture |
| 29 | `CustomTooltip` recréé à chaque render dans `DataVisualization.tsx` | Performance |
| 30 | `Clipboard API` sans `try/catch` dans `ChatInterface.tsx:516` | Robustesse |

---

## 📋 Plan de Refactorisation Proposé

> [!IMPORTANT]
> Ce plan **ne modifie aucune fonctionnalité existante**. Il restructure, sécurise et optimise le code sans changer le comportement.

### Phase R1 — Sécurité (Priorité absolue)

| # | Action | Fichier(s) cible |
|---|---|---|
| R1.1 | Ajouter `validate_sql_query()` dans `init_user_sandbox()` pour valider le DDL/DML avant exécution | [connection.py](file:///c:/Users/Metzo/Documents/projet%20ia/llm4sql/backend/app/database/connection.py) |
| R1.2 | Compléter la blocklist de fonctions dangereuses : `lo_import`, `lo_export`, `dblink_exec`, `dblink_connect`, `pg_stat_file`, `pg_terminate_backend`, `copy_to`, `copy_from` | [security.py](file:///c:/Users/Metzo/Documents/projet%20ia/llm4sql/backend/app/core/security.py) |
| R1.3 | Sanitizer les exceptions HTTP : remplacer `detail=str(e)` par des messages génériques | [main.py](file:///c:/Users/Metzo/Documents/projet%20ia/llm4sql/backend/app/main.py) |
| R1.4 | Ajouter `DOMPurify.sanitize()` sur le SVG Mermaid | [SchemaVisualizer.tsx](file:///c:/Users/Metzo/Documents/projet%20ia/llm4sql/frontend/src/components/SchemaVisualizer.tsx) |
| R1.5 | Restreindre CORS : `allow_methods=["GET","POST"]`, headers spécifiques | [main.py](file:///c:/Users/Metzo/Documents/projet%20ia/llm4sql/backend/app/main.py) |

---

### Phase R2 — Architecture Backend (Décomposition SOLID)

#### [MODIFY] [agent.py](file:///c:/Users/Metzo/Documents/projet%20ia/llm4sql/backend/app/services/agent.py) → Éclatement en modules

```
backend/app/services/
├── agent/
│   ├── __init__.py          # Réexporte run_agent, create_agent_graph
│   ├── state.py             # AgentState TypedDict + send_agent_event
│   ├── llm_provider.py      # get_llm() singleton + _llm_cache (avec LRU)
│   ├── schema.py            # get_database_schema_context + _SCHEMA_CACHE
│   ├── sql_utils.py         # extract_sql_query, extract_tables_from_sql
│   ├── nodes/
│   │   ├── select_tables.py # node_select_tables
│   │   ├── generate_sql.py  # node_generate_sql
│   │   └── execute_sql.py   # node_execute_sql
│   └── graph.py             # create_agent_graph + run_agent
├── cache.py                 # Inchangé (+ ajout taille max)
```

#### [MODIFY] [main.py](file:///c:/Users/Metzo/Documents/projet%20ia/llm4sql/backend/app/main.py) → Extraction des modèles Pydantic

```
backend/app/
├── schemas/
│   ├── __init__.py
│   ├── chat.py              # ChatRequest, ChatResponse
│   ├── sandbox.py           # SandboxRequest, VisualizeRequest/Response
│   └── ollama.py            # OllamaModelsResponse
```

#### [NEW] `backend/app/database/pool.py` — Connection pooling

Centraliser la création de connexion avec `psycopg2.pool.ThreadedConnectionPool` et un `search_path` unique.

---

### Phase R3 — Architecture Frontend (Décomposition composants)

#### [MODIFY] [ChatInterface.tsx](file:///c:/Users/Metzo/Documents/projet%20ia/llm4sql/frontend/src/components/ChatInterface.tsx) → Éclatement

```
frontend/src/
├── types/
│   └── message.ts           # Interface Message, ParsedStep
├── utils/
│   ├── logParser.ts          # parseLiveLogsToSteps()
│   └── thinkingParser.ts     # parseThinking()
├── components/
│   ├── chat/
│   │   ├── ChatInterface.tsx # Composant principal (réduit à ~150 lignes)
│   │   ├── ChatMessage.tsx   # Rendu d'un message individuel
│   │   ├── StepChecklist.tsx # Checklist d'étapes animées
│   │   ├── AgentReport.tsx   # Rapport final de l'agent
│   │   └── TerminalDrawer.tsx# Console de logs pliable
│   ├── shared/
│   │   ├── TabButton.tsx     # Composant onglet réutilisable
│   │   └── EmptyState.tsx    # Placeholder vide réutilisable
```

#### [NEW] `frontend/src/config/api.ts` — Centralisation API

```typescript
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8500';
```

#### [MODIFY] [tsconfig.app.json](file:///c:/Users/Metzo/Documents/projet%20ia/llm4sql/frontend/tsconfig.app.json) — Activer `strict: true`

---

### Phase R4 — Performance

| # | Action | Fichier(s) |
|---|---|---|
| R4.1 | Wrapper `ChatMessage` dans `React.memo` | `ChatMessage.tsx` |
| R4.2 | `useMemo` pour `parseLiveLogsToSteps`, `filteredTables`, `filteredData`, `activeData` | Composants concernés |
| R4.3 | `useCallback` pour tous les handlers passés en props | `App.tsx`, composants |
| R4.4 | Ajouter `maxSize` au `SemanticCache` et LRU au `_llm_cache` | `cache.py`, `llm_provider.py` |
| R4.5 | Séparer lock embedding / lock cache dans `SemanticCache.check()` | `cache.py` |
| R4.6 | Ajouter `document.visibilityState` check aux polling intervals | `useChat.ts` |
| R4.7 | Extraire `CustomTooltip` au top-level du module | `DataVisualization.tsx` |

---

### Phase R5 — Nettoyage & Qualité

| # | Action |
|---|---|
| R5.1 | Supprimer `App.css` (100% legacy Vite scaffold) |
| R5.2 | Supprimer `backend/main.py` (dead code) |
| R5.3 | Supprimer la dépendance `react-markdown` inutilisée |
| R5.4 | Unifier les styles : choisir **CSS classes OU inline**, éliminer le double système |
| R5.5 | Remplacer `alert()` par un composant Toast |
| R5.6 | Corriger `index.html` : `lang="fr"`, `<title>LLM4SQL</title>` |
| R5.7 | TSDoc manquants : `ChatMessage`, `renderChart`, `exportToCSV`, `checkStatus`, `fetchModels` |
| R5.8 | Remplacer les 8 `any` TypeScript par des types concrets |
| R5.9 | Déplacer `pytest`/`pytest-asyncio` en dev-dependencies dans `pyproject.toml` |
| R5.10 | Ajouter `try/catch` autour de `navigator.clipboard.writeText()` |

---

### Phase R6 — Accessibilité (a11y)

| # | Action |
|---|---|
| R6.1 | `aria-label` sur tous les boutons icon-only |
| R6.2 | `role="log"` + `aria-live="polite"` sur la zone de chat |
| R6.3 | `<label htmlFor>` associé à chaque `<select>` et `<input>` |
| R6.4 | `tabIndex={0}` + `onKeyDown` + `role="button"` sur les cards cliquables |
| R6.5 | Focus-trap + fermeture par Escape sur le dropdown Settings |

---

## User Review Required

> [!IMPORTANT]
> **Priorisation** : Je recommande l'ordre R1 → R4.4-R4.5 → R2 → R3 → R4 → R5 → R6. La sécurité d'abord, puis les fuites mémoire, puis l'architecture, puis le reste. Souhaitez-vous un ordre différent ?

> [!WARNING]
> **La Phase R2 (éclatement `agent.py`)** est la plus invasive : elle touche les imports dans `main.py`, les tests, et le graphe LangGraph. Elle nécessitera une mise à jour des 3 fichiers de tests.

## Open Questions

1. **Authentification (R1)** : L'app est 100% locale, mais souhaitez-vous quand même ajouter une auth basique (API key dans `.env`) pour sécuriser les endpoints, ou la restriction `localhost` suffit-elle ?
2. **Choix CSS (R5.4)** : Préférez-vous garder uniquement les classes CSS de `index.css` et supprimer tous les `style={{}}` inline, ou l'inverse ?
3. **Scope de l'audit** : Souhaitez-vous que j'exécute certaines phases immédiatement, ou préférez-vous valider le plan complet d'abord ?

## Verification Plan

### Automated Tests
```bash
cd backend && uv run pytest tests/ -v
cd frontend && npm run build  # Vérification TypeScript strict
```

### Manual Verification
- Vérifier que toutes les routes API fonctionnent après refactoring
- Tester le streaming SSE après ajout de `React.memo`
- Valider le rendu Mermaid après ajout de `DOMPurify`
