export interface Settings {
    theme: 'system' | 'dark' | 'light';
    // 'reduced' turns off all non-essential motion; 'system' follows the OS setting.
    motion: 'system' | 'full' | 'reduced';
    // Zoom factor for the whole interface (text, panels, tree).
    uiScale: number;
    // Tree only, tree with the list view beside it, or the list view alone.
    layout: 'tree' | 'both' | 'list';
    inspector: boolean;
    // 'ask' shows the location picker, 'last' reopens the last location, or an absolute path.
    startLocation: string;
    lastLocation: string | null;
    showHidden: boolean;
    // Folders that size calculation and search never enter.
    excludes: string[];
    // Shortcut overrides by command id (see renderer/keys.ts).
    keys: Record<string, string[]>;
}

export const DEFAULT_SETTINGS: Settings = {
    theme: 'system',
    motion: 'system',
    uiScale: 1,
    layout: 'tree',
    inspector: true,
    startLocation: 'ask',
    lastLocation: null,
    showHidden: true,
    excludes: [],
    keys: {},
};

const isAbsolute = (p: string): boolean =>
    p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\');

function oneOf<T extends string>(v: unknown, options: readonly T[], fallback: T): T {
    return options.includes(v as T) ? (v as T) : fallback;
}

// Anything unexpected falls back to the default, so a damaged settings file can't break the app.
export function sanitizeSettings(raw: unknown): Settings {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const d = DEFAULT_SETTINGS;
    const keys: Record<string, string[]> = {};
    if (r.keys && typeof r.keys === 'object')
        for (const [id, combos] of Object.entries(r.keys as Record<string, unknown>))
            if (
                id.length < 64 &&
                Array.isArray(combos) &&
                combos.length <= 4 &&
                combos.every((c) => typeof c === 'string' && c.length < 40)
            )
                keys[id] = combos as string[];
    const start = typeof r.startLocation === 'string' ? r.startLocation : d.startLocation;
    return {
        theme: oneOf(r.theme, ['system', 'dark', 'light'] as const, d.theme),
        motion: oneOf(r.motion, ['system', 'full', 'reduced'] as const, d.motion),
        uiScale:
            typeof r.uiScale === 'number' && r.uiScale >= 0.75 && r.uiScale <= 2
                ? r.uiScale
                : d.uiScale,
        layout: oneOf(r.layout, ['tree', 'both', 'list'] as const, d.layout),
        inspector: typeof r.inspector === 'boolean' ? r.inspector : d.inspector,
        startLocation:
            start === 'ask' || start === 'last' || isAbsolute(start) ? start : d.startLocation,
        lastLocation:
            typeof r.lastLocation === 'string' && isAbsolute(r.lastLocation)
                ? r.lastLocation
                : null,
        showHidden: typeof r.showHidden === 'boolean' ? r.showHidden : d.showHidden,
        excludes: Array.isArray(r.excludes)
            ? r.excludes
                  .filter((p): p is string => typeof p === 'string' && isAbsolute(p))
                  .slice(0, 200)
            : [],
        keys,
    };
}
