# Drasil — Technical Spec

## Stack

| Part               | Choice                                                                                                             | Why                                                                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop shell      | **Electron**                                                                                                       | One codebase on Windows, macOS and Linux. Built in: `shell.trashItem` (Trash/Recycle Bin), `shell.openPath` (open with default app), `shell.showItemInFolder` (reveal in file manager). Needs only Node to build; no Rust or C++ toolchain. |
| Filesystem backend | **Node.js** (`node:fs` in the main process, heavy scans in `worker_threads`)                                       | Same language as the UI. Async APIs keep the window responsive.                                                                                                                                                                             |
| Language           | **TypeScript** (strict)                                                                                            | Type safety across the main and renderer processes.                                                                                                                                                                                         |
| Build              | **electron-vite** (Vite)                                                                                           | Builds main + renderer, with hot reload in dev.                                                                                                                                                                                             |
| Canvas rendering   | **Canvas 2D** (no library)                                                                                         | Level of detail keeps the number of drawn nodes small, which Canvas 2D handles easily. Switch to WebGL (e.g. PixiJS) only if Phase 4 misses its frame-rate target.                                                                          |
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

## Radial tree (Phase 3)

- `renderer/model.ts` — `Tree`: the renderer's copy of what has been listed, plus which folders are open. It owns all listing requests and calls `onChange` after every batch or state change. Batches go into `pending` and are merged into the sorted `children` by `flush()`, once per layout pass. Opening a folder that isn't `scanned`/`empty` lists it again, which also covers retry and reconnected drives.
- `renderer/layout.ts` — radial layout. Each node gets a slice of its parent's wedge, weighted by `1 + √(subtree weight)` so one huge folder can't squeeze its siblings. Each folder puts its children on a ring at `childRadius`: at least `RING` further out, and pushed further (up to `MAX_GAP`) until every child gets `SPACING` units of arc. It only sets targets (`tx`, `ty`) plus the wedge, `childRadius` and `maxRadius` used for culling.
- `renderer/view.ts` — `TreeView`: canvas drawing, pan/zoom, hit-testing, selection. Nodes animate towards their targets. With reduced motion turned on, they jump. Redraws happen only while something moves or loads.
- Folder states are shown by shape, not just color: dashed ring = not scanned, spinning arc = loading, filled = opened, filled + outer ring = closed with contents, plain ring = empty, half filled = partial, ring with ✕ = no access (dashed = unavailable), triangle = error. The footer also describes the selection in text.
- The Phase 2 list view was removed. The accessible alternative view gets rebuilt in Phase 8 on top of the same `Tree` model.

## Scale and level of detail (Phase 4)

- **Culling:** `TreeView.collect()` walks only subtrees whose wedge and radius range overlap the screen. A folder's on-screen children are found by binary search over their wedges, so a folder with 1M entries costs only what is visible. Only drawn nodes are animated and hit-tested.
- **Clusters:** if a folder's children would be less than `CLUSTER_PX` (3 px) apart, they are drawn as one band, labelled "N items · zoom in". Clicking the band zooms in until it opens.
- **Labels** are always 12 px. A label is hidden (not shrunk) when siblings are less than `LABEL_PX` (14 px) apart, or when it would run into the children's ring. Selected and hovered items always get a label.
- **Throttled layout:** while folders stream in, the layout runs at most every `max(100 ms, 2 × last layout time)`.
- **Folder sizes:** `main/fs/size-worker.ts` (its own worker, via `main/fs/sizes.ts`, IPC `size:start` / `size:watch` / `size:event`). Starting a root begins one walk of it. Folders the UI is showing are "watched": they are walked first and get updates every 300 ms. The walk never follows links. It skips virtual filesystems (`/proc`, `/sys`, `/dev`, `/run` on Linux; `/dev`, `/System/Volumes`, `/Volumes` on macOS). Only folders within 2 levels of the root, plus watched folders, are cached, which keeps memory bounded. States: `complete`; `estimate` (still walking, a lower bound); `incomplete` (finished, but something couldn't be read, also a lower bound). The UI says "at least …" for the last two.
- **Performance budget:** 60 fps (≤ 16 ms per frame) while panning and zooming, with 1M+ items loaded; renderer heap ≤ 1.5 GB at 1M loaded items. F2 on the canvas shows fps, frame time, layout time, drawn and loaded counts, and heap. `npm run make-test-tree -- <empty folder> [files] [perFolder]` creates a test tree (default 1M empty files, 100 per folder; set `perFolder` = `files` for one flat folder).

## Navigation and orientation (Phase 5)

- **Roots and history** (`renderer/main.ts`): each history entry is a live root `TreeNode` plus what was selected, so Back/Forward restore branches exactly as they were left open (max 50 entries). `Tree.useRoot(node)` makes an existing node the root ("Show as root", double-click a folder). `Tree.setRoot(path, adopt)` starts a fresh tree. When going up, the old root is passed as `adopt`, and that branch is reused when it appears in the parent's listing. The view treats `t === tree.root` as the root; a focused branch still has its `parent`.
- **Reveal:** `Tree.reveal(path)` opens folders one level at a time down to `path`, waiting for listings as needed. Then it calls `onReveal`. The path bar uses it for jumps above the root. Phase 7 search will use it too.
- **Path helpers:** `src/shared/paths.ts` works without `node:path` (the renderer is sandboxed). It handles Windows drive roots, POSIX `/` and UNC share roots.
- **Camera:** `TreeView.centerOn(t)` / `fit()` glide there: geometric zoom, linear movement of the world point at the screen center. With reduced motion, they jump. Any drag, wheel or zoom cancels a glide.
- **Inspector** (right panel, toggle with I): it is rebuilt only when its layout changes. Otherwise values are updated in place, because sizes update several times a second and rebuilding mid-click would swallow the click.
- **Open / reveal:** IPC `shell:open` / `shell:reveal` (`shell.openPath` / `shell.showItemInFolder`). The main process checks that the path is absolute and still exists. Both return an error message or `''`.
- **Keys:** Alt+←/→ back/forward (and mouse buttons 4/5), Alt+↑ or Backspace up, Home overview, C center on the selection, I details, Enter open/toggle, double-click open.

## Privacy guards (in place now)

- Strict Content-Security-Policy in `src/renderer/index.html`. Only the local dev server is allowed as a connection.
- The window refuses to navigate and refuses to open new windows.

## Commands

| Command                                               | What it does                |
| ----------------------------------------------------- | --------------------------- |
| `npm install`                                         | Install dependencies        |
| `npm run dev`                                         | Run the app with hot reload |
| `npm run build`                                       | Build into `out/`           |
| `npm start`                                           | Run the built app           |
| `npm run typecheck` / `npm run lint`                  | Type-check / lint           |
| `npm run format` / `npm run format:check`             | Format / check formatting   |
| `npm run make-test-tree -- <dir> [files] [perFolder]` | Create a large test tree    |

## Known setup issues

- On a flaky network, npm can skip optional native packages without saying so. If `npm run dev` says `Cannot find native binding`, delete `node_modules` and `package-lock.json` and run `npm install` again.
- If Electron fails to launch because its binary is missing, run `node node_modules/electron/install.js`.

## Not done yet

- **Automated tests** for node states and size totals, and a measured performance run — testing is handled by the user.
- **CI** — needs git and a hosted repo. Skipped under the "no git unless asked" rule.
- **Test runner** — testing is handled by the user.
- **Installers** — Phase 10.
