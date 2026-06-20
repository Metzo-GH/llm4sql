import React, { useRef, useEffect } from 'react';

interface ThinkingAccordionProps {
  thinkingText: string;
  isThinkingOpen: boolean;
  onToggle: (open: boolean) => void;
  isLoading: boolean;
  modelName?: string;
}

/**
 * Collapsible section displaying LLM text reasoning processes in real-time.
 */
export const ThinkingAccordion: React.FC<ThinkingAccordionProps> = React.memo(({
  thinkingText,
  isThinkingOpen,
  onToggle,
  isLoading,
  modelName
}) => {
  const thinkingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isLoading && thinkingRef.current) {
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
    }
  }, [thinkingText, isLoading]);

  return (
    <details
      className="message-thinking-details"
      open={isThinkingOpen}
      onToggle={(e) => onToggle((e.target as HTMLDetailsElement).open)}
    >
      <summary className="message-thinking-summary select-none text-purple-glow">
        <span>💡 Réflexion du modèle ({modelName || 'Raisonnement'})</span>
      </summary>
      <div ref={thinkingRef} className="message-thinking-body">
        {thinkingText}
      </div>
    </details>
  );
});
