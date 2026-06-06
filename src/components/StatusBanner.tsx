import type { HostInfo, MailContext } from '../outlook';
import type { TrackingSnapshot } from '../redline/types';

interface StatusBannerProps {
  hostInfo: HostInfo | null;
  mailContext: MailContext;
  initError?: string;
  tracking?: TrackingSnapshot | null;
}

function formatTrackingStatus(snapshot: TrackingSnapshot): string {
  const count = snapshot.baselineText.length;
  const time = new Date(snapshot.capturedAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
  const scopeLabel = snapshot.scope === 'selection' ? 'selection' : 'full body';
  return `Tracking ${count} characters since ${time} (${scopeLabel})`;
}

function formatHost(host: Office.HostType | null): string {
  if (host === Office.HostType.Outlook) return 'Outlook';
  if (host === null) return 'Unknown host';
  return String(host);
}

function formatPlatform(platform: Office.PlatformType | null): string {
  if (platform === null) return 'Unknown platform';
  switch (platform) {
    case Office.PlatformType.PC:
      return 'Windows';
    case Office.PlatformType.Mac:
      return 'Mac';
    case Office.PlatformType.OfficeOnline:
      return 'Outlook on the web';
    case Office.PlatformType.iOS:
      return 'iOS';
    case Office.PlatformType.Android:
      return 'Android';
    default:
      return String(platform);
  }
}

function contextMessage(mailContext: MailContext): { tone: 'ok' | 'warn' | 'error'; text: string } {
  switch (mailContext) {
    case 'compose':
      return { tone: 'ok', text: 'Compose draft detected — redline controls will apply here.' };
    case 'read':
      return {
        tone: 'warn',
        text: 'Read mode detected. Open a new email or reply draft to use redlines.',
      };
    default:
      return {
        tone: 'warn',
        text: 'Not inside an Outlook message item (browser preview or unsupported context).',
      };
  }
}

export function StatusBanner({ hostInfo, mailContext, initError, tracking }: StatusBannerProps) {
  if (initError) {
    return (
      <section className="status-banner status-banner--error" role="status">
        <p className="status-banner__title">Add-in failed to initialize</p>
        <p className="status-banner__detail">{initError}</p>
      </section>
    );
  }

  const context = contextMessage(mailContext);
  const isOutlook = hostInfo?.host === Office.HostType.Outlook;
  const trackingActive = mailContext === 'compose' && tracking !== null && tracking !== undefined;

  return (
    <section
      className={`status-banner status-banner--${trackingActive ? 'ok' : context.tone}`}
      role="status"
      aria-live="polite"
    >
      <p className="status-banner__title">
        {trackingActive ? 'Tracking active' : isOutlook ? 'Add-in ready' : 'Add-in loaded'}
      </p>
      {trackingActive && tracking && (
        <p className="status-banner__detail status-banner__detail--strong">
          {formatTrackingStatus(tracking)}
        </p>
      )}
      {hostInfo && (
        <p className="status-banner__detail">
          {formatHost(hostInfo.host)} · {formatPlatform(hostInfo.platform)}
        </p>
      )}
      {!trackingActive && <p className="status-banner__detail">{context.text}</p>}
    </section>
  );
}
