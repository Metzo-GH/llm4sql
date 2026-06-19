import { useState, useMemo, useCallback, useEffect } from 'react';
import { ChatInterface } from './components/ChatInterface';
import { DataTable } from './components/DataTable';
import { DataVisualization } from './components/DataVisualization';
import { SchemaVisualizer } from './components/SchemaVisualizer';
import { useSandbox } from './hooks/useSandbox';
import { useChat } from './hooks/useChat';
import { Database, Table, BarChart3, HelpCircle, Terminal, Play, LayoutTemplate, Braces, Eye, Settings } from 'lucide-react';

/**
 * Main Application orchestrator. Acts as a visual container, aligning the 3-column
 * layout and passing custom-hook operations to individual sub-panels.
 */
export default function App() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  /**
   * Triggers a temporary visual Toast message on the UI.
   */
  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  }, []);

  // Clear toast after 3 seconds automatically
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Delegate DDL Sandbox operations to useSandbox hook
  const {
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
  } = useSandbox({ onShowToast: showToast });

  // Delegate NL Translation & Chat queries to useChat hook
  const {
    messages,
    inputValue,
    setInputValue,
    isLoading,
    resultsStore,
    activeMessageId,
    activeView,
    setActiveView,
    handleSendMessage,
    handleSelectMessageData,
    model,
    setModel,
    temperature,
    setTemperature,
    contextSize,
    setContextSize,
    liveLogs,
    contextUsage,
    apiOnline,
    loadedModelStatus,
    installedModels,
  } = useChat();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Retrieve selected dataset and query SQL for the visualizer
  const activeData = useMemo(() => {
    return activeMessageId ? resultsStore[activeMessageId] : [];
  }, [activeMessageId, resultsStore]);

  const activeSQL = useMemo(() => {
    return activeMessageId 
      ? messages.find(m => m.id === activeMessageId)?.sqlQuery 
      : undefined;
  }, [activeMessageId, messages]);

  return (
    <div className="app-layout">
      {/* Global Application Header */}
      <header className="glass-panel app-header">
        <div className="app-logo-group">
          <div className="app-logo-badge">
            <Terminal size={18} className="app-logo-icon" />
          </div>
          <div>
            <h1 className="app-title">
              LLM<span className="app-title-accent">4</span>SQL
            </h1>
            <p className="app-subtitle">
              Assistant SQL Agentique Local
            </p>
          </div>
        </div>
        <div className="app-header-actions">
          {/* Real-time Ollama status */}
          {loadedModelStatus ? (
            <div className="hidden lg:flex app-ollama-status">
              <span className="app-ollama-status-dot app-ollama-status-dot-active animate-pulse"></span>
              <span className="app-ollama-text">
                Ollama: <strong className="app-ollama-text-bold">{loadedModelStatus.name}</strong> ({loadedModelStatus.processor})
              </span>
              <span className="app-ollama-ctx font-mono">
                Ctx: {loadedModelStatus.context_length >= 1024 ? `${Math.round(loadedModelStatus.context_length / 1024)}k` : loadedModelStatus.context_length}
              </span>
            </div>
          ) : apiOnline ? (
            <div className="hidden lg:flex app-ollama-status">
              <span className="app-ollama-status-dot"></span>
              <span className="app-ollama-text">
                Ollama: Veille / Inactif
              </span>
            </div>
          ) : null}

          {/* Settings button with dropdown wrapper */}
          <div className="settings-dropdown-wrapper">
            <button
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className={`settings-btn ${isSettingsOpen ? 'settings-btn-active' : ''}`}
              title="Paramètres de l'Agent"
              aria-label="Paramètres de l'Agent"
              aria-haspopup="true"
              aria-expanded={isSettingsOpen}
            >
              <Settings size={18} />
            </button>

            {isSettingsOpen && (
              <div className="glass-panel settings-dropdown animate-fade-in">
                <div className="settings-field-group">
                  <label className="settings-label">Modèle Ollama</label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="input-field settings-select"
                  >
                    {installedModels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                
                <div className="settings-field-group">
                  <div className="settings-slider-header">
                    <label className="settings-label">Température</label>
                    <span className="settings-val">{temperature.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1.0"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="settings-slider"
                  />
                </div>
                
                <div className="settings-field-group">
                  <label className="settings-label">Taille du Contexte</label>
                  <select
                    value={contextSize}
                    onChange={(e) => setContextSize(parseInt(e.target.value))}
                    className="input-field settings-select"
                  >
                    <option value={4096}>4k (4096 tokens)</option>
                    <option value={8192}>8k (8192 tokens)</option>
                    <option value={16384}>16k (16384 tokens)</option>
                    <option value={32768}>32k (32768 tokens)</option>
                    <option value={65536}>64k (65536 tokens)</option>
                    <option value={131072}>128k (131072 tokens)</option>
                    <option value={262144}>256k (262144 tokens)</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Dynamic FastAPI status */}
          <div className="hidden md:flex app-api-status">
            <span className={`app-api-status-dot ${apiOnline ? 'app-api-status-online' : 'app-api-status-offline'}`}></span>
            <span className="app-api-text">
              FastAPI: {apiOnline ? 'En ligne' : 'Hors ligne'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Layout: Balanced Desktop 3-Column Grid */}
      <main className="main-grid">
        {/* Column 1 : SQL Sandbox & Interactive DDL Visualizer */}
        <section className="glass-panel sandbox-panel panel-schema">
          <div className="sandbox-header">
            <div className="sandbox-title-row">
              <div className="sandbox-title-group">
                <Database size={18} className="sandbox-icon" />
                <h2 className="sandbox-title m-0">Laboratoire SQL</h2>
              </div>
              <button 
                onClick={handleApplySandbox}
                disabled={isSandboxLoading || !schemaSql.trim()}
                className="btn-primary sandbox-apply-btn"
                style={{ opacity: (isSandboxLoading || !schemaSql.trim()) ? 0.5 : 1 }}
              >
                {isSandboxLoading ? <span className="animate-pulse">Génération...</span> : <><Play size={12} /> Appliquer</>}
              </button>
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
                  <span>⚠️ <b>Sécurité :</b> L'exécution DML s'apply en écriture sur l'espace `user_sandbox`. Ne chargez que des jeux de données certifiés.</span>
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

        {/* Column 2 : Chat Interface */}
        <section className="panel-chat">
          <ChatInterface
            messages={messages}
            inputValue={inputValue}
            setInputValue={setInputValue}
            isLoading={isLoading}
            onSendMessage={handleSendMessage}
            onSelectMessageData={handleSelectMessageData}
            activeMessageDataId={activeMessageId}
            liveLogs={liveLogs}
            contextUsage={contextUsage}
          />
        </section>

        {/* Column 3 : Data Grid Explorer & Charts */}
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
      </main>

      {/* Toast Notification Box */}
      {toast && (
        <div className="toast-container">
          <div className={`toast toast-${toast.type}`}>
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
