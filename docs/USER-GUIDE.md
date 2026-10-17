# Drasil user guide

## Getting started

1. **Install** Drasil from the [download page](https://github.com/YassineBenZriouil/DRASIL/releases/latest) and open it.
2. **Pick a place to start**, such as Home, Documents or a drive. Drasil reads only that place, a little at a time, so the first view appears right away.
3. **Explore:** click a folder to open it, drag empty space to move around, and scroll or pinch to zoom. Double-click a folder to make it the center of the tree. Right-click anything for actions.

Next time, Drasil opens where you left off. You can change this in Settings → When Drasil opens.

## Reading the tree

The location you opened sits in the middle; its folders branch outward and files are leaves. Shapes tell you the state of each folder, so you don't need to rely on color:

| Shape                       | Meaning                                                 |
| --------------------------- | ------------------------------------------------------- |
| ◌ dashed ring               | Not opened yet: its contents haven't been read          |
| spinning arc                | Being read right now                                    |
| ● filled                    | Open                                                    |
| ◉ filled with an outer ring | Closed, has contents                                    |
| ○ plain ring                | Empty                                                   |
| ◐ half filled               | Only partly read (stopped, or an error midway)          |
| ⊗ ring with ✕               | No access (dashed: the drive or folder isn't available) |
| △ triangle                  | Something went wrong reading it                         |

Files are colored by type (images, video, audio, documents, archives, code, programs). Dashed branches are links (shortcuts, symlinks or junctions) to somewhere else. Faded items are hidden files.

When a folder has too many items to show at the current zoom, they appear as a single band saying "N items · zoom in". Zoom in, or click the band, to see them one by one. Names show when there's room for them and are never shrunk to an unreadable size.

The bar at the bottom and the **Details** panel describe the selected item in words: its location, type, size, date and state.

## Getting around

- **Back / Forward / Up** in the toolbar, or Alt+← / Alt+→ / Alt+↑ (or Backspace). The mouse's back and forward buttons work too.
- The **path bar** under the toolbar shows where you are. Click any part of it to go there.
- **Overview** (Home) shows the whole tree. **Locate** (C) glides to the selection.
- **Locations** in the toolbar switch drives and places. Drives that are plugged in or removed are noticed within a few seconds.

## Managing files

| To…                          | Do this                                                              |
| ---------------------------- | -------------------------------------------------------------------- |
| Open a file                  | Double-click it, or press Enter                                      |
| Show it in Explorer / Finder | Details panel, or right-click → Show in …                            |
| Make a new folder            | Right-click a folder → New folder…, or Ctrl+Shift+N                  |
| Rename                       | F2                                                                   |
| Move                         | Drag onto a folder, or Ctrl+X then Ctrl+V                            |
| Copy                         | Hold Ctrl (Option on Mac) while dragging, or Ctrl+C then Ctrl+V      |
| Select several               | Ctrl+click (Cmd+click on Mac)                                        |
| Delete                       | Delete (Cmd+Backspace on Mac) moves items to the Trash / Recycle Bin |
| Delete permanently           | Shift+Delete (Cmd+Option+Backspace), after a confirmation            |

Drasil is careful with your files:

- It never overwrites anything without asking. If a name is already taken you choose: **Keep both**, **Merge folders**, **Replace** (the old item goes to the Trash first), **Skip** or **Cancel everything**.
- It won't move a folder into itself.
- When moving between drives, the original is removed only after the copy fully succeeded.
- Large operations show progress and can be cancelled. The result always says exactly what was done, skipped or left over (for example, a partial copy).
- Afterwards, the folders involved are read again from disk, so what you see is what's really there. Changes made by other programs show up within a few seconds; press F5 to refresh at any time.
- Ordinary deleting goes to the Trash / Recycle Bin. Permanent deleting doesn't securely erase data.

## Search, filters and discovery

- **Search** (Ctrl+F): type part of a name. Matches appear as they're found, closest folders first, each showing which folder it's in. Click a result to open the way to it in the tree. The search says how many folders it checked and whether some couldn't be read, so you always know if the results might be incomplete. It stops at 1,000 matches.
- **Filters** (toolbar → Filters): show only certain file types, files above a size, or files from a time range; show folders only; or hide hidden items. Folders always stay so the tree keeps its shape. When filters are on, the bottom bar says how many items are hidden, so they're never mistaken for deleted ones.
- **Sort** by name, size or date, and **highlight** the largest folders, largest files or oldest files.

## List view and accessibility

- Press **L** for a list view beside the tree, or choose Settings → Layout → List only. It's a standard tree list that works with screen readers (Narrator, NVDA, JAWS, VoiceOver, Orca). Use ↑/↓, → to open a folder, ← to close it or go to its parent, Home/End, Page Up/Down, Enter to open, Space to select, Ctrl+Space to add to the selection, and type a name to jump to it.
- On the tree itself, the arrow keys move around: ↑ goes to the parent, ↓ into a folder, ← and → to the neighbours.
- Settings has light and dark themes, interface size (75–200%), and reduced motion (no animations).
- **F1** lists every keyboard shortcut. Each can be changed in Settings → Keyboard shortcuts.

## Keyboard shortcuts

Ctrl means Cmd on macOS.

| Action                         | Keys                                     |
| ------------------------------ | ---------------------------------------- |
| Back / Forward / Parent folder | Alt+← / Alt+→ / Alt+↑ or Backspace       |
| See the whole tree             | Home                                     |
| Center on the selection        | C                                        |
| Zoom in / out                  | + / −                                    |
| Go to the tree / the list view | Ctrl+1 / Ctrl+2                          |
| Show or hide the list view     | L                                        |
| Show or hide details           | I                                        |
| Search                         | Ctrl+F                                   |
| Filters and sorting            | Ctrl+Shift+F                             |
| Actions menu                   | Shift+F10 or the menu key                |
| New folder                     | Ctrl+Shift+N                             |
| Copy / Cut / Paste             | Ctrl+C / Ctrl+X / Ctrl+V                 |
| Copy path                      | Ctrl+Shift+C                             |
| Rename                         | F2                                       |
| Move to Trash                  | Delete (Mac: Cmd+Backspace)              |
| Delete permanently             | Shift+Delete (Mac: Cmd+Option+Backspace) |
| Refresh                        | F5                                       |
| Keyboard shortcuts             | F1 or ?                                  |
| Settings                       | Ctrl+,                                   |
| Performance stats              | F9                                       |

## What Drasil reads

- **Folders, when you open them.** Only one level at a time, in the background, so nothing freezes.
- **Folder sizes.** These are calculated in the background for the location you opened, folders you can see first. Until a total is final it says "at least …". Totals saved from an earlier visit say when they were calculated and are recalculated each time.
- **Search** goes through the location you opened.
- **What's never followed or read:** links and junctions (so nothing is counted twice or loops forever), virtual system folders (`/proc`, `/sys`, `/dev`, `/run` on Linux; `/dev`, `/System/Volumes`, `/Volumes` inside `/` on macOS), and any folders you exclude in Settings → Excluded locations. Totals and searches that skipped something say so.
- **What it can't read:** folders your account isn't allowed to open are shown as "no access" and counted as unreadable. Drasil never asks for administrator rights.

## Platform differences

**Windows**

- Deleted items go to the Recycle Bin.
- Hidden items are those with the Windows "hidden" attribute, plus names starting with a dot.
- Junctions (like `Application Data`) are shown as links.
- Drives are listed by letter. Shortcuts (`.lnk`) appear as ordinary files.

**macOS**

- The first time Drasil opens Desktop, Documents, Downloads or a removable or network drive, macOS asks for permission. Some system areas also need Full Disk Access (System Settings → Privacy & Security), and folders outside your permissions show as "no access".
- Drives appear under `/Volumes`. Finder aliases appear as ordinary files.

**Linux**

- Deleted items go to your desktop's Trash (the freedesktop.org standard).
- Hidden items are names starting with a dot.
- Drives are found under `/media/<you>`, `/run/media/<you>` and `/mnt`.
- The AppImage can update itself; `.deb` and `.rpm` installs update through your package manager.

**Everywhere**

- Changes from other programs are noticed by checking folder dates every few seconds. On some USB sticks (FAT/exFAT) folder dates don't change, so press F5 there.

## Updates

Drasil never updates on its own. Settings → About → **Check for updates…** asks whether there's a newer version, then asks before downloading it and again before restarting to install. You can turn on a weekly check in the same place; it still asks before downloading.

## Troubleshooting

- **The view looks wrong or out of date:** press F5 to read the folder again.
- **Sizes look wrong:** Settings → Cache → Clear cache, then reopen the location.
- **Drasil stops responding:** it offers to reload the window. Reloading reads your folders again and changes nothing.
- **Reporting a problem:** Settings → About → Report a bug. If you like, attach the log from Settings → About → Open the log folder. It's a plain text file you can look through first.
- **Start fresh:** quit Drasil and delete its settings folder (see [Privacy](PRIVACY.md) for where it is). Your files are never inside it.
