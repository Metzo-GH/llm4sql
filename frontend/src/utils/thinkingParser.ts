/**
 * Découpe la réflexion (balise think) de la réponse finale pour les LLM de raisonnement.
 * Supporte les itérations multiples en se basant sur le dernier bloc de réflexion.
 * 
 * @param content - Le contenu brut renvoyé par le LLM.
 * @returns Un objet contenant la réflexion (thinking) et la réponse finale (answer).
 */
export function parseThinking(content: string): { thinking: string; answer: string } {
  if (!content) return { thinking: '', answer: '' };
  
  const thinkStart = content.lastIndexOf('<think>');
  if (thinkStart === -1) {
    return { thinking: '', answer: content };
  }
  
  const thinkEnd = content.indexOf('</think>', thinkStart);
  if (thinkEnd === -1) {
    return {
      thinking: content.substring(thinkStart + 7).trim(),
      answer: ''
    };
  }
  
  return {
    thinking: content.substring(thinkStart + 7, thinkEnd).trim(),
    answer: content.substring(thinkEnd + 8).trim()
  };
}

/**
 * Extracts all thinking blocks from the content and formats them chronologically
 * as a continuous reasoning chain.
 * 
 * @param content - Raw content containing multiple <think>...</think> blocks.
 * @returns Formatted string of all thinking steps.
 */
export function parseAllThinking(content: string): string {
  if (!content) return '';
  
  const regex = /<think>([\s\S]*?)<\/think>/g;
  const matches = [...content.matchAll(regex)];
  const formattedBlocks: string[] = [];
  
  matches.forEach((match, idx) => {
    formattedBlocks.push(`[Réflexion #${idx + 1}]\n${match[1].trim()}`);
  });
  
  // Check if there is an unclosed think block at the very end
  const lastStart = content.lastIndexOf('<think>');
  if (lastStart !== -1) {
    const lastEnd = content.indexOf('</think>', lastStart);
    if (lastEnd === -1) {
      formattedBlocks.push(`[Réflexion #${matches.length + 1} (en cours...)]\n${content.substring(lastStart + 7).trim()}`);
    }
  }
  
  return formattedBlocks.join('\n\n');
}
