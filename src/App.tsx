import { BodyDebugControls } from './components/BodyDebugControls';
import { StatusBanner } from './components/StatusBanner';
import { TrackingControls } from './components/TrackingControls';
import { useTracking } from './hooks/useTracking';
import { getMailContext, type HostInfo } from './outlook';
import './App.css';

interface AppProps {
  hostInfo: HostInfo | null;
  initError?: string;
}

function App({ hostInfo, initError }: AppProps) {
  const mailContext = initError ? 'unavailable' : getMailContext();
  const controlsEnabled = mailContext === 'compose';
  const { snapshot, loading, error, startTracking } = useTracking();

  return (
    <main className="app">
      <header className="app-header">
        <h1>Outlook Redline</h1>
        <p className="subtitle">Privacy-first draft redlines for Outlook compose</p>
      </header>

      <StatusBanner
        hostInfo={hostInfo}
        mailContext={mailContext}
        initError={initError}
        tracking={snapshot}
      />

      <TrackingControls
        disabled={!controlsEnabled}
        trackingLoading={loading}
        hasBaseline={snapshot !== null}
        onStartTracking={() => void startTracking()}
        trackingError={error}
      />

      <BodyDebugControls disabled={!controlsEnabled} />
    </main>
  );
}

export default App;
