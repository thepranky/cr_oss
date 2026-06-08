type LoadingAction = 'start' | 'show' | null;

interface TrackingControlsProps {
  disabled?: boolean;
  loadingAction?: LoadingAction;
  isTracking?: boolean;
  canInsertRedline?: boolean;
  onStartTracking?: () => void;
  onStopTracking?: () => void;
  onShowRedline?: () => void;
  trackingError?: string | null;
  initError?: string;
}

export function TrackingControls({
  disabled = false,
  loadingAction = null,
  isTracking = false,
  canInsertRedline = false,
  onStartTracking,
  onStopTracking,
  onShowRedline,
  trackingError,
  initError,
}: TrackingControlsProps) {
  const trackingBusy = disabled || loadingAction !== null;
  const starting = loadingAction === 'start';

  return (
    <div className="controls" aria-label="Draft redline controls">
      {initError && <p className="controls__error">{initError}</p>}

      {isTracking || starting ? (
        <div className="controls__tracking-row">
          <div
            className={`status-pill controls__tracking-status ${starting ? 'status-pill--loading' : 'status-pill--tracking'}`}
            role="status"
            aria-live="polite"
          >
            {!starting && <span className="status-pill__dot" aria-hidden="true" />}
            {starting ? 'Capturing baseline…' : 'Tracking changes'}
          </div>
          <button
            type="button"
            className="btn btn--danger controls__stop-tracking"
            disabled={trackingBusy || Boolean(initError)}
            onClick={onStopTracking}
          >
            Stop Tracking
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={trackingBusy || Boolean(initError)}
          onClick={onStartTracking}
          aria-pressed={false}
        >
          Start tracking
        </button>
      )}

      <button
        type="button"
        className={`btn btn--block ${canInsertRedline ? 'btn--primary' : ''}`}
        disabled={trackingBusy || !canInsertRedline}
        onClick={onShowRedline}
      >
        {loadingAction === 'show' ? 'Inserting…' : 'Insert Redline'}
      </button>

      {disabled && !initError && (
        <p className="controls__hint">Open a compose draft to use these controls.</p>
      )}

      {trackingError && <p className="controls__error">{trackingError}</p>}
    </div>
  );
}
