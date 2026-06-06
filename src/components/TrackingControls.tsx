interface TrackingControlsProps {
  disabled?: boolean;
  trackingLoading?: boolean;
  hasBaseline?: boolean;
  onStartTracking?: () => void;
  trackingError?: string | null;
}

export function TrackingControls({
  disabled = false,
  trackingLoading = false,
  hasBaseline = false,
  onStartTracking,
  trackingError,
}: TrackingControlsProps) {
  const busy = disabled || trackingLoading;

  return (
    <section className="controls" aria-label="Redline tracking controls">
      <button
        type="button"
        className="btn btn--primary"
        disabled={busy}
        onClick={onStartTracking}
      >
        {trackingLoading ? 'Capturing baseline…' : 'Start Tracking'}
      </button>
      <button type="button" className="btn" disabled={busy || !hasBaseline}>
        Show Redline
      </button>
      <button type="button" className="btn" disabled={busy || !hasBaseline}>
        Accept All
      </button>
      <button type="button" className="btn btn--secondary" disabled={busy}>
        Open Editor Mode
      </button>
      {disabled && (
        <p className="controls__hint">Controls activate in compose mode (Stages 3–6).</p>
      )}
      {!disabled && !hasBaseline && (
        <p className="controls__hint">Start Tracking to capture a baseline before showing redlines.</p>
      )}
      {trackingError && <p className="controls__error">{trackingError}</p>}
    </section>
  );
}
