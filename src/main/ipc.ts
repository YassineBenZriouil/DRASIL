import { ipcMain } from 'electron';
import { isAbsolute } from 'node:path';
import { cancel, list } from './fs/engine';
import { getLocations } from './fs/locations';

const isId = (v: unknown): v is number => Number.isSafeInteger(v);

export function registerIpc(): void {
    ipcMain.handle('fs:locations', () => getLocations());

    ipcMain.handle('fs:list', (event, path: unknown, id: unknown) => {
        if (typeof path !== 'string' || !isAbsolute(path) || !isId(id))
            throw new Error('Invalid list request');
        list(path, event.sender, id);
    });

    ipcMain.on('fs:cancel', (event, id: unknown) => {
        if (isId(id)) cancel(event.sender, id);
    });
}
