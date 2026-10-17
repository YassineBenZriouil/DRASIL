import type { Dirent } from 'node:fs';
import { lstat, opendir, readlink, realpath, stat } from 'node:fs/promises';
import { join, sep } from 'node:path';
import type { FsNode, ListState } from '../../shared/fs-types';

const BATCH_SIZE = 256;

const UNAVAILABLE_CODES = new Set([
    'ENOENT',
    'ENODEV',
    'ENXIO',
    'ENOMEDIUM',
    'ESTALE',
    'ENOTCONN',
    'EHOSTDOWN',
]);

type FailState = 'inaccessible' | 'unavailable' | 'error';

function failState(err: unknown): FailState {
    const code = (err as NodeJS.ErrnoException).code ?? '';
    if (code === 'EACCES' || code === 'EPERM') return 'inaccessible';
    if (UNAVAILABLE_CODES.has(code)) return 'unavailable';
    return 'error';
}

function failMessage(state: FailState, err: unknown): string {
    if (state === 'inaccessible')
        return 'Access denied by the operating system';
    if (state === 'unavailable') return 'This location is not available';
    return err instanceof Error ? err.message : String(err);
}

function isSameOrInside(child: string, parent: string): boolean {
    const prefix = parent.endsWith(sep) ? parent : parent + sep;
    return child === parent || child.startsWith(prefix);
}

type Base = Omit<FsNode, 'kind' | 'state'>;

async function describeLink(base: Base, dirReal: string): Promise<FsNode> {
    let target: string;
    try {
        target = await realpath(base.path);
    } catch {
        const raw = await readlink(base.path).catch(() => '');
        return {
            ...base,
            kind: 'other',
            state: 'error',
            link: { target: raw, loop: false },
            error: 'Broken link',
        };
    }
    try {
        const info = await stat(target);
        if (info.isDirectory()) {
            // A link to the folder it lives in, or to one of its ancestors, would recurse forever.
            const loop = isSameOrInside(dirReal, target);
            return {
                ...base,
                kind: 'directory',
                state: 'unscanned',
                link: { target, loop },
            };
        }
        const isFile = info.isFile();
        return {
            ...base,
            kind: isFile ? 'file' : 'other',
            state: 'scanned',
            size: isFile ? info.size : undefined,
            link: { target, loop: false },
        };
    } catch (err) {
        const state = failState(err);
        return {
            ...base,
            kind: 'other',
            state,
            link: { target, loop: false },
            error: failMessage(state, err),
        };
    }
}

async function describe(
    dir: string,
    dirReal: string,
    entry: Dirent
): Promise<FsNode> {
    const path = join(dir, entry.name);
    // shortcut: dotfiles only; Windows hidden/system attributes need a native call, add with the hidden filter in Phase 7.
    const hidden = entry.name.startsWith('.');
    const base = { path, name: entry.name, hidden };
    try {
        const info = await lstat(path);
        const withTime = { ...base, modified: info.mtimeMs };
        // Windows junctions also report as symbolic links.
        if (info.isSymbolicLink()) return describeLink(withTime, dirReal);
        if (info.isDirectory())
            return { ...withTime, kind: 'directory', state: 'unscanned' };
        if (info.isFile())
            return {
                ...withTime,
                kind: 'file',
                state: 'scanned',
                size: info.size,
            };
        return { ...withTime, kind: 'other', state: 'scanned' };
    } catch (err) {
        const state = failState(err);
        return {
            ...base,
            kind: entry.isDirectory() ? 'directory' : 'other',
            state,
            error: failMessage(state, err),
        };
    }
}

export interface ListResult {
    state: ListState;
    count: number;
    error?: string;
}

// Lists the direct children of `dir` in batches. Never recurses and never follows links.
export async function listDirectory(
    dir: string,
    isCancelled: () => boolean,
    onBatch: (nodes: FsNode[]) => void
): Promise<ListResult> {
    let handle;
    try {
        handle = await opendir(dir, { bufferSize: 64 });
    } catch (err) {
        const state = failState(err);
        return { state, count: 0, error: failMessage(state, err) };
    }
    const dirReal = await realpath(dir).catch(() => dir);

    let count = 0;
    let pending: Dirent[] = [];
    const flush = async (): Promise<void> => {
        if (pending.length === 0) return;
        const nodes = await Promise.all(
            pending.map((entry) => describe(dir, dirReal, entry))
        );
        pending = [];
        count += nodes.length;
        onBatch(nodes);
    };

    try {
        // Leaving the loop early (return or throw) closes the directory handle.
        for await (const entry of handle) {
            if (isCancelled()) {
                await flush();
                return { state: 'partial', count };
            }
            pending.push(entry);
            if (pending.length === BATCH_SIZE) await flush();
        }
        await flush();
    } catch (err) {
        await flush();
        const state = failState(err);
        const error = failMessage(state, err);
        return count === 0
            ? { state, count, error }
            : { state: 'partial', count, error };
    }
    return { state: count === 0 ? 'empty' : 'scanned', count };
}
