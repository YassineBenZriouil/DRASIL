# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

Pre-code. The repo holds only specs; there is no source, build, lint or test setup yet. Update this file with real commands once a stack is chosen.

- `NON-TECHNICAL.md` — product vision and UX spec for **Drasil** (the product; the folder is named Reef). Read it before designing features.
- `TECHNICAL.md` — empty; intended for the technical spec/architecture.
- `PHASES.md` — the 10-phase roadmap to public release; each phase has exit criteria that gate the next.

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
