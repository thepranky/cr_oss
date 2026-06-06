# Outlook Redline Add-in

Privacy-first Outlook compose add-in that creates Word-style visual redlines in email drafts — deletions in red strikethrough, additions in blue underline. No backend, no login, no analytics.

See [project-plan.md](./project-plan.md) for architecture, staged implementation, and learning notes.

## Prerequisites

- **Node.js** 20+ and npm
- **Outlook** with compose support (Outlook on the web, new Outlook, or classic desktop)
- Ability to sideload a custom add-in manifest

## Quick start

```bash
npm install
node scripts/generate-icons.mjs   # creates public/assets/icon-*.png
npm run dev
```

The dev server runs at **https://localhost:5173** with a self-signed certificate (via `@vitejs/plugin-basic-ssl`). Your browser or Outlook may warn about the cert once — that is expected for local development.

Verify locally: open https://localhost:5173 and accept the certificate warning if prompted.

## Sideload into Outlook

### Outlook on the web

1. Start the dev server (`npm run dev`).
2. Open [Outlook on the web](https://outlook.office.com) and start a **new email**.
3. Click **Apps** (or **Get Add-ins**) → **My add-ins** → **Custom add-ins** → **Add from file**.
4. Select `manifest.xml` from this repo.
5. In the compose ribbon, open the **Redline** group and click **Redline** to show the task pane.

### New Outlook (Windows / Mac)

1. Start the dev server.
2. **Settings** → **Manage add-ins** (or **Get Add-ins**).
3. **My add-ins** → **Custom add-ins** → **Add from file** → choose `manifest.xml`.
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

## Optional: trusted local HTTPS (mkcert)

The default self-signed cert works for sideloading but may show warnings. For locally trusted certs:

```bash
brew install mkcert
mkcert -install
./scripts/generate-certs.sh
```

Then point Vite's `server.https` at the generated `.certs/` files (see comment in `vite.config.ts`).

## Validate the manifest

Use Microsoft's [Office Add-in Validator](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/troubleshoot-manifest) or the [Office Add-in Manifest Editor](https://manifesteditor.azurewebsites.net/) to check `manifest.xml` before sideloading.

## Project status

- [x] **Stage 0** — scaffolding (Vite, React, TypeScript, HTTPS, manifest, icons)
- [ ] **Stage 1** — Office.js bootstrap and task pane shell
- [ ] **Stage 2** — read/write compose body
- [ ] …see [project-plan.md](./project-plan.md)

## License

Open-source weekend project — add a license file before public release if desired.
