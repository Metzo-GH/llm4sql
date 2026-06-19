import type { ParsedStep } from '../types/chat';

/**
 * Extracts structured steps from the stream of backend logs.
 * 
 * @param logs - Array of raw log strings from the backend.
 * @returns Array of ParsedStep objects indicating the progression of the LangGraph agent.
 */
export function parseLiveLogsToSteps(logs: string[]): ParsedStep[] {
  const steps: ParsedStep[] = [
    { id: 'init', label: 'Lancement du moteur LangGraph', status: 'pending' },
    { id: 'tables', label: 'Sélection des tables requises', status: 'pending' },
    { id: 'sql', label: 'Génération de la requête SQL', status: 'pending' },
    { id: 'execution', label: 'Exécution sur PostgreSQL', status: 'pending' },
  ];

  if (logs.length === 0) {
    return steps;
  }

  // 1. Init Step
  const hasInit = logs.some(log => log.includes('[DEBUT AGENT]') || log.includes('[CACHE HIT]'));
  if (hasInit) {
    steps[0].status = 'success';
    const cacheHit = logs.some(log => log.includes('[CACHE HIT]'));
    if (cacheHit) {
      steps[0].detail = 'Récupéré du cache sémantique local';
      steps[0].elapsed = '0ms';
      steps[1].status = 'success';
      steps[1].detail = 'Tables chargées du cache';
      steps[2].status = 'success';
      steps[2].detail = 'SQL chargé du cache';
      steps[3].status = 'success';
      steps[3].detail = 'Résultats chargés du cache';
      return steps;
    } else {
      steps[0].detail = 'Moteur LangGraph démarré';
    }
  } else {
    steps[0].status = 'loading';
    steps[0].detail = 'Démarrage du workflow...';
  }

  // 2. Tables selection step
  const selectTablesStartIndex = logs.findIndex(log => log.includes('[ETAPE 0 - SELECTION TABLES]'));
  if (selectTablesStartIndex !== -1) {
    if (steps[0].status === 'loading') {
      steps[0].status = 'success';
      steps[0].detail = 'Moteur LangGraph démarré';
    }
    steps[1].status = 'loading';
    steps[1].detail = 'Identification des tables requises...';
    
    const selectTablesSuccessLog = logs.find(log => log.includes('[OK] Tables sélectionnées'));
    if (selectTablesSuccessLog) {
      steps[1].status = 'success';
      const elapsedMatch = selectTablesSuccessLog.match(/en ([\d.]+)s/);
      const tablesMatch = selectTablesSuccessLog.match(/: \[(.*?)\]/);
      const elapsed = elapsedMatch ? `${elapsedMatch[1]}s` : '';
      const tables = tablesMatch ? tablesMatch[1].replace(/['"\s]/g, '').split(',') : [];
      steps[1].elapsed = elapsed;
      steps[1].detail = `Tables ciblées : ${tables.length > 0 && tables[0] !== '' ? tables.join(', ') : 'aucune'}`;
    }
  }

  // 3. SQL Generation step
  const sqlGenLogs = logs.filter(log => log.includes('[ETAPE 1 - GENERATION SQL]'));
  if (sqlGenLogs.length > 0) {
    if (steps[1].status !== 'success') {
      steps[1].status = 'success';
      steps[1].detail = 'Tables ciblées avec succès';
    }
    
    steps[2].status = 'loading';
    const lastLog = sqlGenLogs[sqlGenLogs.length - 1];
    const iterationMatch = lastLog.match(/Essai #(\d+)/);
    const iterationNum = iterationMatch ? parseInt(iterationMatch[1]) : 1;
    steps[2].iteration = iterationNum;
    steps[2].detail = `Réflexion du LLM (essai #${iterationNum})...`;

    const sqlSuccessLog = logs.find(log => log.includes('[OK] SQL généré'));
    if (sqlSuccessLog) {
      steps[2].status = 'success';
      const elapsedMatch = sqlSuccessLog.match(/en ([\d.]+)s/);
      steps[2].elapsed = elapsedMatch ? `${elapsedMatch[1]}s` : '';
      steps[2].detail = `Requête SQL générée en ${steps[2].elapsed}`;
    }
  }

  // 4. Execution step
  const executionLogIndex = logs.findIndex(log => log.includes('[ETAPE 2 - EXECUTION SQL]'));
  if (executionLogIndex !== -1) {
    if (steps[2].status !== 'success') {
      steps[2].status = 'success';
    }
    steps[3].status = 'loading';
    steps[3].detail = 'Exécution de la requête sur PostgreSQL...';

    const execSuccessLog = logs.find(log => log.includes('Requete executee avec succes'));
    const execErrorLog = logs.find(log => log.includes('[ERROR] Echec de l\'execution') || log.includes('[ERROR] Alerte Securite'));

    if (execSuccessLog) {
      steps[3].status = 'success';
      const elapsedMatch = execSuccessLog.match(/en ([\d.]+)s/);
      const rowsMatch = execSuccessLog.match(/\((\d+) ligne/);
      steps[3].elapsed = elapsedMatch ? `${elapsedMatch[1]}s` : '';
      const rows = rowsMatch ? rowsMatch[1] : '0';
      steps[3].detail = `Requête exécutée avec succès (${rows} ligne(s) retournée(s))`;
    } else if (execErrorLog) {
      steps[3].status = 'error';
      steps[3].detail = execErrorLog.includes('Alerte Securite') 
        ? 'Alerte de Sécurité (Read-Only uniquement)' 
        : 'Échec de l\'exécution SQL';
    }
  }

  // Auto-correction warning log handling
  const hasAutoCorrection = logs.some(log => log.includes('[AUTO-CORRECTION]'));
  if (hasAutoCorrection) {
    const correctionLogs = logs.filter(log => log.includes('[AUTO-CORRECTION]'));
    const lastCorrLog = correctionLogs[correctionLogs.length - 1];
    const attemptMatch = lastCorrLog.match(/Tentative #(\d+)/);
    const attempt = attemptMatch ? attemptMatch[1] : '';
    steps[2].status = 'loading';
    steps[2].detail = `Auto-correction en cours (essai #${attempt}/3)...`;
    steps[3].status = 'pending';
    steps[3].detail = undefined;
  }

  return steps;
}
