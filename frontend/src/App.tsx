import { useState, useMemo, useCallback, useEffect, lazy, Suspense } from 'react';
import { ChatInterface } from './components/ChatInterface';
import { useSandbox } from './hooks/useSandbox';
import { useChat } from './hooks/useChat';
import { PanelLeftOpen, PanelRightOpen } from 'lucide-react';
import { AppHeader } from './components/layout/AppHeader';

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
  
  // Ergonomie - États de visibilité et d'expansion des panneaux
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);
  const [isDataMaximized, setIsDataMaximized] = useState(false);

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

  // Raccourci Échap pour quitter le mode plein écran des données
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDataMaximized) {
        setIsDataMaximized(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDataMaximized]);

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
    handleExecuteRawSql,
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

  // Classe dynamique pour la grille asymétrique selon les panneaux repliés
  const gridLayoutClass = useMemo(() => {
    if (isLeftCollapsed && isRightCollapsed) return 'main-grid-both-collapsed';
    if (isLeftCollapsed) return 'main-grid-left-collapsed';
    if (isRightCollapsed) return 'main-grid-right-collapsed';
    return '';
  }, [isLeftCollapsed, isRightCollapsed]);

  return (
    <div className="app-layout">
      {/* Global Application Header (Modularité SRP - Phase R35) */}
      <AppHeader
        mainTab={mainTab}
        setMainTab={setMainTab}
        loadedModelStatus={loadedModelStatus}
        apiOnline={apiOnline}
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
        refreshModels={refreshModels}
        isSettingsOpen={isSettingsOpen}
        setIsSettingsOpen={setIsSettingsOpen}
      />

      {/* Main Content Layout */}
      {mainTab === 'chat' ? (
        <main className={`main-grid ${gridLayoutClass}`}>
          {/* Bandelette de réouverture du Laboratoire SQL si replié */}
          {isLeftCollapsed && (
            <button
              onClick={() => setIsLeftCollapsed(false)}
              className="sidebar-expand-strip sidebar-expand-strip-left"
              title="Déplier le Laboratoire SQL"
              aria-label="Déplier le Laboratoire SQL"
            >
              <PanelLeftOpen size={16} className="sidebar-expand-icon" />
              <span className="sidebar-expand-text">Laboratoire SQL</span>
            </button>
          )}

          {/* Column 1 : SQL Sandbox & Interactive DDL Visualizer (Lazy Loaded) */}
          {!isLeftCollapsed && (
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
                onToggleCollapse={() => setIsLeftCollapsed(true)}
              />
            </Suspense>
          )}

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
              onExecuteRawSql={handleExecuteRawSql}
              onSelectView={setActiveView}
              selectedSchema={selectedSchema}
              schemaSql={schemaSql}
            />
          </section>

          {/* Column 3 : Data Grid Explorer & Charts (Lazy Loaded) */}
          {(!isRightCollapsed || isDataMaximized) && (
            <Suspense fallback={<LoadingPanel />}>
              <DataExplorerPanel
                activeMessageId={activeMessageId}
                activeView={activeView}
                setActiveView={setActiveView}
                activeData={activeData}
                activeSQL={activeSQL}
                isMaximized={isDataMaximized}
                onToggleMaximize={() => setIsDataMaximized((prev) => !prev)}
                onToggleCollapse={() => setIsRightCollapsed(true)}
              />
            </Suspense>
          )}

          {/* Bandelette de réouverture de l'Explorateur si replié */}
          {isRightCollapsed && !isDataMaximized && (
            <button
              onClick={() => setIsRightCollapsed(false)}
              className="sidebar-expand-strip sidebar-expand-strip-right"
              title="Déplier l'Explorateur de Données"
              aria-label="Déplier l'Explorateur de Données"
            >
              <PanelRightOpen size={16} className="sidebar-expand-icon" />
              <span className="sidebar-expand-text">Explorateur</span>
            </button>
          )}
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
