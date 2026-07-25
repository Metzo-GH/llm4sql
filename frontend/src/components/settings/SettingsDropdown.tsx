import React from 'react';
import { Settings } from 'lucide-react';

/**
 * Properties for the SettingsDropdown component.
 */
interface SettingsDropdownProps {
  /** The currently selected Ollama model name. */
  model: string;
  /** Callback to update the selected model name. */
  setModel: (model: string) => void;
  /** The currently selected LLM temperature. */
  temperature: number;
  /** Callback to update the LLM temperature. */
  setTemperature: (temp: number) => void;
  /** The currently selected context size. */
  contextSize: number;
  /** Callback to update the context size. */
  setContextSize: (size: number) => void;
  /** State indicating if semantic cache should be bypassed. */
  bypassSemanticCache: boolean;
  /** Callback to update the bypass semantic cache state. */
  setBypassSemanticCache: (bypass: boolean) => void;
  /** The currently selected target database schema. */
  selectedSchema: string;
  /** Callback to update the target database schema. */
  setSelectedSchema: (schema: string) => void;
  /** List of all installed Ollama models. */
  installedModels: string[];
  /** State indicating if the settings dropdown is open. */
  isSettingsOpen: boolean;
  /** Callback to update the open state of the dropdown. */
  setIsSettingsOpen: (open: boolean) => void;
}

/**
 * Component that renders the agent settings panel dropdown.
 */
export const SettingsDropdown: React.FC<SettingsDropdownProps> = React.memo(({
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
  isSettingsOpen,
  setIsSettingsOpen,
}) => {
  return (
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
              {installedModels.length === 0 ? (
                <option value="" disabled>Aucun modèle disponible</option>
              ) : (
                <>
                  <option value="">-- Choisir un modèle --</option>
                  {installedModels.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </>
              )}
            </select>
          </div>

          <div className="settings-field-group">
            <label className="settings-label">Base de données cible</label>
            <select
              value={selectedSchema}
              onChange={(e) => setSelectedSchema(e.target.value)}
              className="input-field settings-select font-medium"
            >
              <option value="public">public (BDD Ouvrages 📚)</option>
              <option value="user_sandbox">user_sandbox (Bac à sable 🧪)</option>
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
              <option value={0}>Défaut Ollama</option>
              <option value={4096}>4k (4096 tokens)</option>
              <option value={8192}>8k (8192 tokens)</option>
              <option value={16384}>16k (16384 tokens)</option>
              <option value={32768}>32k (32768 tokens)</option>
              <option value={65536}>64k (65536 tokens)</option>
              <option value={131072}>128k (131072 tokens)</option>
              <option value={262144}>256k (262144 tokens)</option>
            </select>
          </div>

          <div className="settings-field-group border-t border-subtle pt-3 mt-3">
            <label className="settings-label flex items-center gap-2 cursor-pointer select-none font-medium">
              <input
                type="checkbox"
                checked={bypassSemanticCache}
                onChange={(e) => setBypassSemanticCache(e.target.checked)}
                className="settings-checkbox rounded border-subtle bg-black/40 text-primary focus:ring-accent-primary w-4 h-4 cursor-pointer"
              />
              <span>Bypasser le cache sémantique</span>
            </label>
            <p className="text-[10px] text-muted mt-1 leading-normal">
              Force le modèle à recalculer une réponse neuve plutôt que de réutiliser une réponse proche en mémoire.
            </p>
          </div>
        </div>
      )}
    </div>
  );
});

SettingsDropdown.displayName = 'SettingsDropdown';
