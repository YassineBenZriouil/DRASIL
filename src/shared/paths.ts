// Path helpers that work in the sandboxed renderer (no node:path), for both Windows and POSIX paths.

const DRIVE_ROOT = /^[A-Za-z]:\\$/;

function sepOf(p: string): string {
    return p.includes('\\') ? '\\' : '/';
}

function trimSep(p: string): string {
    const sep = sepOf(p);
    if (p === '/' || DRIVE_ROOT.test(p)) return p;
    return p.endsWith(sep) ? p.slice(0, -1) : p;
}

// The containing folder, or null at the top of a drive or filesystem.
export function parentPath(path: string): string | null {
    const p = trimSep(path);
    if (p === '/' || DRIVE_ROOT.test(p)) return null;
    const sep = sepOf(p);
    const i = p.lastIndexOf(sep);
    if (i < 0) return null;
    if (i === 0) return '/';
    const parent = p.slice(0, i);
    if (/^[A-Za-z]:$/.test(parent)) return parent + '\\';
    // UNC share root (\\server\share) is as high as we go.
    if (/^\\\\[^\\]+$/.test(parent)) return null;
    return parent;
}

export function baseName(path: string): string {
    const p = trimSep(path);
    if (p === '/' || DRIVE_ROOT.test(p)) return p;
    return p.slice(p.lastIndexOf(sepOf(p)) + 1);
}

// True when `path` is `ancestor` itself or somewhere inside it.
export function isInside(path: string, ancestor: string): boolean {
    const a = trimSep(ancestor);
    if (path === a || trimSep(path) === a) return true;
    const sep = sepOf(a);
    return path.startsWith(a.endsWith(sep) ? a : a + sep);
}

// Every folder from the top down to `path`, inclusive.
export function ancestry(path: string): string[] {
    const out: string[] = [];
    for (let p: string | null = path; p; p = parentPath(p)) out.unshift(p);
    return out;
}
