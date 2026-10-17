# DRASIL
## A Living World for Your Files

**Product vision and user experience specification**

---

## 1. What Is Drasil?

Drasil is a cross-platform desktop application that transforms your computer's filesystem into an interactive, living world tree.

Instead of navigating endless lists of folders and files, users explore a beautiful, immersive radial tree that reveals how everything on their computer is organized.

Folders become branches. Files become leaves. Entire directories become living regions of the world, expanding outward as users explore deeper into their filesystem.

Drasil is not just a way to look at files. It is a complete file manager. Users can explore, search, organize, move, copy, rename, open, and delete their files directly inside this visual world.

Drasil runs on Windows, macOS, and Linux.

**The central idea:** Make the filesystem something people can see, understand, explore, and interact with instead of something they merely navigate.

---

## 2. The Vision

Modern file managers are functional, but their interfaces are largely built around lists, rows, columns, and nested folders.

Drasil offers a different experience.

Imagine opening your computer and seeing a vast world tree. At its center is your selected root. Major branches spread outward, representing the main directories. Smaller branches lead into deeper folders, while individual files appear as leaves.

A small project might look like a compact tree with a handful of branches. A computer containing years of documents, photographs, applications, and projects might reveal an enormous, intricate world.

You can zoom out to understand the overall structure, then zoom into a particular region to explore its contents.

The world is not merely an illustration. Every branch and leaf represents something real on your computer.

Drasil should feel atmospheric and alive without sacrificing clarity, speed, or practicality.

---

## 3. The Design Philosophy

### A living world, not a spreadsheet

The filesystem should feel like a coherent environment rather than a collection of rows.

Branches, leaves, connections, depth, scale, and subtle motion should communicate structure naturally.

### Beautiful, but useful

The interface should be visually distinctive, immersive, and memorable. However, users must always understand where they are, what they have selected, and what an action will do.

Visual effects must never make everyday file management harder.

### Start with the whole, explore the details

Users should understand the broad shape of their filesystem without seeing millions of individual items at once.

The world begins with a simplified overview. More detail appears as users zoom in, expand branches, or search for something.

### Every action has a real consequence

Creating a folder creates a real folder. Moving a leaf moves the actual file. Renaming a branch renames the actual directory.

The visualization must always reflect the real filesystem.

### Your files stay yours

Drasil is local-first. Users do not need accounts, cloud storage, or an internet connection to use its core features.

Their files remain on their computer, subject to the operating system's normal permissions.

---

## 4. The Visual World

### 4.1 The radial tree

The primary view is a radial tree.

The selected root sits near the center. Major directories extend outward into branches, and their contents spread into progressively smaller branches and leaves.

The layout should feel organic rather than mechanically rigid, while preserving a clear parent-child relationship between every item.

The tree must remain understandable even when its branches become large and complex.

### 4.2 The visual identity

Drasil's default appearance is dark, atmospheric, and immersive.

The visual language may include:

- Deep, dark backgrounds.
- Elegant branches and fine connecting lines.
- Subtle lighting and restrained glow.
- Gentle transitions as branches open and close.
- Distinctive shapes for folders, files, and special items.
- Soft depth and layered visual elements.
- Clear highlights for selected and searched items.
- Carefully controlled motion that gives the world a sense of life.

The experience should feel like exploring a mysterious, beautifully designed digital ecosystem.

It should not look like a generic operating-system file manager with a tree drawn on top.

At the same time, the interface must avoid excessive particles, bloom, decoration, or animation that distracts from the files themselves.

### 4.3 Folders as branches

Every folder is a branching point.

Opening a folder reveals its direct contents. Expanding it further reveals the next layer of the filesystem.

Large directories should be able to occupy more visual space than small ones when useful for communicating their structure.

Users must be able to distinguish between a branch that has no children, one that has not yet been explored, and one whose contents cannot be accessed.

### 4.4 Files as leaves

Files appear as terminal elements connected to their containing directories.

Their appearance may communicate their type, such as documents, images, videos, audio files, archives, or applications.

File type should be recognizable without requiring every filename to remain visible at all times.

When users zoom in or select a file, its name and relevant information become easier to read.

### 4.5 Visual states

The world should communicate what is happening through clear visual changes.

- **Selected:** The current item is unmistakably highlighted.
- **Focused:** Keyboard navigation has a clear focus indicator.
- **Expanded:** The contents of a directory are visible.
- **Collapsed:** The directory remains present, but its contents are hidden.
- **Loading:** Drasil is discovering the contents of a location.
- **Partially explored:** Some contents are known, but the directory has not been fully scanned.
- **Inaccessible:** The operating system prevents access to the item.
- **Unavailable:** A drive or location is no longer available.
- **Search match:** The matching item stands out from its surroundings.
- **Operation in progress:** An item is being moved, copied, renamed, or otherwise processed.
- **Error:** An operation failed and requires attention.

Color should never be the only way these states are communicated.

---

## 5. Exploring the World

### 5.1 Moving around

Users should be able to navigate naturally using their mouse, trackpad, or keyboard.

They can:

- Pan across the world.
- Zoom in and out.
- Select files and folders.
- Expand and collapse branches.
- Focus on a particular branch.
- Return to the root.
- Jump to a parent directory.
- Navigate backward and forward through previous locations.
- Open files in their usual applications.
- Reveal files in the operating system's file manager.

Movement should feel fluid and predictable.

The interface should preserve spatial context when possible, so users understand how a newly expanded branch relates to the rest of the world.

### 5.2 Zooming

Zooming is one of Drasil's defining interactions.

At a distant view, users see the overall shape of their filesystem.

At medium distance, major folders and their relationships become clearer.

At close range, individual files, filenames, and detailed information become accessible.

Drasil should gradually change the amount of detail displayed instead of shrinking every filename until the screen becomes unreadable.

### 5.3 Expanding branches

Expanding a directory should reveal its children without requiring the entire filesystem to be loaded first.

Users should be able to continue exploring while Drasil discovers additional contents in the background.

A directory with thousands of children should not overwhelm the screen. Drasil should simplify dense regions and reveal their individual items as the user approaches them.

### 5.4 Maintaining orientation

Users must always have a way to understand where they are.

Drasil should provide:

- A visible indication of the current root.
- A navigable ancestry path.
- A way to jump to parent directories.
- A way to refocus the current selection.
- A way to return to the overall view.
- A way to locate the selected item in its surrounding structure.

Users should never feel lost in their own filesystem.

---

## 6. The Main Screen

The main screen is centered on the world tree.

The interface should remain minimal enough that the visualization occupies most of the available space.

### 6.1 The world canvas

The canvas is the main working area.

Users explore, select, expand, and manipulate files here. It should respond smoothly to movement and zooming, and it should remain useful even when the filesystem is very large.

### 6.2 Navigation

A compact navigation area provides access to the current location, parent directories, previous locations, and available drives or volumes.

It should be easy to move between different parts of the computer without restarting the application.

### 6.3 Search

Search should be available without leaving the world.

Users can search for a filename, locate a directory, and jump directly to a matching result.

Search results should include enough information to distinguish items with identical names, such as their parent directories and paths.

Selecting a result should guide the user to its location in the tree.

If the relevant branch is not currently visible, Drasil should reveal the necessary path progressively.

### 6.4 The inspector

Selecting a file or folder opens an information panel.

The inspector should show relevant information, including:

- Name.
- Full location.
- Item type.
- File size, when applicable.
- Modification date.
- Other available properties.
- Available actions.

The inspector should also provide convenient access to common file-management operations.

It must not permanently consume a large portion of the screen when it is unnecessary.

### 6.5 Status and progress

Drasil should communicate ongoing activity clearly.

Users should be able to tell when a directory is being explored, a search is running, or a file operation is in progress.

Progress information should be informative without overwhelming the interface with technical details.

---

## 7. Managing Files

Drasil must be a real file manager, not a read-only visualization tool.

Users should be able to perform ordinary file-management tasks without leaving the application.

### 7.1 Opening files

Double-clicking a file opens it with the operating system's default application.

Users should also be able to reveal the file in their normal system file manager.

### 7.2 Creating folders

Users can create a directory inside a selected directory.

The new branch should appear in the appropriate location, with a clear indication of where it was created.

### 7.3 Renaming

Users can rename files and folders directly from the tree or inspector.

The new name should immediately be reflected in the visualization after the filesystem confirms the operation.

If the name is invalid or already exists, Drasil should explain the problem and allow the user to correct it.

### 7.4 Moving files

Users can drag files or folders onto another directory to move them.

The intended destination must be visually clear before the operation begins.

Drasil should make it obvious whether the action will move or copy an item when both behaviors are available.

Users must not accidentally move a directory into itself or one of its descendants.

### 7.5 Copying files

Users can copy individual files, multiple selections, or entire directories.

The application should communicate the destination, progress, and completion status.

When a file with the same name already exists, users must be able to choose what happens rather than having Drasil silently overwrite it.

### 7.6 Deleting files

Deleting an item should normally move it to the operating system's Trash or Recycle Bin where supported.

Permanent deletion must be clearly distinguished from recoverable deletion and require appropriate confirmation.

Drasil should never imply that ordinary deletion securely erases data.

### 7.7 Selecting multiple items

Users should be able to select multiple files and folders for batch operations.

Selection must remain visually clear, including when the selected items are in different branches.

### 7.8 Contextual actions

Right-clicking a file or folder opens a contextual menu with relevant actions.

Typical actions include:

- Open.
- Open location.
- Copy.
- Cut.
- Paste.
- Rename.
- Delete.
- Copy path.
- Show properties.
- Refresh.

Only applicable actions should be shown as available.

### 7.9 Keyboard interaction

Every important file-management operation should be accessible through the keyboard.

Users should be able to navigate branches, select items, open files, rename entries, search, and access contextual actions without depending on precise mouse movements.

---

## 8. Understanding the Filesystem

Drasil should help users understand their computer, not just browse it.

### 8.1 Seeing the big picture

The overall tree should communicate how a filesystem is organized.

Users should be able to recognize major areas, discover deeply nested directories, and understand where large collections of files are located.

### 8.2 Discovering large directories

Users should be able to identify folders that consume significant disk space.

Folder-size information should be displayed when available, with a clear distinction between complete totals, estimates, and incomplete calculations.

Calculating the size of a very large directory should never freeze the application.

### 8.3 Understanding file types

Drasil should offer visual distinctions between common file types.

Users should be able to filter the view to focus on particular categories, such as photographs, documents, videos, archives, or development projects.

### 8.4 Finding old or unusual files

Users should be able to filter or sort by file size, modification date, type, and other available properties.

These features should help users understand their filesystem without automatically modifying or deleting anything.

### 8.5 Exploring the whole computer

Users should be able to choose from the drives, volumes, and locations available to their operating system.

They should be able to explore multiple locations and understand when a drive is disconnected, a directory is inaccessible, or a scan is incomplete.

Drasil must respect operating-system permissions. It should never suggest that every file is accessible merely because the application can display the computer's overall structure.

---

## 9. Search and Discovery

Search is essential because even a beautiful filesystem visualization cannot make every file easy to locate manually.

### 9.1 Searching by name

Users can search for files and folders by name, including partial names.

Results should be easy to distinguish and should display their locations.

### 9.2 Navigating to results

Selecting a search result should guide the user to the corresponding location in the world.

Drasil should preserve enough surrounding context to help users understand where the item belongs.

### 9.3 Filtering

Users should be able to narrow the visible contents by:

- File or folder.
- File type.
- Size.
- Modification date.
- Hidden status.
- Other available properties.

Filters should make it clear when items are hidden from the current view. A filtered-out item must not be mistaken for a deleted file.

### 9.4 Incomplete results

If some locations have not been scanned or cannot be accessed, Drasil must communicate that limitation.

Search results should never imply that the entire computer was searched successfully when that is not true.

---

## 10. Working with Large Filesystems

A major challenge is representing an entire computer without turning the world into an unreadable mass of tiny objects.

Drasil should use a hybrid approach.

At a broad view, it displays the overall shape and major branches of the filesystem.

As users zoom in, expand directories, or search, it reveals more detail.

Dense branches can be represented by simplified visual groupings until the user explores them.

This approach should provide three benefits:

1. The filesystem remains understandable at a distance.
2. Individual files remain accessible at close range.
3. The application remains responsive without drawing every item simultaneously.

Drasil must distinguish between a branch that has been fully explored and one that is still being discovered.

A collapsed branch is not an empty branch. A partially scanned folder is not a fully known folder.

These distinctions are fundamental to user trust.

---

## 11. First Launch Experience

The first launch should introduce the idea without overwhelming the user.

### Step 1: Welcome

Present Drasil's purpose in a short, clear introduction.

Explain that it turns folders and files into an interactive world tree.

### Step 2: Choose a starting location

Show available drives, volumes, and common locations.

Let users choose where to begin instead of immediately scanning every reachable location.

### Step 3: Build the first view

Start discovering the selected location's contents.

Display the first useful representation as soon as possible.

Do not make users wait for an entire filesystem scan before they can interact with the application.

### Step 4: Explore

Allow users to zoom, pan, select, and expand branches while additional information is discovered.

Provide subtle hints for the main interactions, but do not force users through a lengthy tutorial.

### Step 5: Continue using Drasil

The application should remember useful preferences and previously selected locations where appropriate.

On subsequent launches, it should restore a useful starting point without presenting stale cached information as guaranteed to be current.

---

## 12. Handling Errors and Unusual Situations

Drasil should behave predictably when something goes wrong.

### Inaccessible files

Explain that the operating system denied access or that the item could not be read.

Do not crash or silently omit important information.

### Disconnected drives

Clearly mark the affected location as unavailable.

When the drive becomes available again, Drasil should allow the user to refresh or resume exploration.

### Missing files

If a file disappears because another application moved or deleted it, update the visualization and communicate the change when appropriate.

### Failed operations

If a move, copy, rename, or deletion fails, explain what happened and what the user can do next.

Partial operations must be reported honestly.

### Name conflicts

When the destination already contains an item with the same name, present clear choices.

Never silently overwrite an existing file.

### Large operations

Display progress and provide cancellation when it is safe and supported.

Do not imply that an operation can always be reversed.

### Interrupted operations

After an interruption, Drasil should check the actual filesystem and update its view rather than assuming the operation completed or failed entirely.

---

## 13. Privacy and User Trust

Privacy is a defining product commitment.

Drasil should work locally without requiring an account or cloud service.

The initial product should not include telemetry, analytics, advertising, remote file indexing, or automatic uploading of filesystem information.

File names, paths, and metadata should not be sent to external services.

The application should not require administrator or root privileges for ordinary use.

Users should be able to understand what Drasil is scanning and which locations are inaccessible.

Local metadata caching may be used to improve performance, but the application should explain that cached information can become outdated.

Users should be able to clear the local cache without deleting their actual files.

The filesystem itself remains the source of truth.

---

## 14. Cross-Platform Experience

Drasil must support Windows, macOS, and Linux as first-class platforms.

The visual language, navigation model, and core file-management experience should remain consistent across all three.

However, the application must respect meaningful differences between operating systems.

For example, file permissions, path conventions, available drives, aliases, symbolic links, deletion behavior, and system integrations may differ.

Where a feature behaves differently, Drasil should communicate that difference rather than pretending the platforms are identical.

No platform should be treated as a disposable afterthought.

---

## 15. Accessibility and Comfort

The world tree is the primary interface, but it must not be the only way to interact with files.

Drasil should provide an accessible alternative for browsing and selecting items.

It should include keyboard navigation, visible focus indicators, readable text, sufficient contrast, and accessible descriptions of selected items.

The application should not rely exclusively on color to communicate file types, selection, errors, or loading states.

Users should be able to reduce or disable nonessential animations.

The interface should remain usable on high-resolution displays and at different scaling settings.

Accessibility is part of the product's quality, not a separate feature to consider at the end.

---

## 16. Personalization

Personalization should improve the experience without distracting from the core product.

Potential settings include:

- Theme and appearance.
- Animation intensity.
- Default starting location.
- Hidden-file visibility.
- Default zoom level.
- Preferred navigation behavior.
- File-type display preferences.
- Inspector visibility.
- Keyboard shortcut preferences.
- Scan scope and excluded locations.

Drasil should provide sensible defaults so users can begin immediately.

Personalization should remain optional.

---

## 17. Future Possibilities

The first release should focus on making the radial world tree an excellent file manager.

Future releases may explore:

- Alternative filesystem visualizations.
- More detailed disk-usage exploration.
- Duplicate-file discovery.
- Saved views and bookmarks.
- Advanced search and filtering.
- More ways to compare folders and their contents.
- Custom visual themes.
- Additional file metadata and analysis.
- Extensions that add new ways to explore or understand files.

These possibilities should grow from a reliable core rather than delaying the initial product.

The radial tree remains Drasil's defining experience.

---

## 18. What Drasil Must Never Become

Drasil must not become a beautiful interface that is impractical for real work.

It must not hide files merely because they do not fit the visualization.

It must not confuse an unscanned directory with an empty directory.

It must not silently delete or overwrite data.

It must not require users to upload filesystem information to use the product.

It must not sacrifice navigation clarity for decorative effects.

It must not make ordinary file operations dependent on an internet connection.

It must not pretend that all operating systems behave identically.

It must not attempt to display every item simultaneously at the expense of responsiveness.

Above all, it must never allow the visual metaphor to become more important than the user's ability to understand and manage their own files.

---

## 19. What Success Looks Like

Drasil succeeds when a user can open it and immediately recognize the overall shape of their filesystem.

They can discover where things are, understand how directories relate to each other, and locate files without feeling trapped in endless nested folders.

They can move from a broad overview to a specific file naturally.

They can perform real file-management tasks with confidence.

The application remains responsive even when the filesystem is large.

It works across Windows, macOS, and Linux.

It respects privacy, handles failures honestly, and never sacrifices user trust for visual spectacle.

And most importantly, using Drasil feels fundamentally different from using a conventional file manager.

---

## 20. The Core Promise

**Drasil turns your filesystem into a world you can explore.**

A world where folders form branches, files become leaves, and the structure of your computer becomes visible.

You can zoom out to understand the whole, zoom in to discover the details, and interact with real files as naturally as you explore the world around them.

Beautiful enough to inspire curiosity. Practical enough to use every day. Private enough to trust.

**Drasil — Explore the world within your computer.**
