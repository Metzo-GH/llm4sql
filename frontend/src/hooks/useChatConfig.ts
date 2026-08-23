import { useState, useEffect } from 'react';

export interface ChatConfig {
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
}

/**
 * Hook dédié à la gestion des paramètres d'inférence LLM et de leur persistance dans le localStorage.
 */
export function useChatConfig(): ChatConfig {
  const [model, setModel] = useState<string>(() => {
    return localStorage.getItem('llm4sql_model') || '';
  });

  const [temperature, setTemperature] = useState<number>(() => {
    const val = localStorage.getItem('llm4sql_temperature');
    return val !== null ? parseFloat(val) : 0.0;
  });

  const [contextSize, setContextSize] = useState<number>(() => {
    const val = localStorage.getItem('llm4sql_context_size');
    return val !== null ? parseInt(val) : 0;
  });

  const [bypassSemanticCache, setBypassSemanticCache] = useState<boolean>(() => {
    return localStorage.getItem('llm4sql_bypass_semantic_cache') === 'true';
  });

  const [selectedSchema, setSelectedSchema] = useState<string>(() => {
    return localStorage.getItem('selectedSchema') || 'public';
  });

  useEffect(() => {
    localStorage.setItem('llm4sql_model', model);
  }, [model]);

  useEffect(() => {
    localStorage.setItem('llm4sql_temperature', temperature.toString());
  }, [temperature]);

  useEffect(() => {
    localStorage.setItem('llm4sql_context_size', contextSize.toString());
  }, [contextSize]);

  useEffect(() => {
    localStorage.setItem('llm4sql_bypass_semantic_cache', bypassSemanticCache.toString());
  }, [bypassSemanticCache]);

  useEffect(() => {
    localStorage.setItem('selectedSchema', selectedSchema);
  }, [selectedSchema]);

  return {
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
  };
}
