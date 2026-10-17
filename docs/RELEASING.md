# Releasing Drasil

## One-time setup

1. **Repository.** The project lives at `github.com/YassineBenZriouil/DRASIL`. If it ever moves, update `package.json` (`author.email`, `homepage`, `repository`, `bugs`), `README.md`, `docs/USER-GUIDE.md`, `docs/index.html` and `.github/ISSUE_TEMPLATE/config.yml`. In-app updates, bug reports and links all read the repository from `package.json`.
2. **Windows code signing.** Get a code-signing certificate (OV or EV, or Azure Trusted Signing). Add the repository secrets `WIN_CSC_LINK` (the `.pfx`, base64-encoded) and `WIN_CSC_KEY_PASSWORD`. Unsigned builds work, but SmartScreen warns about them.
3. **macOS signing and notarization.** Join the Apple Developer Program. Export a "Developer ID Application" certificate as `.p12` and add the secrets `MAC_CSC_LINK` (base64) and `MAC_CSC_KEY_PASSWORD`. For notarization, add `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` (from appleid.apple.com) and `APPLE_TEAM_ID`.
4. **Download page.** In the repository settings, turn on GitHub Pages from the `main` branch, `/docs` folder. `docs/index.html` is the download page.
5. **Issues.** Make sure Issues are enabled; the bug template is in `.github/ISSUE_TEMPLATE/`.

## Making a release

1. Set `version` in `package.json` (e.g. `1.0.0`). The tag must match it.
2. Make sure CI is green on all three platforms.
3. Tag the commit `v1.0.0` and push the tag. `.github/workflows/release.yml` builds, signs and notarizes on Windows, macOS and Linux and uploads everything to a **draft** GitHub release:
    - Windows: `Drasil-<v>-win-x64.exe`, `-arm64.exe` (+ `latest.yml` for updates)
    - macOS: `.dmg` and `.zip` for `x64` and `arm64` (+ `latest-mac.yml`)
    - Linux: `.AppImage`, `.deb`, `.rpm` (+ `latest-linux.yml`)
4. Go through the launch checklist below, then publish the draft. Installed copies only see an update once the release is published.

To build locally instead: `npm run dist` builds the installers for the current platform in `dist/`, and `npm run dist:dir` builds just the unpacked app. Set `CSC_IDENTITY_AUTO_DISCOVERY=false` for an unsigned local build on macOS.

## Launch checklist

Do this on a **fresh** machine (or a new user account) for each system. Use a folder of test files, not real data.

**Install**

- [ ] Windows 10 and 11: the installer is signed (Properties → Digital signatures), SmartScreen doesn't block it, it installs without an admin prompt, and the Start menu entry and icon look right.
- [ ] macOS (Apple silicon and Intel): the dmg opens, the app is notarized (`spctl -a -vv /Applications/Drasil.app` says "Notarized Developer ID"), and it opens without warnings. The permission prompts for Desktop/Documents/Downloads appear and read well.
- [ ] Linux (Ubuntu and Fedora at least): the AppImage runs after `chmod +x`, the `.deb` installs with `apt`, the `.rpm` installs with `dnf`, and the desktop entry and icon appear.

**First run**

- [ ] The welcome screen appears and lists sensible places and drives. Picking one shows the tree within a second or two, and the tips card appears.
- [ ] With networking turned off, everything works. With it on, the log (Settings → About → Open the log folder) has no "Blocked a network request" lines after normal use.

**Core tasks (keyboard only, then with a screen reader)**

- [ ] Open folders, search, filter, open a file, reveal it in the file manager.
- [ ] Create, rename, move, copy (with a name conflict), move to Trash, delete permanently, move to a USB drive, unplug the drive.
- [ ] Change theme, size and motion. Switch to List only and use it with a screen reader.

**Upgrade**

- [ ] Install the previous beta, then use Check for updates to update to this release (Windows, macOS and AppImage). Settings, the last location and shortcuts are kept.
- [ ] With the weekly check off, the app never contacts GitHub on its own.

**Uninstall**

- [ ] Windows (Settings → Apps), macOS (move to Trash) and Linux (`apt remove` / `dnf remove` / delete the AppImage) remove the app. Every user file and folder is untouched. (Drasil's own settings folder stays unless the user deletes it.)

**Publish**

- [ ] Release notes written (what's new, known issues), the draft published, and the download page links checked from a browser that isn't signed in.
