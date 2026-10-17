# Drasil — Development Phases

Ten phases from an empty repo to a public release. Each phase ends with a usable, testable build on Windows, macOS and Linux. Don't start a phase until the previous phase's exit criteria are met.

Product requirements live in `NON-TECHNICAL.md`; technical decisions go in `TECHNICAL.md`.

---

## Phase 1 — Foundations

**Goal:** Choose the stack and get an empty app running on all three platforms.

- Choose the desktop framework, rendering approach for the canvas (2D/WebGL/native), and filesystem backend language. Record the choice and its reasons in `TECHNICAL.md`.
- Set up the repo: build, lint, format (Prettier config already exists), test runner.
- Set up CI that builds and runs the tests on Windows, macOS and Linux.
- Create an empty app window that launches on all three.

**Exit criteria:** One command builds and launches the app on each OS. CI is green on all three. `CLAUDE.md` lists the real commands.

---

## Phase 2 — Filesystem Core

**Goal:** A headless engine that reads the filesystem lazily and honestly.

- Node model with explicit states: unscanned, loading, partially scanned, fully scanned, empty, inaccessible, unavailable, error.
- Lazy directory listing: one level at a time, on a background worker, cancellable.
- List drives, volumes and common locations per OS.
- Handle symlinks, junctions and aliases without infinite loops.
- Permission errors become node states, not crashes.

**Exit criteria:** Tests cover every node state on every OS, including permission-denied, a disconnected drive and symlink loops. Listing a 10,000-item folder doesn't block the caller.

---

## Phase 3 — The Radial Tree (first render)

**Goal:** See the filesystem as a world tree.

- Radial layout: root in the center, children spread outward, stable parent–child geometry.
- Pan, zoom, select, expand and collapse.
- Distinct visuals for folder, file, unscanned, loading, empty and inaccessible. Never use color alone to show state.
- Starting-location picker (drives and common folders).

**Exit criteria:** You can pick a location, expand branches as they load, and tell an unscanned branch from an empty one at a glance.

---

## Phase 4 — Scale and Level of Detail

**Goal:** Stay fast and readable on a whole real disk.

- Level-of-detail rendering: big shapes at a distance, labels and files up close.
- Group dense folders into clusters that open up as you zoom in.
- Only draw what's on screen.
- Background folder-size calculation, marked as complete, estimate or incomplete.
- Performance budget: set target frame rate and memory limits, and measure them on a large test tree.

**Exit criteria:** A tree with 1M+ items stays at the frame-rate target, labels never shrink until unreadable, and size totals are never shown as complete when they aren't.

---

## Phase 5 — Navigation and Orientation

**Goal:** The user is never lost.

- Breadcrumb/ancestry path, jump to parent, back and forward history, return to the overview.
- Focus on a branch and re-center on the selection.
- Inspector panel: name, path, type, size, modified date, available actions. Collapsible.
- Status area for ongoing scans and activity.
- Open a file in its default app and reveal it in the system file manager.

**Exit criteria:** From anywhere in the tree, the user can see where they are and get back to the root or the previous location in one action.

---

## Phase 6 — File Operations

**Goal:** Drasil becomes a real file manager.

- Create folder, rename, move (drag and drop), copy, cut/paste, copy path, refresh.
- Delete to the Trash/Recycle Bin by default. Permanent delete is a separate action with its own confirmation.
- Name conflicts always ask (replace / keep both / skip). Never silently overwrite.
- Block moving a folder into itself or one of its descendants.
- Multi-select across branches. Context menu that only shows actions that apply.
- Progress and cancel for large operations. Report partial failures honestly.
- After any operation or interruption, re-read the real filesystem instead of assuming the outcome.

**Exit criteria:** Tests on each OS cover conflicts, permission failures, cross-drive moves, interrupted copies and trash behavior. No test can make the app lose or overwrite data without the user's choice.

---

## Phase 7 — Search, Filters and Discovery

**Goal:** Find anything and understand where the space goes.

- Name search (partial matches) with parent paths shown on each result.
- Selecting a result flies to it and reveals the path step by step.
- Filters: file/folder, type, size, date, hidden status. Make it clear when items are filtered out.
- Sort and highlight large folders and old files. Nothing is changed or deleted automatically.
- Results say when they're incomplete (unscanned or inaccessible areas).

**Exit criteria:** Search returns the first results without blocking the UI, never claims full coverage when it doesn't have it, and a filtered-out item can't be mistaken for a deleted one.

---

## Phase 8 — Accessibility, Keyboard and Settings

**Goal:** Usable by everyone, comfortable for daily use.

- Keyboard access to every important action, with visible focus.
- An accessible list/tree view next to the canvas, with screen-reader support.
- Reduce or turn off animations. Check contrast. Support HiDPI and display scaling.
- Settings: theme, animation intensity, default location, hidden files, scan exclusions, shortcuts, inspector visibility.
- Local metadata cache with a "clear cache" button. Cached data is labeled as possibly out of date.

**Exit criteria:** Every core task can be done with keyboard only and with a screen reader on each OS. An accessibility audit passes.

---

## Phase 9 — Polish, Onboarding and Hardening

**Goal:** It feels finished and doesn't break.

- Visual identity: dark atmospheric theme, gentle transitions, restrained glow. Check that effects never slow down or hide the files.
- First launch: short welcome → choose a location → first view fast → light hints, no long tutorial. Restore the last useful location on later launches.
- Error UX for disconnected drives, missing files, failed operations and file changes from other apps (watch the filesystem).
- Privacy check: confirm there are zero network calls, no telemetry, and no admin/root needed.
- Crash-safety and long-session testing (memory leaks, huge trees, flaky drives).
- Closed beta with real users on all three OSes. Fix what they hit.

**Exit criteria:** No open data-loss or crash bugs. Beta users can finish the core tasks without help. The network-traffic check shows nothing leaving the machine.

---

## Phase 10 — Public Release

**Goal:** Ship it.

- Signed installers: Windows (code-signed installer), macOS (signed and notarized), Linux (AppImage plus at least one of deb/rpm/Flatpak).
- Release pipeline in CI that builds, signs and publishes all platforms from a tag.
- Update mechanism that asks before downloading (no silent phoning home).
- User docs: getting started, keyboard shortcuts, what's scanned, privacy statement, known platform differences.
- License, website/download page, issue tracker, and a way to report bugs.
- Launch checklist: fresh install on clean machines for every OS, upgrade from beta, uninstall leaves the user's files untouched.

**Exit criteria:** A stranger can download, install and use Drasil on Windows, macOS or Linux without help, and nothing in the spec's "What Drasil Must Never Become" section is true of the release.
