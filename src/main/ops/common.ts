import { lstat } from 'node:fs/promises';
import { dirname, extname, join, parse } from 'node:path';

const MESSAGES: Record<string, string> = {
    EACCES: 'Permission denied',
    EPERM: 'Permission denied',
    ENOENT: 'The item no longer exists',
    EEXIST: 'An item with this name already exists',
    ENOSPC: 'Not enough space on the destination',
    EBUSY: 'The item is in use by another program',
    ENAMETOOLONG: 'The name or path is too long',
    EROFS: 'The destination is read-only',
    ENOTEMPTY: 'The folder is not empty',
    EXDEV: 'The item is on a different drive',
};

export function friendlyError(err: unknown): string {
    const code = (err as NodeJS.ErrnoException).code;
    if (code && MESSAGES[code]) return MESSAGES[code]!;
    return err instanceof Error ? err.message : String(err);
}

export async function exists(path: string): Promise<boolean> {
    return lstat(path).then(
        () => true,
        () => false
    );
}

// "name (2).ext", "name (3).ext", … the first one that doesn't exist yet.
export async function uniqueName(
    path: string,
    isDir: boolean
): Promise<string> {
    const dir = dirname(path);
    const { name, ext } = parse(path);
    // Hidden files like ".bashrc" have no extension, and folders keep dots in their name.
    const stem = isDir || !extname(path) ? name + ext : name;
    const suffix = isDir || !extname(path) ? '' : ext;
    for (let i = 2; ; i++) {
        const candidate = join(dir, `${stem} (${i})${suffix}`);
        if (!(await exists(candidate))) return candidate;
    }
}

// Is `child` the same as, or inside, `parent`? Case-insensitive where the OS usually is.
export function isSameOrInside(child: string, parent: string): boolean {
    const fold =
        process.platform === 'linux'
            ? (s: string) => s
            : (s: string) => s.toLowerCase();
    const c = fold(child);
    const p = fold(parent);
    const sep = process.platform === 'win32' ? '\\' : '/';
    return c === p || c.startsWith(p.endsWith(sep) ? p : p + sep);
}
