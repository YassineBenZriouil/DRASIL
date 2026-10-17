// Updates that always ask first: nothing is checked unless the user asks (or turned on the weekly
// check in Settings), nothing is downloaded without a yes, and nothing installs without a restart
// the user chose.
import { app, BrowserWindow, dialog, shell } from 'electron';
import electronUpdater from 'electron-updater';
import pkg from '../../package.json';
import { log } from './log';
import { setUpdateAccess } from './network';
import { currentSettings, updateSettings } from './settings';

const { autoUpdater } = electronUpdater;
const WEEK = 7 * 24 * 60 * 60 * 1000;
const releasesPage = `${pkg.homepage}/releases/latest`;

// Installed builds that can replace themselves. deb/rpm installs update through the package manager.
export function canSelfUpdate(): boolean {
    if (!app.isPackaged) return false;
    if (process.platform === 'linux') return Boolean(process.env['APPIMAGE']);
    return true;
}

let busy = false;

async function ask(
    win: BrowserWindow | null,
    message: string,
    detail: string,
    buttons: string[]
): Promise<number> {
    const opts = {
        type: 'question' as const,
        message,
        detail,
        buttons,
        defaultId: 0,
        cancelId: buttons.length - 1,
    };
    const r = win
        ? await dialog.showMessageBox(win, opts)
        : await dialog.showMessageBox(opts);
    return r.response;
}

// `quiet`: the weekly check only speaks up when there's something new.
export async function checkForUpdates(quiet = false): Promise<void> {
    if (busy) return;
    const win =
        BrowserWindow.getFocusedWindow() ??
        BrowserWindow.getAllWindows()[0] ??
        null;
    if (!canSelfUpdate()) {
        if (quiet) return;
        const choice = await ask(
            win,
            app.isPackaged
                ? 'Update with your package manager'
                : 'Updates work in installed versions',
            app.isPackaged
                ? 'This copy of Drasil was installed as a system package. Your package manager updates it, or you can get the latest version from the download page.'
                : 'This is a development build. Installed versions can check for updates.',
            ['Open the download page', 'Close']
        );
        if (choice === 0) void shell.openExternal(releasesPage);
        return;
    }
    busy = true;
    setUpdateAccess(true);
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.logger = {
        info: () => {},
        warn: (m) => log(`Updater: ${m}`),
        error: (m) => log(`Updater: ${m}`),
        debug: () => {},
    };
    try {
        void updateSettings({ lastUpdateCheck: Date.now() });
        const result = await autoUpdater.checkForUpdates();
        const next = result?.updateInfo.version;
        if (!result?.isUpdateAvailable || !next) {
            if (!quiet)
                await ask(
                    win,
                    'Drasil is up to date',
                    `You have the latest version, ${app.getVersion()}.`,
                    ['OK']
                );
            return;
        }
        const download = await ask(
            win,
            `Drasil ${next} is available`,
            `You have version ${app.getVersion()}. Download the new version now? You can keep working while it downloads.`,
            ['Download', 'Not now']
        );
        if (download !== 0) return;
        await autoUpdater.downloadUpdate();
        const restart = await ask(
            win,
            `Drasil ${next} is ready`,
            'Restart Drasil to finish updating. Your files are not affected.',
            ['Restart now', 'Later (when I quit)']
        );
        if (restart === 0) autoUpdater.quitAndInstall();
        // They said yes to the update, just not to restarting now.
        else autoUpdater.autoInstallOnAppQuit = true;
    } catch (err) {
        log('Update check failed', err);
        if (!quiet)
            await ask(
                win,
                'Couldn’t check for updates',
                'Check your internet connection and try again, or get the latest version from the download page.',
                ['OK']
            );
    } finally {
        setUpdateAccess(false);
        busy = false;
    }
}

// Runs at startup; does nothing unless the user turned on weekly checks.
export function maybeCheckWeekly(): void {
    const s = currentSettings();
    if (s?.autoCheckUpdates && Date.now() - s.lastUpdateCheck > WEEK)
        void checkForUpdates(true);
}
