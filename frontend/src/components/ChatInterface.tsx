import React, { useRef, useEffect } from 'react';
import { Send, Bot, User, AlertTriangle, RefreshCw } from 'lucide-react';

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
}

interface ChatInterfaceProps {
  messages: Message[];
  inputValue: string;
  setInputValue: (value: string) => void;
  isLoading: boolean;
  onSendMessage: (e: React.FormEvent) => void;
  onSelectMessageData: (messageId: string) => void;
  activeMessageDataId: string | null;
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
}) => {
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [loadingStatus, setLoadingStatus] = React.useState('Analyse de la question...');

  // Gérer le changement dynamique de statut de chargement
  useEffect(() => {
    if (!isLoading) {
      setLoadingStatus('Analyse de la question...');
      return;
    }
    
    const statuses = [
      { delay: 0, text: '🔍 Sélection des tables requises via MCP...' },
      { delay: 2000, text: '🧠 Réflexion et génération de la requête SQL (Qwen 3.5)...' },
      { delay: 7000, text: '🛡️ Analyse AST sqlglot et exécution sécurisée...' },
      { delay: 12000, text: '⚡ Finalisation des résultats et du rapport d\'exécution...' }
    ];
    
    const timers = statuses.map(s => 
      setTimeout(() => {
        setLoadingStatus(s.text);
      }, s.delay)
    );
    
    return () => {
      timers.forEach(clearTimeout);
    };
  }, [isLoading]);

  // Faire défiler automatiquement vers le bas à chaque nouveau message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

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
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald" style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--accent-emerald)', boxShadow: '0 0 8px var(--accent-emerald)' }}></span>
          <span className="text-xs text-muted" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>BD Ouvrages Connectée</span>
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
          messages.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <div
                key={msg.id}
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
                    boxShadow: isUser ? 'none' : '0 4px 15px -5px rgba(0,0,0,0.3)'
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
                    const { thinking, answer } = parseThinking(msg.content);
                    return (
                      <>
                        {thinking && (
                          <details 
                            className="mb-3 rounded-lg" 
                            style={{ 
                              marginBottom: '12px', 
                              borderRadius: '8px', 
                              border: '1px solid rgba(147, 51, 234, 0.15)', 
                              backgroundColor: 'rgba(147, 51, 234, 0.03)',
                              padding: '10px 12px'
                            }}
                            open={isLoading && !answer}
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
                              className="mt-2 text-xs font-mono text-muted border-l-2 border-purple-glow/30 pl-3" 
                              style={{ 
                                marginTop: '8px', 
                                fontSize: '12px', 
                                color: 'var(--text-muted)', 
                                borderLeft: '2px solid rgba(147, 51, 234, 0.3)', 
                                paddingLeft: '12px',
                                whiteSpace: 'pre-wrap', 
                                lineHeight: 1.4 
                              }}
                            >
                              {thinking}
                            </div>
                          </details>
                        )}
                        {answer ? (
                          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{answer}</div>
                        ) : !thinking ? (
                          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{msg.content}</div>
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
                            // Simple visual feedback (on pourrait utiliser un state, mais c'est suffisant pour le POC)
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
          })
        )}

        {/* Indicateur de chargement */}
        {isLoading && (
          <div className="flex gap-3 max-w-[85%] self-start" style={{ display: 'flex', gap: '12px', alignSelf: 'flex-start' }}>
            <div className="w-8 h-8 rounded-full bg-surface border border-glow flex items-center justify-center" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '50%', border: '1px solid var(--border-glow)', backgroundColor: 'var(--bg-surface-solid)' }}>
              <Bot size={16} className="text-primary pulse-loading" style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div className="bg-surface border border-subtle rounded-2xl px-4 py-3 flex flex-col gap-2" style={{ borderRadius: '16px', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: 'var(--bg-surface-solid)', border: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 bg-muted rounded-full animate-bounce" style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--text-muted)', animationDelay: '0ms', animation: 'bounce 1s infinite ease-in-out' }}></span>
                <span className="w-2 h-2 bg-muted rounded-full animate-bounce" style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--text-muted)', animationDelay: '200ms', animation: 'bounce 1s infinite ease-in-out' }}></span>
                <span className="w-2 h-2 bg-muted rounded-full animate-bounce" style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--text-muted)', animationDelay: '400ms', animation: 'bounce 1s infinite ease-in-out' }}></span>
              </div>
              <div className="text-xs text-muted" style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                {loadingStatus}
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

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
