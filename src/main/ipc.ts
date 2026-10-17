import { clipboard, ipcMain, shell } from 'electron';
import { lstat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { cancel, list } from './fs/engine';
import { getLocations } from './fs/locations';
import { cancelSearch, startSearch } from './fs/search';
import { cacheInfo, clearCache, startSizes, watchSizes } from './fs/sizes';
import { loadSettings, updateSettings } from './settings';
import { isMenuEntries, popupMenu } from './menu';
import { deleteItems, makeFolder, renameItem, trashItems } from './ops/simple';
import { cancelTransfer, resolveConflict, transfer } from './ops/transfer';

const isId = (v: unknown): v is number => Number.isSafeInteger(v);
const isPath = (v: unknown): v is string =>
    typeof v === 'string' && isAbsolute(v);
const MAX_WATCH = 10_000;
const isPathList = (v: unknown): v is string[] =>
    Array.isArray(v) &&
    v.length > 0 &&
    v.length <= MAX_WATCH &&
    v.every(isPath);
const isName = (v: unknown): v is string =>
    typeof v === 'string' && v.length <= 1024;
const MODES = new Set(['move', 'copy']);
const CHOICES = new Set(['replace', 'merge', 'keepBoth', 'skip', 'cancel']);
const invalid = { error: 'Invalid request' };

// Returns an error message for the UI, or '' on success.
async function withExisting(
    path: unknown,
    action: (path: string) => Promise<string> | void
): Promise<string> {
    if (!isPath(path)) return 'Invalid path';
    try {
        await lstat(path);
    } catch {
        return 'This item no longer exists';
    }
    return (await action(path)) ?? '';
}

export function registerIpc(): void {
    ipcMain.handle('fs:locations', () => getLocations());

    ipcMain.handle('fs:list', (event, path: unknown, id: unknown) => {
        if (!isPath(path) || !isId(id)) throw new Error('Invalid list request');
        list(path, event.sender, id);
    });

    ipcMain.on('fs:cancel', (event, id: unknown) => {
        if (isId(id)) cancel(event.sender, id);
    });

    ipcMain.handle('size:start', (event, root: unknown) => {
        if (!isPath(root)) throw new Error('Invalid size request');
        startSizes(root, event.sender);
    });

    ipcMain.on('size:watch', (event, paths: unknown) => {
        if (
            Array.isArray(paths) &&
            paths.length <= MAX_WATCH &&
            paths.every(isPath)
        )
            watchSizes(paths, event.sender);
    });

    ipcMain.handle('shell:open', (_, path: unknown) =>
        withExisting(path, (p) => shell.openPath(p))
    );

    ipcMain.handle('shell:reveal', (_, path: unknown) =>
        withExisting(path, (p) => shell.showItemInFolder(p))
    );

    ipcMain.handle('op:mkdir', (_, parent: unknown, name: unknown) =>
        isPath(parent) && isName(name) ? makeFolder(parent, name) : invalid
    );

    ipcMain.handle('op:rename', (_, path: unknown, name: unknown) =>
        isPath(path) && isName(name) ? renameItem(path, name) : invalid
    );

    ipcMain.handle('op:trash', (_, paths: unknown) => {
        if (!isPathList(paths)) throw new Error('Invalid request');
        return trashItems(paths);
    });

    ipcMain.handle('op:delete', (_, paths: unknown) => {
        if (!isPathList(paths)) throw new Error('Invalid request');
        return deleteItems(paths);
    });

    ipcMain.handle(
        'op:transfer',
        (
            event,
            id: unknown,
            mode: unknown,
            sources: unknown,
            dest: unknown
        ) => {
            if (
                !isId(id) ||
                typeof mode !== 'string' ||
                !MODES.has(mode) ||
                !isPathList(sources) ||
                !isPath(dest)
            )
                throw new Error('Invalid request');
            void transfer(
                event.sender,
                id,
                mode as 'move' | 'copy',
                sources,
                dest
            );
        }
    );

    ipcMain.on(
        'op:resolve',
        (event, id: unknown, choice: unknown, all: unknown) => {
            if (isId(id) && typeof choice === 'string' && CHOICES.has(choice))
                resolveConflict(
                    event.sender,
                    id,
                    choice as Parameters<typeof resolveConflict>[2],
                    all === true
                );
        }
    );

    ipcMain.on('op:cancel', (event, id: unknown) => {
        if (isId(id)) cancelTransfer(event.sender, id);
    });

    ipcMain.handle(
        'search:start',
        (event, id: unknown, root: unknown, query: unknown) => {
            if (
                !isId(id) ||
                !isPath(root) ||
                typeof query !== 'string' ||
                !query.trim() ||
                query.length > 255
            )
                throw new Error('Invalid search');
            startSearch(event.sender, id, root, query.trim());
        }
    );

    ipcMain.on('search:cancel', (event, id: unknown) => {
        if (isId(id)) cancelSearch(event.sender, id);
    });

    ipcMain.handle('settings:get', () => loadSettings());
    // The patch is merged and fully re-validated in sanitizeSettings.
    ipcMain.handle('settings:set', (_, patch: unknown) => updateSettings(patch));
    ipcMain.handle('cache:info', () => cacheInfo());
    ipcMain.handle('cache:clear', () => clearCache());

    ipcMain.on('clipboard:write', (_, text: unknown) => {
        if (typeof text === 'string' && text.length <= 10_000_000)
            clipboard.writeText(text);
    });

    ipcMain.handle(
        'menu:popup',
        (event, entries: unknown, x: unknown, y: unknown) =>
            isMenuEntries(entries)
                ? popupMenu(
                      event.sender,
                      entries,
                      Number.isFinite(x) ? Math.round(x as number) : undefined,
                      Number.isFinite(y) ? Math.round(y as number) : undefined
                  )
                : null
    );
}
