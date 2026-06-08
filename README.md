# Cr_oss — Track Changes for Outlook

Privacy-first Outlook compose add-in that brings Word-style track changes to email drafts. Deletions appear as red strikethrough, insertions as blue underline. No backend, no login, no analytics — everything runs locally in the task pane.

## Features

**Draft redline** — snapshot the compose body (or a selection), edit freely, then insert a formatted redline showing exactly what changed. Formatting and styling of the original email are preserved.

**Live editor** — bring a selection into the built-in editor and see track changes update in real time as you type. Copy the redlined output to paste anywhere in the draft.

**Word paste support** — pasting from Microsoft Word preserves existing revision markup (ins/del) from OOXML. Plain HTML and text pastes are sanitized of Word-specific noise.

## Two workflows

### 1. Draft redline (Start Tracking → Insert Redline)

1. Optionally select text in the compose window (otherwise the full body is used).
2. Click **Start tracking** — the add-in snapshots the current content.
3. Edit the draft normally.
4. Click **Insert Redline** — the add-in diffs baseline vs. current and writes the styled result back into the compose body.

### 2. Live editor (Bring to editor / paste)

1. Select text in the compose window and click **Bring to editor**, or paste directly into the editor box.
2. Track Changes turns on automatically. Every edit you make is shown live in redline style.
3. Click **Copy** to copy the redlined HTML to the clipboard, then paste it wherever you want in the draft.

## Prerequisites

- **Node.js** 20+ and npm
- **Outlook** with compose support (Outlook on the web, new Outlook, or classic desktop)
- Ability to sideload a custom add-in manifest

## Quick start

```bash
npm install
npm run dev
```

The dev server runs at **https://localhost:5173**.

### Outlook for Mac (one-time setup)

Outlook on Mac uses Safari's WebKit engine, which blocks self-signed certificates. Use locally-trusted certs via [mkcert](https://github.com/FiloSottile/mkcert):

```bash
brew install mkcert
mkcert -install          # prompts for your Mac password — adds a local CA to Keychain
npm run certs            # writes trusted certs to .certs/
npm run dev              # restart if already running
```

Verify in Safari: open https://localhost:5173 — it should load without a certificate warning.

## Sideload into Outlook

### Outlook on the web

1. Start the dev server (`npm run dev`).
2. Open [Outlook on the web](https://outlook.office.com) and start a **new email**.
3. Click **Apps** (or **Get Add-ins**) → **My add-ins** → **Custom add-ins** → **Add from file**.
4. Select `manifest.xml` from this repo.
5. In the compose ribbon, open the **Redline** group and click **Redline** to open the task pane.

### New Outlook (Windows / Mac)

1. Start the dev server.
2. Go to **Settings** → **Manage add-ins**.
3. **My add-ins** → **Custom add-ins** → **Add from file** → select `manifest.xml`.
4. Compose a new message and open the add-in from the ribbon.

### Classic Outlook desktop

1. Start the dev server.
2. **Get Add-ins** → **My Add-ins** → **Add a custom add-in** → **Add from file**.
3. Select `manifest.xml`.

> **Tip:** If the task pane is blank, confirm the dev server is running and that you have trusted https://localhost:5173 in your browser first.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | HTTPS dev server on port 5173 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build |
| `npm test` | Run Vitest unit tests |
| `npm run lint` | ESLint |
| `npm run certs` | Generate locally-trusted dev certs via mkcert |

## HTTPS in development

Vite auto-uses `.certs/localhost.pem` when present (see `vite.config.ts`); otherwise it falls back to a self-signed cert via `@vitejs/plugin-basic-ssl`. The fallback works in browsers you can click through but **not in Outlook for Mac** — use mkcert there (see above).

## Architecture

```
src/
  outlook/        Office.js wrappers (body I/O, selection, context detection)
  redline/        Diff engine and HTML rendering
    diff.ts         Word-level diff with char-level refinement
    htmlBlocks.ts   Block-aligned redline preserving paragraph/list structure
    htmlPlainMap.ts HTML ↔ plain-text index map for formatting-preserving render
    editorRedline.ts Live editor diff (baseline snapshot → styled output)
    workflow.ts     High-level redline entry points for both workflows
  components/     React UI components and contenteditable utilities
  hooks/          useTracking (draft workflow), useEditorRegion (bring-to-editor)
  utils/          Clipboard helpers
```

Key design decisions:

- **Format preservation** — the diff runs on plain text extracted from HTML, but the rendered output slices HTML segments from the original so inline styles, fonts, and bold/italic survive.
- **Block alignment** — paragraphs and list items are diffed as units so redline spans never cross block boundaries, keeping the output valid for email clients.
- **No DOM mutation of the compose body** — all transformations happen on the HTML string before writing it back via `body.setAsync`.

## Validate the manifest

Use Microsoft's [Office Add-in Validator](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/troubleshoot-manifest) or the [Manifest Editor](https://manifesteditor.azurewebsites.net/) to check `manifest.xml` before sideloading.

## License

MIT
