import { useState, useEffect, useCallback } from 'react';
import type { LoadedModelStatus } from '../types/chat';
import { API_BASE_URL } from '../config/api';

export interface OllamaStatus {
  apiOnline: boolean;
  loadedModelStatus: LoadedModelStatus | null;
  installedModels: string[];
  refreshModels: () => Promise<void>;
}

/**
 * Hook dédié au monitoring en temps réel de l'état de l'API FastAPI et du serveur Ollama.
 */
export function useOllamaStatus(): OllamaStatus {
  const [apiOnline, setApiOnline] = useState<boolean>(false);
  const [loadedModelStatus, setLoadedModelStatus] = useState<LoadedModelStatus | null>(null);
  const [installedModels, setInstalledModels] = useState<string[]>([]);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/?t=${Date.now()}`);
      setApiOnline(res.ok);
    } catch {
      setApiOnline(false);
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/ollama/status?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.online && data.models && data.models.length > 0) {
          setLoadedModelStatus(data.models[0]);
        } else {
          setLoadedModelStatus(null);
        }
      } else {
        setLoadedModelStatus(null);
      }
    } catch {
      setLoadedModelStatus(null);
    }
  }, []);

  const refreshModels = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/ollama/models?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setInstalledModels(data);
        } else if (data.models && Array.isArray(data.models)) {
          setInstalledModels(data.models.map((m: { name?: string } | string) => (typeof m === 'string' ? m : m.name || '')));
        }
      }
    } catch {
      // Ignorer l'erreur réseau silencieusement
    }
  }, []);

  useEffect(() => {
    checkStatus();
    refreshModels();
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, [checkStatus, refreshModels]);

  return {
    apiOnline,
    loadedModelStatus,
    installedModels,
    refreshModels,
  };
}
