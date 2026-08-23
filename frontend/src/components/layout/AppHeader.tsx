import React from 'react';
import { Terminal, MessageSquare, FlaskConical } from 'lucide-react';
import type { LoadedModelStatus } from '../../types/chat';
import { SettingsDropdown } from '../settings/SettingsDropdown';

interface AppHeaderProps {
  mainTab: 'chat' | 'benchmark';
  setMainTab: (tab: 'chat' | 'benchmark') => void;
  loadedModelStatus: LoadedModelStatus | null;
  apiOnline: boolean;
  model: string;
  setModel: (model: string) => void;
  temperature: number;
  setTemperature: (temp: number) => void;
  contextSize: number;
  setContextSize: (size: number) => void;
  bypassSemanticCache: boolean;
  setBypassSemanticCache: (bypass: boolean) => void;
  selectedSchema: string;
  setSelectedSchema: (schema: string) => void;
  installedModels: string[];
  refreshModels: () => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
}

/**
 * Composant d'en-tête principal de l'application (Phase R35).
 * Affiche le logo, la navigation par onglets, le statut Ollama, les paramètres et le statut FastAPI.
 */
export const AppHeader: React.FC<AppHeaderProps> = ({
  mainTab,
  setMainTab,
  loadedModelStatus,
  apiOnline,
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
  installedModels,
  refreshModels,
  isSettingsOpen,
  setIsSettingsOpen,
}) => {
  return (
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

      {/* Navigation principale par onglets */}
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
        {/* Statut Ollama en direct */}
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

        {/* Menu déroulant des paramètres LLM & Schéma */}
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

        {/* Statut de l'API FastAPI */}
        <div className="hidden md:flex app-api-status">
          <span className={`app-api-status-dot ${apiOnline ? 'app-api-status-online' : 'app-api-status-offline'}`}></span>
          <span className="app-api-text">
            FastAPI: {apiOnline ? 'En ligne' : 'Hors ligne'}
          </span>
        </div>
      </div>
    </header>
  );
};
