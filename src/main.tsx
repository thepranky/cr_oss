import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './App.css';
import { officeReady } from './outlook/officeReady';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

const root = createRoot(rootElement);

root.render(
  <main className="app app--loading">
    <p>Loading Office.js…</p>
  </main>,
);

officeReady()
  .then((hostInfo) => {
    root.render(
      <StrictMode>
        <App hostInfo={hostInfo} />
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    root.render(
      <StrictMode>
        <App hostInfo={null} initError={message} />
      </StrictMode>,
    );
  });
