// Background folder-size calculation. One walk of the chosen root, plus priority walks for the
// folders the UI is showing. Never follows links, so it can't loop or count anything twice through one.
import type { Dirent } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parentPort } from 'node:worker_threads';
import type { SizeEvent, SizeInfo } from '../../shared/fs-types';

export type SizeRequest =
    { type: 'start'; root: string } | { type: 'watch'; paths: string[] };

interface Acc {
    bytes: number;
    items: number;
    // False once anything inside could not be read.
    readable: boolean;
}

// Virtual or duplicate filesystems that have no real size on disk (or would be counted twice).
const SKIP: Record<string, string[]> = {
    linux: ['/proc', '/sys', '/dev', '/run'],
    darwin: ['/dev', '/System/Volumes', '/Volumes'],
};
const skip = new Set(SKIP[process.platform] ?? []);

// Only shallow folders and watched folders are kept, so memory stays bounded on huge disks.
const CACHE_DEPTH = 2;
const STAT_CHUNK = 64;
const FLUSH_MS = 300;

const port = parentPort!;
let generation = 0;
let done = false;
let scanned = 0;
const cache = new Map<string, Acc>();
const running = new Map<string, Acc>();
const inflight = new Map<string, Promise<Acc>>();
const watched = new Set<string>();
const dirty = new Set<string>();
let priority: string[] = [];
let priorityBusy = false;

function walk(dir: string, depth: number, gen: number): Promise<Acc> {
    const cached = cache.get(dir);
    if (cached) return Promise.resolve(cached);
    let p = inflight.get(dir);
    if (!p) {
        p = walkUncached(dir, depth, gen).finally(() => {
            if (inflight.get(dir) === p) inflight.delete(dir);
        });
        inflight.set(dir, p);
    }
    return p;
}

async function walkUncached(
    dir: string,
    depth: number,
    gen: number
): Promise<Acc> {
    const acc: Acc = { bytes: 0, items: 0, readable: true };
    const live = (): boolean => gen === generation;
    running.set(dir, acc);
    try {
        let entries: Dirent[];
        try {
            entries = await readdir(dir, { withFileTypes: true });
        } catch {
            acc.readable = false;
            return acc;
        }
        const subdirs: string[] = [];
        for (let i = 0; i < entries.length; i += STAT_CHUNK) {
            if (!live()) return acc;
            await Promise.all(
                entries.slice(i, i + STAT_CHUNK).map(async (e) => {
                    acc.items++;
                    scanned++;
                    const path = join(dir, e.name);
                    if (e.isSymbolicLink()) return;
                    if (e.isDirectory()) {
                        if (!skip.has(path)) subdirs.push(path);
                        return;
                    }
                    try {
                        // Read the size first: `acc.bytes += await …` would add to a stale total.
                        const { size } = await lstat(path);
                        acc.bytes += size;
                    } catch {
                        acc.readable = false;
                    }
                })
            );
        }
        for (const sub of subdirs) {
            if (!live()) return acc;
            const r = await walk(sub, depth + 1, gen);
            acc.bytes += r.bytes;
            acc.items += r.items;
            if (!r.readable) acc.readable = false;
        }
        if (live() && (depth <= CACHE_DEPTH || watched.has(dir)))
            cache.set(dir, acc);
        return acc;
    } finally {
        if (running.get(dir) === acc) running.delete(dir);
        if (watched.has(dir)) dirty.add(dir);
    }
}

async function runPriority(gen: number): Promise<void> {
    if (priorityBusy) return;
    priorityBusy = true;
    while (gen === generation && priority.length) {
        const path = priority.pop()!;
        // Depth doesn't matter here: watched folders are always cached.
        if (!cache.has(path)) await walk(path, Infinity, gen);
    }
    priorityBusy = false;
    // Requests that arrived for a newer root while an old walk was finishing.
    if (priority.length && gen !== generation) void runPriority(generation);
}

function flush(): void {
    const sizes: SizeInfo[] = [];
    for (const path of dirty) {
        const acc = cache.get(path);
        if (acc)
            sizes.push({
                path,
                bytes: acc.bytes,
                items: acc.items,
                state: acc.readable ? 'complete' : 'incomplete',
            });
    }
    dirty.clear();
    for (const [path, acc] of running) {
        if (watched.has(path))
            sizes.push({
                path,
                bytes: acc.bytes,
                items: acc.items,
                state: 'estimate',
            });
    }
    const post = (e: SizeEvent): void => port.postMessage(e);
    if (sizes.length) post({ type: 'sizes', sizes });
    post({ type: 'progress', scanned, done });
}

setInterval(flush, FLUSH_MS);

port.on('message', (msg: SizeRequest) => {
    if (msg.type === 'start') {
        const gen = ++generation;
        cache.clear();
        running.clear();
        inflight.clear();
        watched.clear();
        dirty.clear();
        priority = [];
        scanned = 0;
        done = false;
        walk(msg.root, 0, gen).then(() => {
            if (gen === generation) done = true;
        });
        return;
    }
    for (const path of msg.paths) {
        watched.add(path);
        if (cache.has(path)) dirty.add(path);
        else if (!running.has(path)) priority.push(path);
    }
    void runPriority(generation);
});
