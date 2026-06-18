import { useState } from 'react';
import type { Message } from '../components/ChatInterface';

const API_BASE_URL = 'http://localhost:8500';

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

  /**
   * Submits the user's natural language question, processes agentic API calls,
   * detects SQL errors, and triggers auto-correction cycles.
   * 
   * @param e - React Form Event
   */
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userQuestion = inputValue.trim();
    setInputValue('');
    setIsLoading(true);

    // 1. Register the user's message
    const userMsgId = `user-${Date.now()}`;
    const userMessage: Message = {
      id: userMsgId,
      sender: 'user',
      content: userQuestion,
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const payload = { 
        question: userQuestion,
        model,
        temperature,
        context_size: contextSize
      };

      // 2. Fetch from LLM FastAPI endpoint
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Erreur serveur (${response.status})`);
      }

      const data = await response.json();
      const assistantMsgId = `assistant-${Date.now()}`;

      // 3. Register query results in memory cache
      const hasData = data.query_results && data.query_results.length > 0;
      if (hasData) {
        setResultsStore((prev) => ({
          ...prev,
          [assistantMsgId]: data.query_results,
        }));
      }

      // 4. Draft assistant response message
      let content = '';
      if (data.error_message) {
        if (data.error_message.includes('Alerte de Sécurité')) {
          content = "⚠️ Ma politique de sécurité a bloqué cette requête car elle tente d'altérer la base de données ou d'exécuter des fonctions système interdites. Seules les requêtes SELECT en lecture seule sont autorisées.";
        } else {
          content = "❌ Je rencontre des difficultés à exécuter la requête sur PostgreSQL après plusieurs essais d'auto-correction. Veuillez reformuler votre demande.";
        }
      } else if (hasData) {
        content = `J'ai trouvé ${data.query_results.length} ligne(s) répondant à votre demande. Vous pouvez explorer les résultats dans le panneau de droite !`;
      } else {
        content = "Aucun résultat trouvé dans la base de données pour cette demande.";
      }

      const assistantMessage: Message = {
        id: assistantMsgId,
        sender: 'assistant',
        content,
        sqlQuery: data.sql_query,
        errorMessage: data.error_message,
        iterationCount: data.iteration_count,
        hasData: hasData,
        steps: data.steps,
        cacheHit: data.cache_hit,
        tables: data.tables,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // 5. Instantly open data table visualization if query succeeded
      if (hasData) {
        setActiveMessageId(assistantMsgId);
        setActiveView('table');
      }
    } catch (error) {
      console.error(error);
      const assistantMsgId = `error-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMsgId,
          sender: 'assistant',
          content: "❌ Impossible de joindre l'API locale LLM4SQL. Assurez-vous que le serveur FastAPI tourne sur le port 8500.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Sets the current active query message to inspect.
   * 
   * @param messageId - Selected assistant message ID
   */
  const handleSelectMessageData = (messageId: string) => {
    setActiveMessageId(messageId);
    setActiveView('table');
  };

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
  };
}
