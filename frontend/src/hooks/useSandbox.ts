import { useState } from 'react';

const API_BASE_URL = 'http://localhost:8000';

/**
 * Custom React hook managing the SQL Sandbox DDL/DML lifecycle and visualizer tabs.
 * Encapsulates script states, loading indicators, and isolated database schemas initialization.
 */
export function useSandbox() {
  const [sandboxTab, setSandboxTab] = useState<'schema' | 'data' | 'visual'>('schema');
  const [schemaSql, setSchemaSql] = useState('');
  const [insertSql, setInsertSql] = useState('');
  const [mermaidCode, setMermaidCode] = useState('');
  const [isSandboxLoading, setIsSandboxLoading] = useState(false);

  /**
   * Wipes and recreates the user_sandbox schema in PostgreSQL, applies user tables and inserts,
   * and requests the local LLM to visualize the schema as a Mermaid diagram.
   */
  const handleApplySandbox = async () => {
    if (!schemaSql.trim()) return;
    setIsSandboxLoading(true);
    setMermaidCode(''); // Reset visual state
    
    try {
      // 1. Initialize the isolated sandbox schema in PostgreSQL
      const resInit = await fetch(`${API_BASE_URL}/api/sandbox/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema_sql: schemaSql, insert_sql: insertSql }),
      });
      
      if (!resInit.ok) throw new Error("Erreur lors de l'initialisation du Sandbox");

      // 2. Call the LLM visualizer API to translate DDL DDL into Mermaid code
      const resVis = await fetch(`${API_BASE_URL}/api/sandbox/visualize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema_sql: schemaSql }),
      });

      if (resVis.ok) {
        const dataVis = await resVis.json();
        setMermaidCode(dataVis.mermaid_code);
        setSandboxTab('visual'); // Auto-switch to the interactive cards visualizer
      }
      
      alert("✅ Laboratoire SQL prêt ! Vous pouvez maintenant interroger votre base.");
    } catch (e) {
      console.error(e);
      alert("❌ Une erreur s'est produite lors de la configuration du Sandbox.");
    } finally {
      setIsSandboxLoading(false);
    }
  };

  return {
    sandboxTab,
    setSandboxTab,
    schemaSql,
    setSchemaSql,
    insertSql,
    setInsertSql,
    mermaidCode,
    setMermaidCode,
    isSandboxLoading,
    handleApplySandbox,
  };
}
