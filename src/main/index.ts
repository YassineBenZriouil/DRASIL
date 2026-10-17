import { app, BrowserWindow, nativeTheme } from 'electron';
import { join } from 'node:path';
import { registerIpc } from './ipc';
import { currentSettings, loadSettings } from './settings';

function createWindow(): void {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 640,
        minHeight: 480,
        title: 'Drasil',
        // Matches the page background of the active theme, so there's no flash while loading.
        backgroundColor: nativeTheme.shouldUseDarkColors ? '#07090d' : '#f6f7f5',
        show: false,
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
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

    if (process.env['ELECTRON_RENDERER_URL']) {
        win.loadURL(process.env['ELECTRON_RENDERER_URL']);
    } else {
        win.loadFile(join(__dirname, '../renderer/index.html'));
    }
}

app.whenReady().then(async () => {
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
