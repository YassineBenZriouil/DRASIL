import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { DrasilApi } from '../shared/fs-types';

function subscribe<T>(channel: string, callback: (event: T) => void) {
    const handler = (_: IpcRendererEvent, event: T): void => callback(event);
    ipcRenderer.on(channel, handler);
    return () => {
        ipcRenderer.removeListener(channel, handler);
    };
}

const api: DrasilApi = {
    locations: () => ipcRenderer.invoke('fs:locations'),
    list: (path, id) => ipcRenderer.invoke('fs:list', path, id),
    cancel: (id) => ipcRenderer.send('fs:cancel', id),
    onListEvent: (callback) => subscribe('fs:list-event', callback),
    startSizes: (root) => ipcRenderer.invoke('size:start', root),
    watchSizes: (paths) => ipcRenderer.send('size:watch', paths),
    onSizeEvent: (callback) => subscribe('size:event', callback),
    open: (path) => ipcRenderer.invoke('shell:open', path),
    reveal: (path) => ipcRenderer.invoke('shell:reveal', path),
};

contextBridge.exposeInMainWorld('drasil', api);
