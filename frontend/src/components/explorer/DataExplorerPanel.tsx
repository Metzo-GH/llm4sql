import React from 'react';
import { Database, Table, BarChart3, HelpCircle } from 'lucide-react';
import { DataTable } from '../DataTable';
import { DataVisualization } from '../DataVisualization';
import type { SqlResultRow } from '../../types/chat';

/**
 * Properties for the DataExplorerPanel component.
 */
interface DataExplorerPanelProps {
  /** The message ID currently active for data exploration. */
  activeMessageId: string | null;
  /** The active view mode ('table' or 'chart'). */
  activeView: 'table' | 'chart';
  /** Callback to change the active view mode. */
  setActiveView: (view: 'table' | 'chart') => void;
  /** Selected query results data array. */
  activeData: SqlResultRow[];
  /** Query SQL statement that generated the data. */
  activeSQL?: string;
}

/**
 * Component that renders the right-hand column of the layout for examining SQL query results.
 */
export const DataExplorerPanel: React.FC<DataExplorerPanelProps> = React.memo(({
  activeMessageId,
  activeView,
  setActiveView,
  activeData,
  activeSQL,
}) => {
  return (
    <section className="glass-panel sandbox-panel panel-data">
      {/* Navigation Explorer Header */}
      <div className="sandbox-header">
        <div className="sandbox-title-row">
          <div className="sandbox-title-group">
            <Database size={18} className="chat-bot-icon" />
            <h2 className="sandbox-title m-0">Explorateur de Données</h2>
          </div>
          
          {/* Visual View Selection tabs */}
          <div className="sandbox-tabs" role="tablist" aria-label="Modes d'exploration des données">
            <button
              onClick={() => setActiveView('table')}
              disabled={!activeMessageId}
              className={`sandbox-tab-btn ${activeView === 'table' ? 'sandbox-tab-btn-active' : ''}`}
              style={{ opacity: !activeMessageId ? 0.5 : 1 }}
              role="tab"
              aria-selected={activeView === 'table'}
            >
              <Table size={13} />
              <span>Tableau</span>
            </button>
            <button
              onClick={() => setActiveView('chart')}
              disabled={!activeMessageId}
              className={`sandbox-tab-btn ${activeView === 'chart' ? 'sandbox-tab-btn-active' : ''}`}
              style={{ opacity: !activeMessageId ? 0.5 : 1 }}
              role="tab"
              aria-selected={activeView === 'chart'}
            >
              <BarChart3 size={13} />
              <span>Graphique</span>
            </button>
          </div>
        </div>
      </div>

      {/* Active Visualizer Body */}
      <div className="flex-1 min-h-0 chart-container">
        {!activeMessageId ? (
          <div className="data-table-empty">
            <HelpCircle size={40} className="data-table-empty-icon" />
            <h3 className="data-table-empty-title">Aucune donnée active</h3>
            <p className="data-table-empty-desc">
              Exécutez une requête via le chat et cliquez sur le bouton "Explorer les résultats" pour activer la visualisation et l'export !
            </p>
          </div>
        ) : activeView === 'table' ? (
          <DataTable data={activeData} sqlQuery={activeSQL} />
        ) : (
          <DataVisualization data={activeData} />
        )}
      </div>
    </section>
  );
});

DataExplorerPanel.displayName = 'DataExplorerPanel';
