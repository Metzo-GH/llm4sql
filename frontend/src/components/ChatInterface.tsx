import React, { useRef, useEffect, useMemo } from 'react';
import { Bot, Terminal, Send, Square, Trash2, Sparkles } from 'lucide-react';
import type { Message, ContextUsage, LoadedModelStatus } from '../types/chat';
import { ChatMessage } from './chat/ChatMessage';
import { getEffectiveContextLimit } from '../utils/context';

const PUBLIC_STARTER_QUESTIONS = [
  "Quels sont les 5 albums les plus récents ?",
  "Nombre d'ouvrages par auteur",
  "Liste des scénaristes et leurs albums",
  "Combien y a-t-il d'éditeurs différents ?",
];

interface ChatInterfaceProps {
  messages: Message[];
  inputValue: string;
  setInputValue: (value: string) => void;
  isLoading: boolean;
  onSendMessage: (e?: React.FormEvent, customQuestion?: string) => void;
  onSelectMessageData: (messageId: string) => void;
  onClearHistory: () => void;
  activeMessageDataId: string | null;
  liveLogs: string[];
  contextUsage: ContextUsage | null;
  onStopRequest?: () => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  loadedModelStatus?: LoadedModelStatus | null;
  onExecuteRawSql?: (messageId: string, customSql: string) => Promise<boolean>;
  onSelectView?: (view: 'table' | 'chart') => void;
  selectedSchema?: string;
  schemaSql?: string;
}

/**
 * Composant ChatInterface offrant l'interface de messagerie fluide avec
 * défilement automatique, Starter Hints contextuels et affichage enrichi des métadonnées SQL/Erreurs.
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
  onClearHistory,
  activeMessageDataId,
  liveLogs,
  contextUsage,
  onStopRequest,
  onEditMessage,
  loadedModelStatus,
  onExecuteRawSql,
  onSelectView,
  selectedSchema = 'public',
  schemaSql = '',
}) => {
  const chatEndRef = useRef<HTMLDivElement>(null);
  const terminalBodyRef = useRef<HTMLDivElement>(null);
  const [isTerminalOpen, setIsTerminalOpen] = React.useState(false);

  // Calcul dynamique des Starter Hints selon la base sélectionnée (BD Ouvrages vs Sandbox DDL)
  const starterQuestions = useMemo(() => {
    if (selectedSchema === 'public') {
      return PUBLIC_STARTER_QUESTIONS;
    }

    // Extraction des tables créées dans le schéma DDL du Sandbox utilisateur
    const tableMatches = Array.from(
      schemaSql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:user_sandbox\.)?["`]?(\w+)["`]?/gi)
    ).map((m) => m[1]);

    const uniqueTables = Array.from(new Set(tableMatches)).filter(
      (t) => t.toLowerCase() !== 'flyway_schema_history'
    );

    if (uniqueTables.length === 0) {
      return [
        "Afficher la liste des tables du sandbox",
        "Combien de lignes contient chaque table ?",
        "Aperçu général des données",
      ];
    }

    const t0 = uniqueTables[0];
    const t1 = uniqueTables[1];

    const questions: string[] = [
      `Afficher les 10 premières lignes de la table ${t0}`,
      `Combien y a-t-il d'enregistrements dans ${t0} ?`,
    ];

    if (t1) {
      questions.push(`Quelles sont les données liées entre ${t0} et ${t1} ?`);
      questions.push(`Nombre de lignes dans ${t1}`);
    } else {
      questions.push(`Statistiques et résumé des colonnes de ${t0}`);
      questions.push(`Quelles sont les valeurs distinctes dans ${t0} ?`);
    }

    return questions;
  }, [selectedSchema, schemaSql]);

  const effectiveLimit = React.useMemo(() => {
    if (!contextUsage) return 2048;
    return getEffectiveContextLimit(contextUsage.contextSize, loadedModelStatus?.context_length);
  }, [contextUsage, loadedModelStatus]);

  const contextPct = React.useMemo(() => {
    if (!contextUsage) return 0;
    return Math.round((contextUsage.promptTokens / effectiveLimit) * 100);
  }, [contextUsage, effectiveLimit]);

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
            <p className="chat-subtitle m-0">Moteur LangGraph + Ollama Local</p>
          </div>
        </div>
        
        <div className="chat-header-actions">
          {/* Real-time Context Visualizer */}
          {contextUsage && (
            <div className="hidden sm:flex chat-context-usage">
              <span className="chat-context-text">
                {contextUsage.promptTokens}/{effectiveLimit} t {(!contextUsage.contextSize || contextUsage.contextSize === 0) ? '(Défaut)' : ''}
              </span>
              <div 
                className="chat-context-bar"
                title={`Utilisation du contexte : ${contextPct}% ${(!contextUsage.contextSize || contextUsage.contextSize === 0) ? '(Défaut Ollama)' : ''}`}
              >
                <div 
                  className="chat-context-fill"
                  style={{
                    width: `${Math.min(100, contextPct)}%`,
                    background: 'linear-gradient(90deg, var(--accent-emerald) 0%, var(--accent-primary) 100%)'
                  }}
                />
              </div>
            </div>
          )}

          {/* Effacer l'historique de discussion */}
          {messages.length > 0 && (
            <button
              onClick={onClearHistory}
              disabled={isLoading}
              className="chat-clear-btn"
              title="Effacer l'historique des messages"
              aria-label="Effacer l'historique des messages"
            >
              <Trash2 size={12} />
              <span>Effacer</span>
            </button>
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
            <Bot size={44} className="chat-empty-icon" />
            <h3 className="chat-empty-title">Prêt à interroger la base ?</h3>
            <p className="chat-empty-desc">
              Posez votre question en langage naturel ou cliquez sur une suggestion pour lancer une analyse immédiate :
            </p>
            <div className="chat-starter-chips" role="group" aria-label="Suggestions de requêtes de démarrage">
              {starterQuestions.map((question, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSendMessage(undefined, question)}
                  disabled={isLoading}
                  className="chat-starter-chip"
                  title={`Exécuter : "${question}"`}
                >
                  <Sparkles size={13} className="chat-starter-chip-icon" />
                  <span>{question}</span>
                </button>
              ))}
            </div>
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
              onExecuteRawSql={onExecuteRawSql}
              onSelectView={onSelectView}
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
                  Contexte : {contextUsage.promptTokens} / {effectiveLimit} t {(!contextUsage.contextSize || contextUsage.contextSize === 0) && '(Défaut Ollama)'}
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
