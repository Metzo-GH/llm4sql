import React from 'react';
import type { Message } from '../../types/chat';

interface PerformanceMetricsProps {
  msg: Message;
}

/**
 * Visualizes LLM execution speeds, tokens, context utilization ratios,
 * and LangGraph state traces in a chronological vertical timeline.
 */
export const PerformanceMetrics: React.FC<PerformanceMetricsProps> = React.memo(({ msg }) => {
  if (!msg.steps || msg.steps.length === 0) return null;

  return (
    <details className="message-report-details">
      <summary className="message-report-summary select-none flex items-center gap-1">
        ⚙️ Rapport d'exécution de l'agent ({msg.steps.length} étape(s))
      </summary>

      <div className="message-report-body">
        {/* 1. Target Tables Badges */}
        {msg.tables && msg.tables.length > 0 && (
          <div className="message-tables-row border-b border-subtle pb-3 mb-3">
            <span className="message-tables-label">Tables consultées :</span>
            {msg.tables.map((table, tIdx) => (
              <span key={tIdx} className="message-table-tag">
                {table}
              </span>
            ))}
          </div>
        )}

        {/* 2. Chronological Timeline of Steps */}
        <div className="agent-timeline">
          {msg.steps.map((step, idx) => {
            // Check node type
            const isLlm = step.node === 'generate_sql' || step.node === 'agent_loop';
            const isCache = step.node === 'semantic_cache';
            const isSelectTables = step.node === 'select_tables';
            const isTool = step.node.startsWith('tool_');
            const isExec = step.node === 'execute_sql' || step.node === 'clean_and_finalize';
            const isLimit = step.node === 'force_loop_break';

            // Determine dot class
            let dotClass = 'agent-timeline-dot-tool';
            if (isLlm) dotClass = 'agent-timeline-dot-llm';
            if (isCache) dotClass = 'agent-timeline-dot-tool';
            if (isLimit || step.success === false) dotClass = 'agent-timeline-dot-error';

            return (
              <div key={idx} className="agent-timeline-item">
                <div className={`agent-timeline-dot ${dotClass}`} />
                
                {/* Header */}
                <div className="agent-timeline-header">
                  <span>
                    {isLlm && `🧠 Réflexion (Itération #${step.iteration || (idx + 1)}) (${step.model || 'LLM'})`}
                    {isCache && `⚡ Cache Sémantique`}
                    {isSelectTables && `🎴 Sélection des Tables`}
                    {isTool && (() => {
                      const toolName = step.node.replace('tool_', '');
                      return `🛠️ Outil : ${toolName}`;
                    })()}
                    {isExec && `🗄️ Exécution Physique BDD`}
                    {isLimit && `🚨 Limite de Sécurité`}
                  </span>
                  
                  {step.elapsed !== undefined && (
                    <span className="agent-timeline-meta">
                      ⏱️ {step.elapsed}s
                    </span>
                  )}
                </div>

                {/* Body Details */}
                <div className="agent-timeline-body">
                  {isLlm && (
                    <div className="flex flex-col gap-2">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted">Inférence : </span>
                          <span className="font-semibold text-accent-emerald">{step.tokens_per_second || 0} t/s</span>
                        </div>
                        <div>
                          <span className="text-muted">Tokens : </span>
                          <span>{step.prompt_tokens} prompt / {step.eval_tokens} gén.</span>
                        </div>
                      </div>
                      
                      {step.prompt_tokens ? (() => {
                        const limit = step.context_size && step.context_size > 0 ? step.context_size : 2048;
                        const percent = Math.min(100, Math.round((step.prompt_tokens / limit) * 100));
                        return (
                          <div className="message-context-row mt-1">
                            <div className="message-context-meta text-[10px]">
                              <span>Utilisation Contexte : {step.prompt_tokens} / {limit} t</span>
                              <span className={percent > 85 ? 'message-context-pct-alert' : 'message-context-pct-normal'}>
                                {percent}%
                              </span>
                            </div>
                            <div className="message-context-progress h-1.5">
                              <div
                                className="message-context-fill"
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>
                        );
                      })() : null}
                    </div>
                  )}

                  {isCache && (
                    <div>{step.message || 'Résultats récupérés depuis le cache sémantique local.'}</div>
                  )}

                  {isSelectTables && (
                    <div>
                      Tables ciblées :{' '}
                      <strong>
                        {step.selected_tables && step.selected_tables.length > 0
                          ? step.selected_tables.join(', ')
                          : 'aucune'}
                      </strong>
                    </div>
                  )}

                  {isTool && (() => {
                    const toolName = step.node.replace('tool_', '');
                    let toolArgs = '';
                    if (toolName === 'mcp_search_value') {
                      toolArgs = `terme = "${step.tool_call?.args?.term || ''}"`;
                    } else if (toolName === 'mcp_get_schema') {
                      toolArgs = `table_name = "${step.tool_call?.args?.table_name || ''}"`;
                    } else if (toolName === 'mcp_get_sample_data') {
                      toolArgs = `table_name = "${step.tool_call?.args?.table_name || ''}"`;
                    } else if (toolName === 'mcp_dry_run_query') {
                      toolArgs = `sql = "${step.tool_call?.args?.sql?.substring(0, 40) || ''}..."`;
                    } else {
                      toolArgs = JSON.stringify(step.tool_call?.args || {});
                    }

                    return (
                      <div className="flex flex-col gap-1">
                        <div className="font-mono text-[10px] text-muted">{toolName}({toolArgs})</div>
                        <div className="text-xs">
                          Statut :{' '}
                          <span className={step.success ? 'text-accent-emerald font-semibold' : 'text-accent-ruby font-semibold'}>
                            {step.success ? 'Réussi' : `Échec : ${step.error}`}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {isExec && (
                    <div className="flex flex-col gap-1">
                      <div className="text-xs">
                        Statut :{' '}
                        <span className={step.success ? 'text-accent-emerald font-semibold' : 'text-accent-ruby font-semibold'}>
                          {step.success ? 'Succès' : 'Échec'}
                        </span>
                      </div>
                      <div>
                        {step.success
                          ? `Requête exécutée physiquement avec succès (${step.row_count} ligne(s) retournée(s))`
                          : `Erreur PostgreSQL : ${step.error}`}
                      </div>
                    </div>
                  )}

                  {isLimit && (
                    <div className="text-accent-ruby font-semibold">
                      {step.error || "La limite d'appels d'outils successifs (30 max) a été atteinte."}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </details>
  );
});
