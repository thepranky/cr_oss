import { useState } from 'react';
import { EditorMode } from './components/EditorMode';
import { StatusBanner } from './components/StatusBanner';
import { TrackingControls } from './components/TrackingControls';
import { useTracking } from './hooks/useTracking';
import { getMailContext, type HostInfo } from './outlook';
import './App.css';

type AppMode = 'compose' | 'editor';

interface AppProps {
  hostInfo: HostInfo | null;
  initError?: string;
}

function App({ hostInfo, initError }: AppProps) {
  const [mode, setMode] = useState<AppMode>('compose');
  const mailContext = initError ? 'unavailable' : getMailContext();
  const controlsEnabled = mailContext === 'compose';
  const {
    snapshot,
    loadingAction,
    error,
    statusMessage,
    startTracking,
    showRedline,
    acceptAll,
  } = useTracking();

  return (
    <main className={`app ${mode === 'editor' ? 'app--editor' : ''}`}>
      <header className="app-header">
        <h1>Outlook Redline</h1>
        <p className="subtitle">
          {mode === 'editor'
            ? 'Editor mode — compare two versions locally'
            : 'Privacy-first draft redlines for Outlook compose'}
        </p>
      </header>

      {mode === 'compose' ? (
        <>
          <StatusBanner
            hostInfo={hostInfo}
            mailContext={mailContext}
            initError={initError}
            tracking={snapshot}
          />

          <TrackingControls
            disabled={!controlsEnabled}
            loadingAction={loadingAction}
            hasBaseline={snapshot !== null}
            onStartTracking={() => void startTracking()}
            onShowRedline={() => void showRedline()}
            onAcceptAll={() => void acceptAll()}
            onOpenEditorMode={() => setMode('editor')}
            trackingError={error}
            statusMessage={statusMessage}
          />
        </>
      ) : (
        <EditorMode composeEnabled={controlsEnabled} onBack={() => setMode('compose')} />
      )}
    </main>
  );
}

export default App;
