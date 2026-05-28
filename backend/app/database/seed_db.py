from app.database.connection import get_db_connection


def seed_database() -> None:
    """
    Supprime l'ancien schéma et peuple la base de données PostgreSQL avec le jeu de données d'ouvrages BD.
    
    Cette fonction crée le schéma 'BD Ouvrages' composé de 6 tables :
    - personne : Auteurs de bande dessinée (dessinateurs, scénaristes, coloristes).
    - serie : Séries d'albums (ex: 'Blacksad', 'donjon').
    - ouvrage : Albums individuels.
    - concept : Concepts thématiques hiérarchiques (ex: 'animal' -> 'chien').
    - a_pour_mot_cle : Table de liaison entre ouvrages et concepts.
    - avis : Notes et avis de lecteurs sur les ouvrages.
    
    Raises:
        RuntimeError: En cas d'erreur de connexion ou d'exécution SQL lors du peuplement.
    """
    conn = None
    cur = None
    try:
        print("Connexion à PostgreSQL pour le peuplement...")
        conn = get_db_connection()
        cur = conn.cursor()

        print("Nettoyage de l'ancien schéma (DROP TABLES)...")
        cur.execute("DROP TABLE IF EXISTS avis, a_pour_mot_cle, concept, ouvrage, serie, personne CASCADE;")

        print("Création de la table: personne...")
        cur.execute("""
            CREATE TABLE personne (
                idp INT CONSTRAINT personne_pkey PRIMARY KEY,
                nom VARCHAR(30) NOT NULL,
                prenom VARCHAR(30),
                date_naiss DATE,
                date_deces DATE
            );
        """)

        print("Création de la table: serie...")
        cur.execute("""
            CREATE TABLE serie (
                ids INT CONSTRAINT serie_pkey PRIMARY KEY,
                titre VARCHAR(100) NOT NULL
            );
        """)

        print("Création de la table: ouvrage...")
        cur.execute("""
            CREATE TABLE ouvrage (
                ido INT CONSTRAINT ouvrage_pkey PRIMARY KEY,
                titre VARCHAR(100) NOT NULL,
                dessinateur INT NOT NULL CONSTRAINT ouvrage_dessinateur_fkey REFERENCES personne(idp),
                scenariste INT NOT NULL CONSTRAINT ouvrage_scenariste_fkey REFERENCES personne(idp),
                coloriste INT CONSTRAINT ouvrage_coloriste_fkey REFERENCES personne(idp),
                ids INT CONSTRAINT ouvrage_serie_fkey REFERENCES serie(ids),
                num_ordre INT,
                date_sortie DATE
            );
        """)

        print("Création de la table: concept...")
        cur.execute("""
            CREATE TABLE concept (
                idc INT CONSTRAINT concept_pkey PRIMARY KEY,
                label VARCHAR(20),
                concept_pere INT CONSTRAINT concept_pere_fkey REFERENCES concept(idc)
            );
        """)

        print("Création de la table: a_pour_mot_cle...")
        cur.execute("""
            CREATE TABLE a_pour_mot_cle (
                ido INT CONSTRAINT apmc_ouvrage REFERENCES ouvrage(ido) ON DELETE CASCADE,
                idc INT CONSTRAINT apmc_concept REFERENCES concept(idc) ON DELETE CASCADE,
                CONSTRAINT apmc_pkey PRIMARY KEY (ido, idc)
            );
        """)

        print("Création de la table: avis...")
        cur.execute("""
            CREATE TABLE avis (
                pseudo VARCHAR(10),
                ido INT CONSTRAINT avis_ouvrage REFERENCES ouvrage(ido) ON DELETE CASCADE,
                score INT CONSTRAINT score_enum CHECK (score BETWEEN 0 AND 5),
                CONSTRAINT avis_pkey PRIMARY KEY (pseudo, ido)
            );
        """)

        print("Insertion des auteurs (personne)...")
        cur.execute("""
            INSERT INTO personne (idp, nom, prenom, date_naiss) VALUES
            (1, 'Blain', 'Christophe', TO_DATE('10/08/1970','DD/MM/YYYY')),
            (2, 'Sfar', 'Joann', TO_DATE('28/08/1971','DD/MM/YYYY')),
            (3, 'Trondheim', 'Lewis', TO_DATE('11/12/1964','DD/MM/YYYY')),
            (4, 'Catel', NULL, TO_DATE('27/08/1964','DD/MM/YYYY')),
            (5, 'Bocquet', 'José-Louis', TO_DATE('28/08/1962','DD/MM/YYYY')),
            (6, 'Walter', NULL, TO_DATE('06/02/1969','DD/MM/YYYY')),
            (7, 'Arleston', 'Christophe', TO_DATE('14/08/1963','DD/MM/YYYY')),
            (8, 'Mourier', 'Jean-Louis', TO_DATE('06/11/1962','DD/MM/YYYY')),
            (9, 'Guth', 'Claude', TO_DATE('01/03/1962','DD/MM/YYYY')),
            (10, 'Diaz Canales', 'Juan', TO_DATE('01/01/1972','DD/MM/YYYY')),
            (11, 'Guarnido', 'Juanjo', TO_DATE('01/01/1967','DD/MM/YYYY')),
            (12, 'Ayroles', 'Alain', TO_DATE('01/01/1968','DD/MM/YYYY')),
            (13, 'Oubrerie', 'Clément', TO_DATE('23/12/1966','DD/MM/YYYY')),
            (14, 'Abouet', 'Marguerite', TO_DATE('01/01/1971','DD/MM/YYYY'));
        """)

        print("Insertion des séries (serie)...")
        cur.execute("""
            INSERT INTO serie (ids, titre) VALUES
            (1, 'Socrate le demi-chien'),
            (2, 'donjon'),
            (3, 'Trolls de Troy'),
            (4, 'Blacksad'),
            (5, 'Aya de Yopougon');
        """)

        print("Insertion des albums (ouvrage)...")
        cur.execute("""
            INSERT INTO ouvrage (ido, titre, dessinateur, scenariste, coloriste, ids, num_ordre, date_sortie) VALUES
            (11, 'Héraclès', 1, 2, NULL, 1, 1, TO_DATE('19/01/2002','DD/MM/YYYY')),
            (12, 'Ulysse', 1, 2, NULL, 1, 2, TO_DATE('20/11/2004','DD/MM/YYYY')),
            (13, 'Alice Guy, le destin romanesque d''une femme hors normes', 4, 5, NULL, NULL, NULL, TO_DATE('22/09/2021','DD/MM/YYYY')),
            (14, 'Olympe de Gouges', 4, 5, NULL, NULL, NULL, TO_DATE('14/03/2012','DD/MM/YYYY')),
            (15, 'Après la pluie', 1, 2, 6, 2, 84, TO_DATE('06/12/2006','DD/MM/YYYY')),
            (16, 'Art brut', 8, 7, NULL, 3, 23, TO_DATE('10/10/2018','DD/MM/YYYY')),
            (17, 'Un caillou sur la tête', 8, 7, 9, 3, 24, TO_DATE('04/12/2019','DD/MM/YYYY')),
            (18, 'Carnet d''un matelot', 1, 1, NULL, NULL, NULL, TO_DATE('01/04/1994','DD/MM/YYYY')),
            (19, 'Ame rouge', 11, 10, NULL, 4, 3, TO_DATE('18/11/2005','DD/MM/YYYY')),
            (20, 'L''enfer, le silence', 11, 10, NULL, 4, 4, TO_DATE('17/09/2010','DD/MM/YYYY')),
            (21, 'Imbroglio', 3, 3, NULL, NULL, NULL, TO_DATE('01/04/1994','DD/MM/YYYY')),
            (26, 'ALIEEN', 3, 3, NULL, NULL, NULL, TO_DATE('25/01/2007','DD/MM/YYYY')),
            (23, 'Coeur de Canard', 3, 2, 6, 2, 1, TO_DATE('01/04/1998','DD/MM/YYYY')),
            (22, 'Les Indes Fourbes', 11, 12, NULL, NULL, NULL, TO_DATE('28/08/2019','DD/MM/YYYY')),
            (24, 'Volume 1', 13, 14, NULL, 5, 1, TO_DATE('20/11/2005','DD/MM/YYYY')),
            (25, 'Volume 2', 13, 14, NULL, 5, 2, TO_DATE('29/09/2006','DD/MM/YYYY'));
        """)

        print("Insertion des concepts (concept)...")
        cur.execute("""
            INSERT INTO concept (idc, label, concept_pere) VALUES
            (1, 'histoire', NULL),
            (12, 'antiquité', 1),
            (13, 'moyen âge', 1),
            (14, 'époque moderne', 1),
            (3, 'animal', NULL),
            (4, 'chien', 3),
            (5, 'chat', 3),
            (6, 'biographie', NULL),
            (7, 'science fiction', NULL),
            (8, 'philosophie', NULL),
            (9, 'Afrique', NULL),
            (10, 'Côte d''Ivoire', 9),
            (2, 'féminisme', NULL),
            (11, 'heroïc fantasy', NULL),
            (15, 'Amérique', NULL),
            (16, 'religion', NULL),
            (17, 'mythologie', 16),
            (18, 'mythologie grecque', 17),
            (19, 'policier', NULL);
        """)

        print("Insertion des liaisons (a_pour_mot_cle)...")
        cur.execute("""
            INSERT INTO a_pour_mot_cle (ido, idc) VALUES
            (11, 8), (11, 12), (11, 4), (11, 17),
            (12, 8), (12, 12), (12, 4), (12, 17),
            (13, 2), (13, 6),
            (14, 2), (14, 6), (14, 14),
            (15, 11), (15, 3),
            (16, 11),
            (17, 11),
            (19, 19), (19, 5),
            (20, 19), (20, 5),
            (22, 14), (22, 15),
            (23, 11), (23, 3),
            (24, 2), (24, 10),
            (25, 2), (25, 10),
            (26, 7);
        """)

        print("Insertion des avis lecteurs (avis)...")
        cur.execute("""
            INSERT INTO avis (pseudo, ido, score) VALUES
            ('mikasa', 11, 3),
            ('mikasa', 16, 2),
            ('mikasa', 24, 5),
            ('mikasa', 25, 5),
            ('mikasa', 14, 4),
            ('mikasa', 22, 3),
            ('mikasa', 19, 1),
            ('erik', 15, 2),
            ('erik', 23, 2),
            ('erik', 21, 1),
            ('erik', 22, 0),
            ('erik', 11, 2),
            ('erik', 12, 0),
            ('theboss', 11, 3),
            ('theboss', 13, 4),
            ('theboss', 14, 5),
            ('theboss', 15, 5),
            ('theboss', 17, 3),
            ('theboss', 20, 5),
            ('theboss', 22, 5),
            ('theboss', 23, 4),
            ('moussa', 11, 4),
            ('moussa', 12, 4),
            ('sylvester', 14, 3),
            ('sylvester', 15, 5),
            ('kate', 13, 1),
            ('charly', 25, 4),
            ('charly', 17, 5),
            ('loulou', 23, 4),
            ('naruto', 19, 2),
            ('angela', 20, 4),
            ('angela', 21, 5),
            ('angela', 22, 4),
            ('iza', 24, 5),
            ('tonio', 25, 3),
            ('tonio', 26, 4);
        """)

        conn.commit()
        print("Peuplement du jeu de données BD Ouvrages terminé avec succès !")

    except Exception as e:
        if conn:
            conn.rollback()
        raise RuntimeError(f"Erreur fatale lors du peuplement de la base de données : {str(e)}")
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


if __name__ == "__main__":
    seed_database()
