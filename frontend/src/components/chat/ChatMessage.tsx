import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Bot, User, AlertTriangle, RefreshCw } from 'lucide-react';
import type { Message } from '../../types/chat';
import { parseThinking } from '../../utils/thinkingParser';
import { parseLiveLogsToSteps } from '../../utils/logParser';

interface ChatMessageProps {
  msg: Message;
  isLoading: boolean;
  activeMessageDataId: string | null;
  onSelectMessageData: (messageId: string) => void;
  liveLogs?: string[];
}

/**
 * Individual Chat Message component rendering bubble, avatar, LLM thinking accordion,
 * steps progress list, cache hit indicators, and performance telemetry reports.
 * 
 * @param props - Component properties containing message details
 */
export const ChatMessage: React.FC<ChatMessageProps> = ({
  msg,
  isLoading,
  activeMessageDataId,
  onSelectMessageData,
  liveLogs = [],
}) => {
  const isUser = msg.sender === 'user';
  const [isThinkingOpen, setIsThinkingOpen] = useState(true);
  const thinkingRef = useRef<HTMLDivElement>(null);
  
  const thinking = useMemo(() => {
    return msg.thinking || parseThinking(msg.content).thinking;
  }, [msg.thinking, msg.content]);

  // Close thinking block by default when loading completes
  useEffect(() => {
    if (!isLoading) {
      setIsThinkingOpen(false);
    }
  }, [isLoading]);

  // Scroll to bottom of thinking block while generating
  useEffect(() => {
    if (isLoading && thinkingRef.current) {
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
    }
  }, [thinking, isLoading]);

  const parsedSteps = useMemo(() => {
    return !isUser && isLoading ? parseLiveLogsToSteps(liveLogs) : [];
  }, [isUser, isLoading, liveLogs]);

  return (
    <div
      className={`message-wrapper ${isUser ? 'message-user' : 'message-assistant'}`}
    >
      {/* Avatar */}
      <div
        className={`message-avatar ${
          isUser ? 'message-avatar-user' : 'message-avatar-bot'
        }`}
      >
        {isUser ? <User size={16} /> : <Bot size={16} className="chat-bot-icon" />}
      </div>

      {/* Message Bubble */}
      <div
        className={`message-bubble animate-fade-in ${
          isUser ? 'message-bubble-user' : 'message-bubble-bot'
        }`}
      >
        {/* Semantic Cache Badge */}
        {!isUser && msg.cacheHit && (
          <div className="message-cache-badge">
            <span className="message-cache-tag">
              ⚡ Cache Sémantique (0ms)
            </span>
          </div>
        )}

        {/* Text content with reasoning support (<think> tag parsing) */}
        {(() => {
          if (isUser) {
            return <div className="message-text-content">{msg.content}</div>;
          }
          const thinkingText = msg.thinking || parseThinking(msg.content).thinking;
          const rawAnswer = msg.thinking
            ? msg.content.includes('<think>')
              ? parseThinking(msg.content).answer
              : msg.content
            : parseThinking(msg.content).answer;

          // Clean display to avoid duplicate code block visuals (rendered in standard pre elements below)
          const cleanedAnswer = rawAnswer.replace(/```sql[\s\S]*?```/g, '').replace(/```[\s\S]*?```/g, '').trim();

          return (
            <>
              {/* Agent execution checklist (streaming) */}
              {isLoading && parsedSteps.length > 0 && (
                <div className="message-steps-box">
                  {parsedSteps.map((step) => {
                    let statusIcon = null;
                    let colorClass = 'var(--text-muted)';

                    if (step.status === 'success') {
                      statusIcon = (
                        <span className="message-step-icon message-step-icon-success">
                          ✓
                        </span>
                      );
                      colorClass = 'var(--text-heading)';
                    } else if (step.status === 'loading') {
                      statusIcon = (
                        <div className="message-step-icon-loading animate-spin" />
                      );
                      colorClass = 'var(--accent-primary)';
                    } else if (step.status === 'error') {
                      statusIcon = (
                        <span className="message-step-icon message-step-icon-error">
                          ✗
                        </span>
                      );
                      colorClass = 'var(--accent-ruby)';
                    } else {
                      statusIcon = (
                        <span className="message-step-icon message-step-icon-pending" />
                      );
                      colorClass = 'var(--text-muted)';
                    }

                    return (
                      <div
                        key={step.id}
                        className="message-step-row"
                        style={{
                          opacity: step.status === 'pending' ? 0.4 : 1,
                        }}
                      >
                        <div className="message-step-icon-wrapper">{statusIcon}</div>
                        <div className="message-step-info">
                          <div
                            className="message-step-title-row"
                            style={{ color: colorClass }}
                          >
                            <span>{step.label}</span>
                            {step.elapsed && (
                              <span className="message-step-elapsed">
                                {step.elapsed}
                              </span>
                            )}
                          </div>
                          {step.detail && (
                            <div
                              className={`message-step-detail ${
                                step.id === 'tables' || step.id === 'execution' ? 'message-step-detail-mono' : ''
                              }`}
                            >
                              {step.detail}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Model Thinking accordion */}
              {thinkingText && (
                <details
                  className="message-thinking-details"
                  open={isThinkingOpen}
                  onToggle={(e) => setIsThinkingOpen((e.target as HTMLDetailsElement).open)}
                >
                  <summary className="message-thinking-summary select-none text-purple-glow">
                    <span>💡 Réflexion du modèle ({msg.steps?.[0]?.model || 'Raisonnement'})</span>
                  </summary>
                  <div
                    ref={thinkingRef}
                    className="message-thinking-body"
                  >
                    {thinkingText}
                  </div>
                </details>
              )}
              {cleanedAnswer ? (
                <div className="message-text-content">{cleanedAnswer}</div>
              ) : !thinkingText && msg.content ? (
                <div className="message-text-content">{msg.content}</div>
              ) : isLoading && !msg.sqlQuery && !thinkingText ? (
                <div className="message-loading-placeholder italic">
                  <div className="message-loading-dot animate-ping"></div>
                  <span>Calcul de la réponse...</span>
                </div>
              ) : null}
            </>
          );
        })()}

        {/* Generated SQL query block */}
        {msg.sqlQuery && (
          <div className="message-sql-section">
            <div className="message-sql-header">
              <span className="message-sql-label">
                Requête SQL générée :
              </span>
              <button
                onClick={() => {
                  if (msg.sqlQuery) {
                    navigator.clipboard.writeText(msg.sqlQuery);
                    const btn = document.activeElement as HTMLButtonElement;
                    if (btn) {
                      const oldText = btn.innerText;
                      btn.innerText = 'Copié !';
                      setTimeout(() => (btn.innerText = oldText), 2000);
                    }
                  }
                }}
                className="message-sql-copy-btn hover:bg-surface-solid"
              >
                Copier
              </button>
            </div>
            <pre className="message-sql-code">
              <code>{msg.sqlQuery}</code>
            </pre>
          </div>
        )}

        {/* Error message block */}
        {msg.errorMessage && (
          <div className="message-error-box">
            <AlertTriangle size={15} className="message-error-icon" />
            <div>
              <span className="message-error-title">
                Échec après {msg.iterationCount} essai(s) :
              </span>
              <span className="message-error-text">
                {msg.errorMessage}
              </span>
            </div>
          </div>
        )}

        {/* Self-healing warning indicator */}
        {!isUser && msg.iterationCount !== undefined && msg.iterationCount > 0 && !msg.errorMessage && (
          <div className="message-success-healing">
            <RefreshCw size={12} className="message-healing-icon animate-spin" />
            <span>Auto-corrigé avec succès (en {msg.iterationCount} tentative(s) !)</span>
          </div>
        )}

        {/* Interactive Database Visualizer explorer button */}
        {msg.hasData && (
          <button
            onClick={() => onSelectMessageData(msg.id)}
            className={`message-explore-btn ${
              activeMessageDataId === msg.id ? 'btn-primary' : 'btn-secondary'
            }`}
          >
            {activeMessageDataId === msg.id ? "Données actives dans l'explorateur" : 'Explorer les résultats de cette requête'}
          </button>
        )}

        {/* Agent technical performance execution report */}
        {!isUser && msg.steps && msg.steps.length > 0 && (
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
                    <span
                      key={tIdx}
                      className="message-table-tag"
                    >
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
        )}
      </div>
    </div>
  );
};
