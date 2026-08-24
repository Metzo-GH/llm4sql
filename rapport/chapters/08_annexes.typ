// ==============================================================================
// ANNEXES TECHNIQUES DU MÉMOIRE
// ==============================================================================

#heading(level: 1, numbering: none)[Annexes]

== Annexe A : Schéma DDL de la Base de Données de Référence (BD Ouvrages)

Le script SQL ci-dessous présente la structure relationnelle complète de la base de référence `BD Ouvrages` déployée sous `PostgreSQL 16` :

```sql
-- Création des tables du schéma relationnel de référence BD Ouvrages
CREATE TABLE personne (
    idp SERIAL PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    date_naiss DATE,
    date_deces DATE
);

CREATE TABLE serie (
    ids SERIAL PRIMARY KEY,
    titre VARCHAR(255) NOT NULL
);

CREATE TABLE ouvrage (
    ido SERIAL PRIMARY KEY,
    titre VARCHAR(255) NOT NULL,
    dessinateur INT REFERENCES personne(idp),
    scenariste INT REFERENCES personne(idp),
    coloriste INT REFERENCES personne(idp),
    ids INT REFERENCES serie(ids),
    num_ordre INT,
    date_sortie DATE
);

CREATE TABLE concept (
    idc SERIAL PRIMARY KEY,
    label VARCHAR(100) NOT NULL,
    concept_pere INT REFERENCES concept(idc)
);

CREATE TABLE a_pour_mot_cle (
    ido INT REFERENCES ouvrage(ido),
    idc INT REFERENCES concept(idc),
    PRIMARY KEY (ido, idc)
);

CREATE TABLE avis (
    pseudo VARCHAR(100),
    ido INT REFERENCES ouvrage(ido),
    score INT CHECK (score BETWEEN 0 AND 10),
    PRIMARY KEY (pseudo, ido)
);
```

#pagebreak()

== Annexe B : Jeu d'Épreuve Canonique de Benchmark (18 Scénarios)

Le tableau ci-dessous récapitule les 18 questions décisionnelles utilisées pour évaluer l'exactitude d'exécution (*Execution Accuracy*) :

#figure(
  table(
    columns: (0.6fr, 1.4fr, 4fr),
    align: (center, left, left),
    table.header([*N°*], [*Difficulté*], [*Question décisionnelle posée en langage naturel*]),
    [01], [Simple], [Lister le nom et le prénom de tous les auteurs de la table personne.],
    [02], [Simple], [Combien y a-t-il de séries enregistrées dans la base de données ?],
    [03], [Simple], [Donner les titres des ouvrages sortis après l'année 2010.],
    [04], [Simple], [Quel est le score moyen des avis attribués à l'album 'Les Indes Fourbes' ?],
    [05], [Simple], [Donner le titre et le numéro d'ordre des albums appartenant à la série 'Blacksad'.],
    [06], [Moyen], [Lister les ouvrages dessinés par 'Blain' avec le titre de leur série associée.],
    [07], [Moyen], [Quels sont les 3 ouvrages ayant la meilleure note moyenne avec au moins 2 avis ?],
    [08], [Moyen], [Compter le nombre d'ouvrages associés à chaque mot-clé conceptuel.],
    [09], [Moyen], [Quels sont les auteurs qui sont à la fois dessinateurs et scénaristes d'un même ouvrage ?],
    [10], [Difficile], [Quels sont les utilisateurs (pseudos) ayant donné des notes supérieures à la moyenne globale ?],
    [11], [Difficile], [Trouver les paires d'auteurs (dessinateur et scénariste) ayant réalisé plus d'un album ensemble.],
    [12], [Difficile], [Donner la liste des ouvrages associés au concept père 'histoire' ou à ses sous-concepts.],
    [13], [Avancé], [Calculer la note moyenne par série et classer les séries de la mieux notée à la moins bien notée.],
    [14], [Avancé], [Pour chaque série, trouver le titre de la série, son nombre d'albums et la date de sortie du premier album.],
    [15], [Simple], [Peux-tu me donner la liste de tous les dessinateurs uniques enregistrés dans la table ouvrage ?],
    [16], [Moyen], [Affiche pour chaque album son titre, le nom de son scénariste, et le nom de son dessinateur.],
    [17], [Difficile], [Donner la liste des ouvrages n'ayant reçu aucun avis de lecteur.],
    [18], [Avancé], [Lister les concepts n'ayant aucun concept père et compter combien d'ouvrages y sont associés.],
  ),
  caption: [Détail des 18 scénarios d'évaluation du banc de test automatisé],
)

#pagebreak()

== Annexe C : Spécification des Outils du Serveur MCP

Le serveur `MCP` expose quatre outils spécialisés pour l'agent `LangGraph` :

#figure(
  table(
    columns: (1.8fr, 2.2fr, 2.5fr),
    align: (left, left, left),
    table.header([*Nom de l'outil*], [*Paramètres d'entrée*], [*Données retournées*]),
    [`mcp_get_schema`],
    [`table_name` (str), `target_schema` (str)],
    [Structure des colonnes, types PostgreSQL, contraintes PK/FK, nullabilité et indices de jointures (_Join Hints_).],

    [`mcp_search_value`],
    [`query` (str), `target_table` (str), `target_schema` (str)],
    [Valeurs correspondantes trouvées via `ILIKE` et suggestions de jointures sur clés étrangères.],

    [`mcp_get_sample_data`],
    [`table_name` (str), `limit` (int, défaut 3)],
    [Échantillon de 3 enregistrements pour appréhender le formatage des données sans saturer le contexte.],

    [`mcp_dry_run_query`],
    [`sql` (str), `target_schema` (str)],
    [Validation protégée en transaction isolée : statut de succès, colonnes résultantes, estimation de lignes et diagnostics d'erreurs.],
  ),
  caption: [Catalogue des outils standardisés du serveur MCP],
)

