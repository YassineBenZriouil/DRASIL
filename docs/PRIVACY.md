# Privacy

Drasil works entirely on your computer.

- **No network use.** Drasil doesn't send file names, paths, folder contents, usage data or crash reports anywhere. There is no telemetry, no analytics, no advertising and no account. It works fully offline, and the app blocks every network request inside itself, so that nothing can slip through by accident.
- **The one exception: updates, and only when you ask.** "Check for updates" (Settings → About, or Drasil → Check for Updates on macOS) contacts GitHub, where Drasil's releases are published, to see if there's a newer version. It downloads one only after you agree. You can also turn on a weekly check; it's off by default. The check sends nothing about your files.
- **Links you click** (user guide, bug report, download page) open in your web browser. A new bug report is pre-filled with your Drasil version and operating system only; you decide what else to write.
- **What's stored on your computer**, in Drasil's settings folder:
    - `settings.json`: your preferences and the last location you opened.
    - `cache/`: saved folder-size totals, so sizes appear sooner next time. They're marked as possibly out of date and recalculated. You can clear the cache in Settings → Cache.
    - `logs/drasil.log`: error messages, to help fix problems. They can mention folder paths. The log is never sent; you can attach it to a bug report yourself if you want to.

    The settings folder is `%APPDATA%\Drasil` on Windows, `~/Library/Application Support/Drasil` on macOS and `~/.config/Drasil` on Linux. Deleting it resets Drasil; it never contains your files.

- **Your operating system's permissions apply.** Drasil runs as you, needs no administrator rights, and can only see what you can see. On macOS you'll be asked before it can read Desktop, Documents, Downloads and removable drives.
- **Your files stay where they are.** Drasil reads your folders only to show them, and changes files only when you tell it to. Deleting normally moves items to the Trash / Recycle Bin.
