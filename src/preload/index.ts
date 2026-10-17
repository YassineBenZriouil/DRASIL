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
    platform: process.platform,
    getSettings: () => ipcRenderer.invoke('settings:get'),
    setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
    cacheInfo: () => ipcRenderer.invoke('cache:info'),
    clearCache: () => ipcRenderer.invoke('cache:clear'),
    locations: () => ipcRenderer.invoke('fs:locations'),
    list: (path, id) => ipcRenderer.invoke('fs:list', path, id),
    cancel: (id) => ipcRenderer.send('fs:cancel', id),
    onListEvent: (callback) => subscribe('fs:list-event', callback),
    startSizes: (root) => ipcRenderer.invoke('size:start', root),
    watchSizes: (paths) => ipcRenderer.send('size:watch', paths),
    onSizeEvent: (callback) => subscribe('size:event', callback),
    open: (path) => ipcRenderer.invoke('shell:open', path),
    reveal: (path) => ipcRenderer.invoke('shell:reveal', path),
    mkdir: (parent, name) => ipcRenderer.invoke('op:mkdir', parent, name),
    rename: (path, name) => ipcRenderer.invoke('op:rename', path, name),
    trash: (paths) => ipcRenderer.invoke('op:trash', paths),
    deletePermanently: (paths) => ipcRenderer.invoke('op:delete', paths),
    transfer: (id, mode, sources, dest) =>
        ipcRenderer.invoke('op:transfer', id, mode, sources, dest),
    resolveConflict: (id, choice, all) =>
        ipcRenderer.send('op:resolve', id, choice, all),
    cancelOp: (id) => ipcRenderer.send('op:cancel', id),
    onOpEvent: (callback) => subscribe('op:event', callback),
    copyText: (text) => ipcRenderer.send('clipboard:write', text),
    watchFolders: (paths) => ipcRenderer.send('watch:set', paths),
    onFsChanged: (callback) => subscribe('fs:changed', callback),
    logError: (message) => ipcRenderer.send('log:error', message),
    appInfo: () => ipcRenderer.invoke('app:info'),
    checkForUpdates: () => ipcRenderer.send('app:checkUpdates'),
    openLink: (kind) => ipcRenderer.send('app:link', kind),
    openLogFolder: () => ipcRenderer.send('app:openLogs'),
    onMenuCommand: (callback) => subscribe('menu:command', callback),
    search: (id, root, query) =>
        ipcRenderer.invoke('search:start', id, root, query),
    cancelSearch: (id) => ipcRenderer.send('search:cancel', id),
    onSearchEvent: (callback) => subscribe('search:event', callback),
    popupMenu: (entries, x, y) =>
        ipcRenderer.invoke('menu:popup', entries, x, y),
};

contextBridge.exposeInMainWorld('drasil', api);
