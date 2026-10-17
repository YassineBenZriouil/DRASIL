import {
    BrowserWindow,
    Menu,
    type MenuItemConstructorOptions,
    type WebContents,
} from 'electron';
import type { MenuEntry } from '../shared/fs-types';

export function isMenuEntries(v: unknown): v is MenuEntry[] {
    return (
        Array.isArray(v) &&
        v.length <= 50 &&
        v.every(
            (e) =>
                e &&
                typeof e === 'object' &&
                (e.separator === true ||
                    (typeof e.id === 'string' && typeof e.label === 'string'))
        )
    );
}

// Native context menu. Resolves to the chosen id, or null if dismissed.
export function popupMenu(
    sender: WebContents,
    entries: MenuEntry[],
    x?: number,
    y?: number
): Promise<string | null> {
    return new Promise((resolve) => {
        let settled = false;
        const settle = (v: string | null): void => {
            if (settled) return;
            settled = true;
            resolve(v);
        };
        const template: MenuItemConstructorOptions[] = entries.map((e) =>
            'separator' in e
                ? { type: 'separator' }
                : {
                      label: e.label,
                      enabled: e.enabled !== false,
                      accelerator: e.accelerator,
                      // Shortcuts are only shown here; the renderer handles the keys itself.
                      registerAccelerator: false,
                      click: () => settle(e.id),
                  }
        );
        const window = BrowserWindow.fromWebContents(sender) ?? undefined;
        Menu.buildFromTemplate(template).popup({
            window,
            x,
            y,
            // On some platforms the menu closes before the click fires; give it a moment.
            callback: () => setTimeout(() => settle(null), 100),
        });
    });
}
