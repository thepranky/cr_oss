type LoadingAction = 'start' | 'show' | 'accept' | null;

interface TrackingControlsProps {
  disabled?: boolean;
  loadingAction?: LoadingAction;
  hasBaseline?: boolean;
  onStartTracking?: () => void;
  onShowRedline?: () => void;
  onAcceptAll?: () => void;
  onOpenEditorMode?: () => void;
  trackingError?: string | null;
  statusMessage?: string | null;
}

export function TrackingControls({
  disabled = false,
  loadingAction = null,
  hasBaseline = false,
  onStartTracking,
  onShowRedline,
  onAcceptAll,
  onOpenEditorMode,
  trackingError,
  statusMessage,
}: TrackingControlsProps) {
  const trackingBusy = disabled || loadingAction !== null;

  return (
    <section className="controls" aria-label="Redline tracking controls">
      <button
        type="button"
        className="btn btn--primary"
        disabled={trackingBusy}
        onClick={onStartTracking}
      >
        {loadingAction === 'start' ? 'Capturing baseline…' : 'Start Tracking'}
      </button>
      <button
        type="button"
        className="btn"
        disabled={trackingBusy || !hasBaseline}
        onClick={onShowRedline}
      >
        {loadingAction === 'show' ? 'Building redline…' : 'Show Redline'}
      </button>
      <button
        type="button"
        className="btn"
        disabled={trackingBusy || !hasBaseline}
        onClick={onAcceptAll}
      >
        {loadingAction === 'accept' ? 'Applying changes…' : 'Accept All'}
      </button>
      <button
        type="button"
        className="btn btn--secondary"
        disabled={loadingAction !== null}
        onClick={onOpenEditorMode}
      >
        Open Editor Mode
      </button>
      {disabled && (
        <p className="controls__hint">Open a compose draft to use redline controls.</p>
      )}
      {!disabled && !hasBaseline && (
        <p className="controls__hint">
          Click Start Tracking to snapshot the draft (or selection) as your baseline.
        </p>
      )}
      {statusMessage && <p className="controls__info">{statusMessage}</p>}
      {trackingError && <p className="controls__error">{trackingError}</p>}
    </section>
  );
}
