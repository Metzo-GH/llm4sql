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

  const renderThinkingContent = () => {
    if (!thinkingText) return null;

    if (thinkingText.includes('[Réflexion #')) {
      const blocks = thinkingText.split(/\[Réflexion\s*#/g).filter(Boolean);
      return (
        <div className="message-thinking-chain">
          {blocks.map((block, idx) => {
            const closingBracketIdx = block.indexOf(']');
            if (closingBracketIdx === -1) {
              return (
                <div key={idx} className="message-thinking-block animate-fade-in">
                  <div className="message-thinking-block-title">💡 Réflexion #{idx + 1}</div>
                  <div className="message-thinking-block-text">{block.trim()}</div>
                </div>
              );
            }
            const titlePart = block.substring(0, closingBracketIdx).trim();
            const textPart = block.substring(closingBracketIdx + 1).trim();
            return (
              <div key={idx} className="message-thinking-block animate-fade-in">
                <div className="message-thinking-block-title">
                  💡 Réflexion #{titlePart}
                </div>
                <div className="message-thinking-block-text">
                  {textPart}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    return <div className="message-thinking-block-text">{thinkingText}</div>;
  };

  return (
    <details
      className="message-thinking-details"
      open={isThinkingOpen}
      onToggle={(e) => onToggle((e.target as HTMLDetailsElement).open)}
    >
      <summary className="message-thinking-summary select-none text-purple-glow">
        <span>💡 Chaîne de Réflexion ({modelName || 'Raisonnement'})</span>
      </summary>
      <div ref={thinkingRef} className="message-thinking-body">
        {renderThinkingContent()}
      </div>
    </details>
  );
});
