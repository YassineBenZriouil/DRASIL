// Background folder-size calculation. One walk of the chosen root, plus priority walks for the
// folders the UI is showing. Never follows links, so it can't loop or count anything twice through one.
// Totals from the last full walk of a root are saved to a local cache file and shown, clearly marked
// as possibly out of date, until fresh numbers arrive.
import type { Dirent } from 'node:fs';
import { lstat, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parentPort } from 'node:worker_threads';
import type { SizeEvent, SizeInfo } from '../../shared/fs-types';
import { skip } from './skip';

export type SizeRequest =
    | {
          type: 'start';
          root: string;
          // Where this root's saved totals live, or null to not use the cache.
          cacheFile: string | null;
          excludes: string[];
      }
    | { type: 'watch'; paths: string[] }
    | { type: 'clearCache' };

interface Acc {
    bytes: number;
    items: number;
    // False once anything inside could not be read.
    readable: boolean;
    // True when an excluded folder was skipped somewhere inside.
    excluded: boolean;
}

interface SavedFile {
    root: string;
    savedAt: number;
    entries: [string, number, number, boolean, boolean][];
}

const fold =
    process.platform === 'linux' ? (s: string) => s : (s: string) => s.toLowerCase();

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
let excludes = new Set<string>();
let saved = new Map<string, Acc>();
let savedAt = 0;
let cacheFile: string | null = null;

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
    const acc: Acc = { bytes: 0, items: 0, readable: true, excluded: false };
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
                        if (excludes.has(fold(path))) acc.excluded = true;
                        else if (!skip.has(path)) subdirs.push(path);
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
            if (r.excluded) acc.excluded = true;
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
                state: acc.readable && !acc.excluded ? 'complete' : 'incomplete',
                excluded: acc.excluded || undefined,
            });
    }
    dirty.clear();
    for (const path of watched) {
        if (cache.has(path)) continue;
        // Until a fresh total exists, a saved one says more than a partial count; it's sent marked
        // as saved earlier, never as current.
        const old = saved.get(path);
        const acc = running.get(path);
        if (old)
            sizes.push({
                path,
                bytes: old.bytes,
                items: old.items,
                state: 'cached',
                savedAt,
            });
        else if (acc)
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

async function loadSaved(file: string, root: string, gen: number): Promise<void> {
    try {
        const data = JSON.parse(await readFile(file, 'utf8')) as SavedFile;
        if (gen !== generation || data.root !== root || !Array.isArray(data.entries)) return;
        saved = new Map(
            data.entries.map(([p, bytes, items, readable, excluded]) => [
                p,
                { bytes, items, readable, excluded },
            ])
        );
        savedAt = data.savedAt;
    } catch {
        // No cache yet, or unreadable: just calculate.
    }
}

async function save(file: string, root: string): Promise<void> {
    const entries: SavedFile['entries'] = [];
    for (const [p, a] of cache) entries.push([p, a.bytes, a.items, a.readable, a.excluded]);
    const data: SavedFile = { root, savedAt: Date.now(), entries: entries.slice(0, 50_000) };
    try {
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file + '.tmp', JSON.stringify(data));
        await rename(file + '.tmp', file);
    } catch (err) {
        console.error('Could not save the size cache:', err);
    }
}

port.on('message', (msg: SizeRequest) => {
    if (msg.type === 'clearCache') {
        saved = new Map();
        savedAt = 0;
        return;
    }
    if (msg.type === 'start') {
        const gen = ++generation;
        const { root } = msg;
        cacheFile = msg.cacheFile;
        excludes = new Set(msg.excludes.map(fold));
        saved = new Map();
        if (cacheFile) void loadSaved(cacheFile, root, gen);
        cache.clear();
        running.clear();
        inflight.clear();
        watched.clear();
        dirty.clear();
        priority = [];
        scanned = 0;
        done = false;
        walk(root, 0, gen).then(() => {
            if (gen !== generation) return;
            done = true;
            if (cacheFile) void save(cacheFile, root);
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
