# Drasil — Technical Spec

## Stack

| Part               | Choice                                                                                                             | Why                                                                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop shell      | **Electron**                                                                                                       | One codebase on Windows, macOS and Linux. Built in: `shell.trashItem` (Trash/Recycle Bin), `shell.openPath` (open with default app), `shell.showItemInFolder` (reveal in file manager). Needs only Node to build; no Rust or C++ toolchain. |
| Filesystem backend | **Node.js** (`node:fs` in the main process, heavy scans in `worker_threads`)                                       | Same language as the UI. Async APIs keep the window responsive.                                                                                                                                                                             |
| Language           | **TypeScript** (strict)                                                                                            | Type safety across the main and renderer processes.                                                                                                                                                                                         |
| Build              | **electron-vite** (Vite)                                                                                           | Builds main + renderer, with hot reload in dev.                                                                                                                                                                                             |
| Canvas rendering   | **WebGL via PixiJS** (added in Phase 3)                                                                            | Draws large numbers of nodes quickly, with GPU zoom and pan. Level-of-detail logic stays ours.                                                                                                                                              |
| UI panels          | Plain HTML/CSS + TypeScript for now. Add a UI framework only if the panels (inspector, search, settings) need one. | Avoid a dependency until it pays for itself.                                                                                                                                                                                                |
| Lint / format      | ESLint (typescript-eslint) / Prettier                                                                              | Already used by the editor setup.                                                                                                                                                                                                           |

## Process layout

- `src/main/` — Electron main process: windows, filesystem access, file operations. Only this side touches the disk.
- `src/renderer/` — the UI (canvas + panels). Runs sandboxed with no Node access (`contextIsolation`, `sandbox`, no `nodeIntegration`).
- `src/preload/` — exposes `window.drasil` (typed as `DrasilApi` in `src/shared/fs-types.ts`) over IPC. This is the renderer's only route to the disk.
- `src/shared/` — types used by both sides.

## Filesystem engine (Phase 2)

Flow: renderer `drasil.list(path, id)` → IPC `fs:list` (main checks the path is absolute and the id is an integer) → `main/fs/engine.ts` → a `worker_threads` worker (`main/fs/worker.ts`) → `main/fs/list.ts`.

- **One level at a time.** `listDirectory` reads only the direct children, in batches of 256, sent back as `fs:list-event` `batch` events and then one `done` event. It never recurses.
- **Request ids** are picked by the renderer, so no event can arrive before its id is known. The engine maps them to global ids for each window.
- **Cancel** (`drasil.cancel(id)`) stops the listing between entries. The final state is `partial`. Listings for a closed window are cancelled automatically. If the worker crashes, every open listing ends with `error`, and the next request starts a new worker.
- **States** (`NodeState`): directories start as `unscanned`. A listing ends as `scanned`, `empty`, `partial` (cancelled or failed midway), `inaccessible` (EACCES/EPERM), `unavailable` (ENOENT, missing drive, stale network mount) or `error`.
- **Links:** symlinks and Windows junctions get `link.target`. `link.loop` is true when the target is the link's own folder or an ancestor. Any future recursive walk (folder sizes, search) must not follow links.
- **Locations** (`main/fs/locations.ts`): standard user folders, plus drives. Windows: present drive letters. macOS: `/` and `/Volumes/*`, without the startup-disk alias. Linux: `/` and mounts under `/media/$USER`, `/run/media/$USER` and `/mnt`.
- **Known limits:** `hidden` only means dotfiles. Windows hidden/system attributes need a native call (planned with the hidden filter in Phase 7). macOS Finder aliases and Windows `.lnk` shortcuts are shown as plain files.

The window currently shows a plain list view for exploring the engine (`src/renderer/main.ts`). Phase 3 makes the radial tree the main view. The list view stays as the accessible alternative.

## Privacy guards (in place now)

- Strict Content-Security-Policy in `src/renderer/index.html`. Only the local dev server is allowed as a connection.
- The window refuses to navigate and refuses to open new windows.

## Commands

| Command                                   | What it does                |
| ----------------------------------------- | --------------------------- |
| `npm install`                             | Install dependencies        |
| `npm run dev`                             | Run the app with hot reload |
| `npm run build`                           | Build into `out/`           |
| `npm start`                               | Run the built app           |
| `npm run typecheck` / `npm run lint`      | Type-check / lint           |
| `npm run format` / `npm run format:check` | Format / check formatting   |

## Known setup issues

- On a flaky network, npm can skip optional native packages without saying so. If `npm run dev` says `Cannot find native binding`, delete `node_modules` and `package-lock.json` and run `npm install` again.
- If Electron fails to launch because its binary is missing, run `node node_modules/electron/install.js`.

## Not done yet

- **Phase 2 automated tests** for the node states — testing is handled by the user.

- **CI** — needs git and a hosted repo. Skipped under the "no git unless asked" rule.
- **Test runner** — testing is handled by the user.
- **Installers** — Phase 10.
