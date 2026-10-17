import { app, nativeTheme, webContents } from 'electron';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sanitizeSettings, type Settings } from '../shared/settings';

const file = (): string => join(app.getPath('userData'), 'settings.json');
let current: Settings | null = null;

export async function loadSettings(): Promise<Settings> {
    if (current) return current;
    const raw = await readFile(file(), 'utf8').then(
        (t) => JSON.parse(t) as unknown,
        () => ({})
    );
    current = sanitizeSettings(raw);
    applySettings(current);
    return current;
}

export async function updateSettings(patch: unknown): Promise<Settings> {
    const base = await loadSettings();
    const p = patch && typeof patch === 'object' ? patch : {};
    current = sanitizeSettings({ ...base, ...p });
    applySettings(current);
    // Write to a temp file first, so a crash mid-write can't leave a broken settings file.
    const tmp = file() + '.tmp';
    await writeFile(tmp, JSON.stringify(current, null, 2));
    await rename(tmp, file());
    return current;
}

export function currentSettings(): Settings | null {
    return current;
}

// Theme drives prefers-color-scheme in the page and the native menus; scale is the zoom factor.
export function applySettings(s: Settings): void {
    nativeTheme.themeSource = s.theme;
    for (const wc of webContents.getAllWebContents())
        if (!wc.isDestroyed()) wc.setZoomFactor(s.uiScale);
}
