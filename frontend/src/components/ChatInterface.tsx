import React, { useRef, useEffect } from 'react';
import { Bot, Terminal, Send, Square } from 'lucide-react';
import type { Message, ContextUsage } from '../types/chat';
import { ChatMessage } from './chat/ChatMessage';

interface ChatInterfaceProps {
  messages: Message[];
  inputValue: string;
  setInputValue: (value: string) => void;
  isLoading: boolean;
  onSendMessage: (e: React.FormEvent) => void;
  onSelectMessageData: (messageId: string) => void;
  activeMessageDataId: string | null;
  liveLogs: string[];
  contextUsage: ContextUsage | null;
  onStopRequest?: () => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
}

/**
 * Composant ChatInterface offrant l'interface de messagerie fluide avec
 * défilement automatique et affichage enrichi des métadonnées SQL/Erreurs.
 * 
 * @param props - Component properties for managing the chat state
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
  onStopRequest,
  onEditMessage,
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
    <div className="glass-panel chat-interface relative overflow-hidden">
      {/* En-tête */}
      <div className="chat-header border-b border-subtle">
        <div className="chat-title-group">
          <div className="chat-avatar-container">
            <Bot size={22} className="chat-bot-icon pulse-loading" />
          </div>
          <div>
            <h2 className="chat-title m-0">Assistant SQL Local</h2>
            <p className="chat-subtitle m-0">Moteur LangGraph + Qwen 3.5 Local</p>
          </div>
        </div>
        
        <div className="chat-header-actions">
          {/* Real-time Context Visualizer */}
          {contextUsage && (
            <div className="hidden sm:flex chat-context-usage">
              <span className="chat-context-text">
                {contextUsage.promptTokens}/{contextUsage.contextSize} t
              </span>
              <div 
                className="chat-context-bar"
                title={`Utilisation du contexte : ${Math.round((contextUsage.promptTokens / contextUsage.contextSize) * 100)}%`}
              >
                <div 
                  className="chat-context-fill"
                  style={{
                    width: `${Math.min(100, Math.round((contextUsage.promptTokens / contextUsage.contextSize) * 100))}%`,
                    background: 'linear-gradient(90deg, var(--accent-emerald) 0%, var(--accent-primary) 100%)'
                  }}
                />
              </div>
            </div>
          )}

          {/* Toggle Terminal button */}
          <button
            onClick={() => setIsTerminalOpen(!isTerminalOpen)}
            className={`chat-logs-btn ${isTerminalOpen ? 'chat-logs-btn-active' : ''}`}
            title="Afficher/Masquer la console de logs"
            aria-label="Afficher ou masquer la console de logs"
            aria-expanded={isTerminalOpen}
          >
            <Terminal size={12} />
            <span>Logs</span>
          </button>
        </div>
      </div>

      {/* Zone des messages */}
      <div className="chat-messages-area" role="log" aria-live="polite">
        {messages.length === 0 ? (
          <div className="chat-empty-state">
            <Bot size={48} className="chat-empty-icon" />
            <h3 className="chat-empty-title">Prêt à interroger la base ?</h3>
            <p className="chat-empty-desc">
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
              onEditMessage={onEditMessage}
            />
          ))
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Tiroir de console de logs déroulant */}
      {isTerminalOpen && (
        <div className="terminal-drawer">
          {/* Header du tiroir */}
          <div className="terminal-header">
            <div className="terminal-title-group">
              <Terminal size={12} className="terminal-icon" />
              <span className="terminal-title">
                console@llm4sql:~
              </span>
              {isLoading && (
                <span className="terminal-pulse-dot animate-pulse"></span>
              )}
            </div>
            
            {contextUsage && (
              <div className="terminal-title-group text-xs">
                <span className="terminal-context-text">
                  Contexte : {contextUsage.promptTokens} / {contextUsage.contextSize} t
                </span>
              </div>
            )}
          </div>
          
          {/* Corps de la console */}
          <div 
            ref={terminalBodyRef}
            className="terminal-body select-text"
          >
            {liveLogs.length === 0 ? (
              <div className="text-muted italic">En attente de commandes...</div>
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
                  <div key={idx} className="terminal-log-line" style={{ color }}>
                    {log}
                  </div>
                );
              })
            )}
            {isLoading && (
              <span className="terminal-cursor animate-pulse"></span>
            )}
          </div>
        </div>
      )}

      {/* Formulaire de saisie */}
      <form onSubmit={onSendMessage} className="chat-input-form border-t border-subtle">
        <div className="chat-input-group">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isLoading}
            placeholder={isLoading ? "Génération en cours..." : "Posez votre question (ex: 'les ouvrages sortis en 2021')"}
            className="input-field chat-input-field"
            aria-label="Votre question de recherche SQL en langage naturel"
          />
          {isLoading ? (
            <button
              type="button"
              onClick={onStopRequest}
              className="btn-primary chat-send-btn chat-stop-btn"
              title="Arrêter la génération"
              aria-label="Arrêter la génération"
            >
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!inputValue.trim()}
              className="btn-primary chat-send-btn"
              title="Envoyer le message"
              aria-label="Envoyer le message"
            >
              <Send size={14} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
