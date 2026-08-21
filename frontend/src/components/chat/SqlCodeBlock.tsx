import React, { useState } from 'react';
import { Pencil, Play, X, Copy, Check } from 'lucide-react';

interface SqlCodeBlockProps {
  sqlQuery: string;
  onExecuteRawSql?: (editedSql: string) => Promise<boolean>;
}

/**
 * Renders the generated SQL query block with direct editing and execution capabilities.
 */
export const SqlCodeBlock: React.FC<SqlCodeBlockProps> = React.memo(({ sqlQuery, onExecuteRawSql }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedSql, setEditedSql] = useState(sqlQuery);
  const [isExecuting, setIsExecuting] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(isEditing ? editedSql : sqlQuery);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRunModified = async () => {
    if (!onExecuteRawSql || !editedSql.trim()) return;
    setIsExecuting(true);
    const success = await onExecuteRawSql(editedSql.trim());
    setIsExecuting(false);
    if (success) {
      setIsEditing(false);
    }
  };

  return (
    <div className="message-sql-section">
      <div className="message-sql-header">
        <span className="message-sql-label">
          {isEditing ? "Éditeur SQL Direct (Human-in-the-Loop) :" : "Requête SQL générée :"}
        </span>
        <div className="flex items-center gap-1.5">
          {!isEditing && onExecuteRawSql && (
            <button
              onClick={() => {
                setEditedSql(sqlQuery);
                setIsEditing(true);
              }}
              className="message-sql-action-btn hover:bg-surface-solid"
              title="Modifier le SQL manuellement"
              aria-label="Modifier le SQL manuellement"
            >
              <Pencil size={12} />
              <span>Modifier</span>
            </button>
          )}

          <button 
            onClick={handleCopy} 
            className="message-sql-action-btn hover:bg-surface-solid"
            title="Copier la requête SQL"
            aria-label="Copier la requête SQL"
          >
            {copied ? <Check size={12} className="text-accent-emerald" /> : <Copy size={12} />}
            <span>{copied ? 'Copié !' : 'Copier'}</span>
          </button>
        </div>
      </div>

      {isEditing ? (
        <div className="message-sql-edit-wrapper">
          <textarea
            value={editedSql}
            onChange={(e) => setEditedSql(e.target.value)}
            disabled={isExecuting}
            className="input-field message-sql-edit-textarea font-mono"
            rows={Math.max(3, editedSql.split('\n').length)}
            placeholder="Écrivez votre requête SELECT ici..."
            aria-label="Éditer la requête SQL"
          />
          <div className="message-sql-edit-actions">
            <button
              onClick={handleRunModified}
              disabled={isExecuting || !editedSql.trim()}
              className="btn-primary message-sql-run-btn"
              title="Exécuter directement sur PostgreSQL sans passer par l'agent"
            >
              <Play size={13} fill="currentColor" />
              <span>{isExecuting ? 'Exécution...' : 'Exécuter le SQL modifié ⚡'}</span>
            </button>
            <button
              onClick={() => {
                setIsEditing(false);
                setEditedSql(sqlQuery);
              }}
              disabled={isExecuting}
              className="btn-secondary message-sql-cancel-btn"
              title="Annuler les modifications"
            >
              <X size={13} />
              <span>Annuler</span>
            </button>
          </div>
        </div>
      ) : (
        <pre className="message-sql-code">
          <code>{sqlQuery}</code>
        </pre>
      )}
    </div>
  );
});
