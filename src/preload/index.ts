import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { DrasilApi, ListEvent } from '../shared/fs-types';

const api: DrasilApi = {
    locations: () => ipcRenderer.invoke('fs:locations'),
    list: (path, id) => ipcRenderer.invoke('fs:list', path, id),
    cancel: (id) => ipcRenderer.send('fs:cancel', id),
    onListEvent: (callback) => {
        const handler = (_: IpcRendererEvent, event: ListEvent): void =>
            callback(event);
        ipcRenderer.on('fs:list-event', handler);
        return () => ipcRenderer.removeListener('fs:list-event', handler);
    },
};

contextBridge.exposeInMainWorld('drasil', api);
