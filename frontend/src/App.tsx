import { useState } from 'react';
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
  } = useSandbox();

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
  } = useChat();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Retrieve selected dataset and query SQL for the visualizer
  const activeData = activeMessageId ? resultsStore[messageIdFilter(activeMessageId)] : [];
  
  /**
   * Safe helper to match the exact selected assistant message ID.
   */
  function messageIdFilter(id: string): string {
    return id;
  }

  const activeSQL = activeMessageId 
    ? messages.find(m => m.id === activeMessageId)?.sqlQuery 
    : undefined;

  return (
    <div className="app-layout">
      {/* Global Application Header */}
      <header className="glass-panel px-6 py-4 flex items-center justify-between" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px' }}>
        <div className="flex items-center gap-3" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, var(--accent-primary), hsl(265, 95%, 65%))' }}>
            <Terminal size={22} style={{ color: 'var(--text-heading)' }} />
          </div>
          <div>
            <h1 className="text-xl font-extrabold m-0" style={{ fontSize: '20px', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
              LLM<span style={{ color: 'var(--accent-primary)' }}>4</span>SQL
            </h1>
            <p className="text-xs text-muted m-0" style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              Assistant SQL Agentique Local
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className={`p-2 rounded-lg border transition-all ${isSettingsOpen ? 'bg-primary border-glow text-white' : 'bg-surface border-subtle text-muted hover:text-main'}`}
            style={{ 
              border: '1px solid var(--border-subtle)', 
              borderRadius: '8px', 
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isSettingsOpen ? 'var(--accent-primary)' : 'transparent',
              color: isSettingsOpen ? '#fff' : 'var(--text-muted)'
            }}
            title="Paramètres de l'Agent"
          >
            <Settings size={18} />
          </button>
          <div className="hidden md:flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="w-2 h-2 rounded-full bg-emerald" style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-emerald)' }}></span>
            <span className="text-xs text-muted" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>FastAPI: OK</span>
          </div>
        </div>
      </header>

      {/* Collapsible Settings Panel */}
      {isSettingsOpen && (
        <div className="glass-panel mx-6 mt-4 p-4 animate-fade-in" style={{ margin: '16px 24px 0 24px', padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', borderRadius: '12px', background: 'var(--bg-card)' }}>
          <div className="flex flex-col gap-1.5" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="text-xs font-semibold text-heading" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-heading)' }}>Modèle Ollama</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="input-field text-xs"
              style={{ padding: '8px 12px', fontSize: '12px', borderRadius: '8px', color: 'var(--text-main)', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)' }}
            >
              <option value="qwen3.5:4b">Qwen 3.5 (4B) - Par défaut</option>
              <option value="qwen3.5:9b">Qwen 3.5 (9B)</option>
              <option value="deepseek-r1:1.5b">DeepSeek R1 (1.5B) - Raisonnement</option>
              <option value="deepseek-r1:8b">DeepSeek R1 (8B) - Raisonnement</option>
              <option value="llama3:latest">Llama 3 (8B)</option>
            </select>
          </div>
          
          <div className="flex flex-col gap-1.5" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div className="flex justify-between items-center" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="text-xs font-semibold text-heading" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-heading)' }}>Température</label>
              <span className="text-xs text-muted" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{temperature.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1.0"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent-primary)' }}
            />
          </div>
          
          <div className="flex flex-col gap-1.5" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="text-xs font-semibold text-heading" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-heading)' }}>Taille du Contexte (num_ctx)</label>
            <input
              type="number"
              min="512"
              max="32768"
              step="512"
              value={contextSize}
              onChange={(e) => setContextSize(parseInt(e.target.value) || 2048)}
              className="input-field text-xs"
              style={{ padding: '8px 12px', fontSize: '12px', borderRadius: '8px', color: 'var(--text-main)', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)' }}
            />
          </div>
        </div>
      )}

      {/* Main Content Layout: Balanced Desktop 3-Column Grid */}
      <main className="main-grid">
        {/* Column 1 : SQL Sandbox & Interactive DDL Visualizer */}
        <section className="glass-panel p-5 flex flex-col h-[650px] panel-schema" style={{ display: 'flex', flexDirection: 'column', padding: '20px', height: '650px' }}>
          <div className="flex flex-col gap-3 border-b border-subtle pb-3 mb-4" style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px', marginBottom: '16px' }}>
            <div className="flex items-center justify-between" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Database size={18} style={{ color: 'var(--accent-secondary)' }} />
                <h2 className="text-md font-semibold m-0" style={{ fontSize: '15px', fontWeight: 600 }}>Laboratoire SQL</h2>
              </div>
              <button 
                onClick={handleApplySandbox}
                disabled={isSandboxLoading || !schemaSql.trim()}
                className="btn-primary text-xs flex items-center gap-1.5"
                style={{ padding: '6px 12px', fontSize: '11px', opacity: (isSandboxLoading || !schemaSql.trim()) ? 0.5 : 1 }}
              >
                {isSandboxLoading ? <span className="animate-pulse">Génération...</span> : <><Play size={12} /> Appliquer</>}
              </button>
            </div>
            
            {/* Sandbox Visual tabs selection */}
            <div className="flex bg-surface rounded-lg p-0.5" style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--bg-card)', padding: '2px', borderRadius: '8px' }}>
              <button
                onClick={() => setSandboxTab('schema')}
                className={`p-1.5 rounded-md transition-all text-xs flex-1 flex items-center justify-center gap-1.5 ${sandboxTab === 'schema' ? 'bg-primary text-white font-semibold' : 'text-muted'}`}
                style={{ fontSize: '11px', border: 'none', background: sandboxTab === 'schema' ? 'var(--accent-primary)' : 'transparent', color: sandboxTab === 'schema' ? '#fff' : 'var(--text-muted)', cursor: 'pointer' }}
              >
                <LayoutTemplate size={12} /> Schéma
              </button>
              <button
                onClick={() => setSandboxTab('data')}
                className={`p-1.5 rounded-md transition-all text-xs flex-1 flex items-center justify-center gap-1.5 ${sandboxTab === 'data' ? 'bg-primary text-white font-semibold' : 'text-muted'}`}
                style={{ fontSize: '11px', border: 'none', background: sandboxTab === 'data' ? 'var(--accent-primary)' : 'transparent', color: sandboxTab === 'data' ? '#fff' : 'var(--text-muted)', cursor: 'pointer' }}
              >
                <Braces size={12} /> Données
              </button>
              <button
                onClick={() => setSandboxTab('visual')}
                className={`p-1.5 rounded-md transition-all text-xs flex-1 flex items-center justify-center gap-1.5 ${sandboxTab === 'visual' ? 'bg-primary text-white font-semibold' : 'text-muted'}`}
                style={{ fontSize: '11px', border: 'none', background: sandboxTab === 'visual' ? 'var(--accent-primary)' : 'transparent', color: sandboxTab === 'visual' ? '#fff' : 'var(--text-muted)', cursor: 'pointer' }}
              >
                <Eye size={12} /> Visuel
              </button>
            </div>
          </div>
          
          <div className="flex-1 min-h-0" style={{ flex: 1, minHeight: 0 }}>
            {sandboxTab === 'schema' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '8px' }}>
                <textarea
                  value={schemaSql}
                  onChange={(e) => setSchemaSql(e.target.value)}
                  placeholder="Collez ici le code de création de vos tables (CREATE TABLE...)"
                  className="input-field w-full font-mono text-xs"
                  style={{ width: '100%', flex: 1, resize: 'none', fontSize: '11px', padding: '12px' }}
                />
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'flex', gap: '4px', alignItems: 'center', background: 'rgba(239, 68, 68, 0.05)', padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.15)', lineHeight: 1.3 }}>
                  <span>⚠️ <b>Sécurité :</b> Ces scripts DDL s'exécutent localement pour configurer votre sandbox. Par ailleurs, les requêtes générées par l'IA dans le Chat sont bridées en Lecture Seule absolue (SELECT).</span>
                </div>
              </div>
            )}
            {sandboxTab === 'data' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '8px' }}>
                <textarea
                  value={insertSql}
                  onChange={(e) => setInsertSql(e.target.value)}
                  placeholder="Optionnel : Collez ici vos insertions de données (INSERT INTO...)"
                  className="input-field w-full font-mono text-xs"
                  style={{ width: '100%', flex: 1, resize: 'none', fontSize: '11px', padding: '12px' }}
                />
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'flex', gap: '4px', alignItems: 'center', background: 'rgba(239, 68, 68, 0.05)', padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.15)', lineHeight: 1.3 }}>
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

        {/* Column 2 : Chat Interface */}
        <section className="panel-chat" style={{ height: '650px' }}>
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
        <section className="glass-panel p-5 flex flex-col h-[650px] panel-data" style={{ display: 'flex', flexDirection: 'column', padding: '20px', height: '650px' }}>
          {/* Navigation Explorer Header */}
          <div className="flex items-center justify-between border-b border-subtle pb-3 mb-4" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px', marginBottom: '16px' }}>
            <div className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={18} style={{ color: 'var(--accent-primary)' }} />
              <h2 className="text-md font-semibold m-0" style={{ fontSize: '15px', fontWeight: 600 }}>Explorateur de Données</h2>
            </div>
            
            {/* Visual View Selection tabs */}
            <div className="flex gap-1 bg-surface rounded-lg p-0.5" style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--bg-card)', padding: '2px', borderRadius: '8px' }}>
              <button
                onClick={() => setActiveView('table')}
                disabled={!activeMessageId}
                className={`p-1.5 rounded-md transition-all flex items-center gap-1 ${
                  activeView === 'table' ? 'btn-primary' : 'btn-secondary'
                }`}
                style={{ padding: '6px 10px', fontSize: '11px', cursor: !activeMessageId ? 'not-allowed' : 'pointer', opacity: !activeMessageId ? 0.5 : 1 }}
              >
                <Table size={13} />
                <span>Tableau</span>
              </button>
              <button
                onClick={() => setActiveView('chart')}
                disabled={!activeMessageId}
                className={`p-1.5 rounded-md transition-all flex items-center gap-1 ${
                  activeView === 'chart' ? 'btn-primary' : 'btn-secondary'
                }`}
                style={{ padding: '6px 10px', fontSize: '11px', cursor: !activeMessageId ? 'not-allowed' : 'pointer', opacity: !activeMessageId ? 0.5 : 1 }}
              >
                <BarChart3 size={13} />
                <span>Graphique</span>
              </button>
            </div>
          </div>

          {/* Active Visualizer Body */}
          <div className="flex-1 min-h-0 chart-container">
            {!activeMessageId ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-muted" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', padding: '16px' }}>
                <HelpCircle size={40} className="opacity-30 mb-3" style={{ marginBottom: '12px', opacity: 0.3 }} />
                <h3 className="text-sm font-semibold text-heading mb-1" style={{ color: 'var(--text-heading)', fontWeight: 600 }}>Aucune donnée active</h3>
                <p className="text-xs max-w-xs" style={{ fontSize: '12px', maxWidth: '280px', margin: 0 }}>
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
    </div>
  );
}
