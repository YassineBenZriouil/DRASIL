import { ipcMain } from 'electron';
import { isAbsolute } from 'node:path';
import { cancel, list } from './fs/engine';
import { getLocations } from './fs/locations';
import { startSizes, watchSizes } from './fs/sizes';

const isId = (v: unknown): v is number => Number.isSafeInteger(v);
const isPath = (v: unknown): v is string =>
    typeof v === 'string' && isAbsolute(v);
const MAX_WATCH = 10_000;

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
}
