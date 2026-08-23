import json
import logging
from pathlib import Path
from typing import List, Dict, Any

logger = logging.getLogger("llm4sql.eval_repo")

# Chemin vers la persistance JSON
DATASET_FILE = Path(__file__).parent.parent.parent / "data" / "eval_dataset.json"

# Dataset canonique par défaut de 18 cas d'évaluation
CANONICAL_EVAL_DATASET: List[Dict[str, Any]] = [
    {
        "id": 1,
        "question": "Lister le nom et le prénom de tous les auteurs de la table personne.",
        "difficulty": "Facile",
        "ground_truth_sql": "SELECT nom, prenom FROM personne ORDER BY nom, prenom;"
    },
    {
        "id": 2,
        "question": "Combien y a-t-il de séries enregistrées dans la base de données ?",
        "difficulty": "Facile",
        "ground_truth_sql": "SELECT COUNT(*) FROM serie;"
    },
    {
        "id": 3,
        "question": "Donner les titres des ouvrages sortis après l'année 2010.",
        "difficulty": "Facile",
        "ground_truth_sql": "SELECT titre FROM ouvrage WHERE date_sortie > '2010-12-31' ORDER BY titre;"
    },
    {
        "id": 4,
        "question": "Quel est le score moyen des avis attribués à l'album 'Les Indes Fourbes' ?",
        "difficulty": "Facile",
        "ground_truth_sql": "SELECT AVG(score) FROM avis a JOIN ouvrage o ON a.ido = o.ido WHERE o.titre = 'Les Indes Fourbes';"
    },
    {
        "id": 5,
        "question": "Donner le titre et le numéro d'ordre des albums appartenant à la série 'Blacksad'.",
        "difficulty": "Facile",
        "ground_truth_sql": "SELECT o.titre, o.num_ordre FROM ouvrage o JOIN serie s ON o.ids = s.ids WHERE s.titre = 'Blacksad' ORDER BY o.num_ordre;"
    },
    {
        "id": 6,
        "question": "Lister les ouvrages dessinés par 'Blain' avec le titre de leur série associée.",
        "difficulty": "Moyen",
        "ground_truth_sql": "SELECT o.titre, s.titre FROM ouvrage o JOIN personne p ON o.dessinateur = p.idp LEFT JOIN serie s ON o.ids = s.ids WHERE p.nom = 'Blain' ORDER BY o.titre;"
    },
    {
        "id": 7,
        "question": "Quels sont les 3 ouvrages ayant la meilleure note moyenne avec au moins 2 avis ?",
        "difficulty": "Moyen",
        "ground_truth_sql": "SELECT o.titre, AVG(a.score) FROM ouvrage o JOIN avis a ON o.ido = a.ido GROUP BY o.ido, o.titre HAVING COUNT(a.score) >= 2 ORDER BY AVG(a.score) DESC LIMIT 3;"
    },
    {
        "id": 8,
        "question": "Compter le nombre d'ouvrages associés à chaque mot-clé conceptuel.",
        "difficulty": "Moyen",
        "ground_truth_sql": "SELECT c.label, COUNT(ap.ido) FROM concept c JOIN a_pour_mot_cle ap ON c.idc = ap.idc GROUP BY c.idc, c.label ORDER BY COUNT(ap.ido) DESC, c.label;"
    },
    {
        "id": 9,
        "question": "Quels sont les auteurs qui sont à la fois dessinateurs et scénaristes d'un même ouvrage ?",
        "difficulty": "Moyen",
        "ground_truth_sql": "SELECT DISTINCT p.nom, p.prenom FROM personne p JOIN ouvrage o ON p.idp = o.dessinateur WHERE o.dessinateur = o.scenariste ORDER BY p.nom;"
    },
    {
        "id": 10,
        "question": "Quels sont les utilisateurs (pseudos) ayant donné des notes supérieures à la moyenne globale ?",
        "difficulty": "Difficile",
        "ground_truth_sql": "SELECT DISTINCT pseudo FROM avis WHERE score > (SELECT AVG(score) FROM avis) ORDER BY pseudo;"
    },
    {
        "id": 11,
        "question": "Trouver les paires d'auteurs (dessinateur et scénariste) ayant réalisé plus d'un album ensemble.",
        "difficulty": "Difficile",
        "ground_truth_sql": "SELECT p1.nom, p2.nom FROM ouvrage o JOIN personne p1 ON o.dessinateur = p1.idp JOIN personne p2 ON o.scenariste = p2.idp GROUP BY p1.idp, p1.nom, p2.idp, p2.nom HAVING COUNT(*) > 1 ORDER BY p1.nom;"
    },
    {
        "id": 12,
        "question": "Donner la liste des ouvrages associés au concept père 'histoire' ou à ses sous-concepts.",
        "difficulty": "Difficile",
        "ground_truth_sql": "WITH RECURSIVE me AS (SELECT idc FROM concept WHERE label = 'histoire' UNION ALL SELECT c.idc FROM concept c JOIN me ON c.concept_pere = me.idc) SELECT DISTINCT o.titre FROM ouvrage o JOIN a_pour_mot_cle ap ON o.ido = ap.ido JOIN me ON ap.idc = me.idc ORDER BY o.titre;"
    },
    {
        "id": 13,
        "question": "Calculer la note moyenne par série et classer les séries de la mieux notée à la moins bien notée.",
        "difficulty": "Avancé",
        "ground_truth_sql": "SELECT s.titre, AVG(a.score) FROM serie s JOIN ouvrage o ON s.ids = o.ids JOIN avis a ON o.ido = a.ido GROUP BY s.ids, s.titre ORDER BY AVG(a.score) DESC;"
    },
    {
        "id": 14,
        "question": "Pour chaque série, trouver le titre de la série, son nombre d'albums et la date de sortie du premier album.",
        "difficulty": "Avancé",
        "ground_truth_sql": "SELECT s.titre, COUNT(o.ido), MIN(o.date_sortie) FROM serie s JOIN ouvrage o ON s.ids = o.ids GROUP BY s.ids, s.titre ORDER BY s.titre;"
    },
    {
        "id": 15,
        "question": "Peux-tu me donner la liste de tous les dessinateurs uniques enregistrés dans la table ouvrage ?",
        "difficulty": "Facile",
        "ground_truth_sql": "SELECT DISTINCT p.nom, p.prenom FROM ouvrage o JOIN personne p ON o.dessinateur = p.idp ORDER BY p.nom;"
    },
    {
        "id": 16,
        "question": "Affiche pour chaque album son titre, le nom de son scénariste, et le nom de son dessinateur.",
        "difficulty": "Moyen",
        "ground_truth_sql": "SELECT o.titre, ps.nom, pd.nom FROM ouvrage o JOIN personne pd ON o.dessinateur = pd.idp JOIN personne ps ON o.scenariste = ps.idp ORDER BY o.titre;"
    },
    {
        "id": 17,
        "question": "Donner la liste des ouvrages n'ayant reçu aucun avis de lecteur.",
        "difficulty": "Difficile",
        "ground_truth_sql": "SELECT o.titre FROM ouvrage o LEFT JOIN avis a ON o.ido = a.ido WHERE a.ido IS NULL ORDER BY o.titre;"
    },
    {
        "id": 18,
        "question": "Lister les concepts n'ayant aucun concept père et compter combien d'ouvrages y sont associés.",
        "difficulty": "Avancé",
        "ground_truth_sql": "SELECT c.label, COUNT(ap.ido) FROM concept c LEFT JOIN a_pour_mot_cle ap ON c.idc = ap.idc WHERE c.concept_pere IS NULL GROUP BY c.idc, c.label ORDER BY c.label;"
    }
]

# Collection dynamique en mémoire synchronisée avec eval_dataset.json
EVAL_DATASET: List[Dict[str, Any]] = []


def save_dataset(dataset: List[Dict[str, Any]]) -> None:
    """Sauvegarde le jeu de données d'évaluation dans backend/app/data/eval_dataset.json."""
    DATASET_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(DATASET_FILE, "w", encoding="utf-8") as f:
        json.dump(dataset, f, indent=2, ensure_ascii=False)
    EVAL_DATASET.clear()
    EVAL_DATASET.extend(dataset)


def load_dataset() -> List[Dict[str, Any]]:
    """
    Charge le jeu de données d'évaluation depuis backend/app/data/eval_dataset.json.
    Crée le fichier s'il n'existe pas avec les 18 cas canoniques.
    """
    DATASET_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not DATASET_FILE.exists():
        save_dataset(CANONICAL_EVAL_DATASET)

    try:
        with open(DATASET_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            EVAL_DATASET.clear()
            EVAL_DATASET.extend(data)
            return EVAL_DATASET
    except Exception as e:
        logger.error(f"Erreur de lecture de eval_dataset.json: {str(e)}")
        EVAL_DATASET.clear()
        EVAL_DATASET.extend(CANONICAL_EVAL_DATASET)
        return EVAL_DATASET


def add_eval_case(question: str, difficulty: str, ground_truth_sql: str) -> Dict[str, Any]:
    """Ajoute un nouveau cas d'évaluation et persiste dans le JSON."""
    ds = load_dataset()
    new_id = max([c["id"] for c in ds], default=0) + 1
    new_case = {
        "id": new_id,
        "question": question,
        "difficulty": difficulty,
        "ground_truth_sql": ground_truth_sql
    }
    ds.append(new_case)
    save_dataset(ds)
    return new_case


def update_eval_case(case_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
    """Modifie un cas d'évaluation existant par son ID et persiste dans le JSON."""
    ds = load_dataset()
    target = next((c for c in ds if c["id"] == case_id), None)
    if not target:
        raise ValueError(f"Cas d'évaluation id={case_id} non trouvé.")

    if "question" in data and data["question"] is not None:
        target["question"] = data["question"]
    if "difficulty" in data and data["difficulty"] is not None:
        target["difficulty"] = data["difficulty"]
    if "ground_truth_sql" in data and data["ground_truth_sql"] is not None:
        target["ground_truth_sql"] = data["ground_truth_sql"]

    save_dataset(ds)
    return target


def delete_eval_case(case_id: int) -> bool:
    """Supprime un cas d'évaluation par son ID et persiste dans le JSON."""
    ds = load_dataset()
    new_ds = [c for c in ds if c["id"] != case_id]
    if len(new_ds) == len(ds):
        return False
    save_dataset(new_ds)
    return True


def reset_eval_dataset() -> List[Dict[str, Any]]:
    """Réinitialise le dataset JSON aux 18 cas canoniques par défaut."""
    save_dataset(CANONICAL_EVAL_DATASET)
    return load_dataset()


# Charger le dataset initial
load_dataset()
