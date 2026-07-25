import { useState, useMemo, useCallback, useEffect, lazy, Suspense } from 'react';
import { ChatInterface } from './components/ChatInterface';
import { useSandbox } from './hooks/useSandbox';
import { useChat } from './hooks/useChat';
import { Terminal, MessageSquare, FlaskConical } from 'lucide-react';
import { SettingsDropdown } from './components/settings/SettingsDropdown';

// Importation paresseuse des panneaux lourds pour le code splitting (performance)
const SandboxPanel = lazy(() => import('./components/sandbox/SandboxPanel').then(module => ({ default: module.SandboxPanel })));
const DataExplorerPanel = lazy(() => import('./components/explorer/DataExplorerPanel').then(module => ({ default: module.DataExplorerPanel })));
const BenchmarkPanel = lazy(() => import('./components/BenchmarkPanel').then(module => ({ default: module.BenchmarkPanel })));

/**
 * Composant de chargement squelette pour les panneaux chargés à la demande.
 */
const LoadingPanel = () => (
  <div className="glass-panel sandbox-panel flex items-center justify-center p-6 text-center">
    <div className="flex flex-col items-center gap-2">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      <span className="text-xs text-muted">Chargement du module...</span>
    </div>
  </div>
);

/**
 * Main Application orchestrator. Acts as a visual container, aligning the 3-column
 * layout and passing custom-hook operations to individual sub-panels.
 */
export default function App() {
  const [mainTab, setMainTab] = useState<'chat' | 'benchmark'>('chat');
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
    handleStopRequest,
    handleEditMessage,
    handleSelectMessageData,
    handleClearHistory,
    model,
    setModel,
    temperature,
    setTemperature,
    contextSize,
    setContextSize,
    bypassSemanticCache,
    setBypassSemanticCache,
    selectedSchema,
    setSelectedSchema,
    liveLogs,
    contextUsage,
    apiOnline,
    loadedModelStatus,
    installedModels,
    refreshModels,
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

        {/* Dynamic Navigation Tabs: Chat vs Benchmark */}
        <div className="sandbox-tabs" role="tablist" aria-label="Navigation principale">
          <button
            onClick={() => setMainTab('chat')}
            className={`sandbox-tab-btn ${mainTab === 'chat' ? 'sandbox-tab-btn-active' : ''}`}
            role="tab"
            aria-selected={mainTab === 'chat'}
          >
            <MessageSquare size={14} />
            <span>Chat Agent 💬</span>
          </button>
          <button
            onClick={() => setMainTab('benchmark')}
            className={`sandbox-tab-btn ${mainTab === 'benchmark' ? 'sandbox-tab-btn-active' : ''}`}
            role="tab"
            aria-selected={mainTab === 'benchmark'}
          >
            <FlaskConical size={14} />
            <span>Benchmark 🧪</span>
          </button>
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

          {/* Settings Dropdown Component (SOLID - SRP) */}
          <SettingsDropdown
            model={model}
            setModel={setModel}
            temperature={temperature}
            setTemperature={setTemperature}
            contextSize={contextSize}
            setContextSize={setContextSize}
            bypassSemanticCache={bypassSemanticCache}
            setBypassSemanticCache={setBypassSemanticCache}
            selectedSchema={selectedSchema}
            setSelectedSchema={setSelectedSchema}
            installedModels={installedModels}
            isSettingsOpen={isSettingsOpen}
            setIsSettingsOpen={(open) => {
              setIsSettingsOpen(open);
              if (open) {
                refreshModels();
              }
            }}
          />

          {/* Dynamic FastAPI status */}
          <div className="hidden md:flex app-api-status">
            <span className={`app-api-status-dot ${apiOnline ? 'app-api-status-online' : 'app-api-status-offline'}`}></span>
            <span className="app-api-text">
              FastAPI: {apiOnline ? 'En ligne' : 'Hors ligne'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      {mainTab === 'chat' ? (
        <main className="main-grid">
          {/* Column 1 : SQL Sandbox & Interactive DDL Visualizer (Lazy Loaded) */}
          <Suspense fallback={<LoadingPanel />}>
            <SandboxPanel
              sandboxTab={sandboxTab}
              setSandboxTab={setSandboxTab}
              schemaSql={schemaSql}
              setSchemaSql={setSchemaSql}
              insertSql={insertSql}
              setInsertSql={setInsertSql}
              mermaidCode={mermaidCode}
              isSandboxLoading={isSandboxLoading}
              isVisualizing={isVisualizing}
              handleApplySandbox={handleApplySandbox}
              handleGenerateDiagram={handleGenerateDiagram}
            />
          </Suspense>

          {/* Column 2 : Chat Interface */}
          <section className="panel-chat">
            <ChatInterface
              messages={messages}
              inputValue={inputValue}
              setInputValue={setInputValue}
              isLoading={isLoading}
              onSendMessage={handleSendMessage}
              onStopRequest={handleStopRequest}
              onEditMessage={handleEditMessage}
              onSelectMessageData={handleSelectMessageData}
              onClearHistory={handleClearHistory}
              activeMessageDataId={activeMessageId}
              liveLogs={liveLogs}
              contextUsage={contextUsage}
              loadedModelStatus={loadedModelStatus}
            />
          </section>

          {/* Column 3 : Data Grid Explorer & Charts (Lazy Loaded) */}
          <Suspense fallback={<LoadingPanel />}>
            <DataExplorerPanel
              activeMessageId={activeMessageId}
              activeView={activeView}
              setActiveView={setActiveView}
              activeData={activeData}
              activeSQL={activeSQL}
            />
          </Suspense>
        </main>
      ) : (
        <main className="p-4 h-[calc(100vh-80px)] overflow-hidden">
          <Suspense fallback={<LoadingPanel />}>
            <BenchmarkPanel
              currentModel={model}
              installedModels={installedModels}
              selectedSchema={selectedSchema}
            />
          </Suspense>
        </main>
      )}

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
