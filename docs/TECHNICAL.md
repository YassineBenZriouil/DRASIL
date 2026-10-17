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
- **Hidden items:** a leading dot on every OS. On Windows, items with the hidden attribute count too, read with `dir /a:h /b` (`main/fs/hidden.ts`, run alongside the first reads of each listing). macOS Finder aliases and Windows `.lnk` shortcuts are shown as plain files.

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

## File operations (Phase 6)

- **Main process** (`main/ops/`): `transfer.ts` (move/copy), `simple.ts` (new folder, rename, Trash, permanent delete), `common.ts` (friendly error messages, `uniqueName`). IPC: `op:mkdir`, `op:rename`, `op:trash`, `op:delete`, `op:transfer` + `op:event` (progress / conflict / done), `op:resolve`, `op:cancel`. Every argument is validated in `ipc.ts`, and names are checked again with `shared/names.ts`.
- **Safety rules:**
    - Copies use `COPYFILE_EXCL`, so they never overwrite.
    - On a conflict the user picks Keep both / Merge folders / Replace / Skip / Cancel everything, optionally for all remaining conflicts. "Replace" first sends the existing item to the Trash. If that fails, nothing is replaced.
    - A folder can't be moved or copied into itself.
    - A cross-drive move (`EXDEV`) copies first, then deletes the source only if every part arrived.
    - Links are copied as links, never followed.
    - Drive roots can't be renamed or deleted.
    - Partial results (cancel, failures, partial copies, partly deleted folders) are reported in `OpSummary.notes`.
- **Known gaps:** copy progress advances per file, not within one large file. There is a tiny window between the conflict check and `rename()` in which a newly created file could be overwritten on macOS/Linux. Both are marked `shortcut:` in the code.
- **Renderer** (`renderer/ops.ts`): prompts (`renderer/dialog.ts`: one queued `<dialog>`), the app-internal clipboard for cut/copy/paste, progress with Cancel in the footer, and result notices (problems stay until dismissed). After every operation, `afterChange()` re-reads the affected folders (`Tree.refresh`) and restarts the size calculation.
- **Refresh** (`Tree.refresh` / `relist`): the old entries stay on screen until the new listing is complete. Then they are swapped in, reusing existing nodes by path, so open branches stay open. A rename rewrites the loaded paths in place first, for the same reason.
- **Selection:** `TreeView.selection` (Ctrl/Cmd+click) plus the primary `selected`. Dragging a node moves the selection onto a folder; hold Ctrl (Option on macOS) to copy. A label always says what will happen and why a drop isn't allowed. Esc cancels. The right-click menu is native (`main/menu.ts`) and only lists actions that apply.
- **Keys:** Ctrl/Cmd+C/X/V, F2 rename, Delete (Cmd+Backspace on macOS) = Trash, Shift+Delete (Cmd+Option+Backspace) = permanent delete with confirmation, Ctrl/Cmd+Shift+N new folder, F5 refresh, menu key or Shift+F10 = context menu. The performance overlay moved to F9.

## Search, filters and discovery (Phase 7)

- **Search** (`main/fs/search-worker.ts` via `main/fs/search.ts`; IPC `search:start` / `search:cancel` / `search:event`): it walks the current root breadth-first, so shallow matches arrive first. Matching is partial and case-insensitive, comparing names in NFC so decomposed macOS names match. Results stream in batches. It never follows links and skips the virtual folders in `main/fs/skip.ts` (shared with the size worker). It stops at 1,000 matches. Only one search runs at a time; a new one cancels the old.
- **Coverage:** every search ends with a `SearchCoverage`: folders checked, folders that couldn't be read (with examples), limit reached, cancelled. The results panel (`renderer/search.ts`) states it every time and only says "every readable folder was searched" when that's true.
- **Going to a result** uses `Tree.reveal`. If the item is gone, or hidden by filters, a notice says so.
- **Filters** (`renderer/filter.ts`, panel in `renderer/filterpanel.ts`): folders only, file types, minimum size, modified date, show hidden. Type, size and date apply to files only; folders always stay, so the tree keeps its shape. Layout calls `view.pick(t)` and stores the result in `TreeNode.shown`; `children` stays the full, name-sorted list. The view and layout must use `shown` for anything on screen. `layout()` returns how many loaded items were filtered out. The footer says "Filters on: N loaded items hidden (not deleted)", and folder descriptions say how many of their items are hidden.
- **Sort** by name, size (folder totals so far) or date. Sorting by size re-sorts at most every 2 s while sizes are still being calculated.
- **Highlight** the 10 largest folders, largest files or oldest files among the items on screen. Drawn as an amber halo (search matches are yellow), always labelled, and listed in the panel. Folder totals that aren't complete say "at least".
- Ctrl/Cmd+F focuses search. ↓/↑ move through results, Enter goes to one, Esc clears.

## Accessibility, keyboard and settings (Phase 8)

- **Settings** (`shared/settings.ts` holds the shape, defaults and `sanitizeSettings`; `main/settings.ts` stores them in `userData/settings.json`, writing a temp file first). IPC `settings:get` / `settings:set` (a partial patch, merged and fully re-validated). The main process applies `theme` through `nativeTheme.themeSource`, so CSS `prefers-color-scheme` and the native menus follow it, and `uiScale` through `setZoomFactor`, reapplied on every page load.
- **Themes:** all colors are CSS tokens in `style.css` (dark by default, light under `prefers-color-scheme: light`). The canvas reads the same tokens (`loadPalette` in `view.ts`) and reloads them when the scheme changes. Checked against WCAG AA: text at least 4.5:1, shapes at least 3:1 on the background, in both themes. Re-check if you change a token.
- **Motion:** `view.reducedMotion` (Settings → Animation, or the OS setting) turns off node glides, camera glides, the spinning loading arc and the busy pulse. State is still shown by shape and text.
- **Sharpness:** the canvas re-sizes on pixel-ratio changes (moving to another screen, or changing the interface size).
- **Shortcuts** (`renderer/keys.ts`): one `Keymap` of commands, defined in `main.ts`. Defaults can be overridden in Settings (saved as `keys`), and assigning a combo takes it away from any other command. This is the single source of keyboard shortcuts; add new ones there, not in ad-hoc `keydown` handlers. Plain keys (letters, Home, Backspace…) are ignored in text fields and inside `[data-own-keys]` (the list view). The canvas itself only handles Escape, Enter/Space and arrows (up = parent, down = into a folder, left/right = siblings).
- **List view** (`renderer/listview.ts`): an ARIA `tree` built from the same `Tree` and `shown` lists as the canvas. It uses a roving tabindex and `aria-level` / `setsize` / `posinset` / `expanded` / `selected` / `busy`, and is virtualized (26 px rows, plus the focused row is always kept). Row elements are reused, so focus is never lost on updates. Arrows, Home/End, PgUp/PgDn, Enter, Space, Ctrl/Cmd+Space and type-ahead all work. Layout: tree / tree and list / list only (`body[data-layout]`).
- **Screen readers:** selection changes made outside the list are announced through `#announce` (polite). The footer status is no longer a live region, because sizes update it several times a second. The search status sets `aria-busy` until the search ends. There is a "Skip to files" button at the top.
- **Cache:** the size worker saves the totals from each finished root walk to `userData/cache/sizes-<sha1(root)>.json` (folders cached during the walk, up to 50,000). When a root is opened again, saved totals are sent as `state: 'cached'` with `savedAt` until fresh ones arrive. The UI says "about … calculated <date>, may be out of date (recalculating…)". Settings shows the cache size and can clear it (`cache:info` / `cache:clear`); clearing never touches user files.
- **Excluded locations** (Settings): size calculation and search don't enter them. Totals that skipped one are `incomplete` with `excluded: true` and say so; search coverage counts them.
- **Start location:** ask, last location (saved whenever the root changes), or a fixed path.

## Polish, onboarding and hardening (Phase 9)

- **First launch** (`renderer/welcome.ts`): a short welcome with a location picker (places and drives), then a dismissible tips card. There is no tutorial. Settings `onboarded` / `tipsDismissed` remember both. Later launches reopen the last location (`startLocation` now defaults to `'last'`). If it's gone or unreadable, the picker opens and says why.
- **Outside changes** (`main/watch.ts`): the renderer sends the open folders (`watch:set`, shallow first, capped at 2,000). The main process polls their modification times every 3 s and sends `fs:changed`; the renderer then runs `Tree.refresh`, plus a size recalculation at most every 5 s. Polling is used on purpose instead of `fs.watch`: on Windows a watch holds a directory handle that can stop other programs deleting folders. Polling also works on network drives and notices vanished drives. Known gap (marked `shortcut:`): FAT/exFAT may not update folder times.
- **Drives:** the renderer re-reads the locations every 5 s and says when a drive is disconnected or connected. If the tree's drive comes back, the tree is read again.
- **Crash safety** (`main/index.ts`): a crashed window reloads, and a frozen one offers Wait / Reload. Both re-read the disk; nothing is assumed. A size worker that dies asks the window to restart the calculation (at most 3 times a minute). A search worker that dies ends the search as "stopped before it finished". Uncaught errors in main or the window go to a local log, `userData/logs/drasil.log` (1 MB, one old copy kept), and the window shows one notice.
- **Look:** a faint radial glow behind the tree; bolder main branches that fade outward; a soft glow on the root and the selection only, so the cost doesn't grow with tree size; 160 ms panel entrances. All motion is off when `body[data-motion=reduced]`.

## Release (Phase 10)

- **Packaging:** electron-builder (`electron-builder.yml`). Windows: NSIS per-user installer (no admin), x64 and arm64. macOS: dmg + zip (the zip is for updates), x64 and arm64, hardened runtime, notarized, with folder-access usage strings. Linux: AppImage, deb, rpm. `out/main/**` is unpacked from the asar archive because worker threads load those files directly. Artifacts go to `dist/` as `Drasil-<version>-<os>-<arch>.<ext>`. The icon is drawn by `scripts/make-icon.mjs` into `build/icon.png` (`npm run icon`).
- **Single source for the project address:** `package.json` (`homepage`, `repository`, `bugs`). electron-builder's GitHub publishing, the updater, bug-report links and the About links all read it. The repository is `YassineBenZriouil/DRASIL`.
- **CI:** `.github/workflows/ci.yml` (typecheck, lint, format, build and unsigned `--dir` package on all three OSes) and `release.yml` (on a `v*` tag matching `package.json`: build, sign, notarize and publish to a **draft** GitHub release). Secrets are listed in `docs/RELEASING.md`.
- **Updates** (`main/updates.ts`, electron-updater): nothing happens unless the user clicks "Check for updates" (or turns on the weekly check, off by default). It asks before downloading and asks before restarting; "Later" installs on quit. Network access is opened only to GitHub's release hosts, only while a check or download runs (`setUpdateAccess` in `main/network.ts`). The guard covers every session, including the updater's. deb/rpm installs and dev builds point to the download page instead.
- **Menus:** macOS gets an app/Edit/Window/Help menu. Menu commands go to the renderer's shortcut registry (`menu:command`), and the Edit menu's copy/cut/paste act on selected files through DOM `copy`/`cut`/`paste` events. Windows and Linux have no menu bar.
- **About / help** (`main/about.ts`): version, license, check for updates, user guide, privacy, report a bug (pre-filled with version and OS only), download page, open the log folder. Only these fixed URLs can be opened.
- **User docs:** `README.md`, `docs/USER-GUIDE.md` (getting started, shortcuts, what's scanned, platform differences, troubleshooting), `docs/PRIVACY.md`, `docs/index.html` (download page for GitHub Pages from `/docs`), `LICENSE` (MIT), and issue templates in `.github/ISSUE_TEMPLATE/`.
- **Launch checklist:** `docs/RELEASING.md`.

## Privacy guards (in place now)

- Strict Content-Security-Policy in `src/renderer/index.html`. Only the local dev server is allowed as a connection.
- The window refuses to navigate and refuses to open new windows.
- Every web request outside `file:`/`data:`/`blob:`/`devtools:` (and the dev server while developing) is cancelled in `main/index.ts` and logged as a bug, so a stray dependency can't phone home.
- The spellchecker is off: it would download dictionaries.
- No telemetry or crash uploads; update checks only when the user asks (see Release). Logs, settings and the size cache stay in `userData`. Nothing needs admin/root.
- Checked in Phase 9: a normal run logged no blocked requests.

## Commands

| Command                                               | What it does                                  |
| ----------------------------------------------------- | --------------------------------------------- |
| `npm install`                                         | Install dependencies                          |
| `npm run dev`                                         | Run the app with hot reload                   |
| `npm run build`                                       | Build into `out/`                             |
| `npm start`                                           | Run the built app                             |
| `npm run typecheck` / `npm run lint`                  | Type-check / lint                             |
| `npm run format` / `npm run format:check`             | Format / check formatting                     |
| `npm run make-test-tree -- <dir> [files] [perFolder]` | Create a large test tree                      |
| `npm run dist` / `npm run dist:dir`                   | Build installers / an unpacked app in `dist/` |
| `npm run icon`                                        | Redraw `build/icon.png`                       |

## Known setup issues

- On a flaky network, npm can skip optional native packages without saying so. If `npm run dev` says `Cannot find native binding`, delete `node_modules` and `package-lock.json` and run `npm install` again.
- npm 11 blocks install scripts unless they're allowed. `allowScripts` in `package.json` allows Electron's, which downloads the app binary, and denies `electron-winstaller` (the Squirrel helper, unused because releases use NSIS). If Electron still fails to launch because its binary is missing, run `node node_modules/electron/install.js`.

## Not done yet

- **Automated tests** for node states and size totals, and a measured performance run — testing is handled by the user.
- **Test runner** — testing is handled by the user.
