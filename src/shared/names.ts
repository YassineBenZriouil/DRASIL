// File name rules, checked in the renderer for quick feedback and again in the main process.

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

// Returns a message explaining what's wrong with `name`, or null if it's fine.
export function nameProblem(name: string, platform: string): string | null {
    const windows = platform === 'win32';
    if (!name.trim()) return 'Enter a name.';
    if (name === '.' || name === '..') return 'This name is reserved.';
    // eslint-disable-next-line no-control-regex
    if (windows && /[\\/<>:"|?*\x00-\x1f]/.test(name))
        return 'Names can’t contain \\ / : * ? " < > |';
    if (!windows && /[/\0]/.test(name)) return 'Names can’t contain /';
    if (windows && /[. ]$/.test(name))
        return 'Names can’t end with a space or a period.';
    if (windows && WINDOWS_RESERVED.test(name))
        return 'This name is reserved by Windows.';
    if (new TextEncoder().encode(name).length > 255)
        return 'This name is too long.';
    return null;
}
