import type { ParsedStep } from '../types/chat';

/**
 * Extracts structured steps dynamically from the stream of backend logs.
 * Renders a detailed, step-by-step chronological progress checklist.
 * 
 * @param logs - Array of raw log strings from the backend.
 * @returns Array of ParsedStep objects indicating the progression of the LangGraph agent.
 */
export function parseLiveLogsToSteps(logs: string[]): ParsedStep[] {
  const steps: ParsedStep[] = [];

  if (logs.length === 0) {
    return [
      { id: 'init', label: "Démarrage du workflow...", status: 'loading' }
    ];
  }

  // 1. Check for Cache Hit
  const hasCacheHit = logs.some(log => log.includes('[CACHE HIT]'));
  if (hasCacheHit) {
    return [
      { id: 'init', label: "Initialisation de l'agent", status: 'success', detail: 'Récupéré du cache sémantique local' },
      { id: 'cache', label: "Calcul de la réponse instantané (0ms)", status: 'success', detail: 'Résultats du cache chargés' }
    ];
  }

  // 2. Initialize
  steps.push({
    id: 'init',
    label: "Initialisation de l'agent",
    status: 'success',
    detail: 'Moteur LangGraph démarré'
  });

  // Track the indices of active tool steps to update them on success/error
  let lastSearchIdx = -1;
  let lastSchemaIdx = -1;
  let lastSampleIdx = -1;
  let lastDryRunIdx = -1;
  let lastExecIdx = -1;

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];

    // Reflection step
    if (log.includes('[RÉFLEXION]')) {
      const iterMatch = log.match(/itération (\d+)/);
      const iter = iterMatch ? iterMatch[1] : '1';
      
      // Update previous loading reflection to success
      const prevReflect = steps.find(s => s.id.startsWith('reflect-') && s.status === 'loading');
      if (prevReflect) {
        prevReflect.status = 'success';
      }
      
      // Add new reflection step
      steps.push({
        id: `reflect-${iter}`,
        label: `Réflexion et planification (Itération #${iter})`,
        status: 'loading'
      });
    }

    // Search Value tool call
    if (log.includes('[APPEL OUTIL] mcp_search_value')) {
      // Mark reflection step as success since it made a decision
      const prevRef = steps.find(s => s.id.startsWith('reflect-') && s.status === 'loading');
      if (prevRef) prevRef.status = 'success';

      const termMatch = log.match(/term['"]?:\s*['"](.*?)['"]/);
      const term = termMatch ? termMatch[1] : '';
      steps.push({
        id: `tool-search-${i}`,
        label: `Recherche de la valeur "${term}"`,
        status: 'loading'
      });
      lastSearchIdx = steps.length - 1;
    }
    if (log.includes('[OUTIL SUCCÈS] mcp_search_value') || log.includes('[OUTIL ERREUR] mcp_search_value')) {
      if (lastSearchIdx !== -1) {
        const isSuccess = log.includes('[OUTIL SUCCÈS]');
        steps[lastSearchIdx].status = isSuccess ? 'success' : 'error';
        steps[lastSearchIdx].detail = isSuccess ? 'Valeur sémantique localisée dans la base' : 'Erreur lors de la recherche';
      }
    }

    // Get Schema tool call
    if (log.includes('[APPEL OUTIL] mcp_get_schema')) {
      const prevRef = steps.find(s => s.id.startsWith('reflect-') && s.status === 'loading');
      if (prevRef) prevRef.status = 'success';

      const tableMatch = log.match(/table_name['"]?:\s*['"](.*?)['"]/);
      const table = tableMatch ? tableMatch[1] : '';
      steps.push({
        id: `tool-schema-${i}`,
        label: `Analyse des relations de la table "${table}"`,
        status: 'loading'
      });
      lastSchemaIdx = steps.length - 1;
    }
    if (log.includes('[OUTIL SUCCÈS] mcp_get_schema') || log.includes('[OUTIL ERREUR] mcp_get_schema')) {
      if (lastSchemaIdx !== -1) {
        const isSuccess = log.includes('[OUTIL SUCCÈS]');
        steps[lastSchemaIdx].status = isSuccess ? 'success' : 'error';
        steps[lastSchemaIdx].detail = isSuccess ? 'Schéma et clés étrangères chargés' : 'Erreur de chargement du schéma';
      }
    }

    // Get Sample Data tool call
    if (log.includes('[APPEL OUTIL] mcp_get_sample_data')) {
      const prevRef = steps.find(s => s.id.startsWith('reflect-') && s.status === 'loading');
      if (prevRef) prevRef.status = 'success';

      const tableMatch = log.match(/table_name['"]?:\s*['"](.*?)['"]/);
      const table = tableMatch ? tableMatch[1] : '';
      steps.push({
        id: `tool-sample-${i}`,
        label: `Chargement d'exemples pour "${table}"`,
        status: 'loading'
      });
      lastSampleIdx = steps.length - 1;
    }
    if (log.includes('[OUTIL SUCCÈS] mcp_get_sample_data') || log.includes('[OUTIL ERREUR] mcp_get_sample_data')) {
      if (lastSampleIdx !== -1) {
        const isSuccess = log.includes('[OUTIL SUCCÈS]');
        steps[lastSampleIdx].status = isSuccess ? 'success' : 'error';
        steps[lastSampleIdx].detail = isSuccess ? 'Lignes d\'exemples récupérées' : 'Erreur lors de la lecture des lignes';
      }
    }

    // Dry Run (Explain) tool call
    if (log.includes('[APPEL OUTIL] mcp_dry_run_query')) {
      const prevRef = steps.find(s => s.id.startsWith('reflect-') && s.status === 'loading');
      if (prevRef) prevRef.status = 'success';

      steps.push({
        id: `tool-dryrun-${i}`,
        label: "Validation de la syntaxe par EXPLAIN",
        status: 'loading'
      });
      lastDryRunIdx = steps.length - 1;
    }
    if (log.includes('[OUTIL SUCCÈS] mcp_dry_run_query') || log.includes('[OUTIL ERREUR] mcp_dry_run_query')) {
      if (lastDryRunIdx !== -1) {
        const isSuccess = log.includes('[OUTIL SUCCÈS]');
        steps[lastDryRunIdx].status = isSuccess ? 'success' : 'error';
        steps[lastDryRunIdx].detail = isSuccess ? 'Structure SQL validée par PostgreSQL' : 'Correction de syntaxe requise';
      }
    }

    // Finalize
    if (log.includes('[FIN] Finalisation')) {
      // Mark any loading reflection as success
      const prevRef = steps.find(s => s.id.startsWith('reflect-') && s.status === 'loading');
      if (prevRef) prevRef.status = 'success';

      steps.push({
        id: 'finalize',
        label: "Finalisation du SQL & Nettoyage Regex",
        status: 'success',
        detail: 'Requête finalisée'
      });
    }

    // Execution
    if (log.includes('Exécution finale sur PostgreSQL...')) {
      steps.push({
        id: 'exec',
        label: "Exécution physique sur la base de données",
        status: 'loading'
      });
      lastExecIdx = steps.length - 1;
    }
    if (log.includes('Exécution finale réussie')) {
      if (lastExecIdx !== -1) {
        steps[lastExecIdx].status = 'success';
        const rowsMatch = log.match(/: (\d+) ligne/);
        const rows = rowsMatch ? rowsMatch[1] : '0';
        steps[lastExecIdx].detail = `${rows} ligne(s) retournée(s)`;
      }
    }
    if (log.includes('[ERROR] Échec de l\'exécution final')) {
      if (lastExecIdx !== -1) {
        steps[lastExecIdx].status = 'error';
        steps[lastExecIdx].detail = 'Erreur lors de l\'exécution SQL';
      }
    }
  }

  return steps;
}
