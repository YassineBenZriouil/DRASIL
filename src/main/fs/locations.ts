import { app } from 'electron';
import { readdir, realpath, stat } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { basename, join } from 'node:path';
import type { Location } from '../../shared/fs-types';

const PLACES = [
    'home',
    'desktop',
    'documents',
    'downloads',
    'pictures',
    'music',
    'videos',
] as const;

function isDir(path: string): Promise<boolean> {
    return stat(path).then(
        (s) => s.isDirectory(),
        () => false
    );
}

async function subdirs(parent: string): Promise<string[]> {
    const names = await readdir(parent).catch(() => [] as string[]);
    const paths = names.map((name) => join(parent, name));
    const ok = await Promise.all(paths.map(isDir));
    return paths.filter((_, i) => ok[i]);
}

async function drives(): Promise<Location[]> {
    if (process.platform === 'win32') {
        const roots = Array.from(
            { length: 26 },
            (_, i) => `${String.fromCharCode(65 + i)}:\\`
        );
        const ok = await Promise.all(roots.map(isDir));
        return roots
            .filter((_, i) => ok[i])
            .map((path) => ({ path, name: path.slice(0, 2), kind: 'drive' }));
    }

    let mounts: string[];
    if (process.platform === 'darwin') {
        mounts = await subdirs('/Volumes');
        // The startup disk also appears in /Volumes as a link to '/'.
        const real = await Promise.all(
            mounts.map((m) => realpath(m).catch(() => m))
        );
        mounts = mounts.filter((_, i) => real[i] !== '/');
    } else {
        const user = userInfo().username;
        const groups = await Promise.all(
            [`/media/${user}`, `/run/media/${user}`, '/mnt'].map(subdirs)
        );
        mounts = groups.flat();
    }
    const root: Location = { path: '/', name: 'Computer', kind: 'drive' };
    return [
        root,
        ...mounts.map((path): Location => ({
            path,
            name: basename(path),
            kind: 'drive',
        })),
    ];
}

async function places(): Promise<Location[]> {
    const found: Location[] = [];
    for (const name of PLACES) {
        let path: string;
        try {
            path = app.getPath(name);
        } catch {
            continue;
        }
        if (await isDir(path))
            found.push({
                path,
                name: name === 'home' ? 'Home' : basename(path),
                kind: 'place',
            });
    }
    return found;
}

export async function getLocations(): Promise<Location[]> {
    const [p, d] = await Promise.all([places(), drives()]);
    return [...p, ...d];
}
