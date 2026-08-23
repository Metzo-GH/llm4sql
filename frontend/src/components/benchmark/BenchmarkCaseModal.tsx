import React from 'react';
import { Pencil, Plus } from 'lucide-react';
import type { BenchmarkCaseResult } from '../BenchmarkPanel';

interface BenchmarkCaseModalProps {
  isOpen: boolean;
  editingCase: BenchmarkCaseResult | null;
  formQuestion: string;
  setFormQuestion: (q: string) => void;
  formDifficulty: 'Facile' | 'Moyen' | 'Difficile' | 'Avancé';
  setFormDifficulty: (d: 'Facile' | 'Moyen' | 'Difficile' | 'Avancé') => void;
  formGroundTruthSql: string;
  setFormGroundTruthSql: (sql: string) => void;
  onSave: (e: React.FormEvent) => Promise<void>;
  onClose: () => void;
}

export const BenchmarkCaseModal: React.FC<BenchmarkCaseModalProps> = ({
  isOpen,
  editingCase,
  formQuestion,
  setFormQuestion,
  formDifficulty,
  setFormDifficulty,
  formGroundTruthSql,
  setFormGroundTruthSql,
  onSave,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 w-full max-w-lg shadow-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
            {editingCase ? (
              <>
                <Pencil size={16} className="text-blue-400" />
                Modifier le Cas d'Évaluation #{editingCase.id}
              </>
            ) : (
              <>
                <Plus size={16} className="text-emerald-400" />
                Ajouter une Question d'Évaluation
              </>
            )}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 text-xs px-2 py-1 rounded cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSave} className="flex flex-col gap-3.5 text-xs">
          <div className="flex flex-col gap-1">
            <label className="text-gray-300 font-medium">Question en langage naturel :</label>
            <textarea
              value={formQuestion}
              onChange={(e) => setFormQuestion(e.target.value)}
              placeholder="Ex: Lister tous les ouvrages de la série Blacksad..."
              rows={2}
              required
              className="bg-gray-950 border border-gray-700 rounded-md p-2 text-gray-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-gray-300 font-medium">Niveau de difficulté :</label>
            <select
              value={formDifficulty}
              onChange={(e) => setFormDifficulty(e.target.value as 'Facile' | 'Moyen' | 'Difficile' | 'Avancé')}
              className="bg-gray-950 border border-gray-700 rounded-md p-2 text-gray-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="Facile">Facile</option>
              <option value="Moyen">Moyen</option>
              <option value="Difficile">Difficile</option>
              <option value="Avancé">Avancé</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-gray-300 font-medium">Requête SQL de référence (Ground Truth) :</label>
            <textarea
              value={formGroundTruthSql}
              onChange={(e) => setFormGroundTruthSql(e.target.value)}
              placeholder="Ex: SELECT * FROM ouvrage WHERE ids = 1;"
              rows={3}
              required
              className="bg-gray-950 border border-gray-700 rounded-md p-2 font-mono text-[11px] text-emerald-300 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 font-semibold text-white shadow-md shadow-emerald-900/30 cursor-pointer"
            >
              {editingCase ? 'Mettre à jour' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
