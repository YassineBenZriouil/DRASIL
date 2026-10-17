import { app, BrowserWindow, dialog, nativeTheme, session } from 'electron';
import { join } from 'node:path';
import { registerIpc } from './ipc';
import { log } from './log';
import { currentSettings, loadSettings } from './settings';

function createWindow(): void {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 640,
        minHeight: 480,
        title: 'Drasil',
        // Matches the page background of the active theme, so there's no flash while loading.
        backgroundColor: nativeTheme.shouldUseDarkColors
            ? '#07090d'
            : '#f6f7f5',
        show: false,
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
            // The spellchecker downloads dictionaries from the internet; Drasil makes no network calls.
            spellcheck: false,
        },
    });

    // Show only once painted, so there is no white flash before the dark theme.
    win.once('ready-to-show', () => win.show());
    // Zoom resets on each page load; reapply the interface scale.
    win.webContents.on('did-finish-load', () =>
        win.webContents.setZoomFactor(currentSettings()?.uiScale ?? 1)
    );

    // Privacy: the app never navigates or opens windows to external sites.
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => event.preventDefault());

    // Crash safety: a crashed page reloads (the filesystem is re-read; nothing is assumed),
    // and a frozen one offers to reload.
    win.webContents.on('render-process-gone', (_e, details) => {
        log(`Window process ended: ${details.reason}`);
        if (details.reason !== 'clean-exit' && !win.isDestroyed()) win.reload();
    });
    win.on('unresponsive', () => {
        log('Window stopped responding');
        void dialog
            .showMessageBox(win, {
                type: 'warning',
                message: 'Drasil isn’t responding',
                detail: 'You can wait, or reload the window. Reloading reads your folders again; no files are changed.',
                buttons: ['Wait', 'Reload'],
                defaultId: 0,
                cancelId: 0,
            })
            .then(({ response }) => {
                if (response === 1 && !win.isDestroyed()) win.reload();
            });
    });

    if (process.env['ELECTRON_RENDERER_URL']) {
        win.loadURL(process.env['ELECTRON_RENDERER_URL']);
    } else {
        win.loadFile(join(__dirname, '../renderer/index.html'));
    }
}

// Privacy guard: no request may leave the computer. Only the app's own files (and the local
// dev server while developing) load; anything else is blocked and logged as a bug.
function blockNetwork(): void {
    const dev = process.env['ELECTRON_RENDERER_URL'];
    const devHost = dev ? new URL(dev).host : null;
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        const url = new URL(details.url);
        const local =
            [
                'file:',
                'data:',
                'blob:',
                'devtools:',
                'chrome-extension:',
            ].includes(url.protocol) ||
            (devHost !== null && url.host === devHost);
        if (!local)
            log('Blocked a network request (this is a bug)', details.url);
        callback({ cancel: !local });
    });
}

process.on('uncaughtException', (err) => log('Uncaught error', err));
process.on('unhandledRejection', (err) => log('Unhandled rejection', err));

app.whenReady().then(async () => {
    blockNetwork();
    registerIpc();
    await loadSettings();
    createWindow();

    // macOS: re-create a window when the dock icon is clicked and none are open.
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
