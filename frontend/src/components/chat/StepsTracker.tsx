import React from 'react';

interface Step {
  id: string;
  label: string;
  status: 'success' | 'loading' | 'error' | 'pending';
  elapsed?: string;
  detail?: string;
}

interface StepsTrackerProps {
  steps: Step[];
}

/**
 * Tracks agent progress and active nodes inside a checklist UI.
 */
export const StepsTracker: React.FC<StepsTrackerProps> = React.memo(({ steps }) => {
  return (
    <div className="message-steps-box">
      {steps.map((step) => {
        let statusIcon = null;
        let colorClass = 'var(--text-muted)';

        if (step.status === 'success') {
          statusIcon = (
            <span className="message-step-icon message-step-icon-success">
              ✓
            </span>
          );
          colorClass = 'var(--text-heading)';
        } else if (step.status === 'loading') {
          statusIcon = (
            <div className="message-step-icon-loading animate-spin" />
          );
          colorClass = 'var(--accent-primary)';
        } else if (step.status === 'error') {
          statusIcon = (
            <span className="message-step-icon message-step-icon-error">
              ✗
            </span>
          );
          colorClass = 'var(--accent-ruby)';
        } else {
          statusIcon = (
            <span className="message-step-icon message-step-icon-pending" />
          );
          colorClass = 'var(--text-muted)';
        }

        return (
          <div
            key={step.id}
            className={`message-step-row ${step.status === 'loading' ? 'message-step-row-loading' : ''}`}
            style={{
              opacity: step.status === 'pending' ? 0.4 : 1,
            }}
          >
            <div className="message-step-icon-wrapper">{statusIcon}</div>
            <div className="message-step-info">
              <div
                className="message-step-title-row"
                style={{ color: colorClass }}
              >
                <span>{step.label}</span>
                {step.elapsed && (
                  <span className="message-step-elapsed">
                    {step.elapsed}
                  </span>
                )}
              </div>
              {step.detail && (
                <div
                  className={`message-step-detail ${
                    step.id === 'tables' || step.id === 'execution' ? 'message-step-detail-mono' : ''
                  }`}
                >
                  {step.detail}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});
