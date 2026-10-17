// Name search under a root, breadth-first so shallow matches come first. Streams results,
// never follows links, and reports every folder it couldn't read.
import type { Dirent } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parentPort } from 'node:worker_threads';
import type { SearchEvent, SearchResult } from '../../shared/fs-types';
import { skip } from './skip';

export type SearchRequest =
    | {
          type: 'search';
          id: number;
          root: string;
          query: string;
          excludes: string[];
      }
    | { type: 'cancel'; id: number };

const LIMIT = 1000;
const FLUSH_MS = 120;
const SAMPLE_COUNT = 5;

const port = parentPort!;
const post = (e: SearchEvent): void => port.postMessage(e);
// Only one search runs at a time; a newer one makes older loops stop.
let active = 0;

// macOS stores names decomposed (NFD); compare in one form, ignoring case.
const fold = (s: string): string => s.normalize('NFC').toLocaleLowerCase();

const foldPath =
    process.platform === 'linux' ? (s: string) => s : (s: string) => s.toLowerCase();

async function search(
    id: number,
    root: string,
    query: string,
    excludeList: string[]
): Promise<void> {
    const excludes = new Set(excludeList.map(foldPath));
    active = id;
    const live = (): boolean => active === id;
    const q = fold(query);
    const queue = [root];
    const coverage = {
        folders: 0,
        unreadable: 0,
        unreadableSamples: [] as string[],
        excluded: 0,
        limited: false,
        cancelled: false,
    };
    let found = 0;
    let batch: SearchResult[] = [];
    let lastFlush = Date.now();
    const flush = (): void => {
        if (batch.length) post({ id, type: 'results', results: batch });
        batch = [];
        post({ id, type: 'progress', folders: coverage.folders });
        lastFlush = Date.now();
    };

    for (let i = 0; i < queue.length; i++) {
        if (!live()) {
            coverage.cancelled = true;
            break;
        }
        const dir = queue[i]!;
        // Free memory for folders already walked.
        if (i > 10_000) {
            queue.splice(0, i);
            i = 0;
        }
        let entries: Dirent[];
        try {
            entries = await readdir(dir, { withFileTypes: true });
        } catch {
            coverage.unreadable++;
            if (coverage.unreadableSamples.length < SAMPLE_COUNT)
                coverage.unreadableSamples.push(dir);
            continue;
        }
        coverage.folders++;
        for (const e of entries) {
            const path = join(dir, e.name);
            if (fold(e.name).includes(q)) {
                const s = await lstat(path).catch(() => null);
                batch.push({
                    path,
                    name: e.name,
                    kind: e.isDirectory()
                        ? 'directory'
                        : e.isFile()
                          ? 'file'
                          : 'other',
                    size: s?.isFile() ? s.size : undefined,
                    modified: s?.mtimeMs,
                });
                if (++found >= LIMIT) {
                    coverage.limited = true;
                    break;
                }
            }
            if (e.isDirectory() && !e.isSymbolicLink() && !skip.has(path)) {
                if (excludes.has(foldPath(path))) coverage.excluded++;
                else queue.push(path);
            }
        }
        if (coverage.limited) break;
        if (Date.now() - lastFlush > FLUSH_MS) flush();
    }
    if (!live()) coverage.cancelled = true;
    flush();
    post({ id, type: 'done', coverage });
}

port.on('message', (msg: SearchRequest) => {
    if (msg.type === 'cancel') {
        if (active === msg.id) active = 0;
        return;
    }
    void search(msg.id, msg.root, msg.query, msg.excludes);
});
