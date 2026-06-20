import React from 'react';
import type { Message } from '../../types/chat';

interface PerformanceMetricsProps {
  msg: Message;
}

/**
 * Visualizes LLM execution speeds, tokens, context utilization ratios,
 * and LangGraph state traces for debugging.
 */
export const PerformanceMetrics: React.FC<PerformanceMetricsProps> = React.memo(({ msg }) => {
  if (!msg.steps || msg.steps.length === 0) return null;

  return (
    <details className="message-report-details">
      <summary className="message-report-summary select-none flex items-center gap-1">
        ⚙️ Rapport d'exécution de l'agent ({msg.steps.length} étape(s))
      </summary>

      <div className="message-report-body">
        {/* 1. Global Performance Metrics */}
        {msg.steps.some((s) => s.node === 'generate_sql') && (
          <div className="message-attempts-metrics">
            {msg.steps
              .filter((s) => s.node === 'generate_sql')
              .map((step, idx) => {
                const percent =
                  step.context_size && step.prompt_tokens
                    ? Math.min(100, Math.round((step.prompt_tokens / step.context_size) * 100))
                    : 0;
                return (
                  <div key={idx} className="message-attempt-metrics-card">
                    <div className="message-attempt-header">
                      Tentative #{step.iteration || (idx + 1)}
                    </div>
                    <div className="message-metrics-grid">
                      <div className="message-metric-item">
                        <span className="message-metric-label">Tokens Envoyés : </span>
                        <span className="message-metric-val">
                          {step.prompt_tokens} t
                        </span>
                      </div>
                      <div className="message-metric-item">
                        <span className="message-metric-label">Tokens Générés : </span>
                        <span className="message-metric-val">
                          {step.eval_tokens} t
                        </span>
                      </div>
                      <div className="message-metric-item">
                        <span className="message-metric-label">Vitesse Inférence : </span>
                        <span className="message-metric-val-accent">
                          {step.tokens_per_second} t/s
                        </span>
                      </div>
                      <div className="message-metric-item">
                        <span className="message-metric-label">Génération : </span>
                        <span className="message-metric-val">{step.elapsed} s</span>
                      </div>

                      {step.context_size && step.prompt_tokens && (
                        <div className="message-context-row">
                          <div className="message-context-meta">
                            <span>
                              Utilisation Contexte : {step.prompt_tokens} / {step.context_size} tokens
                            </span>
                            <span className={percent > 85 ? 'message-context-pct-alert' : 'message-context-pct-normal'}>
                              {percent}%
                            </span>
                          </div>
                          <div className="message-context-progress">
                            <div
                              className="message-context-fill"
                              style={{
                                width: `${percent}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {/* 2. Target Tables Badges */}
        {msg.tables && msg.tables.length > 0 && (
          <div className="message-tables-row">
            <span className="message-tables-label">Tables consultées :</span>
            {msg.tables.map((table, tIdx) => (
              <span key={tIdx} className="message-table-tag">
                {table}
              </span>
            ))}
          </div>
        )}

        {/* 3. LangGraph step chronological trace */}
        <div className="message-trace-list">
          {msg.steps.map((step, idx) => {
            if (step.node === 'semantic_cache') {
               return (
                <div key={idx} className="message-trace-line message-trace-cache">
                  <span>[cache]</span>
                  <span>{step.message}</span>
                </div>
              );
            }
            if (step.node === 'select_tables') {
              return (
                <div key={idx} className="message-trace-line message-trace-node">
                  <span className="message-trace-node-val">[node]</span>
                  <span>
                    select_tables - Tables ciblées :{' '}
                    {step.selected_tables && step.selected_tables.length > 0
                      ? step.selected_tables.join(', ')
                      : 'aucune'}{' '}
                    (en {step.elapsed}s)
                  </span>
                </div>
              );
            }
            if (step.node === 'generate_sql') {
              return (
                <div key={idx} className="message-trace-line message-trace-node-gen">
                  <span>[node]</span>
                  <span>
                    generate_sql (essai #{step.iteration}) - SQL généré en {step.elapsed}s
                  </span>
                </div>
              );
            }
            if (step.node === 'execute_sql') {
              return (
                <div
                  key={idx}
                  className={`message-trace-line ${step.success ? 'message-trace-node-exec-ok' : 'message-trace-node-exec-err'}`}
                >
                  <span>[node]</span>
                  <span>
                    execute_sql -{' '}
                    {step.success
                      ? `Exécuté (${step.row_count} lignes) en ${step.elapsed}s`
                      : `Échec de l'exécution : ${step.error}`}
                  </span>
                </div>
              );
            }
            return null;
          })}
        </div>
      </div>
    </details>
  );
});
