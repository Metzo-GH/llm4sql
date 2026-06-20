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
