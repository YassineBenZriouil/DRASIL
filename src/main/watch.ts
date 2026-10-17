// Notices changes made by other apps in the folders that are open in the tree.
// It polls each folder's modification time instead of using fs.watch: on Windows a watch keeps a
// handle open that can stop other programs from deleting folders, and polling also works on network
// drives and notices when a drive disappears.
// shortcut: some FAT/exFAT drives don't update folder times, so changes there show only on refresh (F5).
import type { WebContents } from 'electron';
import { stat } from 'node:fs/promises';

const INTERVAL_MS = 3000;
const MAX_FOLDERS = 2000;
const CONCURRENCY = 32;

// Folder → last seen modification time (NaN while it can't be read).
let folders = new Map<string, number>();
let owner: WebContents | null = null;
let busy = false;

export function setWatched(sender: WebContents, paths: string[]): void {
    owner = sender;
    const next = new Map<string, number>();
    for (const p of paths.slice(0, MAX_FOLDERS)) {
        const seen = folders.get(p);
        // undefined = not checked yet; the first check only records a starting point.
        if (seen !== undefined) next.set(p, seen);
        else next.set(p, -1);
    }
    folders = next;
}

async function check(): Promise<void> {
    if (busy || !owner || owner.isDestroyed() || folders.size === 0) return;
    busy = true;
    const changed: string[] = [];
    const entries = [...folders.entries()];
    try {
        for (let i = 0; i < entries.length; i += CONCURRENCY) {
            await Promise.all(
                entries
                    .slice(i, i + CONCURRENCY)
                    .map(async ([path, before]) => {
                        const now = await stat(path).then(
                            (s) => s.mtimeMs,
                            () => NaN
                        );
                        if (!folders.has(path)) return;
                        folders.set(path, now);
                        const same =
                            before === now ||
                            (Number.isNaN(before) && Number.isNaN(now));
                        if (before !== -1 && !same) changed.push(path);
                    })
            );
        }
    } finally {
        busy = false;
    }
    if (changed.length && owner && !owner.isDestroyed())
        owner.send('fs:changed', changed);
}

setInterval(() => void check(), INTERVAL_MS);
