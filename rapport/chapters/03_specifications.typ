// ==============================================================================
// CHAPITRE 3 : SPÉCIFICATIONS FONCTIONNELLES & MODÉLISATION DES DONNÉES
// ==============================================================================

= Spécifications Fonctionnelles & Modélisation des Données

== Analyse des Besoins et Personas Utilisateurs

Afin de répondre aux exigences hétérogènes de l'entreprise, trois profils utilisateurs types ont guidé la conception fonctionnelle de la plateforme :

- *Le Décideur et Responsable Métier (Persona 1)* : Ne disposant pas de compétences techniques en `SQL`, il souhaite interroger la base de données directement en français ("Quels sont les ouvrages parus après 2010 ?") et obtenir instantanément un tableau de bord lisible, complété par des visualisations graphiques et des fonctions d'export (CSV).
- *L'Analyste de Données et Développeur (Persona 2)* : Maîtrisant parfaitement la syntaxe relationnelle, il recherche un accélérateur de productivité pour générer automatiquement les requêtes complexes comportant de multiples jointures. Il exige une transparence totale sur le code généré, la capacité de l'éditer directement dans l'interface et de le ré-exécuter sans passer par l'IA (_Human-in-the-Loop_).
- *L'Administrateur de Base de Données / Responsable Sécurité (Persona 3)* : Garant de l'intégrité du système d'information, il impose des contraintes non négociables : étanchéité totale face aux fuites de données vers l'extérieur, interdiction absolue de toute modification de structure ou de contenu (`SELECT`-only) et cloisonnement étanche des espaces de test.

== Spécifications Fonctionnelles (Matrice MoSCoW)

Le périmètre applicatif a été hiérarchisé selon la méthodologie MoSCoW afin de cadencer les livraisons :

#figure(
  table(
    columns: (1.4fr, 3.6fr, 2fr),
    align: (left, left, left),
    table.header([*Priorité*], [*Exigence Fonctionnelle*], [*Composant Associé*]),
    [Must Have],
    [Traduction fiable de questions en français vers des requêtes `PostgreSQL`.],
    [Graphe `LangGraph` & `Ollama`],

    [Must Have],
    [Boucle d'auto-correction récursive en cas d'erreur de syntaxe ou de schéma (_Self-Healing_).],
    [Outils `MCP` & Graphe d'états],

    [Must Have],
    [Garantie d'exécution strictement en lecture seule (rejet des écritures).],
    [AST `sqlglot` & `psycopg` v3],

    [Must Have],
    [Restitution tabulaire interactive avec tri dynamique, pagination et export CSV.],
    [Composant `DataTable`],

    [Must Have],
    [Bac à sable DDL (_Sandbox_) permettant de tester des schémas personnalisés en isolation.],
    [Panneau `SandboxPanel`],

    [Should Have],
    [Modélisation relationnelle instantanée du schéma DDL en diagramme entité-association.],
    [Parser AST Python pur],

    [Should Have],
    [Banc de test automatisé avec calcul d'exactitude d'exécution (_Execution Accuracy_).],
    [Module `BenchmarkPanel`],

    [Should Have],
    [Diffusion en direct des étapes de réflexion de l'agent (`reasoning_content` / `<think>`).],
    [Flux `SSE` & Accordéon XAI],

    [Could Have],
    [Édition directe du code SQL généré dans le chat avec ré-exécution immédiate.],
    [Composant `SqlCodeBlock`],

    [Could Have],
    [Cache sémantique vectoriel en mémoire pour accélérer les requêtes récurrentes (0 ms).],
    [Module de cache d'embeddings],
  ),
  caption: [Matrice des spécifications fonctionnelles selon la méthode MoSCoW],
)

== Exigences Non-Fonctionnelles & Métriques Cibles

Les contraintes de qualité logicielle, de sécurité et d'ergonomie couvrent quatre axes majeurs :

- *Souveraineté et Confidentialité* : L'intégralité du traitement (inférence du LLM, analyse syntaxique, requêtage BDD, rendu UI) s'exécute strictement en local (*air-gapped*), sans aucun flux réseau sortant vers l'extérieur.
- *Performance et Latence* : Le temps de réponse moyen doit rester compris entre *3 et 5 secondes* pour les requêtes complexes multi-jointures, et tomber sous les *100 ms* en cas de correspondance dans le cache sémantique vectoriel.
- *Agnosticisme et Sobriété Matérielle* : L'architecture est totalement agnostique du modèle sous-jacent et supporte n'importe quel LLM local via Ollama (Llama, Mistral, Qwen, DeepSeek). Dans cette étude, un modèle compact quantifié (`qwen3.5:4b`) a servi de référence minimale sous contrainte de ressources (< 8 Go de VRAM) pour prouver la viabilité sur du matériel standard, sachant que des modèles plus volumineux améliorent proportionnellement la vitesse et l'aisance de raisonnement.
- *Sécurité Applicative* : Rejet systématique de toute commande autre qu'un `SELECT` via l'analyse de l'arbre syntaxique (`AST`) de `sqlglot` @sqlglot2024, indépendamment du texte généré par le LLM.

== Modèle Relationnel de Référence : BD Ouvrages

Pour concevoir et valider la plateforme sur des requêtes représentatives de la complexité des bases d'entreprise, la maîtrise d'ouvrage a mis à disposition le schéma relationnel de référence `BD Ouvrages`. Ce schéma modélise une bibliothèque d'œuvres éditoriales :

#v(0.3cm)

#figure(
  image("../Images/erd_bd_ouvrages.svg", width: 100%),
  caption: [Modèle Entité-Association (ERD) de la base de données de référence BD Ouvrages],
)

#v(0.3cm)

Ce schéma a été spécifiquement conçu pour mettre à l'épreuve les capacités de raisonnement du système face à trois pièges relationnels classiques :

1. *Clés étrangères multiples vers une même table cible* : La table `ouvrage` référence trois fois la table `personne` (`dessinateur`, `scenariste`, `coloriste`), ce qui impose à l'agent de réaliser des auto-jointures multiples avec des alias de tables explicites (`JOIN personne pd ON o.dessinateur = pd.idp JOIN personne ps ON o.scenariste = ps.idp`).
2. *Clé étrangère optionnelle (Nullable FK)* : Le champ `ids` reliant un album à sa série est optionnel (valeur `NULL` pour les ouvrages hors-série dits _one-shots_). Une jointure interne naïve (`INNER JOIN`) élimine silencieusement les ouvrages sans série, exigeant impérativement l'application d'un `LEFT JOIN`.
3. *Hiérarchie réflexive récursive* : La table `concept` possède une clé réflexive `concept_pere` pointant vers son propre identifiant `idc`, nécessitant des requêtes récursives complexes (`WITH RECURSIVE`) pour explorer les sous-arborescences thématiques.


