import { useState, useCallback, useEffect } from 'react';

import { API_BASE_URL } from '../config/api';

interface UseSandboxOptions {
  onShowToast?: (message: string, type: 'success' | 'error') => void;
}

/**
 * Custom React hook managing the SQL Sandbox DDL/DML lifecycle and visualizer tabs.
 * Encapsulates script states, loading indicators, and isolated database schemas initialization.
 * 
 * @param options - Hook configuration options (e.g. callback to show UI Toasts)
 */
export function useSandbox(options?: UseSandboxOptions) {
  const { onShowToast } = options || {};
  const [sandboxTab, setSandboxTab] = useState<'schema' | 'data' | 'visual'>('schema');
  const [schemaSql, setSchemaSql] = useState('');
  const [insertSql, setInsertSql] = useState('');
  const [mermaidCode, setMermaidCode] = useState('');
  const [isSandboxLoading, setIsSandboxLoading] = useState(false);
  const [isVisualizing, setIsVisualizing] = useState(false);

  // Fetch active database schema (user_sandbox or public) on startup
  useEffect(() => {
    const fetchExistingSchema = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/sandbox/schema`);
        if (res.ok) {
          const data = await res.json();
          if (data.schema_sql) {
            setSchemaSql(data.schema_sql);
          }
          if (data.mermaid_code) {
            setMermaidCode(data.mermaid_code);
            // Switch to visual tab if there's actually a non-empty schema (more than just "erDiagram")
            if (data.mermaid_code.trim() !== 'erDiagram') {
              setSandboxTab('visual');
            }
          }
        }
      } catch (e) {
        console.error("Impossible de charger le schéma existant :", e);
      }
    };
    fetchExistingSchema();
  }, []);

  /**
   * Wipes and recreates the user_sandbox schema in PostgreSQL, applies user tables and inserts.
   * This operation is local, instant and does not call the LLM.
   */
  const handleApplySandbox = useCallback(async () => {
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
      onShowToast?.("Base de données initialisée instantanément ! Vous pouvez maintenant interroger votre base.", "success");
    } catch (e) {
      console.error(e);
      onShowToast?.("Une erreur s'est produite lors de la configuration du Sandbox.", "error");
    } finally {
      setIsSandboxLoading(false);
    }
  }, [schemaSql, insertSql, onShowToast]);

  /**
   * Calls the LLM visualizer API to translate DDL SQL into Mermaid code.
   */
  const handleGenerateDiagram = useCallback(async () => {
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
      onShowToast?.("Impossible de générer le diagramme avec l'IA locale.", "error");
    } finally {
      setIsVisualizing(false);
    }
  }, [schemaSql, isVisualizing, onShowToast]);

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
