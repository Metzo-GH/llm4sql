import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  FlaskConical,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Cpu,
  Award,
  AlertCircle,
  FileCode2,
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
  Activity,
  Wrench,
  HelpCircle,
  Square,
} from 'lucide-react';
import { API_BASE_URL } from '../config/api';

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

  // Charger la liste des cas depuis l'API
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

  // Basculer l'accordéon d'un cas
  const toggleAccordion = useCallback((caseId: number) => {
    setExpandedCases(prev => ({
      ...prev,
      [caseId]: !prev[caseId]
    }));
  }, []);

  const activeResults = useMemo(() => {
    if (report) return report.results;
    if (liveResults.length > 0) return liveResults;
    return cases;
  }, [report, liveResults, cases]);

  // Déplier / replier tous les accordéons
  const toggleAllAccordions = useCallback((expand: boolean) => {
    if (activeResults.length === 0) return;
    const newState: Record<number, boolean> = {};
    activeResults.forEach(c => {
      newState[c.id] = expand;
    });
    setExpandedCases(newState);
  }, [activeResults]);

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
        await fetch(`${API_BASE_URL}/api/eval/cases/${editingCase.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: formQuestion,
            difficulty: formDifficulty,
            ground_truth_sql: formGroundTruthSql,
          }),
        });
      } else {
        await fetch(`${API_BASE_URL}/api/eval/cases`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: formQuestion,
            difficulty: formDifficulty,
            ground_truth_sql: formGroundTruthSql,
          }),
        });
      }
      setIsModalOpen(false);
      fetchCases();
    } catch (err) {
      console.error('Erreur lors de la sauvegarde du cas :', err);
    }
  };

  const handleDeleteCase = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Voulez-vous vraiment supprimer le cas d'évaluation #${id} ?`)) return;

    try {
      await fetch(`${API_BASE_URL}/api/eval/cases/${id}`, {
        method: 'DELETE',
      });
      fetchCases();
    } catch (err) {
      console.error('Erreur lors de la suppression :', err);
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
      fetchCases();
    } catch (err) {
      console.error('Erreur lors de la réinitialisation :', err);
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
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 transition-all"
          >
            <Plus size={14} className="text-emerald-400" />
            <span>➕ Ajouter une question</span>
          </button>

          {/* Bouton Réinitialiser */}
          <button
            onClick={handleResetCases}
            disabled={isRunning}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-all"
            title="Réinitialiser aux 18 cas canoniques"
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
        <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-xs">
          <AlertCircle size={16} className="shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Message d'erreur */}
      {errorMessage && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">
          <AlertCircle size={16} className="shrink-0" />
          <span>{errorMessage}</span>
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
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {/* Card Score Global */}
          <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/30 flex flex-col justify-between">
            <div className="text-xs text-emerald-400 font-medium flex items-center justify-between">
              <span>Score Global</span>
              <Award size={16} />
            </div>
            <div className="text-2xl font-bold text-emerald-300 my-1 font-mono">
              {report ? `${report.global_score}%` : `${liveGlobalScore}%`}
            </div>
            <div className="text-[10px] text-gray-400">
              {report
                ? `${report.passed_cases} / ${report.total_cases} cas réussis en ${report.total_execution_time}s`
                : `${liveResults.filter(r => r.passed).length} / ${liveResults.length} exécutés`}
            </div>
          </div>

          {/* Breakdown par difficulté */}
          {(['Facile', 'Moyen', 'Difficile', 'Avancé'] as const).map((diff) => {
            const stats = report?.difficulty_breakdown[diff];
            const liveDiffCases = liveResults.filter(r => r.difficulty === diff);
            const livePassed = liveDiffCases.filter(r => r.passed).length;
            const accuracy = stats
              ? stats.accuracy
              : liveDiffCases.length > 0
              ? Math.round((livePassed / liveDiffCases.length) * 100)
              : 0;

            return (
              <div
                key={diff}
                className="p-3 rounded-lg bg-gray-900/60 border border-gray-800 flex flex-col justify-between"
              >
                <div className="text-xs text-gray-300 font-medium flex items-center justify-between">
                  <span>{diff}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getDifficultyBadgeClass(diff)}`}>
                    {diff}
                  </span>
                </div>
                <div className="text-xl font-bold text-gray-100 my-1 font-mono">
                  {accuracy}%
                </div>
                <div className="text-[10px] text-gray-400">
                  {stats ? `${stats.passed}/${stats.total} cas` : `${livePassed}/${liveDiffCases.length} cas`}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Liste des cas d'évaluation avec Accordéon & CRUD */}
      <div className="flex flex-col flex-1 gap-2 mt-2">
        <div className="flex items-center justify-between text-xs text-gray-400 pb-1 border-b border-gray-800">
          <span>Détail des {activeResults.length} cas d'évaluation</span>
          {activeResults.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleAllAccordions(true)}
                className="hover:text-emerald-400 transition-colors"
              >
                Tout déplier
              </button>
              <span>•</span>
              <button
                onClick={() => toggleAllAccordions(false)}
                className="hover:text-emerald-400 transition-colors"
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

        {activeResults.map((item) => {
          const isExpanded = !!expandedCases[item.id];
          return (
            <div
              key={item.id}
              className={`rounded-lg border transition-all ${
                item.passed === true
                  ? 'bg-gray-900/40 border-gray-800 hover:border-emerald-500/40'
                  : item.passed === false
                  ? 'bg-red-950/10 border-red-900/40 hover:border-red-500/50'
                  : 'bg-gray-900/30 border-gray-800/80 hover:border-gray-700'
              }`}
            >
              {/* Header Accordéon */}
              <div
                onClick={() => toggleAccordion(item.id)}
                className="w-full p-3 flex items-center justify-between text-left gap-3 cursor-pointer select-none"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {item.passed === true ? (
                    <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
                  ) : item.passed === false ? (
                    <XCircle size={18} className="text-red-400 shrink-0" />
                  ) : (
                    <HelpCircle size={18} className="text-gray-500 shrink-0" />
                  )}
                  <span className="text-xs font-mono text-gray-400 shrink-0">#{item.id}</span>
                  <span className={`text-xs px-2 py-0.5 rounded border shrink-0 ${getDifficultyBadgeClass(item.difficulty)}`}>
                    {item.difficulty}
                  </span>
                  <span className="text-xs font-medium text-gray-200 truncate">{item.question}</span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {item.execution_time !== undefined && (
                    <span className="text-xs font-mono text-gray-400 flex items-center gap-1 mr-2">
                      <Clock size={12} />
                      {item.execution_time}s
                    </span>
                  )}

                  {/* Action Éditer */}
                  <button
                    onClick={(e) => openEditModal(item, e)}
                    className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-blue-400 transition-colors"
                    title="Éditer ce cas"
                  >
                    <Pencil size={14} />
                  </button>

                  {/* Action Supprimer */}
                  <button
                    onClick={(e) => handleDeleteCase(item.id, e)}
                    className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-red-400 transition-colors"
                    title="Supprimer ce cas"
                  >
                    <Trash2 size={14} />
                  </button>

                  {isExpanded ? <ChevronDown size={16} className="text-gray-400 ml-1" /> : <ChevronRight size={16} className="text-gray-400 ml-1" />}
                </div>
              </div>

              {/* Contenu Dépliable */}
              {isExpanded && (
                <div className="px-3 pb-3 pt-1 border-t border-gray-800/60 flex flex-col gap-3 text-xs">
                  {item.error && (
                    <div className="p-2.5 rounded bg-red-500/10 border border-red-500/20 text-red-300 font-mono text-[11px]">
                      <strong>Erreur :</strong> {item.error}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Ground Truth SQL */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                        <FileCode2 size={13} />
                        Ground Truth SQL (Référence)
                      </span>
                      <pre className="p-2.5 rounded bg-gray-950 border border-gray-800 font-mono text-[11px] text-emerald-300 overflow-x-auto whitespace-pre-wrap">
                        {item.ground_truth_sql}
                      </pre>
                    </div>

                    {/* IA Generated SQL */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold text-blue-400 flex items-center gap-1">
                        <FileCode2 size={13} />
                        IA Generated SQL (Généré par LLM)
                      </span>
                      <pre className={`p-2.5 rounded bg-gray-950 border font-mono text-[11px] overflow-x-auto whitespace-pre-wrap ${
                        item.passed === true
                          ? 'border-gray-800 text-blue-300'
                          : item.passed === false
                          ? 'border-red-900/50 text-red-300'
                          : 'border-gray-800 text-gray-400'
                      }`}>
                        {item.generated_sql || 'Aucune requête SQL générée (non exécuté)'}
                      </pre>
                    </div>
                  </div>

                  {/* Étapes de l'Agent (LangGraph ReAct Telemetry) */}
                  <div className="flex flex-col gap-2 pt-2 border-t border-gray-800/80">
                    <span className="text-[11px] font-semibold text-purple-400 flex items-center gap-1.5">
                      <Activity size={14} />
                      Étapes de l'Agent (LangGraph ReAct)
                    </span>
                    {item.steps && item.steps.length > 0 ? (
                      <div className="flex flex-col gap-1.5 bg-gray-950/80 p-2.5 rounded-lg border border-gray-800">
                        {item.steps.map((st, sIdx) => {
                          const nodeName = st.node || st.step || `Nœud ${sIdx + 1}`;
                          const toolName = st.mcp_tool || st.tool;
                          const status = st.status || 'success';
                          const timeVal = st.elapsed_time ?? st.duration;
                          return (
                            <div key={sIdx} className="flex items-center justify-between text-[11px] font-mono bg-gray-900/60 p-1.5 px-2 rounded border border-gray-800/60">
                              <div className="flex items-center gap-2 truncate">
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0"></span>
                                <span className="font-semibold text-purple-300">{nodeName}</span>
                                {toolName && (
                                  <span className="px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-300 text-[10px] flex items-center gap-1 truncate">
                                    <Wrench size={10} />
                                    {toolName}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {timeVal !== undefined && (
                                  <span className="text-gray-400 text-[10px]">
                                    {timeVal}s
                                  </span>
                                )}
                                <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                                  status === 'success' || status === 'completed' || status === 'passed'
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                }`}>
                                  {status}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-[11px] text-gray-500 italic p-2 rounded bg-gray-950/50 border border-gray-900">
                        Aucune étape agentique enregistrée pour ce cas (exécutez le benchmark pour capturer la télémétrie).
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal d'Ajout / Édition de Cas d'Évaluation */}
      {isModalOpen && (
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
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-200 text-xs px-2 py-1 rounded"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCase} className="flex flex-col gap-3.5 text-xs">
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
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 font-semibold text-white shadow-md shadow-emerald-900/30"
                >
                  {editingCase ? 'Mettre à jour' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
