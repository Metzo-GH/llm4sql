import React from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  FileCode2,
  Pencil,
  Trash2,
  Activity,
  Wrench,
  HelpCircle,
} from 'lucide-react';
import type { BenchmarkCaseResult } from '../BenchmarkPanel';

interface BenchmarkCaseItemProps {
  item: BenchmarkCaseResult;
  isExpanded: boolean;
  onToggleExpand: (id: number) => void;
  onEdit: (item: BenchmarkCaseResult, e: React.MouseEvent) => void;
  onDelete: (id: number, e: React.MouseEvent) => void;
  getDifficultyBadgeClass: (difficulty: string) => string;
}

export const BenchmarkCaseItem: React.FC<BenchmarkCaseItemProps> = ({
  item,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  getDifficultyBadgeClass,
}) => {
  return (
    <div
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
        onClick={() => onToggleExpand(item.id)}
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
            onClick={(e) => onEdit(item, e)}
            className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-blue-400 transition-colors"
            title="Éditer ce cas"
          >
            <Pencil size={14} />
          </button>

          {/* Action Supprimer */}
          <button
            onClick={(e) => onDelete(item.id, e)}
            className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-red-400 transition-colors"
            title="Supprimer ce cas"
          >
            <Trash2 size={14} />
          </button>

          {isExpanded ? (
            <ChevronDown size={16} className="text-gray-400 ml-1" />
          ) : (
            <ChevronRight size={16} className="text-gray-400 ml-1" />
          )}
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
              <pre
                className={`p-2.5 rounded bg-gray-950 border font-mono text-[11px] overflow-x-auto whitespace-pre-wrap ${
                  item.passed === true
                    ? 'border-gray-800 text-blue-300'
                    : item.passed === false
                    ? 'border-red-900/50 text-red-300'
                    : 'border-gray-800 text-gray-400'
                }`}
              >
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
                    <div
                      key={sIdx}
                      className="flex items-center justify-between text-[11px] font-mono bg-gray-900/60 p-1.5 px-2 rounded border border-gray-800/60"
                    >
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
                          <span className="text-gray-400 text-[10px]">{timeVal}s</span>
                        )}
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                            status === 'success' || status === 'completed' || status === 'passed'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}
                        >
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
};
