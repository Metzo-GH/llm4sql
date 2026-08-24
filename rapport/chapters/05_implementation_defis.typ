// ==============================================================================
// CHAPITRE 5 : IMPLÉMENTATION TECHNIQUE & DÉFIS D'INGÉNIERIE RÉSOLUS
// ==============================================================================

= Implémentation Technique & Défis d'Ingénierie Résolus

== Communication Temps Réel et Explicabilité Cognitive (XAI)

Pour réconcilier l'autonomie des utilisateurs métiers et le besoin de contrôle des développeurs, l'interaction entre le backend `FastAPI` et l'interface `React 19` repose sur un flux continu _Server-Sent Events_ (`SSE`) :

- *Visualisation de la chaîne de décision* : Chaque action de l'agent (connexion aux outils MCP, introspection du schéma DDL, recherche de valeurs `ILIKE`, exécution protégée _dry-run_) est transmise en temps réel sous forme d'événements typés, alimentant une checklist animée dans l'interface.
- *Streaming de la réflexion interne (`reasoning_content` / `<think>`)* : Les jetons de réflexion générés par le modèle local sont capturés au fur et à mesure de l'inférence et affichés dans un accordéon dynamique. Cette transparence cognitive (*Explainable AI*) permet aux experts de vérifier la cohérence logique avant même la fin de la génération SQL.

== Cache Sémantique Vectoriel en Mémoire & Bypass Dynamique

Afin de garantir un temps de réponse instantané (< 100 ms) sur les questions récurrentes tout en préservant les ressources de calcul, un cache sémantique vectoriel haute performance a été implémenté :

- *Similarité Cosinus par Embeddings Locaux* : Chaque question est encodée en vecteur dense via l'endpoint `/api/embed` d'Ollama. La similarité cosinus avec l'historique en mémoire est évaluée selon la formule :
  $ s = (bold(u) dot bold(v)) / (||bold(u)|| times ||bold(v)||) $
  Une correspondance est validée dès que $s >= 0.95$.
- *Algorithme de repli par coefficient de Jaccard* : En cas d'indisponibilité du module d'embeddings, un calcul textuel sur les $n$-grammes assure la continuité de service.
- *Bypass Dynamique* : L'utilisateur peut désactiver le cache d'un clic pour forcer une régénération complète sans effacer la mémoire globale.

== Décisions d'Architecture Critiques : Impasses Abandonnées vs Solutions Adoptées

Le développement de `LLM4SQL` a été guidé par une démarche empirique et documentée dans `AI_MAP.md`. Plusieurs pistes techniques séduisantes sur le papier ont été testées, mesurées puis formellement invalidées lorsqu'elles ne répondaient pas aux exigences de robustesse :

#v(0.3cm)

#figure(
  image("../Images/pivots_architecturaux.svg", width: 100%),
  caption: [Autopsie des arbitrages d'ingénierie : les trois impasses techniques abandonnées et leurs solutions pérennes],
)

#v(0.3cm)

=== 1. L'Impasse de la Traduction AST ➔ Français (Phase R16)
- *Piste initiale testée* : Afin d'évaluer la pertinence d'une requête sans exécuter de code en base, nous avons conçu un traducteur transformant l'arbre syntaxique (`AST`) SQL en une phrase en français, puis calculé la similarité cosinus avec la question initiale.
- *Exemple typique de l'échec* :

#align(center)[
#block(
  width: 95%,
  stroke: 0.5pt + rgb("#cbd5e1"),
  radius: 6pt,
  fill: rgb("#f8fafc"),
  inset: 10pt,
)[
  #align(left)[
    *Question utilisateur :* _« Donner le titre des albums parus en 2020. »_ \
    *SQL généré (100 % valide) :* `SELECT titre FROM album WHERE annee = 2020;` \
    *Traduction textuelle par l'AST :* _« Sélectionner la colonne titre depuis la table album où la condition annee est égale à 2020. »_ \
    *Similarité Cosinus (Embeddings) :* *34,8 %* #text(fill: rgb("#e11d48"))[❌ (Rejeté comme faux négatif !)] \
    *Résultat réel en base PostgreSQL :* 3 albums retournés, conformité exacte avec la vérité terrain.
  ]
]
]

Cette divergence lexicale entre les termes techniques du code et le langage naturel entraînait plus de 60 % de faux négatifs sur des requêtes justes.
- *Solution pérenne adoptée* : L'abandon de l'heuristique au profit de l'*Execution Accuracy* sur base réelle PostgreSQL, couplée à un algorithme de _soft-matching_ par jetons utiles dans `eval_comparator.py`.

=== 2. L'Impasse du Dynamic Few-Shot RAG par Gabarits Abstraits (Phase R27)
- *Piste initiale testée* : Nous avions développé un catalogue JSON de patrons SQL (`templates.json`) pour injecter dynamiquement des exemples de requêtes « sur mesure » dans le prompt en fonction des mots-clés détectés.
- *Exemple typique de pollution cognitive (Attention Collapse)* :

#align(center)[
#block(
  width: 95%,
  stroke: 0.5pt + rgb("#cbd5e1"),
  radius: 6pt,
  fill: rgb("#f8fafc"),
  inset: 10pt,
)[
  #align(left)[
    *Gabarit injecté dans le prompt :* `SELECT c.id, COUNT(*) FROM orders o JOIN customers c ON ... GROUP BY c.id;` \
    *Question posée sur BD Ouvrages :* _« Compter le nombre d'albums par série »_ \
    *SQL halluciné par le petit LLM :*
    ```sql
    -- Le modèle 4B mélange la table fictive 'orders' de l'exemple avec 'BD Ouvrages' !
    SELECT o.ids, COUNT(*) FROM orders o JOIN serie s ON o.ids = s.ids GROUP BY o.ids;
    ```
    *Résultat après passage au Zero-Shot épuré + MCP :*
    ```sql
    -- Requête exacte générée sans exemple polluant :
    SELECT ids, COUNT(*) AS total_albums FROM album GROUP BY ids;
    ```
  ]
]
]

L'injection d'exemples approximatifs biaise les modèles compacts.
- *Solution pérenne adoptée* : Un mode *Zero-Shot outillé* où le prompt reste ultra-concis (< 15 lignes) et où le modèle découvre le schéma dynamiquement par des appels d'outils ciblés (`mcp_get_schema`, `mcp_search_value`).

=== 3. L'Impasse de la Génération de Diagrammes Mermaid par LLM (Phase 5)
- *Piste initiale testée* : Déléguer au LLM la lecture du DDL SQL pour produire le diagramme relationnel Mermaid affiché dans l'interface web.
- *Constat empirique* : Cette délégation introduisait une latence injustifiée (4 à 8 secondes d'inférence) et souffrait d'erreurs fréquentes de syntaxe Mermaid (caractères spéciaux non échappés) qui bloquaient le rendu React.
- *Solution pérenne adoptée* : Un parseur DDL en Python pur dans `sandbox.py` utilisant l'AST `sqlglot`, générant le diagramme de manière instantanée (< 1 ms), avec 100 % de conformité syntaxique et 0 charge sur Ollama.

== Défis d'Ingénierie Logicielle et Solutions Implémentées

Le déploiement d'une architecture _Text-to-SQL_ locale éprouvée sous contrainte de ressources a nécessité de résoudre quatre défis d'ingénierie majeurs :

=== Défi 1 : L'Effondrement d'Attention (Attention Collapse) et la Directivité du Prompt
*Problème rencontré :* L'injection de prompts volumineux contenant des dizaines d'exemples de requêtes saturait la mémoire de travail des modèles compacts.

*Solution d'ingénierie :* Nous avons épuré le prompt système pour adopter un style concis en anglais technique, centré sur des directives architecturales strictes et l'usage systématique des outils MCP :

```python
# Extrait des directives architecturales épurées (app/services/agent/prompts.py)
SYSTEM_PROMPT_TEMPLATE = """You are an expert PostgreSQL DBA agent.
Translate the user query into a clean, syntactically correct PostgreSQL SELECT query.

CRITICAL WORKFLOW & TOOL RULES:
1. ALWAYS inspect table structure first using `mcp_get_schema(table_name="...")`.
2. Inspect `join_hint` in schema metadata: use LEFT JOIN when a foreign key is marked optional/nullable.
3. NEVER guess column names, string literals or table structures.
4. If the user filters by text/names, use `mcp_search_value(query="...", target_table="...")`.
5. ALWAYS test your query using `mcp_dry_run_query(sql="...")` before returning your final answer.
6. STRICTLY ONLY SELECT QUERIES ARE ALLOWED. NEVER mutate data.
7. Wrap your final query in a single ```sql ... ``` block."""
```

=== Défi 2 : Faux Négatifs d'Évaluation & Algorithme de Soft-Matching par Jetons
*Problème rencontré :* La comparaison stricte de dictionnaires SQL échouait dès que l'IA nommait différemment une colonne ou concaténait le prénom et le nom.

*Exemple illustratif :*
- Vérité terrain attendue : `[{"nom": "Goscinny", "prenom": "René"}]`
- Résultat produit par l'IA : `[{"auteur": "René Goscinny", "total_albums": 32}]`
- En comparaison stricte de clés : *Échec*.
- En comparaison par jetons utiles (`_extract_row_tokens`) : L'ensemble `{"goscinny", "rene"}` est bien un sous-ensemble des jetons générés `{"auteur", "rene", "goscinny", "total", "albums", "32"}` -> *Validation avec succès*.

```python
# Extrait du comparateur de pertinence par jetons (app/services/eval/eval_comparator.py)
def _extract_row_tokens(row: dict[str, Any]) -> set[str]:
    """Extrait les jetons textuels et numériques significatifs d'une ligne."""
    tokens = set()
    for val in row.values():
        if val is None or str(val).strip().lower() in FALLBACK_NULL_STRINGS:
            continue
        # Découpe en mots alphanumériques significatifs (>= 2 caractères)
        words = re.findall(r"\b\w{2,}\b|\b\d+\b", str(val).lower())
        tokens.update(words)
    return tokens

def _find_distinct_token_matching(gt_tokens: list[set], gen_tokens: list[set]) -> bool:
    """Vérifie que chaque ligne de référence trouve un sur-ensemble distinct dans le résultat généré."""
    used_gen_indices = set()
    for gt_set in gt_tokens:
        match_found = False
        for idx, gen_set in enumerate(gen_tokens):
            if idx not in used_gen_indices and gt_set.issubset(gen_set):
                used_gen_indices.add(idx)
                match_found = True
                break
        if not match_found:
            return False
    return True
```

=== Défi 3 : La Détection Universelle de Nullabilité et les Join Hints dans MCP
*Problème rencontré (Cas #6 - Blain) :* Sur les relations facultatives (`nullable=True`), l'utilisation d'un `INNER JOIN` élimine silencieusement des lignes parents valides sans lever d'erreur SQL (_Lossy Join_).

*Exemple concret sur la base BD Ouvrages :*
L'auteur Blain a dessiné 4 albums : 3 tomes de la série *Gus* (`ids = 12`) et 1 album indépendant (*Carnet d'un matelot*, `ids IS NULL`).

```sql
-- ❌ AVANT : Requête avec INNER JOIN (Perte silencieuse de données : 3 lignes retournées au lieu de 4)
SELECT a.titre, s.titre FROM album a
JOIN serie s ON a.ids = s.ids
JOIN dessiner d ON a.ida = d.ida JOIN personne p ON d.idp = p.idp
WHERE p.nom = 'Blain';

-- ✅ APRÈS : Requête guidée par le join_hint MCP (4 lignes retournées avec conservation du one-shot)
SELECT a.titre, s.titre FROM album a
LEFT JOIN serie s ON a.ids = s.ids
JOIN dessiner d ON a.ida = d.ida JOIN personne p ON d.idp = p.idp
WHERE p.nom = 'Blain';
```

*Solution d'ingénierie dans MCP :*

```python
# Extrait de l'inspection dynamique de nullabilité (app/mcp_server.py)
for col in fk_columns:
    is_nullable = col.get("is_nullable", False)
    if is_nullable:
        join_hint = (
            "LEFT JOIN recommended (optional relation: avoids dropping parent rows when null)"
        )
    else:
        join_hint = "INNER JOIN (mandatory relation: foreign key is NOT NULL)"
    col["join_hint"] = join_hint
```

=== Défi 4 : Migration Asynchrone vers psycopg v3 et Pool Thread-Safe
*Problème rencontré :* Le pilote synchrone historique `psycopg2` bloquait la boucle d'événements de `FastAPI`, limitant la scalabilité lors de requêtes simultanées et compliquant la gestion des transactions en lecture seule.

*Solution d'ingénierie :* Nous avons migré l'infrastructure vers `psycopg` v3 et `psycopg_pool`, avec initialisation asynchrone dans le `lifespan` FastAPI, transactions strictement cloisonnées en `readonly=True` et curseurs dictionnaires natifs (`dict_row`) pour des performances maximales.

