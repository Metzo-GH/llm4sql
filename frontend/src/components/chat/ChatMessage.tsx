import React, { useState, useMemo } from 'react';
import { Bot, User, AlertTriangle, RefreshCw, Pencil } from 'lucide-react';
import type { Message, ParsedStep } from '../../types/chat';
import { parseThinking } from '../../utils/thinkingParser';
import { parseLiveLogsToSteps } from '../../utils/logParser';
import { SqlCodeBlock } from './SqlCodeBlock';
import { StepsTracker } from './StepsTracker';
import { ThinkingAccordion } from './ThinkingAccordion';
import { PerformanceMetrics } from './PerformanceMetrics';

interface ChatMessageProps {
  msg: Message;
  isLoading: boolean;
  activeMessageDataId: string | null;
  onSelectMessageData: (messageId: string) => void;
  liveLogs?: string[];
  onEditMessage?: (messageId: string, newContent: string) => void;
  onExecuteRawSql?: (messageId: string, customSql: string) => Promise<boolean>;
  onSelectView?: (view: 'table' | 'chart') => void;
}

interface UserMessageContentProps {
  msg: Message;
  isLoading: boolean;
  onEditMessage?: (messageId: string, newContent: string) => void;
}

/**
 * Renders the content of a user message.
 * Provides edit functionality directly inline without polluting parent state.
 * 
 * @param props - Component properties including the message object and the edit handler.
 */
const UserMessageContent: React.FC<UserMessageContentProps> = ({ msg, isLoading, onEditMessage }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(msg.content);
  const [prevContent, setPrevContent] = useState(msg.content);

  if (prevContent !== msg.content) {
    setPrevContent(msg.content);
    setEditText(msg.content);
  }

  if (isEditing) {
    return (
      <div className="message-edit-container">
        <textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          className="input-field message-edit-textarea"
        />
        <div className="message-edit-actions">
          <button
            onClick={() => {
              if (onEditMessage && editText.trim()) {
                onEditMessage(msg.id, editText.trim());
              }
              setIsEditing(false);
            }}
            className="btn-primary message-edit-save-btn"
          >
            Enregistrer
          </button>
          <button
            onClick={() => {
              setIsEditing(false);
              setEditText(msg.content);
            }}
            className="btn-secondary message-edit-cancel-btn"
          >
            Annuler
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="message-text-content-wrapper">
      <div className="message-text-content">{msg.content}</div>
      {!isLoading && onEditMessage && (
        <button
          onClick={() => setIsEditing(true)}
          className="message-edit-trigger-btn"
          title="Modifier le prompt"
          aria-label="Modifier le prompt"
        >
          <Pencil size={11} />
        </button>
      )}
    </div>
  );
};

interface AssistantMessageContentProps {
  msg: Message;
  isLoading: boolean;
  parsedSteps: ParsedStep[];
}

/**
 * Renders the content of an assistant (bot/agent) message.
 * Manages thinking state visibility and parses reasoning tags.
 * 
 * @param props - Component properties including the message object, loading state, and steps trace.
 */
const AssistantMessageContent: React.FC<AssistantMessageContentProps> = ({
  msg,
  isLoading,
  parsedSteps,
}) => {
  const [isThinkingOpen, setIsThinkingOpen] = useState(true);
  const [prevIsLoading, setPrevIsLoading] = useState(isLoading);

  if (prevIsLoading !== isLoading) {
    setPrevIsLoading(isLoading);
    if (!isLoading) {
      setIsThinkingOpen(false);
    }
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
        <StepsTracker steps={parsedSteps} />
      )}

      {/* Model Thinking accordion */}
      {thinkingText && (
        <ThinkingAccordion
          thinkingText={thinkingText}
          isThinkingOpen={isThinkingOpen}
          onToggle={setIsThinkingOpen}
          isLoading={isLoading}
          modelName={msg.steps?.[0]?.model}
        />
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
};

/**
 * Individual Chat Message component rendering bubble, avatar, LLM thinking accordion,
 * steps progress list, cache hit indicators, and performance telemetry reports.
 * Wrapped in React.memo for optimal rendering performance.
 */
export const ChatMessage: React.FC<ChatMessageProps> = React.memo(({
  msg,
  isLoading,
  activeMessageDataId,
  onSelectMessageData,
  liveLogs = [],
  onEditMessage,
  onExecuteRawSql,
  onSelectView,
}) => {
  const isUser = msg.sender === 'user';

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
        {isUser ? (
          <UserMessageContent
            msg={msg}
            isLoading={isLoading}
            onEditMessage={onEditMessage}
          />
        ) : (
          <AssistantMessageContent
            msg={msg}
            isLoading={isLoading}
            parsedSteps={parsedSteps}
          />
        )}

        {/* Generated SQL query block */}
        {msg.sqlQuery && (
          <SqlCodeBlock 
            sqlQuery={msg.sqlQuery} 
            onExecuteRawSql={onExecuteRawSql ? (sql) => onExecuteRawSql(msg.id, sql) : undefined}
          />
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

        {/* Follow-up Action Chips */}
        {!isUser && msg.hasData && !isLoading && (
          <div className="message-followup-chips" role="group" aria-label="Actions rapides">
            <button
              onClick={() => {
                onSelectMessageData(msg.id);
                if (onSelectView) onSelectView('table');
              }}
              className="message-followup-chip"
              title="Ouvrir les données dans le tableau"
            >
              <span>📋 Tableau de données</span>
            </button>
            <button
              onClick={() => {
                onSelectMessageData(msg.id);
                if (onSelectView) onSelectView('chart');
              }}
              className="message-followup-chip message-followup-chip-accent"
              title="Ouvrir la visualisation graphique Recharts"
            >
              <span>📊 Vue Graphique</span>
            </button>
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
        <PerformanceMetrics msg={msg} />
      </div>
    </div>
  );
});
