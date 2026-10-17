# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Rules (from the user — always follow)

- Never run any git command unless the user explicitly asks for it.
- Don't run tests. The user handles all testing.
- When a phase is finished, reply with only: `Done`, followed by a short, simple list of what to test. Nothing else.

## Project state

All 10 phases are complete: an Electron + TypeScript + electron-vite app with a lazy filesystem engine a background folder-size worker, and a Canvas 2D radial tree with culling and level of detail (`src/renderer/model.ts`, `layout.ts`, `view.ts`), plus history, path bar and inspector (`src/renderer/main.ts`), file operations (`src/main/ops/`, `src/renderer/ops.ts`), search/filters (`src/main/fs/search-worker.ts`, `src/renderer/search.ts`, `filter.ts`, `filterpanel.ts`), settings, shortcuts and the accessible list view (`src/shared/settings.ts`, `src/renderer/keys.ts`, `listview.ts`, `settingsui.ts`), onboarding, outside-change polling and crash handling (`src/renderer/welcome.ts`, `src/main/watch.ts`, `src/main/log.ts`), and release packaging, ask-first updates and docs (`electron-builder.yml`, `src/main/updates.ts`, `src/main/network.ts`, `.github/workflows/`, `docs/RELEASING.md`). Stack, engine design and reasons are in `docs/TECHNICAL.md`.

- `docs/NON-TECHNICAL.md` — product vision and UX spec for **Drasil** (the product; the folder is named Reef). Read it before designing features.
- `docs/TECHNICAL.md` — stack, architecture, known setup issues. Update it when a technical decision is made.
- `docs/PHASES.md` — the 10-phase roadmap to public release; each phase has exit criteria that gate the next.

## Commands

- `npm run dev` — run with hot reload
- `npm run build` — build to `out/`; `npm start` runs the build
- `npm run typecheck`, `npm run lint`, `npm run format:check`
- `npm run dist` / `npm run dist:dir` — installers / unpacked app in `dist/` (set `CSC_IDENTITY_AUTO_DISCOVERY=false` for unsigned local builds)
- The repository is `github.com/YassineBenZriouil/DRASIL`, set in `package.json` (`homepage`, `repository`, `bugs`) and repeated in the docs.

## Architecture

- `src/main/` is the Electron main process and the only code that touches the filesystem.
- `src/renderer/` is the sandboxed UI (no Node access). It reaches the disk only through `window.drasil` (`src/preload/`, typed in `src/shared/fs-types.ts`).
- Keyboard shortcuts live only in the `Keymap` command list in `src/renderer/main.ts` (see `keys.ts`). Colors live only as CSS tokens in `style.css` (the canvas reads them), and changes must keep WCAG AA contrast in both themes. Anything shown on the canvas must also reach the list view and screen readers.
- On-screen code uses `TreeNode.shown` (children after filters and sorting); `children` is the full name-sorted data. Search and filter messages must never claim more coverage than was actually checked.
- File operations must keep the Phase 6 safety rules in `docs/TECHNICAL.md`: never overwrite (copy with `COPYFILE_EXCL`, "replace" goes to the Trash first), delete a cross-drive move's source only after a full copy, and re-read affected folders afterwards.
- Directory listing runs in a worker thread (`src/main/fs/`), one level at a time, streamed as batches. Don't add recursive walks that follow links. Validate every IPC argument in `src/main/ipc.ts`.
- The network block (`blockNetwork` in `src/main/network.ts`) must stay; the only allowed traffic is the user-started update check to GitHub: the app makes no network requests. Don't switch outside-change detection to `fs.watch` (see `src/main/watch.ts` for why).
- The renderer CSP and navigation blocking in `src/main/index.ts` enforce the no-network rule. Don't loosen them.

## Product summary

Drasil is a cross-platform (Windows, macOS, Linux as equal first-class targets) desktop file manager that renders the filesystem as an interactive radial "world tree": folders are branches, files are leaves. It is a full file manager (open, create folder, rename, move, copy, trash/delete, multi-select, context menu, keyboard), not a read-only visualizer. Local-first.

## Hard requirements from the spec (easy to violate in implementation)

- **Lazy, incremental scanning.** Never block on a full scan; show the first view ASAP and keep the UI interactive while discovery and folder-size calculation run in the background.
- **Distinct node states must be modeled explicitly:** unscanned vs. empty vs. partially scanned vs. fully scanned, plus inaccessible (permission denied), unavailable (drive gone), loading, operation-in-progress, error. Collapsed ≠ empty; filtered-out ≠ deleted. Folder sizes must be marked complete / estimate / incomplete.
- **Level-of-detail rendering.** Don't draw every item; cluster dense regions and reveal detail as the user zooms or expands. Don't shrink labels to unreadability.
- **The filesystem is the source of truth.** The view updates only after the OS confirms an operation; after interruptions, re-check the real filesystem. Cache is allowed but must be clearable and never presented as guaranteed current.
- **Safe file operations.** Never silently overwrite (prompt on name conflicts); default delete goes to Trash/Recycle Bin, permanent delete is separate and confirmed; block moving a directory into itself or a descendant; report partial failures honestly; offer cancellation for large operations where safe.
- **Search** must say when results are incomplete (unscanned or inaccessible locations) and show parent paths to disambiguate.
- **Privacy:** no telemetry, analytics, accounts, network calls or uploading of paths/metadata. No admin/root needed for normal use.
- **Accessibility:** keyboard access to every important operation, visible focus, a non-canvas accessible browsing alternative, never color alone for state, option to reduce/disable animation, HiDPI/scaling support.
- **Platform differences** (paths, permissions, symlinks/aliases, trash behavior, drives) should be surfaced to the user, not papered over.

## Conventions

Prettier (`.prettierrc`): 4-space indent, single quotes, semicolons, ES5 trailing commas, 80-column width. VS Code formats on save.
