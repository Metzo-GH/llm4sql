import { useState, useEffect, useCallback } from 'react';
import type { Message, ContextUsage, LoadedModelStatus } from '../types/chat';

import { API_BASE_URL } from '../config/api';

/**
 * Custom React hook orchestrating chat messaging flows, agentic LLM API calls,
 * memory-cached query datasets, and active visual data grid inspections.
 */
export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Cache of SQL query datasets, indexed by the assistant's message ID
  const [resultsStore, setResultsStore] = useState<Record<string, Record<string, any>[]>>({});
  
  // The active message ID chosen in the explorer panel
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  
  // Visual explorer mode ('table' | 'chart')
  const [activeView, setActiveView] = useState<'table' | 'chart'>('table');

  // Agent configuration states
  const [model, setModel] = useState('qwen3.5:4b');
  const [temperature, setTemperature] = useState(0.0);
  const [contextSize, setContextSize] = useState(4096);

  // Real-time telemetry log lines for the terminal visualizer
  const [liveLogs, setLiveLogs] = useState<string[]>([]);
  
  // Real-time context window usage
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null);

  const [apiOnline, setApiOnline] = useState(false);
  const [loadedModelStatus, setLoadedModelStatus] = useState<LoadedModelStatus | null>(null);
  const [installedModels, setInstalledModels] = useState<string[]>(['qwen3.5:4b', 'qwen3.5:9b', 'deepseek-r1:1.5b', 'deepseek-r1:8b']);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/`);
        if (res.ok) {
          setApiOnline(true);
        } else {
          setApiOnline(false);
        }
      } catch (err) {
        setApiOnline(false);
      }

      try {
        const res = await fetch(`${API_BASE_URL}/api/ollama/status`);
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
      } catch (err) {
        setLoadedModelStatus(null);
      }
    };

    const fetchModels = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/ollama/models`);
        if (res.ok) {
          const data = await res.json();
          if (data.models && data.models.length > 0) {
            setInstalledModels(data.models);
          }
        }
      } catch (err) {
        console.error("Erreur lors de la récupération des modèles Ollama:", err);
      }
    };

    checkStatus();
    fetchModels();

    const statusInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        checkStatus();
      }
    }, 5000);
    const modelsInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchModels();
      }
    }, 15000);

    return () => {
      clearInterval(statusInterval);
      clearInterval(modelsInterval);
    };
  }, []);

  /**
   * Submits the user's natural language question, processes agentic API calls,
   * detects SQL errors, and triggers auto-correction cycles.
   * 
   * @param e - React Form Event
   */
  const handleSendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userQuestion = inputValue.trim();
    setInputValue('');
    setIsLoading(true);
    setLiveLogs([]);
    setContextUsage(null);

    // 1. Register the user's message
    const userMsgId = `user-${Date.now()}`;
    const userMessage: Message = {
      id: userMsgId,
      sender: 'user',
      content: userQuestion,
    };
    setMessages((prev) => [...prev, userMessage]);

    // Create a temporary streaming message for the assistant
    const assistantMsgId = `assistant-${Date.now()}`;
    const initialAssistantMessage: Message = {
      id: assistantMsgId,
      sender: 'assistant',
      content: '', // Accumulated raw LLM tokens (including <think> tag)
    };
    setMessages((prev) => [...prev, initialAssistantMessage]);

    try {
      const payload = { 
        question: userQuestion,
        model,
        temperature,
        context_size: contextSize
      };

      // 2. Fetch from the SSE FastAPI endpoint
      const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Erreur serveur (${response.status})`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Impossible d'obtenir le flux de lecture.");
      }

      const decoder = new TextDecoder();
      let accumulatedBuffer = '';
      let rawLLMText = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        accumulatedBuffer += decoder.decode(value, { stream: true });
        
        // SSE events are separated by double newlines
        const lines = accumulatedBuffer.split('\n\n');
        accumulatedBuffer = lines.pop() || ''; // Keep the last incomplete block in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          
          try {
            const rawJson = trimmed.substring(6);
            const event = JSON.parse(rawJson);

            if (event.type === 'log') {
              setLiveLogs((prev) => [...prev, event.data]);
            } else if (event.type === 'context_usage') {
              setContextUsage({
                promptTokens: event.data.prompt_tokens,
                evalTokens: event.data.eval_tokens,
                contextSize: event.data.context_size,
                estimated: event.data.estimated,
              });
            } else if (event.type === 'token') {
              rawLLMText += event.data;
              
              // Parse thinking vs SQL in real-time
              const thinkStart = rawLLMText.indexOf('<think>');
              const thinkEnd = rawLLMText.indexOf('</think>');
              
              let thinking = '';
              let sql = '';
              
              if (thinkStart !== -1) {
                if (thinkEnd !== -1) {
                  thinking = rawLLMText.substring(thinkStart + 7, thinkEnd).trim();
                  sql = rawLLMText.substring(thinkEnd + 8).trim();
                } else {
                  thinking = rawLLMText.substring(thinkStart + 7).trim();
                }
              } else {
                sql = rawLLMText.trim();
              }
              
              // Clean codeblock markers from SQL while streaming
              let cleanedSql = sql;
              if (cleanedSql.startsWith('```sql')) {
                cleanedSql = cleanedSql.substring(6).trim();
              } else if (cleanedSql.startsWith('```')) {
                cleanedSql = cleanedSql.substring(3).trim();
              }
              if (cleanedSql.endsWith('```')) {
                cleanedSql = cleanedSql.substring(0, cleanedSql.length - 3).trim();
              }
              
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMsgId
                    ? {
                        ...msg,
                        thinking: thinking || undefined,
                        sqlQuery: cleanedSql || undefined,
                        content: rawLLMText,
                      }
                    : msg
                )
              );
            } else if (event.type === 'result') {
              const data = event.data;
              const hasData = data.query_results && data.query_results.length > 0;
              
              if (hasData) {
                setResultsStore((prev) => ({
                  ...prev,
                  [assistantMsgId]: data.query_results,
                }));
              }

              let finalContent = '';
              if (data.error_message) {
                if (data.error_message.includes('Alerte de Sécurité') || data.error_message.includes('Alerte de Securite')) {
                  finalContent = "⚠️ Ma politique de sécurité a bloqué cette requête car elle tente d'altérer la base de données ou d'exécuter des fonctions système interdites. Seules les requêtes SELECT en lecture seule sont autorisées.";
                } else {
                  finalContent = "❌ Je rencontre des difficultés à exécuter la requête sur PostgreSQL après plusieurs essais d'auto-correction. Veuillez reformuler votre demande.";
                }
              } else if (hasData) {
                finalContent = `J'ai trouvé ${data.query_results.length} ligne(s) répondant à votre demande. Vous pouvez explorer les résultats dans le panneau de droite !`;
              } else {
                finalContent = "Aucun résultat trouvé dans la base de données pour cette demande.";
              }

              // Update with final results
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMsgId
                    ? {
                        ...msg,
                        content: finalContent,
                        sqlQuery: data.sql_query,
                        errorMessage: data.error_message,
                        iterationCount: data.iteration_count,
                        hasData: hasData,
                        steps: data.steps,
                        cacheHit: data.cache_hit,
                        tables: data.tables,
                      }
                    : msg
                )
              );

              if (hasData) {
                setActiveMessageId(assistantMsgId);
                setActiveView('table');
              }
            } else if (event.type === 'error') {
              throw new Error(event.data);
            }
          } catch (err) {
            console.error('Error parsing SSE event:', err);
          }
        }
      }
    } catch (error: any) {
      console.error(error);
      const errorMsg = error?.message || "Impossible de joindre l'API locale LLM4SQL. Assurez-vous que le serveur FastAPI tourne sur le port 8500.";
      
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? {
                ...msg,
                content: `❌ ${errorMsg}`,
              }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, isLoading, model, temperature, contextSize]);

  /**
   * Sets the current active query message to inspect.
   * 
   * @param messageId - Selected assistant message ID
   */
  const handleSelectMessageData = useCallback((messageId: string) => {
    setActiveMessageId(messageId);
    setActiveView('table');
  }, []);

  return {
    messages,
    inputValue,
    setInputValue,
    isLoading,
    resultsStore,
    activeMessageId,
    setActiveMessageId,
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
  };
}
