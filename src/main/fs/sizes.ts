import { app, type WebContents } from 'electron';
import { createHash } from 'node:crypto';
import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Worker } from 'node:worker_threads';
import { log } from '../log';
import type { SizeEvent } from '../../shared/fs-types';
import { currentSettings } from '../settings';
import type { SizeRequest } from './size-worker';
import createWorker from './size-worker?nodeWorker';

let worker: Worker | null = null;
let lastStart: SizeRequest | null = null;
let crashes: number[] = [];
// Only one window explores at a time; the latest one to start a calculation gets the updates.
let owner: WebContents | null = null;

// Saved folder totals, one file per root. Stays on this computer; clearable from Settings.
export const cacheDir = (): string => join(app.getPath('userData'), 'cache');

function post(msg: SizeRequest): void {
    if (!worker) {
        const w = createWorker({});
        w.on('message', (event: SizeEvent) => {
            if (owner && !owner.isDestroyed()) owner.send('size:event', event);
        });
        w.on('error', (err) => log('Size worker failed:', err));
        w.on('exit', (code) => {
            worker = null;
            // Ask the window to start over, so totals never stay stuck at "calculating".
            // At most a few restarts a minute, so a folder that always crashes it can't loop forever.
            const now = Date.now();
            crashes = crashes.filter((t) => now - t < 60_000);
            crashes.push(now);
            if (
                code !== 0 &&
                crashes.length <= 3 &&
                lastStart &&
                owner &&
                !owner.isDestroyed()
            )
                owner.send('size:event', {
                    type: 'restart',
                } satisfies SizeEvent);
        });
        worker = w;
    }
    worker.postMessage(msg);
}

export function startSizes(root: string, sender: WebContents): void {
    owner = sender;
    const name = createHash('sha1').update(root).digest('hex');
    lastStart = {
        type: 'start',
        root,
        cacheFile: join(cacheDir(), `sizes-${name}.json`),
        excludes: currentSettings()?.excludes ?? [],
    };
    post(lastStart);
}

export function watchSizes(paths: string[], sender: WebContents): void {
    if (sender === owner) post({ type: 'watch', paths });
}

export async function cacheInfo(): Promise<{ files: number; bytes: number }> {
    const names = await readdir(cacheDir()).catch(() => [] as string[]);
    const sizes = await Promise.all(
        names.map((n) =>
            stat(join(cacheDir(), n)).then(
                (s) => s.size,
                () => 0
            )
        )
    );
    return { files: names.length, bytes: sizes.reduce((a, b) => a + b, 0) };
}

// Deletes saved totals only; the user's files are never touched.
export async function clearCache(): Promise<void> {
    await rm(cacheDir(), { recursive: true, force: true });
    if (worker) post({ type: 'clearCache' });
}
