/**
 * Calculates the effective context limit based on contextSize and loadedModelStatus.
 * Fallback to 2048 if no information is available.
 * 
 * @param contextSize - Chosen context size or 0 for default.
 * @param modelContextLength - Model's native context length.
 * @returns The calculated limit.
 */
export function getEffectiveContextLimit(
  contextSize?: number,
  modelContextLength?: number
): number {
  if (contextSize && contextSize > 0) {
    return contextSize;
  }
  if (modelContextLength && modelContextLength > 0) {
    return modelContextLength;
  }
  return 2048;
}
