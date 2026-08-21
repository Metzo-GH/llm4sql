import React from 'react';
import { Database, LayoutTemplate, Braces, Eye, Play, PanelLeftClose } from 'lucide-react';
import { SchemaVisualizer } from '../SchemaVisualizer';

/**
 * Properties for the SandboxPanel component.
 */
interface SandboxPanelProps {
  /** Current active tab in sandbox. */
  sandboxTab: 'schema' | 'data' | 'visual';
  /** Callback to set active tab in sandbox. */
  setSandboxTab: (tab: 'schema' | 'data' | 'visual') => void;
  /** Schema DDL SQL code string. */
  schemaSql: string;
  /** Callback to update schema SQL. */
  setSchemaSql: (sql: string) => void;
  /** Insert DML SQL code string. */
  insertSql: string;
  /** Callback to update insert SQL. */
  setInsertSql: (sql: string) => void;
  /** Generated Mermaid ER diagram code. */
  mermaidCode: string;
  /** State indicating if sandbox is applying scripts. */
  isSandboxLoading: boolean;
  /** State indicating if the ER diagram is being generated. */
  isVisualizing: boolean;
  /** Action handler to apply the sandbox DDL/DML. */
  handleApplySandbox: () => void;
  /** Action handler to generate the Mermaid diagram. */
  handleGenerateDiagram: () => Promise<void>;
  /** Callback to collapse the left panel. */
  onToggleCollapse?: () => void;
}

/**
 * Component that renders the left-hand column containing the SQL Sandbox.
 */
export const SandboxPanel: React.FC<SandboxPanelProps> = React.memo(({
  sandboxTab,
  setSandboxTab,
  schemaSql,
  setSchemaSql,
  insertSql,
  setInsertSql,
  mermaidCode,
  isSandboxLoading,
  isVisualizing,
  handleApplySandbox,
  handleGenerateDiagram,
  onToggleCollapse,
}) => {
  return (
    <section className="glass-panel sandbox-panel panel-schema">
      <div className="sandbox-header">
        <div className="sandbox-title-row">
          <div className="sandbox-title-group">
            <Database size={18} className="sandbox-icon" />
            <h2 className="sandbox-title m-0">Laboratoire SQL</h2>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleApplySandbox}
              disabled={isSandboxLoading || !schemaSql.trim()}
              className="btn-primary sandbox-apply-btn"
              style={{ opacity: (isSandboxLoading || !schemaSql.trim()) ? 0.5 : 1 }}
            >
              {isSandboxLoading ? <span className="animate-pulse">Génération...</span> : <><Play size={12} /> Appliquer</>}
            </button>
            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                className="panel-header-action-btn hidden lg:flex"
                title="Masquer le laboratoire SQL"
                aria-label="Masquer le laboratoire SQL"
              >
                <PanelLeftClose size={14} />
              </button>
            )}
          </div>
        </div>
        
        {/* Sandbox Visual tabs selection */}
        <div className="sandbox-tabs" role="tablist" aria-label="Onglets du laboratoire SQL">
          <button
            onClick={() => setSandboxTab('schema')}
            className={`sandbox-tab-btn ${sandboxTab === 'schema' ? 'sandbox-tab-btn-active' : ''}`}
            role="tab"
            aria-selected={sandboxTab === 'schema'}
          >
            <LayoutTemplate size={12} /> Schéma
          </button>
          <button
            onClick={() => setSandboxTab('data')}
            className={`sandbox-tab-btn ${sandboxTab === 'data' ? 'sandbox-tab-btn-active' : ''}`}
            role="tab"
            aria-selected={sandboxTab === 'data'}
          >
            <Braces size={12} /> Données
          </button>
          <button
            onClick={() => setSandboxTab('visual')}
            className={`sandbox-tab-btn ${sandboxTab === 'visual' ? 'sandbox-tab-btn-active' : ''}`}
            role="tab"
            aria-selected={sandboxTab === 'visual'}
          >
            <Eye size={12} /> Visuel
          </button>
        </div>
      </div>
      
      <div className="schema-visual-panel">
        {sandboxTab === 'schema' && (
          <div className="sandbox-tab-content">
            <textarea
              value={schemaSql}
              onChange={(e) => setSchemaSql(e.target.value)}
              placeholder="Collez ici le code de création de vos tables (CREATE TABLE...)"
              className="input-field sandbox-textarea font-mono"
            />
            <div className="sandbox-warning">
              <span>⚠️ <b>Sécurité :</b> Ces scripts DDL s'exécutent localement pour configurer votre sandbox. Par ailleurs, les requêtes générées par l'IA dans le Chat sont bridées en Lecture Seule absolue (SELECT).</span>
            </div>
          </div>
        )}
        {sandboxTab === 'data' && (
          <div className="sandbox-tab-content">
            <textarea
              value={insertSql}
              onChange={(e) => setInsertSql(e.target.value)}
              placeholder="Optionnel : Collez ici vos insertions de données (INSERT INTO...)"
              className="input-field sandbox-textarea font-mono"
            />
            <div className="sandbox-warning">
              <span>⚠️ <b>Sécurité :</b> L'exécution DML s'applique en écriture sur l'espace `user_sandbox`. Ne chargez que des jeux de données certifiés.</span>
            </div>
          </div>
        )}
        {sandboxTab === 'visual' && (
          <SchemaVisualizer 
            mermaidCode={mermaidCode} 
            schemaSql={schemaSql} 
            onGenerateDiagram={handleGenerateDiagram}
            isVisualizing={isVisualizing}
          />
        )}
      </div>
    </section>
  );
});

SandboxPanel.displayName = 'SandboxPanel';
