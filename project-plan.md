# Outlook Redline Add-in — Project Plan

> **Status:** Planning complete, implementation not started  
> **Last updated:** 2026-06-06  
> **Goal:** A privacy-first, sideloadable Outlook compose add-in that renders Word-style visual redlines (deletions in red strikethrough, additions in blue underline) inside email drafts using email-safe HTML — with no backend and no data leaving the client.

---

## Table of Contents

1. [What We Are Building](#1-what-we-are-building)
2. [MVP Scope — Does and Does Not Do](#2-mvp-scope--does-and-does-not-do)
3. [Recommended Tech Stack](#3-recommended-tech-stack)
4. [Main Architecture](#4-main-architecture)
5. [File and Folder Structure](#5-file-and-folder-structure)
6. [Staged Implementation Plan](#6-staged-implementation-plan)
7. [Key Office.js Concepts](#7-key-officejs-concepts)
8. [Key Diff and Redline Concepts](#8-key-diff-and-redline-concepts)
9. [Testing Strategy](#9-testing-strategy)
10. [Known Limitations and Future Improvements](#10-known-limitations-and-future-improvements)
11. [Acceptance Criteria Checklist (v1)](#11-acceptance-criteria-checklist-v1)
12. [Implementation Notes and Learning Log](#12-implementation-notes-and-learning-log)

---

## 1. What We Are Building

### Problem

Outlook compose windows do not offer native **Track Changes** like Microsoft Word. When collaborators edit draft emails, there is no built-in way to show *what changed* in a familiar redline format before sending.

### Solution

A **task-pane Outlook add-in** that:

1. Lets the user click **Start Tracking** to snapshot the current email body (or selected text) as a **baseline**.
2. Lets the user edit the draft normally in Outlook.
3. On **Show Redline**, compares baseline vs current content and **replaces the draft body** with styled HTML redlines.
4. Offers **Accept All** to collapse the redline view into the clean revised text (no markup).
5. Provides an **in-add-in editor mode** for paste/import → edit → generate redline → insert into the Outlook draft.

### Core UX Flow (Compose)

```
┌─────────────────────────────────────────────────────────────┐
│  Outlook Compose Window                                      │
│  ┌──────────────────────────┐  ┌──────────────────────────┐ │
│  │  Email body (HTML)       │  │  Redline Task Pane       │ │
│  │                          │  │                          │ │
│  │  User edits here...      │  │  [Start Tracking]        │ │
│  │                          │  │  [Show Redline]          │ │
│  │                          │  │  [Accept All]            │ │
│  │                          │  │  [Open Editor Mode]      │ │
│  └──────────────────────────┘  └──────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Privacy Model

- **No backend.** All logic runs in the browser/Office runtime.
- **No login, no analytics.**
- Email content never leaves the user's machine except when they send the email themselves.
- Baseline snapshots are stored in **in-memory React state** (and optionally `Office.context.document.settings` for session persistence — v1 uses memory only unless we hit a clear UX need).

---

## 2. MVP Scope — Does and Does Not Do

### v1 DOES

| Feature | Description |
|---------|-------------|
| Sideloadable add-in | XML manifest, local HTTPS dev server, works in Outlook on the web and Outlook desktop (where supported) |
| Compose task pane | Opens from a compose message; buttons for tracking workflow |
| Start Tracking | Captures full body **or** selected text as baseline |
| Show Redline | Diff baseline vs current body; inject redline HTML into draft |
| Redline styling | Deletions: `<span style="color:red;text-decoration:line-through">` · Additions: `<span style="color:blue;text-decoration:underline">` |
| Accept All | Strip redline markup; keep revised plain/clean text in body |
| Editor mode | Separate pane view: paste/import text, edit in simple HTML editor, preview redline, insert into Outlook body |
| Word paste (best effort) | Preserve visible HTML from pasted Word content; do not parse OOXML revision metadata |
| Unit tests | Pure diff/render functions tested with Vitest |
| Modular code | Outlook integration separated from diff logic |

### v1 DOES NOT

| Out of scope | Reason |
|--------------|--------|
| AppSource publishing polish | Prefer working sideload MVP |
| Per-change accept/reject | Accept All only in v1 |
| Real-time/live redline overlay | Explicit button-triggered compare |
| Perfect Word `w:ins` / `w:del` metadata | Best-effort HTML only |
| Rich-text editor (TipTap, Quill, etc.) | Simple textarea / contenteditable first |
| Read-mode / received-mail redlines | Compose only |
| Multi-user collaboration sync | No backend |
| Mobile Outlook | Desktop + web compose focus |
| Undo/redo integration with Outlook | Rely on Outlook's native undo where possible |
| Persistent baseline across Outlook restarts | In-memory unless trivial to add via settings |
| Inline comments / balloons | Word-style inline spans only |

---

## 3. Recommended Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| UI framework | **React 18 + TypeScript** | Office add-in task panes are web apps; React is the most common pattern in Office samples |
| Bundler / dev server | **Vite** | Fast HMR, simple config, easy HTTPS for Office sideloading |
| Office integration | **Office.js** (CDN) | Required API for reading/writing Outlook compose body |
| Manifest | **XML Add-in Only manifest** | Simplest sideload path; no Microsoft 365 admin deployment needed for dev |
| Text diff | **diff** (npm `diff` package, aka jsdiff) | Battle-tested Myers diff; character- or word-level granularity |
| HTML parsing (minimal) | **DOM APIs** or tiny helper | Strip/normalize HTML for diff input; avoid heavy deps in v1 |
| Testing | **Vitest** | Same Vite toolchain; fast unit tests for pure functions |
| Linting | **ESLint + TypeScript ESLint** | Standard TS hygiene |
| Backend | **None** | Privacy-first, zero ops |

### Why NOT heavier choices (for v1)

- **No TipTap/ProseMirror:** Adds complexity before we prove the Outlook write path works.
- **No unified diff libraries with HTML awareness:** HTML diff is hard; v1 uses *text extraction → diff → re-wrap in spans* (see §8).
- **No webpack:** Vite is simpler for a greenfield weekend project.

---

## 4. Main Architecture

### Layer Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Task Pane UI (React)                     │
│  App.tsx · TrackingControls · EditorMode · StatusBanner     │
└──────────────────────────┬──────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
┌─────────────────┐ ┌──────────────┐ ┌─────────────────────┐
│ outlook/        │ │ redline/     │ │ state/              │
│ body.ts         │ │ diff.ts      │ │ trackingStore.ts    │
│ selection.ts    │ │ render.ts    │ │ (React context)     │
│ insert.ts       │ │ normalize.ts │ │                     │
└────────┬────────┘ └──────┬───────┘ └─────────────────────┘
         │                 │
         ▼                 ▼
   Office.js API      Pure functions (testable)
   (async, host)       (sync, no Office deps)
```

### Data Flow: Start Tracking → Show Redline

```
1. User clicks "Start Tracking"
   └─► outlook/body.getBody() or outlook/selection.getSelectedText()
       └─► normalize.ts → plain text + optional HTML snapshot stored in state

2. User edits email in Outlook (outside add-in)

3. User clicks "Show Redline"
   └─► outlook/body.getBody() → current text
   └─► redline/diff.ts → DiffPart[] (equal | insert | delete)
   └─► redline/render.ts → HTML string with styled spans
   └─► outlook/body.setBody(html, { coercionType: Html })

4. User clicks "Accept All"
   └─► redline/render.ts → acceptAll(html) → clean revised text
   └─► outlook/body.setBody(clean, { coercionType: Html or Text })
```

### Separation of Concerns

| Module | Responsibility | Office.js? |
|--------|----------------|------------|
| `src/outlook/` | Read/write body, selection, coercion types, error handling | Yes |
| `src/redline/` | Normalize text, run diff, render HTML, accept-all | No — pure TS |
| `src/components/` | Buttons, editor UI, status messages | Indirect via hooks |
| `src/hooks/` | Glue: call outlook + redline, manage loading/errors | Yes |

**Rule:** `src/redline/*` must never import `Office`. This keeps diff logic unit-testable and portable.

### Editor Mode Flow

```
User opens Editor Mode in task pane
  ├─► Paste/import text into local editor (contenteditable or textarea)
  ├─► "Set as Original" → baseline in local state
  ├─► Edit "Current" version in second field
  ├─► "Preview Redline" → redline/render (no Outlook call)
  └─► "Insert into Email" → outlook/body.setBody(previewHtml)
```

---

## 5. File and Folder Structure

```
cr_oss/
├── project-plan.md              # This document (living plan + learning log)
├── README.md                    # Quick start: install, dev, sideload
├── package.json
├── tsconfig.json
├── vite.config.ts               # HTTPS dev server for Office
├── vitest.config.ts
├── index.html                   # Task pane entry
├── manifest.xml                 # Outlook add-in manifest (sideload)
│
├── public/
│   └── assets/                  # Icons referenced by manifest (16,32,80px)
│
├── src/
│   ├── main.tsx                 # React bootstrap + Office.onReady
│   ├── App.tsx                  # Root layout, mode switch (compose vs editor)
│   ├── App.css                  # Minimal task-pane styles
│   │
│   ├── components/
│   │   ├── TrackingControls.tsx # Start Tracking, Show Redline, Accept All
│   │   ├── StatusBanner.tsx     # Errors, "tracking active" indicator
│   │   ├── EditorMode.tsx       # Import/paste, dual-pane editor, preview
│   │   └── RedlinePreview.tsx   # Read-only preview of generated HTML
│   │
│   ├── hooks/
│   │   ├── useTracking.ts       # Baseline state + tracking actions
│   │   └── useOutlookBody.ts    # Wrapper around get/set body with loading
│   │
│   ├── outlook/
│   │   ├── index.ts             # Re-exports
│   │   ├── body.ts              # getBodyHtml, setBodyHtml, getBodyText
│   │   ├── selection.ts         # getSelectedText (compose)
│   │   └── officeReady.ts       # Promise wrapper for Office.onReady
│   │
│   ├── redline/
│   │   ├── index.ts
│   │   ├── normalize.ts         # HTML → plain text for diffing
│   │   ├── diff.ts              # diffWords or diffChars wrapper
│   │   ├── render.ts            # DiffPart[] → HTML; acceptAll()
│   │   └── types.ts             # DiffPart, TrackingSnapshot, etc.
│   │
│   └── test/
│       ├── normalize.test.ts
│       ├── diff.test.ts
│       └── render.test.ts
│
└── scripts/
    └── generate-certs.sh        # Optional: mkcert for trusted local HTTPS
```

### Manifest Highlights (`manifest.xml`)

- **Extension point:** `MessageComposeCommandSurface` (button + task pane).
- **Source location:** `https://localhost:5173/index.html` (Vite default; adjust port in vite.config).
- **Permissions:** `ReadWriteItem` (required to replace compose body).
- **Form factor:** Desktop + web (`DesktopFormFactor`, `WebFormFactor`).

---

## 6. Staged Implementation Plan

Each stage ends with a **demo milestone** and a **learning note** added to §12.

### Stage 0 — Project Scaffolding

**Tasks:**
- Initialize Vite + React + TypeScript project
- Add ESLint, Vitest, `diff` package
- Configure Vite HTTPS (self-signed cert or `@vitejs/plugin-basic-ssl`)
- Create minimal `manifest.xml` with placeholder icons
- Add `README.md` with sideload instructions

**Milestone:** `npm run dev` serves HTTPS; manifest validates in [Office Add-in Validator](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/troubleshoot-manifest).

**Demonstrates:** Office add-ins are web apps served over HTTPS; the manifest is the deployment descriptor, not the code.

---

### Stage 1 — Office.js Bootstrap and Task Pane Shell

**Tasks:**
- Load Office.js from CDN in `index.html`
- `Office.onReady()` gate before rendering React
- Basic task pane UI: title, placeholder buttons, status area
- Wire manifest button → open task pane

**Milestone:** Sideload into Outlook compose; task pane opens and shows "Add-in ready".

**Demonstrates:** `Office.onReady`, manifest ↔ URL binding, compose vs read detection via `Office.context.mailbox.item`.

---

### Stage 2 — Read/Write Compose Body

**Tasks:**
- Implement `outlook/body.ts`:
  - `getBodyCoerced(coercionType: 'html' | 'text')`
  - `setBody(content, coercionType)`
- Use `Office.context.mailbox.item.body.getAsync` / `setAsync`
- Add "Read Body" / "Write Test HTML" debug buttons (remove or hide later)

**Milestone:** Button writes `<p>Hello <b>world</b></p>` into draft; user sees formatted HTML in compose.

**Demonstrates:** Async Office.js pattern (`getAsync`/`setAsync`), HTML coercion, compose-only APIs.

**Non-obvious decision:** Always use `Office.CoercionType.Html` when injecting redlines so styling survives in sent mail.

---

### Stage 3 — Selection and Start Tracking

**Tasks:**
- Implement `outlook/selection.ts` for selected text in compose body
- `useTracking` hook: store `{ baselineText, baselineHtml?, capturedAt, scope: 'full' | 'selection' }`
- **Start Tracking** button: prefer selection if non-empty, else full body
- Status banner: "Tracking N characters since …"

**Milestone:** Select paragraph → Start Tracking → edit elsewhere → baseline unchanged in add-in state.

**Demonstrates:** Selection API limits in Outlook (may differ web vs desktop); baseline is add-in state, not Outlook metadata.

---

### Stage 4 — Core Redline Engine (Pure Module)

**Tasks:**
- `normalize.ts`: strip tags → plain text; preserve paragraph breaks as `\n`
- `diff.ts`: `diffWordsWithSpace` (or `diffChars` for short text) → `DiffPart[]`
- `render.ts`: map parts to styled `<span>` elements; wrap in `<div>` or `<p>` as needed
- `acceptAll.ts`: walk rendered HTML or re-derive from diff — keep inserts, drop deletes
- Vitest coverage for known cases (see §9)

**Milestone:** Unit tests pass; no Outlook required to validate diff output.

**Demonstrates:** Separating *comparison* from *presentation*; word-level diff is more readable than char-level for prose.

**Non-obvious decision:** Diff plain text, not raw HTML tags — comparing HTML strings produces noisy, useless diffs.

---

### Stage 5 — Show Redline and Accept All (End-to-End)

**Tasks:**
- **Show Redline:** get current body text → diff vs baseline → render → setBody HTML
- **Accept All:** parse current body OR recompute from last diff → set clean body
- Remove debug buttons; polish `TrackingControls` UX
- Handle empty baseline, no changes detected

**Milestone:** Full compose workflow works: track → edit → redline → accept → send (verify recipient sees colors).

**Demonstrates:** End-to-end integration; redline HTML is what recipients see because Outlook sends HTML bodies as-is.

---

### Stage 6 — Editor Mode

**Tasks:**
- `EditorMode.tsx`: two text areas or contenteditable regions (Original / Current)
- Local baseline (independent of Outlook tracking state, or shared — start independent)
- Preview pane using `redline/render`
- **Insert into Email** calls `setBodyHtml`

**Milestone:** Paste two versions in editor → preview redline → insert into empty compose draft.

**Demonstrates:** Same redline engine works inside and outside Outlook read/write path.

---

### Stage 7 — Word Paste Best Effort

**Tasks:**
- On paste in editor mode, use `clipboardData.getData('text/html')` when available
- Strip Word-specific `<o:p>`, `mso-*` styles, conditional comments
- Keep semantic tags: `<b>`, `<i>`, `<p>`, `<ul>`, `<li>`
- Document limitations in UI tooltip

**Milestone:** Paste from Word → visible bold/lists preserved in editor; redline still operates on extracted text.

**Demonstrates:** v1 treats Word as an HTML clipboard source, not an OOXML revision document.

---

### Stage 8 — Hardening and README

**Tasks:**
- Error boundaries, user-friendly Office error messages
- Confirm behavior Outlook on the web vs new Outlook vs classic desktop
- Final README: prerequisites, `npm install`, `npm run dev`, sideload steps, troubleshooting
- Update §11 acceptance checklist and §12 learning log

**Milestone:** Another developer can clone, run, sideload, and complete the workflow without chat context.

---

## 7. Key Office.js Concepts

### 7.1 Add-in Types and Entry Points

- **Task pane add-in:** HTML page hosted at `SourceLocation`; opened from ribbon button defined in manifest.
- **Compose vs Read:** Our APIs (`item.body`, selection) require **compose** form. Guard with `item.itemType` and `item.displayReplyForm` checks.

### 7.2 Office.onReady

```typescript
Office.onReady((info) => {
  if (info.host === Office.HostType.Outlook) {
    // Safe to call mailbox APIs
  }
});
```

Host and platform (PC, Mac, OfficeOnline) may differ — log `info.platform` during dev.

### 7.3 Async Pattern

Nearly all Outlook body APIs are async:

```typescript
Office.context.mailbox.item.body.getAsync(
  Office.CoercionType.Html,
  (result) => {
    if (result.status === Office.AsyncResultStatus.Succeeded) {
      const html = result.value;
    }
  }
);
```

Wrap in Promises in `outlook/body.ts` for cleaner React hooks.

### 7.4 Coercion Types

| Type | Use case |
|------|----------|
| `Html` | Inject redline with colors and underline/strikethrough |
| `Text` | Baseline extraction when HTML is messy |
| `Html` read + normalize | Preferred path for Show Redline |

**Important:** Setting HTML replaces the entire body by default. There is no fine-grained DOM API for compose bodies — plan for full-body replacement.

### 7.5 Permissions

- `ReadWriteItem` — required to `setAsync` on body.
- `ReadItem` — insufficient for Show Redline.

### 7.6 Manifest and Sideloading

- **Sideload:** Insert manifest via Outlook → Get Add-ins → My Add-ins → Custom Add-ins → Add from file.
- **HTTPS required:** localhost with trusted or self-signed cert; browser/Office may show cert warnings.
- **Icon URLs** must be reachable from manifest paths.

### 7.7 Selection in Compose

- `Office.context.mailbox.item.getSelectedDataAsync(Office.CoercionType.Text, ...)` returns current selection.
- Selection support varies; always offer full-body fallback.
- After **Show Redline**, selection context is lost — acceptable for v1.

### 7.8 No Backend Implications

- No SSO, no Graph API, no `OfficeRuntime.storage` required for v1.
- Optional: `Office.context.document.settings` for small baseline persistence (size limits apply).

---

## 8. Key Diff and Redline Concepts

### 8.1 Why Plain Text Diff?

HTML-aware diff algorithms (e.g. diffing `<p>foo</p>` vs `<p>bar</p>`) treat tags as content and produce unreadable redlines. v1 pipeline:

```
HTML → normalize to plain text → diff → render spans → HTML output
```

Formatting from the *original* email may be lost in redline view — acceptable MVP tradeoff.

### 8.2 Diff Granularity

| Algorithm | Pros | Cons |
|-----------|------|------|
| `diffChars` | Finds tiny edits | Noisy on long prose |
| `diffWordsWithSpace` | Readable word-level | May miss intra-word typo granularity |
| `diffLines` | Fast on big docs | Too coarse for sentences |

**v1 default:** `diffWordsWithSpace` with fallback to `diffChars` for text under ~40 characters.

### 8.3 Diff Part Model

```typescript
type DiffOperation = 'equal' | 'insert' | 'delete';

interface DiffPart {
  op: DiffOperation;
  value: string;
}
```

Example: `"Hello world"` → `"Hello brave world"`

```
equal:   "Hello "
delete:  ""           // (none)
insert:  "brave "
equal:   "world"
```

Rendered: `Hello <span style="color:blue;text-decoration:underline">brave </span>world`

Deletion example: `"Hello world"` → `"Hello"`

```
equal:   "Hello "
delete:  "world"
```

Rendered: `Hello <span style="color:red;text-decoration:line-through">world</span>`

### 8.4 Rendering Email-Safe HTML

Use inline `style` attributes — many email clients strip `<style>` blocks and classes.

```html
<span style="color:red;text-decoration:line-through">deleted</span>
<span style="color:blue;text-decoration:underline">added</span>
```

Wrap in `<div>` or `<p>` to avoid Outlook compose stripping bare text nodes.

### 8.5 Accept All Semantics

**Accept All** = apply the proposed revision:

- Keep all `insert` and `equal` parts
- Discard all `delete` parts
- Result is the **new** version without markup

Implementation options (pick simplest that works):

1. **Re-diff path:** Store last baseline + fetch current body text → recompute diff → render clean (no delete spans, no insert styling).
2. **DOM strip path:** Parse current HTML, remove strikethrough spans, unwrap underline spans to plain text.

Prefer **re-diff path** for consistency.

### 8.6 Word Paste vs Word Track Changes

| Source | v1 behavior |
|--------|-------------|
| Word visual HTML (bold, lists) | Preserve via clipboard HTML sanitization |
| Word OOXML `<w:ins>` / `<w:del>` | Not parsed; paste may flatten to visible text |
| Word "Track Changes" bubbles | Not supported |

### 8.7 Edge Cases to Handle

- **Whitespace-only changes:** Collapse or show explicitly — document behavior in tests.
- **HTML entities:** Normalize before diff (`&nbsp;` → space).
- **Empty baseline:** Disable Show Redline; prompt user to Start Tracking.
- **No changes:** Show "No changes detected" instead of rewriting body.
- **Full-body replacement:** User loses cursor position — acceptable v1 limitation.

---

## 9. Testing Strategy

### 9.1 Unit Tests (Vitest) — Primary

Pure functions in `src/redline/`:

| Module | Example cases |
|--------|---------------|
| `normalize.ts` | Strip tags, keep `\n` for `<p>`, decode entities |
| `diff.ts` | Insert only, delete only, mixed, no change, punctuation |
| `render.ts` | Correct inline styles, escape HTML in user text (`<script>`) |
| `acceptAll` | Produces expected clean string from diff parts |

Run: `npm test`

### 9.2 Manual Integration Tests — Required for Office

Office.js cannot be fully mocked without heavy harness. Use a **manual test checklist** (see §11):

1. Sideload manifest
2. New email compose
3. Full workflow per acceptance criteria
4. Send to self; verify HTML in received message (Gmail, Outlook web)

### 9.3 Optional: Office Add-in Mock

- `@types/office-js` for TypeScript
- Consider `office-addin-mock` later if we automate UI tests — not v1

### 9.4 HTML Escaping Test (Security)

User text containing `<`, `>`, `&` must be escaped in rendered output to avoid XSS in compose WebView.

---

## 10. Known Limitations and Future Improvements

### v1 Limitations

1. **Formatting loss in redline view** — bold/lists from original may disappear because we diff plain text.
2. **Full body replace** — cannot redline arbitrary selected region in-place; selection only defines baseline capture.
3. **Platform variance** — selection API, HTML sanitization, and compose editor differ across Outlook clients.
4. **No per-change accept/reject** — Accept All only.
5. **No persistence** — closing compose may lose baseline unless we add settings storage.
6. **Word track changes** — best-effort HTML paste only.
7. **Self-signed HTTPS** — dev friction for first-time sideload.
8. **Undo** — Outlook undo after setBody may behave unpredictably.

### Future Improvements (post-v1)

| Priority | Feature |
|----------|---------|
| High | Per-change accept/reject in task pane list |
| High | `Office.context.document.settings` baseline persistence |
| Medium | Rich-text editor (TipTap) in editor mode |
| Medium | Smarter HTML-preserving diff (retain formatting on unchanged runs) |
| Medium | Word OOXML revision import |
| Low | AppSource deployment, centralized deployment manifest |
| Low | Read-mode add-in for reviewing received redlines |
| Low | Dark-mode aware redline colors |

---

## 11. Acceptance Criteria Checklist (v1)

Use this during Stage 8 sign-off:

- [ ] I can run the add-in locally (`npm install` + `npm run dev`)
- [ ] I can sideload it into Outlook (manifest + HTTPS)
- [ ] The task pane opens from Outlook compose
- [ ] **Start Tracking** stores current body or selected content as baseline
- [ ] **Show Redline** compares baseline vs current content
- [ ] The draft body is replaced with redline HTML
- [ ] Additions are blue and underlined
- [ ] Deletions are red with strikethrough
- [ ] **Accept All** produces the clean revised version
- [ ] Basic editor mode: paste/import, edit, generate redline, insert into email
- [ ] `project-plan.md` updated with implementation notes and learning notes
- [ ] Unit tests pass for redline module

---

## 12. Implementation Notes and Learning Log

> Append entries after each stage. Format: **Stage N — date — what changed — concept demonstrated**

### Stage 0

*Not started.*

### Stage 1

*Not started.*

### Stage 2

*Not started.*

### Stage 3

*Not started.*

### Stage 4

*Not started.*

### Stage 5

*Not started.*

### Stage 6

*Not started.*

### Stage 7

*Not started.*

### Stage 8

*Not started.*

---

## Appendix A — Quick Reference Commands (planned)

```bash
npm install
npm run dev          # HTTPS Vite server for sideloading
npm test             # Vitest unit tests
npm run build        # Production bundle (optional preview)
```

## Appendix B — Redline Style Constants (planned)

```typescript
export const REDLINE_STYLES = {
  delete: 'color:red;text-decoration:line-through',
  insert: 'color:blue;text-decoration:underline',
} as const;
```

## Appendix C — Useful Links

- [Outlook add-ins overview](https://learn.microsoft.com/en-us/office/dev/add-ins/outlook/outlook-add-ins-overview)
- [Get/set body in compose](https://learn.microsoft.com/en-us/office/dev/add-ins/outlook/insert-data-in-the-body)
- [Sideload Outlook add-ins for testing](https://learn.microsoft.com/en-us/office/dev/add-ins/outlook/sideload-outlook-add-ins-for-testing)
- [jsdiff (npm `diff`)](https://github.com/kpdecker/jsdiff)
