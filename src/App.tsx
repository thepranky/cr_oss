import './App.css';

function App() {
  return (
    <main className="app">
      <header className="app-header">
        <h1>Outlook Redline</h1>
        <p className="subtitle">Privacy-first draft redlines for Outlook compose</p>
      </header>

      <section className="status-card">
        <p className="status-label">Stage 0 — scaffolding</p>
        <p>
          Dev server is running. Next: sideload <code>manifest.xml</code> and wire Office.js in
          Stage 1.
        </p>
      </section>
    </main>
  );
}

export default App;
