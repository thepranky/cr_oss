import { useCallback, useState } from 'react';
import { TrackingControls } from './components/TrackingControls';
import { TrackChangesEditor } from './components/TrackChangesEditor';
import { useEditorRegion } from './hooks/useEditorRegion';
import { useTracking } from './hooks/useTracking';
import { getMailContext } from './outlook';
import './App.css';

interface AppProps {
  initError?: string;
}

function App({ initError }: AppProps) {
  const mailContext = initError ? 'unavailable' : getMailContext();
  const controlsEnabled = mailContext === 'compose';
  const { bringSelectionToEditor } = useEditorRegion();
  const {
    snapshot,
    redlineInserted,
    loadingAction,
    error,
    startTracking,
    stopTracking,
    showRedline,
  } = useTracking();

  const [editorLoad, setEditorLoad] = useState({ id: 0, html: '' });
  const [bringing, setBringing] = useState(false);

  const handleBringToEditor = useCallback(async () => {
    setBringing(true);

    try {
      const payload = await bringSelectionToEditor();
      setEditorLoad((prev) => ({ id: prev.id + 1, html: payload.html }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(message);
    } finally {
      setBringing(false);
    }
  }, [bringSelectionToEditor]);

  const handleEditorClearRegion = useCallback(() => {
    setEditorLoad({ id: 0, html: '' });
  }, []);

  return (
    <main className="app">
      <header className="app-header">
        <h1 className="app-header__title">Cr_oss</h1>
        <p className="app-header__subtitle">Track changes in Outlook</p>
      </header>

      <section className="panel">
        <h2 className="panel__heading">Draft</h2>
        <TrackingControls
          disabled={!controlsEnabled}
          initError={initError}
          loadingAction={loadingAction}
          isTracking={snapshot !== null && !redlineInserted}
          canInsertRedline={snapshot !== null && !redlineInserted}
          onStartTracking={() => void startTracking()}
          onStopTracking={stopTracking}
          onShowRedline={() => void showRedline()}
          trackingError={error}
        />
      </section>

      <TrackChangesEditor
        key={`editor-${editorLoad.id}`}
        composeEnabled={controlsEnabled}
        bringingToEditor={bringing}
        onBringToEditor={handleBringToEditor}
        onClearRegion={handleEditorClearRegion}
        initialHtml={editorLoad.html}
      />
    </main>
  );
}

export default App;
