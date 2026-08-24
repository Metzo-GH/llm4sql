// ==============================================================================
// CHAPITRE 1 : CONTEXTE, ENJEUX STRATÉGIQUES & ÉTAT DE L'ART
// ==============================================================================

= Contexte, Enjeux Stratégiques & État de l'Art

== L'Accès aux Données Décisionnelles en Entreprise

Dans les systèmes d'information décisionnels, la base de données relationnelle constitue le référentiel des données opérationnelles indispensables au pilotage de l'activité. Toutefois, l'exploitation quotidienne de ces données crée une friction organisationnelle classique entre deux profils aux compétences complémentaires :

D'une part, les *décideurs et responsables métiers* possèdent la compréhension des indicateurs de gestion, mais ne maîtrisent pas la syntaxe technique du langage `SQL`. Chaque besoin ponctuel d'information implique la création d'un ticket auprès de la direction des systèmes d'information (DSI), ce qui introduit des délais de traitement de plusieurs heures à plusieurs jours et freine l'exploration spontanée des données.

D'autre part, les *équipes data et développeurs* connaissent les schémas relationnels, mais consacrent une part significative de leur temps à rédiger manuellement des requêtes `SQL` répétitives (jointures multiples, agrégations, filtres de dates). Pour ces profils techniques, formuler une intention en français pour obtenir un premier jet de requête syntaxiquement valide représente un gain de temps appréciable, à condition de pouvoir inspecter et modifier directement le code produit avant son exécution (_Human-in-the-Loop_).

Cette double attente justifie la mise en place d'un système de traduction du langage naturel vers `SQL` (*Text-to-SQL*), conçu à la fois comme une interface d'interrogation autonome pour les métiers et comme un assistant de productivité pour les profils techniques.

== Sécurité, Souveraineté et Précision sur le Cadre RGPD

Le recours aux modèles de fondation hébergés en mode SaaS via des API distantes (tels que ceux d'OpenAI, d'Anthropic ou de Google) soulève des questions de sécurité et de conformité qui méritent une analyse juridique et technique rigoureuse :

1. *Exposition des structures et des données de gestion* : Pour générer une requête `SQL` exacte, le modèle de langage doit recevoir la définition DDL des tables (colonnes, types, clés primaires et étrangères) ainsi que des échantillons de valeurs textuelles pour résoudre les filtres métiers. L'envoi de ces métadonnées et données à des serveurs tiers expose des informations potentiellement sensibles ou protégées par le secret d'affaires.
2. *Transferts de données hors UE et Chapitre V du RGPD* : L'utilisation d'API hébergées sur des infrastructures soumises à des juridictions extraterritoriales (notamment le _Cloud Act_ américain) pose la question de la conformité aux articles 44 et suivants du RGPD relatifs aux transferts internationaux de données. L'exécution 100 % locale sur l'infrastructure de l'entreprise résout ce point spécifique en garantissant que les données ne franchissent jamais le périmètre du réseau interne et dispense l'organisation de souscrire des contrats de sous-traitance de traitement au sens de l'article 28.
3. *Obligations organisationnelles résiduelles* : L'exécution locale ne dispense toutefois pas l'entreprise d'appliquer les autres obligations du RGPD : le contrôle des droits d'accès à la base de données (RBAC), le chiffrement des disques au repos, la journalisation des requêtes exécutées pour la traçabilité des accès, et la gestion des droits des personnes concernées (articles 15 à 22).

Le choix d'une architecture locale (*air-gapped*) permet ainsi d'éliminer le risque de fuite vers des tiers tout en s'intégrant dans la politique de sécurité générale du système d'information de l'organisation.

== État de l'Art des Approches Text-to-SQL

La littérature en traitement du langage naturel et en bases de données met en évidence trois grandes approches pour le _Text-to-SQL_ :

#figure(
  table(
    columns: (1.4fr, 2.4fr, 2.2fr, 1.2fr),
    align: (left, left, left, center),
    table.header([*Approche*], [*Principe technique*], [*Limites identifiées*], [*Statut*]),
    [Invite directe (_Zero-shot_)],
    [Insertion brute du DDL complet et de la question dans le prompt système.],
    [Hallucinations fréquentes sur les noms de colonnes et saturation du contexte sur les bases complexes.],
    [Inadapté en production],

    [Spécialisation (_Fine-tuning_)],
    [Réentraînement supervisé d'un modèle sur des paires question-requête SQL.],
    [Coût de calcul élevé et nécessité de réentraîner le modèle à chaque modification du schéma de données.],
    [Coûteux à maintenir],

    [Architecture agentique (`ReAct` + `MCP`)],
    [Orchestration par graphe d'états @yao2022react avec outils normalisés @anthropic2024mcp pour inspecter, tester (_dry-run_) et corriger (@madaan2023selfrefine).],
    [Nécessite la mise en place de protocoles stricts et de règles de validation robustes.],
    [Standard retenu (LLM4SQL)],
  ),
  caption: [Comparatif des approches de génération Text-to-SQL dans la littérature scientifique],
)

Les benchmarks de recherche comme *Spider* @yu2018spider et *BIRD-SQL* @li2023bird indiquent qu'une invite textuelle simple ne suffit pas pour traiter des bases relationnelles réelles. Les architectures modulaires décomposées (*DIN-SQL* @pourreza2024din) s'imposent aujourd'hui en séparant l'exploration du schéma de la phase de génération et de validation.

== Analyse Économique et Méthodologie du Coût Global (TCO)

Pour évaluer la pertinence économique d'une solution locale par rapport aux offres d'API distantes, nous avons modélisé le Coût Total de Possession (*Total Cost of Ownership - TCO*) sur un horizon de 3 ans.

=== 1. Grille Tarifaire des Modèles (Relevé Code Arena / WebDev, Août 2026)
Sur la base du classement officiel *Code Arena | WebDev* @arenaai2026 (relevé du 22 août 2026 portant sur 118 modèles évalués sur des flux de code agentiques avec raisonnement multi-étapes), les coûts d'API par million (M) de tokens se répartissent selon trois gammes principales :
- *Modèles de pointe (Frontier Tier)* :
  - _Claude Opus 5 Max_ (Anthropic, Score 1691) : 5,00 \$ / M tokens d'entrée, 25,00 \$ / M tokens de sortie.
  - _GPT-5.6 Sol xHigh_ (OpenAI, Score 1619) : 4,00 \$ / M tokens d'entrée, 20,00 \$ / M tokens de sortie.
- *Modèles intermédiaires réactifs (Mid-Range Tier)* :
  - _Qwen 3.8 Max_ (Alibaba, Score 1669) : 2,00 \$ / M tokens d'entrée, 6,00 \$ / M tokens de sortie.
  - _Gemini 3.7 Flash High_ (Google, Score 1587) : 0,75 \$ / M tokens d'entrée, 3,57 \$ / M tokens de sortie.
- *Modèles économiques (Budget Tier)* :
  - _DeepSeek V4 Flash High_ (DeepSeek, Score 1579) : 0,44 \$ / M tokens d'entrée, 1,32 \$ / M tokens de sortie.
  - _Qwen 3.8 27B_ (Alibaba, Score 1595) : 0,50 \$ / M tokens d'entrée, 3,00 \$ / M tokens de sortie.

=== 2. Hypothèses de Charge d'une PME
- *Volume d'activité* : Une équipe de 10 collaborateurs posant chacun 15 requêtes analytiques par jour ouvré, sur 220 jours ouvrés par an, soit un volume de *33 000 requêtes décisionnelles par an*.
- *Consommation par cycle agentique* : Chaque requête en langage naturel nécessite en moyenne 2 à 3 tours d'interaction (introspection du schéma MCP, test de validation à blanc _dry-run_, et génération finale). Le contexte moyen cumulé est estimé à *6 000 tokens d'entrée* (DDL des tables, historique, consignes) et *800 tokens de sortie* (réflexion et code SQL).
- *Volume annuel de tokens* : $33\,000 times 6\,000 = 198$ millions de tokens d'entrée et $33\,000 times 800 = 26{,}4$ millions de tokens de sortie par an.

=== 3. Modélisation Comparative sur 3 Ans

#figure(
  table(
    columns: (1.8fr, 2.4fr, 2.2fr, 2.2fr, 2.4fr),
    align: (left, left, left, left, left),
    table.header([*Poste de charge*], [*Frontier API (GPT-5.6 / Opus 5)*], [*Mid-Range API (Gemini 3.7 Flash)*], [*Budget API (DeepSeek V4 Flash)*], [*Solution Locale LLM4SQL (Modèle local, ex. Qwen 4B)*]),
    [Tarif / 1M tokens],
    [4 à 5 \$ In / 20 à 25 \$ Out],
    [0,75 \$ In / 3,57 \$ Out],
    [0,44 \$ In / 1,32 \$ Out],
    [*0,00 € (Inférence locale)*],

    [Coût direct annuel tokens],
    [~ 1 320 à 1 650 \$ (~ 1 220 à 1 530 €)],
    [~ 243 \$ (~ 225 €)],
    [~ 122 \$ (~ 113 €)],
    [*0,00 €*],

    [Coût marginal électricité],
    [Inclus dans le service],
    [Inclus dans le service],
    [Inclus dans le service],
    [~ 15 à 25 € / an (sur matériel existant)],

    [Confidentialité du schéma],
    [Données transmises à un tiers],
    [Données transmises à un tiers],
    [Données transmises à un tiers],
    [*100 % interne au réseau*],

    [*Coût d'exploitation 3 ans*],
    [*~ 3 660 à 4 590 €*],
    [*~ 675 €*],
    [*~ 340 €*],
    [*~ 45 à 75 € (Électricité)*],
  ),
  caption: [Modélisation chiffrée du TCO sur 3 ans (33 000 requêtes/an selon les tarifs officiels Code Arena Août 2026)],
)

Cette modélisation démontre que même face aux API économiques de 2026 (comme DeepSeek V4 Flash), la solution locale `LLM4SQL` reste la seule option garantissant un coût d'exploitation marginal quasi nul tout en empêchant toute fuite des schémas de base de données d'entreprise et des filtres de requêtes vers des serveurs tiers.
