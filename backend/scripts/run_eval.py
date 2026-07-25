#!/usr/bin/env python3
"""
Script CLI pour exécuter le benchmark d'évaluation de LLM4SQL en ligne de commande.
"""

import sys
import os
import json
import argparse
from pathlib import Path

# Ajouter le répertoire parent au sys.path si exécuté directement
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.services.eval_service import run_full_benchmark, EVAL_DATASET


def main():
    parser = argparse.ArgumentParser(
        description="CLI Benchmark d'Évaluation Automatisé LLM4SQL"
    )
    parser.add_argument(
        "--model",
        type=str,
        default=None,
        help="Nom du modèle Ollama à évaluer (ex: qwen3.5:4b, qwen2.5-coder:7b)"
    )
    parser.add_argument(
        "--output",
        type=str,
        default="eval_report_baseline.json",
        help="Chemin du fichier JSON de sortie (défaut: eval_report_baseline.json)"
    )
    args = parser.parse_args()

    print("=" * 70)
    print("      BENCHMARK D'ÉVALUATION LLM4SQL (EXECUTION ACCURACY)      ")
    print("=" * 70)
    print(f" Modèle cible    : {args.model or 'Modèle par défaut'}")
    print(f" Total de cas    : {len(EVAL_DATASET)}")
    print(f" Fichier de sortie: {args.output}")
    print("-" * 70)

    def print_progress(current: int, total: int, case_res: dict):
        status = "PASSE [OK]" if case_res["passed"] else "ECHEC [KO]"
        print(f" [{current:02d}/{total:02d}] Cas #{case_res['id']:02d} [{case_res['difficulty']:<9}] : {status} en {case_res['execution_time']}s")
        if not case_res["passed"] and case_res.get("error"):
            print(f"        -> Erreur : {case_res['error']}")

    report = run_full_benchmark(model=args.model, progress_callback=print_progress)

    print("=" * 70)
    print("                      RÉSUMÉ DU BENCHMARK                       ")
    print("=" * 70)
    print(f" Score Global     : {report['global_score']}% ({report['passed_cases']}/{report['total_cases']})")
    print(f" Temps d'exécution: {report['total_execution_time']}s")
    print("-" * 70)
    print(" DÉTAILS PAR DIFFICULTÉ :")
    for diff, stats in report["difficulty_breakdown"].items():
        print(f"  - {diff:<10} : {stats['accuracy']}% ({stats['passed']}/{stats['total']})")
    print("=" * 70)

    # Sauvegarde du rapport JSON
    try:
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        print(f"Rapport de benchmark sauvegardé avec succès dans : {out_path.resolve()}")
    except Exception as e:
        print(f"Erreur lors de la sauvegarde du rapport : {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
