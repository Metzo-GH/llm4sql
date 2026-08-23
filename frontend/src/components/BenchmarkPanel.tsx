import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  FlaskConical,
  Play,
  Cpu,
  AlertCircle,
  Plus,
  RotateCcw,
  Square,
  Eraser,
  Filter,
} from 'lucide-react';
import { API_BASE_URL } from '../config/api';
import { BenchmarkSummaryCards } from './benchmark/BenchmarkSummaryCards';
import { BenchmarkCaseItem } from './benchmark/BenchmarkCaseItem';
import { BenchmarkCaseModal } from './benchmark/BenchmarkCaseModal';

/**
 * Interface pour la télémétrie d'une étape agentique LangGraph.
 */
export interface AgentStepTelemetry {
  node?: string;
  step?: string;
  status?: string;
  mcp_tool?: string;
  tool?: string;
  elapsed_time?: number;
  duration?: number;
}

/**
 * Interface pour un cas de benchmark individuel.
 */
export interface BenchmarkCaseResult {
  id: number;
  question: string;
  difficulty: 'Facile' | 'Moyen' | 'Difficile' | 'Avancé';
  passed?: boolean;
  execution_time?: number;
  ground_truth_sql: string;
  generated_sql?: string | null;
  error?: string | null;
  expected_count?: number;
  actual_count?: number;
  steps?: AgentStepTelemetry[];
}

/**
 * Interface pour le rapport global d'évaluation.
 */
export interface BenchmarkReport {
  timestamp: string;
  model: string;
  total_cases: number;
  passed_cases: number;
  global_score: number;
  total_execution_time: number;
  difficulty_breakdown: Record<
    'Facile' | 'Moyen' | 'Difficile' | 'Avancé',
    { total: number; passed: number; accuracy: number }
  >;
  results: BenchmarkCaseResult[];
}

interface BenchmarkPanelProps {
  /** Modèle actuellement sélectionné dans l'application. */
  currentModel: string;
  /** Liste des modèles Ollama installés. */
  installedModels: string[];
  /** Schéma de base de données cible ("public" par défaut). */
  selectedSchema?: string;
}

/**
 * Composant de l'interface de benchmark automatisé (Phase R20).
 * Permet d'évaluer la précision d'exécution d'un LLM et d'éditer le jeu de données d'évaluation.
 */
export const BenchmarkPanel: React.FC<BenchmarkPanelProps> = ({
  currentModel,
  installedModels,
  selectedSchema = 'public',
}) => {
  const [selectedModel, setSelectedModel] = useState<string>(currentModel || '');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [currentProgress, setCurrentProgress] = useState<{ current: number; total: number } | null>(null);
  const [report, setReport] = useState<BenchmarkReport | null>(null);
  const [liveResults, setLiveResults] = useState<BenchmarkCaseResult[]>([]);
  const [expandedCases, setExpandedCases] = useState<Record<number, boolean>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // État du jeu de données brut depuis le backend
  const [cases, setCases] = useState<BenchmarkCaseResult[]>([]);

  // Modal d'ajout / édition
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingCase, setEditingCase] = useState<BenchmarkCaseResult | null>(null);
  const [formQuestion, setFormQuestion] = useState<string>('');
  const [formDifficulty, setFormDifficulty] = useState<'Facile' | 'Moyen' | 'Difficile' | 'Avancé'>('Moyen');
  const [formGroundTruthSql, setFormGroundTruthSql] = useState<string>('');

  const activeModel = selectedModel || currentModel || '';

  // Charger la liste des cas depuis l' API
  const fetchCases = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/eval/cases`);
      if (res.ok) {
        const data = await res.json();
        setCases(data);
      }
    } catch (err) {
      console.warn('Impossible de charger les cas d\'évaluation :', err);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCases();
  }, [fetchCases]);

  // Charger l'historique initial si disponible
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/eval/history`)
      .then(res => res.json())
      .then((history: BenchmarkReport[]) => {
        if (history && history.length > 0) {
          setReport(history[0]);
          setLiveResults(history[0].results);
        }
      })
      .catch(err => {
        console.warn('Impossible de charger l\'historique du benchmark :', err);
      });
  }, []);

  // État du filtre d'affichage ('all' | 'passed' | 'failed' | 'untested')
  const [filterStatus, setFilterStatus] = useState<'all' | 'passed' | 'failed' | 'untested'>('all');

  // Basculer l'accordéon d'un cas
  const toggleAccordion = useCallback((caseId: number) => {
    setExpandedCases(prev => ({
      ...prev,
      [caseId]: !prev[caseId]
    }));
  }, []);

  // Fusion dynamique : `cases` est la source de vérité pour la liste des questions,
  // enrichie de la télémétrie d'évaluation (report ou liveResults) si disponible.
  const mergedCases = useMemo(() => {
    const execMap = new Map<number, BenchmarkCaseResult>();
    if (report?.results) {
      report.results.forEach(r => execMap.set(r.id, r));
    }
    if (liveResults.length > 0) {
      liveResults.forEach(r => execMap.set(r.id, r));
    }

    if (execMap.size === 0) {
      return cases;
    }

    return cases.map(c => {
      const exec = execMap.get(c.id);
      if (exec) {
        return {
          ...exec,
          question: c.question,
          difficulty: c.difficulty,
          ground_truth_sql: c.ground_truth_sql,
        };
      }
      return c;
    });
  }, [cases, report, liveResults]);

  // Statistiques de comptage par statut
  const passedCount = useMemo(() => mergedCases.filter(c => c.passed === true).length, [mergedCases]);
  const failedCount = useMemo(() => mergedCases.filter(c => c.passed === false).length, [mergedCases]);
  const untestedCount = useMemo(() => mergedCases.filter(c => c.passed === undefined).length, [mergedCases]);

  // Cas filtrés selon l'onglet actif
  const activeResults = useMemo(() => {
    if (filterStatus === 'passed') return mergedCases.filter(c => c.passed === true);
    if (filterStatus === 'failed') return mergedCases.filter(c => c.passed === false);
    if (filterStatus === 'untested') return mergedCases.filter(c => c.passed === undefined);
    return mergedCases;
  }, [mergedCases, filterStatus]);

  // Déplier / replier tous les accordéons
  const toggleAllAccordions = useCallback((expand: boolean) => {
    if (activeResults.length === 0) return;
    const newState: Record<number, boolean> = {};
    activeResults.forEach(c => {
      newState[c.id] = expand;
    });
    setExpandedCases(newState);
  }, [activeResults]);

  // Effacer les résultats du benchmark (revenir à la vue brute du dataset sans effacer les questions personnalisées)
  const handleClearBenchmarkResults = useCallback(() => {
    setReport(null);
    setLiveResults([]);
    setErrorMessage(null);
    setStatusMessage('Résultats du benchmark effacés. Affichage des questions du jeu de données.');
  }, []);

  // Arrêt manuel du benchmark par l'utilisateur
  const handleStopBenchmark = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/api/eval/stop`, { method: 'POST' });
    } catch (err) {
      console.warn('Erreur lors de la requête d\'arrêt du benchmark :', err);
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsRunning(false);
    setStatusMessage('Benchmark arrêté par l\'utilisateur');
  }, []);

  // Lancement du benchmark via SSE
  const handleStartBenchmark = useCallback(() => {
    if (isRunning) return;

    setIsRunning(true);
    setErrorMessage(null);
    setStatusMessage(null);
    setLiveResults([]);
    setReport(null);
    setCurrentProgress({ current: 0, total: cases.length || 18 });

    const modelParam = activeModel ? encodeURIComponent(activeModel) : '';
    const schemaParam = encodeURIComponent(selectedSchema || 'public');
    const sseUrl = `${API_BASE_URL}/api/eval/stream?model=${modelParam}&target_schema=${schemaParam}`;

    const eventSource = new EventSource(sseUrl);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'start') {
          setCurrentProgress({ current: 0, total: data.total });
        } else if (data.type === 'progress') {
          setCurrentProgress({ current: data.current, total: data.total });
          setLiveResults(prev => [...prev, data.case]);
        } else if (data.type === 'complete') {
          setReport(data.report);
          setLiveResults(data.report.results);
          setIsRunning(false);
          if (data.report?.cancelled) {
            setStatusMessage('Benchmark arrêté par l\'utilisateur');
          }
          eventSource.close();
          eventSourceRef.current = null;
        } else if (data.type === 'error') {
          setErrorMessage(data.message || 'Erreur lors du déroulement du benchmark.');
          setIsRunning(false);
          eventSource.close();
          eventSourceRef.current = null;
        }
      } catch (err) {
        console.error('Erreur lors du traitement du message SSE :', err);
      }
    };

    eventSource.onerror = () => {
      setErrorMessage('La connexion au flux SSE d\'évaluation a été interrompue.');
      setIsRunning(false);
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [isRunning, activeModel, cases.length, selectedSchema]);

  // Actions CRUD
  const openCreateModal = () => {
    setEditingCase(null);
    setFormQuestion('');
    setFormDifficulty('Moyen');
    setFormGroundTruthSql('');
    setIsModalOpen(true);
  };

  const openEditModal = (c: BenchmarkCaseResult, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCase(c);
    setFormQuestion(c.question);
    setFormDifficulty(c.difficulty);
    setFormGroundTruthSql(c.ground_truth_sql);
    setIsModalOpen(true);
  };

  const handleSaveCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formQuestion.trim() || !formGroundTruthSql.trim()) return;

    try {
      if (editingCase) {
        const res = await fetch(`${API_BASE_URL}/api/eval/cases/${editingCase.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: formQuestion.trim(),
            difficulty: formDifficulty,
            ground_truth_sql: formGroundTruthSql.trim(),
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          setErrorMessage(`Erreur lors de la modification : ${errData.detail || res.statusText}`);
          return;
        }
        setStatusMessage(`Cas #${editingCase.id} modifié avec succès.`);
      } else {
        const res = await fetch(`${API_BASE_URL}/api/eval/cases`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: formQuestion.trim(),
            difficulty: formDifficulty,
            ground_truth_sql: formGroundTruthSql.trim(),
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          setErrorMessage(`Erreur lors de l'ajout : ${errData.detail || res.statusText}`);
          return;
        }
        const created = await res.json();
        setStatusMessage(`Nouveau cas #${created.id} ajouté avec succès.`);
      }
      setIsModalOpen(false);
      await fetchCases();
    } catch (err) {
      console.error('Erreur lors de la sauvegarde du cas :', err);
      setErrorMessage(`Erreur réseau : ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDeleteCase = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Voulez-vous vraiment supprimer le cas d'évaluation #${id} ?`)) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/eval/cases/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setErrorMessage(`Erreur lors de la suppression : ${errData.detail || res.statusText}`);
        return;
      }
      setStatusMessage(`Cas #${id} supprimé avec succès.`);
      await fetchCases();
    } catch (err) {
      console.error('Erreur lors de la suppression :', err);
      setErrorMessage(`Erreur réseau : ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleResetCases = async () => {
    if (!window.confirm('Voulez-vous vraiment réinitialiser le jeu de données aux 18 cas canoniques par défaut ?')) return;

    try {
      await fetch(`${API_BASE_URL}/api/eval/cases/reset`, {
        method: 'POST',
      });
      setReport(null);
      setLiveResults([]);
      setStatusMessage('Jeu de données réinitialisé aux 18 cas canoniques par défaut.');
      await fetchCases();
    } catch (err) {
      console.error('Erreur lors de la réinitialisation :', err);
      setErrorMessage(`Erreur réseau : ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Score global temporaire en direct
  const liveGlobalScore = useMemo(() => {
    if (liveResults.length === 0) return 0;
    const passed = liveResults.filter(r => r.passed).length;
    return Math.round((passed / liveResults.length) * 100);
  }, [liveResults]);

  const getDifficultyBadgeClass = (difficulty: string) => {
    switch (difficulty) {
      case 'Facile': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'Moyen': return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'Difficile': return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'Avancé': return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      default: return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 gap-4 glass-panel text-gray-100 relative">
      {/* En-tête du Benchmark */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <FlaskConical size={24} />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-wide flex items-center gap-2">
              Benchmark d'Évaluation Automatisé
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-normal">
                Execution Accuracy
              </span>
            </h2>
            <p className="text-xs text-gray-400">
              Évaluez et gérez les cas de test SQL sur PostgreSQL (Télémétrie Agentique LangGraph).
            </p>
          </div>
        </div>

        {/* Barre d'outils et Formulaire */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Bouton Ajouter */}
          <button
            onClick={openCreateModal}
            disabled={isRunning}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 transition-all cursor-pointer"
          >
            <Plus size={14} className="text-emerald-400" />
            <span>➕ Ajouter une question</span>
          </button>

          {/* Bouton Effacer les résultats du benchmark */}
          {(report || liveResults.length > 0) && (
            <button
              onClick={handleClearBenchmarkResults}
              disabled={isRunning}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-blue-950/40 hover:bg-blue-900/60 text-blue-300 border border-blue-800/60 transition-all cursor-pointer"
              title="Effacer les résultats d'exécution pour afficher la liste brute de toutes les questions"
            >
              <Eraser size={13} className="text-blue-400" />
              <span>🧹 Effacer les résultats</span>
            </button>
          )}

          {/* Bouton Réinitialiser */}
          <button
            onClick={handleResetCases}
            disabled={isRunning}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-all cursor-pointer"
            title="Réinitialiser le jeu de données aux 18 cas canoniques par défaut"
          >
            <RotateCcw size={13} className="text-amber-400" />
            <span>🔄 Réinitialiser</span>
          </button>

          {/* Choix du Modèle */}
          <div className="flex items-center gap-1.5">
            <Cpu size={15} className="text-gray-400" />
            <select
              value={activeModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={isRunning}
              className="bg-gray-900/80 border border-gray-700/80 rounded-md text-xs px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 text-gray-200"
            >
              <option value="">Modèle par défaut (Ollama)</option>
              {installedModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Bouton Lancer / Arrêter */}
          {isRunning ? (
            <button
              onClick={handleStopBenchmark}
              className="flex items-center gap-2 text-xs font-semibold px-4 py-1.5 rounded-md bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-lg shadow-red-900/30 transition-all active:scale-95 cursor-pointer"
            >
              <Square size={13} className="fill-current text-white" />
              <span>Arrêter le Benchmark 🛑</span>
            </button>
          ) : (
            <button
              onClick={handleStartBenchmark}
              className="flex items-center gap-2 text-xs font-semibold px-4 py-1.5 rounded-md bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-900/30 transition-all active:scale-95 cursor-pointer"
            >
              <Play size={14} className="fill-current" />
              <span>Lancer le Benchmark 🚀</span>
            </button>
          )}
        </div>
      </div>

      {/* Message d'information / statut */}
      {statusMessage && (
        <div className="flex items-center justify-between p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300 text-xs animate-fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0 text-emerald-400" />
            <span>{statusMessage}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-gray-400 hover:text-gray-200 text-xs px-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Message d'erreur */}
      {errorMessage && (
        <div className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs animate-fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0 text-red-400" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-gray-400 hover:text-gray-200 text-xs px-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Barre de progression pendant l'évaluation */}
      {isRunning && currentProgress && (
        <div className="p-4 rounded-lg bg-gray-900/70 border border-emerald-500/30 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-emerald-400 font-medium flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              Progression de l'évaluation ({currentProgress.current} / {currentProgress.total} cas)
            </span>
            <span className="font-mono text-gray-300">
              Score actuel : {liveGlobalScore}%
            </span>
          </div>
          <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
              style={{
                width: `${Math.round((currentProgress.current / currentProgress.total) * 100)}%`
              }}
            ></div>
          </div>
        </div>
      )}

      {/* Synthèse des résultats et Cartes de scores */}
      {(report || liveResults.length > 0) && (
        <BenchmarkSummaryCards
          report={report}
          liveResults={liveResults}
          liveGlobalScore={liveGlobalScore}
          getDifficultyBadgeClass={getDifficultyBadgeClass}
        />
      )}

      {/* Barre de filtrage et d'état des cas */}
      <div className="flex flex-col flex-1 gap-2 mt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-gray-400 pb-2 border-b border-gray-800">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-300 flex items-center gap-1.5">
              <Filter size={13} className="text-emerald-400" />
              Filtrer :
            </span>
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-2 py-0.5 rounded text-xs transition-colors cursor-pointer ${
                filterStatus === 'all'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-medium'
                  : 'bg-gray-800/60 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }`}
            >
              Tous ({mergedCases.length})
            </button>
            {(report || liveResults.length > 0) && (
              <>
                <button
                  onClick={() => setFilterStatus('passed')}
                  className={`px-2 py-0.5 rounded text-xs transition-colors cursor-pointer ${
                    filterStatus === 'passed'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-medium'
                      : 'bg-gray-800/60 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                  }`}
                >
                  Réussis ({passedCount})
                </button>
                <button
                  onClick={() => setFilterStatus('failed')}
                  className={`px-2 py-0.5 rounded text-xs transition-colors cursor-pointer ${
                    filterStatus === 'failed'
                      ? 'bg-red-500/20 text-red-300 border border-red-500/40 font-medium'
                      : 'bg-gray-800/60 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                  }`}
                >
                  Échoués ({failedCount})
                </button>
                <button
                  onClick={() => setFilterStatus('untested')}
                  className={`px-2 py-0.5 rounded text-xs transition-colors cursor-pointer ${
                    filterStatus === 'untested'
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 font-medium'
                      : 'bg-gray-800/60 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                  }`}
                >
                  Non évalués ({untestedCount})
                </button>
              </>
            )}
          </div>

          {activeResults.length > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => toggleAllAccordions(true)}
                className="hover:text-emerald-400 transition-colors cursor-pointer"
              >
                Tout déplier
              </button>
              <span>•</span>
              <button
                onClick={() => toggleAllAccordions(false)}
                className="hover:text-emerald-400 transition-colors cursor-pointer"
              >
                Tout replier
              </button>
            </div>
          )}
        </div>

        {activeResults.length === 0 && !isRunning && (
          <div className="flex flex-col items-center justify-center p-8 text-center bg-gray-900/40 rounded-lg border border-gray-800/80">
            <FlaskConical size={36} className="text-gray-600 mb-2" />
            <p className="text-sm text-gray-300 font-medium">Aucun cas d'évaluation disponible</p>
            <p className="text-xs text-gray-500 mt-1 max-w-md">
              Cliquez sur "➕ Ajouter une question" pour ajouter un test ou sur "🔄 Réinitialiser" pour restaurer les 18 cas canoniques.
            </p>
          </div>
        )}

        {activeResults.map((item) => (
          <BenchmarkCaseItem
            key={item.id}
            item={item}
            isExpanded={!!expandedCases[item.id]}
            onToggleExpand={toggleAccordion}
            onEdit={openEditModal}
            onDelete={handleDeleteCase}
            getDifficultyBadgeClass={getDifficultyBadgeClass}
          />
        ))}
      </div>

      {/* Modal d'Ajout / Édition de Cas d'Évaluation */}
      <BenchmarkCaseModal
        isOpen={isModalOpen}
        editingCase={editingCase}
        formQuestion={formQuestion}
        setFormQuestion={setFormQuestion}
        formDifficulty={formDifficulty}
        setFormDifficulty={setFormDifficulty}
        formGroundTruthSql={formGroundTruthSql}
        setFormGroundTruthSql={setFormGroundTruthSql}
        onSave={handleSaveCase}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};

