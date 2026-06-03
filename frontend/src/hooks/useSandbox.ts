import { useState } from 'react';

const API_BASE_URL = 'http://localhost:8500';

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
  const [isVisualizing, setIsVisualizing] = useState(false);

  /**
   * Wipes and recreates the user_sandbox schema in PostgreSQL, applies user tables and inserts.
   * This operation is local, instant and does not call the LLM.
   */
  const handleApplySandbox = async () => {
    if (!schemaSql.trim()) return;
    setIsSandboxLoading(true);
    setMermaidCode(''); // Reset visual state
    
    try {
      // Initialize the isolated sandbox schema in PostgreSQL
      const resInit = await fetch(`${API_BASE_URL}/api/sandbox/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema_sql: schemaSql, insert_sql: insertSql }),
      });
      
      if (!resInit.ok) throw new Error("Erreur lors de l'initialisation du Sandbox");

      setSandboxTab('visual'); // Auto-switch to the interactive cards visualizer
      alert("✅ Base de données initialisée instantanément ! Vous pouvez maintenant interroger votre base.");
    } catch (e) {
      console.error(e);
      alert("❌ Une erreur s'est produite lors de la configuration du Sandbox.");
    } finally {
      setIsSandboxLoading(false);
    }
  };

  /**
   * Calls the LLM visualizer API to translate DDL SQL into Mermaid code.
   */
  const handleGenerateDiagram = async () => {
    if (!schemaSql.trim() || isVisualizing) return;
    setIsVisualizing(true);

    try {
      const resVis = await fetch(`${API_BASE_URL}/api/sandbox/visualize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema_sql: schemaSql }),
      });

      if (!resVis.ok) throw new Error("Erreur lors de la génération du diagramme");

      const dataVis = await resVis.json();
      setMermaidCode(dataVis.mermaid_code);
    } catch (e) {
      console.error(e);
      alert("❌ Impossible de générer le diagramme avec l'IA locale.");
    } finally {
      setIsVisualizing(false);
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
    isVisualizing,
    handleApplySandbox,
    handleGenerateDiagram,
  };
}
