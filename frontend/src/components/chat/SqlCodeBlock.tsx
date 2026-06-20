import React from 'react';

interface SqlCodeBlockProps {
  sqlQuery: string;
}

/**
 * Renders the generated SQL query block with a copy button.
 */
export const SqlCodeBlock: React.FC<SqlCodeBlockProps> = React.memo(({ sqlQuery }) => {
  const handleCopy = () => {
    navigator.clipboard.writeText(sqlQuery);
    const btn = document.activeElement as HTMLButtonElement;
    if (btn) {
      const oldText = btn.innerText;
      btn.innerText = 'Copié !';
      setTimeout(() => (btn.innerText = oldText), 2000);
    }
  };

  return (
    <div className="message-sql-section">
      <div className="message-sql-header">
        <span className="message-sql-label">Requête SQL générée :</span>
        <button onClick={handleCopy} className="message-sql-copy-btn hover:bg-surface-solid">
          Copier
        </button>
      </div>
      <pre className="message-sql-code">
        <code>{sqlQuery}</code>
      </pre>
    </div>
  );
});
