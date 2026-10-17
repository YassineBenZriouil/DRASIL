# Drasil

**A living world for your files.** Drasil is a file manager for Windows, macOS and Linux that shows your folders and files as an interactive radial tree. Folders are branches, files are leaves. Zoom out to see the shape of your whole drive, zoom in to work with single files, and move, copy, rename and delete them right there in the tree.

- **See the big picture:** large and deeply nested folders stand out at a glance. Folder sizes are calculated in the background.
- **A real file manager:** open, create, rename, move (drag and drop), copy, paste, and send to the Trash. It never overwrites a file without asking.
- **Search and filters:** find anything by name, filter by type, size or date, and highlight the largest or oldest items.
- **Keyboard and screen readers:** every action works from the keyboard, and a list view works with screen readers. Light and dark themes, and reduced motion.
- **Private:** everything stays on your computer. No account, no telemetry, no internet needed. It only goes online to check for updates, and only when you ask.

## Download

Get the latest version for your system from the **[download page](https://github.com/OWNER/drasil/releases/latest)**:

| System        | File                                                                             |
| ------------- | -------------------------------------------------------------------------------- |
| Windows 10/11 | `Drasil-<version>-win-x64.exe` (or `-arm64`)                                     |
| macOS 12+     | `Drasil-<version>-mac-arm64.dmg` (Apple silicon) or `-x64.dmg` (Intel)           |
| Linux         | `.AppImage` (any distribution), `.deb` (Debian/Ubuntu), `.rpm` (Fedora/openSUSE) |

No administrator rights are needed to install or use it.

## Help

- [User guide](docs/USER-GUIDE.md): getting started, keyboard shortcuts, what Drasil reads, and platform differences.
- [Privacy](docs/PRIVACY.md)
- Found a bug? [Report it](https://github.com/OWNER/drasil/issues/new?labels=bug). The easiest way is from the app: Settings → About → Report a bug.

## Building from source

Requires Node.js 24 or later.

```sh
npm install
npm run dev        # run with hot reload
npm run dist:dir   # build an unpacked app in dist/
npm run dist       # build installers for this platform in dist/
```

Architecture and design notes are in [docs/TECHNICAL.md](docs/TECHNICAL.md); releasing is described in [docs/RELEASING.md](docs/RELEASING.md).

## License

[MIT](LICENSE)
