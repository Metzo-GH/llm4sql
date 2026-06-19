import React, { useRef, useEffect } from 'react';
import { Send, Bot, User, AlertTriangle, RefreshCw, Terminal } from 'lucide-react';

export interface Message {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  sqlQuery?: string;
  errorMessage?: string;
  iterationCount?: number;
  hasData?: boolean;
  steps?: Array<any>;
  cacheHit?: boolean;
  tables?: Array<string>;
  thinking?: string;
}

interface ChatInterfaceProps {
  messages: Message[];
  inputValue: string;
  setInputValue: (value: string) => void;
  isLoading: boolean;
  onSendMessage: (e: React.FormEvent) => void;
  onSelectMessageData: (messageId: string) => void;
  activeMessageDataId: string | null;
  liveLogs: string[];
  contextUsage: any;
}

/**
 * Découpe la réflexion (balise think) de la réponse finale pour les LLM de raisonnement.
 */
function parseThinking(content: string): { thinking: string, answer: string } {
  if (!content) return { thinking: '', answer: '' };
  
  const thinkStart = content.indexOf('<think>');
  if (thinkStart === -1) {
    return { thinking: '', answer: content };
  }
  
  const thinkEnd = content.indexOf('</think>');
  if (thinkEnd === -1) {
    return {
      thinking: content.substring(thinkStart + 7).trim(),
      answer: ''
    };
  }
  
  return {
    thinking: content.substring(thinkStart + 7, thinkEnd).trim(),
    answer: content.substring(thinkEnd + 8).trim()
  };
}

/**
 * Interface representing a parsed step from raw backend logs.
 */
interface ParsedStep {
  id: string;
  label: string;
  status: 'pending' | 'loading' | 'success' | 'error';
  detail?: string;
  elapsed?: string;
  iteration?: number;
}

/**
 * Extracts structured steps from the stream of backend logs.
 */
function parseLiveLogsToSteps(logs: string[]): ParsedStep[] {
  const steps: ParsedStep[] = [
    { id: 'init', label: 'Lancement du moteur LangGraph', status: 'pending' },
    { id: 'tables', label: 'Sélection des tables requises', status: 'pending' },
    { id: 'sql', label: 'Génération de la requête SQL', status: 'pending' },
    { id: 'execution', label: 'Exécution sur PostgreSQL', status: 'pending' },
  ];

  if (logs.length === 0) {
    return steps;
  }

  // 1. Init Step
  const hasInit = logs.some(log => log.includes('[DEBUT AGENT]') || log.includes('[CACHE HIT]'));
  if (hasInit) {
    steps[0].status = 'success';
    const cacheHit = logs.some(log => log.includes('[CACHE HIT]'));
    if (cacheHit) {
      steps[0].detail = 'Récupéré du cache sémantique local';
      steps[0].elapsed = '0ms';
      steps[1].status = 'success';
      steps[1].detail = 'Tables chargées du cache';
      steps[2].status = 'success';
      steps[2].detail = 'SQL chargé du cache';
      steps[3].status = 'success';
      steps[3].detail = 'Résultats chargés du cache';
      return steps;
    } else {
      steps[0].detail = 'Moteur LangGraph démarré';
    }
  } else {
    steps[0].status = 'loading';
    steps[0].detail = 'Démarrage du workflow...';
  }

  // 2. Tables selection step
  const selectTablesStartIndex = logs.findIndex(log => log.includes('[ETAPE 0 - SELECTION TABLES]'));
  if (selectTablesStartIndex !== -1) {
    if (steps[0].status === 'loading') {
      steps[0].status = 'success';
      steps[0].detail = 'Moteur LangGraph démarré';
    }
    steps[1].status = 'loading';
    steps[1].detail = 'Identification des tables requises...';
    
    const selectTablesSuccessLog = logs.find(log => log.includes('[OK] Tables sélectionnées'));
    if (selectTablesSuccessLog) {
      steps[1].status = 'success';
      const elapsedMatch = selectTablesSuccessLog.match(/en ([\d.]+)s/);
      const tablesMatch = selectTablesSuccessLog.match(/: \[(.*?)\]/);
      const elapsed = elapsedMatch ? `${elapsedMatch[1]}s` : '';
      const tables = tablesMatch ? tablesMatch[1].replace(/['"\s]/g, '').split(',') : [];
      steps[1].elapsed = elapsed;
      steps[1].detail = `Tables ciblées : ${tables.length > 0 && tables[0] !== '' ? tables.join(', ') : 'aucune'}`;
    }
  }

  // 3. SQL Generation step
  const sqlGenLogs = logs.filter(log => log.includes('[ETAPE 1 - GENERATION SQL]'));
  if (sqlGenLogs.length > 0) {
    if (steps[1].status !== 'success') {
      steps[1].status = 'success';
      steps[1].detail = 'Tables ciblées avec succès';
    }
    
    steps[2].status = 'loading';
    const lastLog = sqlGenLogs[sqlGenLogs.length - 1];
    const iterationMatch = lastLog.match(/Essai #(\d+)/);
    const iterationNum = iterationMatch ? parseInt(iterationMatch[1]) : 1;
    steps[2].iteration = iterationNum;
    steps[2].detail = `Réflexion du LLM (essai #${iterationNum})...`;

    const sqlSuccessLog = logs.find(log => log.includes('[OK] SQL généré'));
    if (sqlSuccessLog) {
      steps[2].status = 'success';
      const elapsedMatch = sqlSuccessLog.match(/en ([\d.]+)s/);
      steps[2].elapsed = elapsedMatch ? `${elapsedMatch[1]}s` : '';
      steps[2].detail = `Requête SQL générée en ${steps[2].elapsed}`;
    }
  }

  // 4. Execution step
  const executionLogIndex = logs.findIndex(log => log.includes('[ETAPE 2 - EXECUTION SQL]'));
  if (executionLogIndex !== -1) {
    if (steps[2].status !== 'success') {
      steps[2].status = 'success';
    }
    steps[3].status = 'loading';
    steps[3].detail = 'Exécution de la requête sur PostgreSQL...';

    const execSuccessLog = logs.find(log => log.includes('Requete executee avec succes'));
    const execErrorLog = logs.find(log => log.includes('[ERROR] Echec de l\'execution') || log.includes('[ERROR] Alerte Securite'));

    if (execSuccessLog) {
      steps[3].status = 'success';
      const elapsedMatch = execSuccessLog.match(/en ([\d.]+)s/);
      const rowsMatch = execSuccessLog.match(/\((\d+) ligne/);
      steps[3].elapsed = elapsedMatch ? `${elapsedMatch[1]}s` : '';
      const rows = rowsMatch ? rowsMatch[1] : '0';
      steps[3].detail = `Requête exécutée avec succès (${rows} ligne(s) retournée(s))`;
    } else if (execErrorLog) {
      steps[3].status = 'error';
      steps[3].detail = execErrorLog.includes('Alerte Securite') 
        ? 'Alerte de Sécurité (Read-Only uniquement)' 
        : 'Échec de l\'exécution SQL';
    }
  }

  // Auto-correction warning log handling
  const hasAutoCorrection = logs.some(log => log.includes('[AUTO-CORRECTION]'));
  if (hasAutoCorrection) {
    const correctionLogs = logs.filter(log => log.includes('[AUTO-CORRECTION]'));
    const lastCorrLog = correctionLogs[correctionLogs.length - 1];
    const attemptMatch = lastCorrLog.match(/Tentative #(\d+)/);
    const attempt = attemptMatch ? attemptMatch[1] : '';
    steps[2].status = 'loading';
    steps[2].detail = `Auto-correction en cours (essai #${attempt}/3)...`;
    steps[3].status = 'pending';
    steps[3].detail = undefined;
  }

  return steps;
}

/**
 * Composant de message individuel pour encapsuler le comportement de l'accordéon.
 */
const ChatMessage: React.FC<{
  msg: Message;
  isLoading: boolean;
  activeMessageDataId: string | null;
  onSelectMessageData: (messageId: string) => void;
  liveLogs?: string[];
}> = ({ msg, isLoading, activeMessageDataId, onSelectMessageData, liveLogs = [] }) => {
  const isUser = msg.sender === 'user';
  const [isThinkingOpen, setIsThinkingOpen] = React.useState(true);
  const thinkingRef = React.useRef<HTMLDivElement>(null);
  const thinking = msg.thinking || parseThinking(msg.content).thinking;

  // Fermer la réflexion par défaut une fois le chargement terminé
  React.useEffect(() => {
    if (!isLoading) {
      setIsThinkingOpen(false);
    }
  }, [isLoading]);

  // Scroller automatiquement vers le bas de la réflexion lors de la génération
  React.useEffect(() => {
    if (isLoading && thinkingRef.current) {
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
    }
  }, [thinking, isLoading]);

  const parsedSteps = !isUser && isLoading ? parseLiveLogsToSteps(liveLogs) : [];

  return (
    <div
      className={`flex gap-3 max-w-[85%] ${isUser ? 'self-end flex-row-reverse' : 'self-start'}`}
      style={{
        display: 'flex',
        gap: '12px',
        maxWidth: '85%',
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        flexDirection: isUser ? 'row-reverse' : 'row'
      }}
    >
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center border ${
          isUser ? 'bg-card border-subtle' : 'bg-surface border-glow'
        }`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          border: '1px solid',
          borderColor: isUser ? 'var(--border-subtle)' : 'var(--border-glow)',
          backgroundColor: isUser ? 'var(--bg-card)' : 'var(--bg-surface-solid)',
          flexShrink: 0
        }}
      >
        {isUser ? <User size={16} /> : <Bot size={16} style={{ color: 'var(--accent-primary)' }} />}
      </div>

      {/* Bulle de texte */}
      <div
        className={`rounded-2xl px-4 py-3 text-sm animate-fade-in ${
          isUser 
            ? 'bg-card border border-subtle text-heading' 
            : 'bg-surface border border-subtle text-main'
        }`}
        style={{
          borderRadius: '16px',
          padding: '12px 16px',
          fontSize: '14px',
          backgroundColor: isUser ? 'var(--bg-card)' : 'var(--bg-surface-solid)',
          border: '1px solid var(--border-subtle)',
          color: isUser ? 'var(--text-heading)' : 'var(--text-main)',
          boxShadow: isUser ? 'none' : '0 4px 15px -5px rgba(0,0,0,0.3)',
          flex: isUser ? 'initial' : '1'
        }}
      >
        {/* Badge de Cache Sémantique */}
        {!isUser && msg.cacheHit && (
          <div className="mb-2 flex items-center gap-1.5 text-xs text-emerald" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '11px', color: 'var(--accent-emerald)', fontWeight: 600 }}>
            <span style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
              ⚡ Cache Sémantique (0ms)
            </span>
          </div>
        )}

        {/* Texte du message avec support de réflexion (balise think) */}
        {(() => {
          if (isUser) {
            return <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{msg.content}</div>;
          }
          const thinking = msg.thinking || parseThinking(msg.content).thinking;
          const rawAnswer = msg.thinking ? (msg.content.includes('<think>') ? parseThinking(msg.content).answer : msg.content) : parseThinking(msg.content).answer;
          
          // Nettoyage de l'affichage pour éviter les doublons avec le bloc SQL dédié
          const cleanedAnswer = rawAnswer.replace(/```sql[\s\S]*?```/g, '').replace(/```[\s\S]*?```/g, '').trim();

          return (
            <>
              {/* Checklist des étapes de chargement */}
              {isLoading && parsedSteps.length > 0 && (
                <div 
                  className="mb-4 p-3.5 rounded-xl border flex flex-col gap-3"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                    borderColor: 'var(--border-subtle)',
                    borderRadius: '12px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    marginBottom: '14px',
                    boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.05)'
                  }}
                >
                  {parsedSteps.map((step) => {
                    let statusIcon = null;
                    let colorClass = 'var(--text-muted)';
                    
                    if (step.status === 'success') {
                      statusIcon = (
                        <span 
                          style={{
                            width: '16px',
                            height: '16px',
                            borderRadius: '50%',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            border: '1.5px solid var(--accent-emerald)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--accent-emerald)',
                            fontSize: '9px',
                            fontWeight: 'bold',
                            flexShrink: 0
                          }}
                        >
                          ✓
                        </span>
                      );
                      colorClass = 'var(--text-heading)';
                    } else if (step.status === 'loading') {
                      statusIcon = (
                        <div 
                          className="animate-spin"
                          style={{
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%',
                            border: '2px solid rgba(147, 51, 234, 0.2)',
                            borderTopColor: 'var(--accent-primary)',
                            animation: 'spin 1s linear infinite',
                            flexShrink: 0,
                            marginTop: '2px'
                          }}
                        />
                      );
                      colorClass = 'var(--accent-primary)';
                    } else if (step.status === 'error') {
                      statusIcon = (
                        <span 
                          style={{
                            width: '16px',
                            height: '16px',
                            borderRadius: '50%',
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            border: '1.5px solid var(--accent-ruby)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--accent-ruby)',
                            fontSize: '9px',
                            fontWeight: 'bold',
                            flexShrink: 0
                          }}
                        >
                          ✗
                        </span>
                      );
                      colorClass = 'var(--accent-ruby)';
                    } else {
                      statusIcon = (
                        <span 
                          style={{
                            width: '16px',
                            height: '16px',
                            borderRadius: '50%',
                            border: '1.5px dashed var(--text-muted)',
                            opacity: 0.3,
                            display: 'inline-block',
                            flexShrink: 0
                          }}
                        />
                      );
                      colorClass = 'var(--text-muted)';
                    }

                    return (
                      <div 
                        key={step.id} 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'flex-start', 
                          gap: '10px',
                          opacity: step.status === 'pending' ? 0.4 : 1,
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', height: '18px' }}>
                          {statusIcon}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div 
                            style={{ 
                              fontSize: '12.5px', 
                              fontWeight: 600, 
                              color: colorClass, 
                              display: 'flex', 
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                          >
                            <span>{step.label}</span>
                            {step.elapsed && (
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 400 }}>
                                {step.elapsed}
                              </span>
                            )}
                          </div>
                          {step.detail && (
                            <div 
                              style={{ 
                                fontSize: '11px', 
                                color: 'var(--text-muted)', 
                                marginTop: '1px',
                                fontFamily: step.id === 'tables' || step.id === 'execution' ? 'var(--font-mono)' : 'inherit',
                                wordBreak: 'break-all'
                              }}
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

              {thinking && (
                <details 
                  className="mb-3 rounded-lg transition-all" 
                  style={{ 
                    marginBottom: '12px', 
                    borderRadius: '8px', 
                    border: '1px solid rgba(147, 51, 234, 0.15)', 
                    backgroundColor: 'rgba(147, 51, 234, 0.03)',
                    padding: '10px 12px'
                  }}
                  open={isThinkingOpen}
                  onToggle={(e) => setIsThinkingOpen((e.target as HTMLDetailsElement).open)}
                >
                  <summary 
                    className="text-xs font-semibold select-none text-purple-glow" 
                    style={{ 
                      fontSize: '11px', 
                      fontWeight: 600, 
                      color: 'hsl(265, 90%, 70%)', 
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>💡 Réflexion du modèle ({msg.steps?.[0]?.model || 'Raisonnement'})</span>
                  </summary>
                  <div 
                    ref={thinkingRef}
                    className="mt-2 text-xs font-mono text-muted border-l-2 border-purple-glow/30 pl-3" 
                    style={{ 
                      marginTop: '8px', 
                      fontSize: '12px', 
                      color: 'var(--text-muted)', 
                      borderLeft: '2px solid rgba(147, 51, 234, 0.3)', 
                      paddingLeft: '12px',
                      whiteSpace: 'pre-wrap', 
                      lineHeight: 1.4,
                      maxHeight: '200px',
                      overflowY: 'auto',
                      paddingRight: '8px',
                      scrollbarWidth: 'thin'
                    }}
                  >
                    {thinking}
                  </div>
                </details>
              )}
              {cleanedAnswer ? (
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{cleanedAnswer}</div>
              ) : !thinking && msg.content ? (
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{msg.content}</div>
              ) : isLoading && !msg.sqlQuery && !thinking ? (
                <div className="text-xs text-muted italic" style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" style={{ backgroundColor: 'var(--accent-primary)' }}></div>
                  <span>Calcul de la réponse...</span>
                </div>
              ) : null}
            </>
          );
        })()}

        {/* Requête SQL générée (Assistant uniquement) */}
        {msg.sqlQuery && (
          <div className="mt-3 pt-3 border-t border-subtle" style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
            <div className="flex justify-between items-center mb-1.5" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span className="text-xs text-muted font-semibold" style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Requête SQL générée :</span>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(msg.sqlQuery!);
                  const btn = document.activeElement as HTMLButtonElement;
                  if (btn) {
                    const oldText = btn.innerText;
                    btn.innerText = "Copié !";
                    setTimeout(() => btn.innerText = oldText, 2000);
                  }
                }}
                className="text-xs px-2 py-1 rounded bg-surface border border-subtle hover:bg-surface-solid transition-colors"
                style={{ fontSize: '10px', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', background: 'var(--bg-surface)', color: 'var(--text-main)', border: '1px solid var(--border-subtle)' }}
              >
                Copier
              </button>
            </div>
            <pre className="text-xs font-mono p-3 rounded-lg overflow-x-auto" style={{ margin: 0, padding: '12px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', borderRadius: '8px', overflowX: 'auto', color: 'var(--accent-secondary)' }}>
              <code>{msg.sqlQuery}</code>
            </pre>
          </div>
        )}

        {/* Message d'Erreur (Assistant uniquement) */}
        {msg.errorMessage && (
          <div className="mt-2.5 p-3 rounded-lg flex items-start gap-2 border" style={{ marginTop: '10px', padding: '10px', display: 'flex', gap: '8px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.05)', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
            <AlertTriangle size={15} style={{ color: 'var(--accent-ruby)', marginTop: '2px', flexShrink: 0 }} />
            <div>
              <span className="text-xs font-semibold block" style={{ display: 'block', fontSize: '11px', color: 'var(--accent-ruby)', fontWeight: 600 }}>Échec après {msg.iterationCount} essai(s) :</span>
              <span className="text-xs font-mono text-muted block mt-0.5" style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)' }}>{msg.errorMessage}</span>
            </div>
          </div>
        )}

        {/* Métadonnées de Self-Healing (Assistant uniquement) */}
        {!isUser && msg.iterationCount !== undefined && msg.iterationCount > 0 && !msg.errorMessage && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', fontSize: '11px', color: 'var(--accent-emerald)' }}>
            <RefreshCw size={12} className="animate-spin" style={{ animation: 'spin 4s linear infinite' }} />
            <span>Auto-corrigé avec succès (en {msg.iterationCount} tentative(s) !)</span>
          </div>
        )}

        {/* Bouton pour visualiser les données */}
        {msg.hasData && (
          <button
            onClick={() => onSelectMessageData(msg.id)}
            className={`mt-3 w-full text-xs font-medium py-2 px-3 rounded-md transition-all flex items-center justify-center gap-1.5 ${
              activeMessageDataId === msg.id
                ? 'btn-primary'
                : 'btn-secondary'
            }`}
            style={{
              marginTop: '12px',
              width: '100%',
              padding: '8px 12px',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            {activeMessageDataId === msg.id ? 'Données actives dans l\'explorateur' : 'Explorer les résultats de cette requête'}
          </button>
        )}

        {/* Rapport d'exécution de l'agent (Trace technique) */}
        {!isUser && msg.steps && msg.steps.length > 0 && (
          <details 
            className="mt-3 border-t border-subtle pt-2" 
            style={{ 
              marginTop: '12px', 
              paddingTop: '8px', 
              borderTop: '1px solid var(--border-subtle)' 
            }}
          >
            <summary 
              className="text-xs text-muted cursor-pointer hover:text-main select-none flex items-center gap-1"
              style={{ 
                fontSize: '11px', 
                color: 'var(--text-muted)', 
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              ⚙️ Rapport d'exécution de l'agent ({msg.steps.length} étape(s))
            </summary>
            
            <div className="mt-2 space-y-2" style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* 1. Métriques de performance globales */}
              {msg.steps.some(s => s.node === 'generate_sql') && (
                <div 
                  style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(2, 1fr)', 
                    gap: '6px', 
                    backgroundColor: 'rgba(0,0,0,0.2)', 
                    padding: '8px', 
                    borderRadius: '6px', 
                    fontSize: '10px' 
                  }}
                >
                  {msg.steps.filter(s => s.node === 'generate_sql').map((step, idx) => {
                    const percent = step.context_size && step.prompt_tokens
                      ? Math.min(100, Math.round((step.prompt_tokens / step.context_size) * 100))
                      : 0;
                    return (
                      <React.Fragment key={idx}>
                        <div style={{ color: 'var(--text-muted)' }}>Tokens Envoyés : <span style={{ color: 'var(--text-heading)', fontWeight: 600 }}>{step.prompt_tokens} t</span></div>
                        <div style={{ color: 'var(--text-muted)' }}>Tokens Générés : <span style={{ color: 'var(--text-heading)', fontWeight: 600 }}>{step.eval_tokens} t</span></div>
                        <div style={{ color: 'var(--text-muted)' }}>Vitesse Inférence : <span style={{ color: 'var(--accent-secondary)', fontWeight: 600 }}>{step.tokens_per_second} t/s</span></div>
                        <div style={{ color: 'var(--text-muted)' }}>Génération : <span style={{ color: 'var(--text-heading)', fontWeight: 600 }}>{step.elapsed} s</span></div>
                        
                        {step.context_size && step.prompt_tokens && (
                          <div style={{ gridColumn: 'span 2', marginTop: '6px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                              <span>Utilisation Contexte : {step.prompt_tokens} / {step.context_size} tokens</span>
                              <span style={{ color: percent > 85 ? 'var(--accent-ruby)' : 'var(--text-muted)', fontWeight: 600 }}>{percent}%</span>
                            </div>
                            <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div 
                                style={{ 
                                  width: `${percent}%`, 
                                  height: '100%', 
                                  background: 'linear-gradient(90deg, var(--accent-emerald) 0%, var(--accent-primary) 100%)', 
                                  borderRadius: '3px' 
                                }} 
                              />
                            </div>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              )}

              {/* 2. Badges des tables impliquées */}
              {msg.tables && msg.tables.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Tables consultées :</span>
                  {msg.tables.map((table, tIdx) => (
                    <span 
                      key={tIdx} 
                      style={{ 
                        fontSize: '10px', 
                        padding: '2px 6px', 
                        borderRadius: '4px', 
                        backgroundColor: 'rgba(147, 51, 234, 0.1)', 
                        border: '1px solid rgba(147, 51, 234, 0.2)',
                        color: 'hsl(265, 90%, 75%)',
                        fontWeight: 500
                      }}
                    >
                      {table}
                    </span>
                  ))}
                </div>
              )}

              {/* 3. Chronologie des étapes LangGraph */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', fontFamily: 'monospace', paddingLeft: '4px' }}>
                {msg.steps.map((step, idx) => {
                  if (step.node === 'semantic_cache') {
                    return (
                      <div key={idx} style={{ color: 'var(--accent-emerald)', display: 'flex', gap: '6px' }}>
                        <span>[cache]</span>
                        <span>{step.message}</span>
                      </div>
                    );
                  }
                  if (step.node === 'select_tables') {
                    return (
                      <div key={idx} style={{ color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <span style={{ color: 'var(--accent-emerald)' }}>[node]</span>
                          <span>select_tables - Tables ciblées : {step.selected_tables && step.selected_tables.length > 0 ? step.selected_tables.join(', ') : 'aucune'} (en {step.elapsed}s)</span>
                        </div>
                      </div>
                    );
                  }
                  if (step.node === 'generate_sql') {
                    return (
                      <div key={idx} style={{ color: 'var(--accent-secondary)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <span>[node]</span>
                          <span>generate_sql (essai #{step.iteration}) - SQL généré en {step.elapsed}s</span>
                        </div>
                      </div>
                    );
                  }
                  if (step.node === 'execute_sql') {
                    return (
                      <div 
                        key={idx} 
                        style={{ 
                          color: step.success ? 'var(--accent-emerald)' : 'var(--accent-ruby)', 
                          display: 'flex', 
                          flexDirection: 'column', 
                          gap: '2px' 
                        }}
                      >
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <span>[node]</span>
                          <span>
                            execute_sql - {step.success ? `Exécuté (${step.row_count} lignes) en ${step.elapsed}s` : `Échec de l'exécution : ${step.error}`}
                          </span>
                        </div>
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

/**
 * Composant ChatInterface offrant l'interface de messagerie fluide avec
 * défilement automatique et affichage enrichi des métadonnées SQL/Erreurs.
 */
export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  messages,
  inputValue,
  setInputValue,
  isLoading,
  onSendMessage,
  onSelectMessageData,
  activeMessageDataId,
  liveLogs,
  contextUsage,
}) => {
  const chatEndRef = useRef<HTMLDivElement>(null);
  const terminalBodyRef = useRef<HTMLDivElement>(null);
  const [isTerminalOpen, setIsTerminalOpen] = React.useState(false);

  // Faire défiler automatiquement vers le bas à chaque nouveau message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-scroll du terminal body vers le bas
  useEffect(() => {
    if (terminalBodyRef.current) {
      terminalBodyRef.current.scrollTop = terminalBodyRef.current.scrollHeight;
    }
  }, [liveLogs]);

  return (
    <div className="glass-panel flex flex-col h-[650px] relative overflow-hidden" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* En-tête */}
      <div className="px-6 py-4 border-b border-subtle flex items-center justify-between" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-3" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center border border-glow" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', borderRadius: '8px', border: '1px solid var(--border-glow)' }}>
            <Bot size={22} className="text-primary pulse-loading" style={{ color: 'var(--accent-primary)' }} />
          </div>
          <div>
            <h2 className="text-lg font-semibold m-0" style={{ fontSize: '18px', fontWeight: 600 }}>Assistant SQL Local</h2>
            <p className="text-xs text-muted m-0" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Moteur LangGraph + Qwen 3.5 Local</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Real-time Context Visualizer */}
          {contextUsage && (
            <div className="hidden sm:flex items-center gap-2 text-xs" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
              <span className="text-muted font-mono" style={{ color: 'var(--text-muted)' }}>
                {contextUsage.promptTokens}/{contextUsage.contextSize} t
              </span>
              <div 
                className="w-16 h-2 rounded bg-white/10 overflow-hidden" 
                style={{ width: '64px', height: '8px', backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px' }}
                title={`Utilisation du contexte : ${Math.round((contextUsage.promptTokens / contextUsage.contextSize) * 100)}%`}
              >
                <div 
                  className="h-full rounded transition-all duration-300"
                  style={{
                    width: `${Math.min(100, Math.round((contextUsage.promptTokens / contextUsage.contextSize) * 100))}%`,
                    background: 'linear-gradient(90deg, var(--accent-emerald) 0%, var(--accent-primary) 100%)',
                    height: '100%'
                  }}
                />
              </div>
            </div>
          )}

          {/* Toggle Terminal button */}
          <button
            onClick={() => setIsTerminalOpen(!isTerminalOpen)}
            className="p-1.5 rounded transition-all text-xs flex items-center gap-1.5 border"
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              border: isTerminalOpen ? '1px solid var(--border-glow)' : '1px solid var(--border-subtle)',
              cursor: 'pointer',
              background: isTerminalOpen ? 'rgba(147, 51, 234, 0.15)' : 'rgba(255, 255, 255, 0.05)',
              color: isTerminalOpen ? 'var(--accent-primary)' : 'var(--text-main)',
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 600
            }}
            title="Afficher/Masquer la console de logs"
          >
            <Terminal size={12} />
            <span>Logs</span>
          </button>
        </div>
      </div>

      {/* Zone des messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
            <Bot size={48} className="text-muted mb-4 opacity-50" style={{ marginBottom: '16px', opacity: 0.5 }} />
            <h3 className="text-md font-semibold text-heading mb-1" style={{ color: 'var(--text-heading)', fontWeight: 600 }}>Prêt à interroger la base ?</h3>
            <p className="text-sm max-w-sm" style={{ fontSize: '14px', maxWidth: '320px', margin: 0 }}>
              Posez votre question en français. L'agent va extraire le schéma, générer le SQL SELECT, l'exécuter et s'auto-corriger en cas de besoin !
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              msg={msg}
              isLoading={isLoading && messages[messages.length - 1].id === msg.id}
              activeMessageDataId={activeMessageDataId}
              onSelectMessageData={onSelectMessageData}
              liveLogs={liveLogs}
            />
          ))
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Tiroir de console de logs déroulant */}
      {isTerminalOpen && (
        <div 
          className="border-t border-subtle flex flex-col h-[180px] font-mono text-xs text-left"
          style={{
            borderTop: '1px solid var(--border-subtle)',
            backgroundColor: 'rgba(5, 8, 16, 0.95)',
            height: '180px',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 10
          }}
        >
          {/* Header du tiroir */}
          <div 
            className="flex items-center justify-between px-4 py-1.5 bg-black/45 border-b border-subtle"
            style={{
              padding: '6px 16px',
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Terminal size={12} className="text-secondary" style={{ color: 'var(--accent-secondary)' }} />
              <span className="text-xs font-mono font-semibold" style={{ fontSize: '10px', color: 'var(--text-heading)' }}>
                console@llm4sql:~
              </span>
              {isLoading && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald animate-pulse" style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--accent-emerald)', boxShadow: '0 0 6px var(--accent-emerald)' }}></span>
              )}
            </div>
            
            {contextUsage && (
              <div className="flex items-center gap-2 text-xs" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px' }}>
                <span className="text-muted font-mono" style={{ color: 'var(--text-muted)' }}>
                  Contexte : {contextUsage.promptTokens} / {contextUsage.contextSize} t
                </span>
              </div>
            )}
          </div>
          
          {/* Corps de la console */}
          <div 
            ref={terminalBodyRef}
            className="flex-1 overflow-y-auto p-3 font-mono text-xs select-text"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              lineHeight: '1.4',
              color: 'hsl(142, 60%, 80%)',
              overflowY: 'auto',
              padding: '12px'
            }}
          >
            {liveLogs.length === 0 ? (
              <div className="text-muted italic" style={{ color: 'var(--text-muted)' }}>En attente de commandes...</div>
            ) : (
              liveLogs.map((log, idx) => {
                let color = 'var(--text-main)';
                if (log.startsWith('[API') || log.startsWith('[DEBUT') || log.startsWith('[FIN')) {
                  color = 'var(--accent-primary)';
                } else if (log.includes('[OK]')) {
                  color = 'var(--accent-emerald)';
                } else if (log.includes('[ERROR]') || log.includes('[API ERR]')) {
                  color = 'var(--accent-ruby)';
                } else if (log.includes('[ETAPE')) {
                  color = 'var(--accent-secondary)';
                } else if (log.includes('[CACHE HIT]')) {
                  color = 'var(--accent-emerald)';
                } else if (log.startsWith('  -') || log.startsWith('Table \'')) {
                  color = 'var(--text-muted)';
                }
                return (
                  <div key={idx} style={{ color, whiteSpace: 'pre-wrap', marginBottom: '2px' }}>
                    {log}
                  </div>
                );
              })
            )}
            {isLoading && (
              <span className="inline-block w-1.5 h-3.5 bg-emerald animate-pulse ml-0.5" style={{ display: 'inline-block', width: '4px', height: '10px', backgroundColor: 'var(--accent-emerald)', verticalAlign: 'middle' }}></span>
            )}
          </div>
        </div>
      )}

      {/* Formulaire de saisie */}
      <form onSubmit={onSendMessage} className="p-4 border-t border-subtle bg-surface-solid" style={{ padding: '16px', borderTop: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface-solid)' }}>
        <div className="flex gap-2" style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isLoading}
            placeholder="Posez votre question (ex: 'les ouvrages sortis en 2021')"
            className="input-field flex-1"
            style={{ flex: 1 }}
          />
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            className="btn-primary"
            style={{ padding: '12px 16px' }}
          >
            <Send size={16} />
          </button>
        </div>
      </form>
    </div>
  );
};
