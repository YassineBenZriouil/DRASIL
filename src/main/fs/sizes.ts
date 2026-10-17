import type { WebContents } from 'electron';
import type { Worker } from 'node:worker_threads';
import type { SizeEvent } from '../../shared/fs-types';
import type { SizeRequest } from './size-worker';
import createWorker from './size-worker?nodeWorker';

let worker: Worker | null = null;
// Only one window explores at a time; the latest one to start a calculation gets the updates.
let owner: WebContents | null = null;

function post(msg: SizeRequest): void {
    if (!worker) {
        const w = createWorker({});
        w.on('message', (event: SizeEvent) => {
            if (owner && !owner.isDestroyed()) owner.send('size:event', event);
        });
        w.on('error', (err) => console.error('Size worker failed:', err));
        w.on('exit', () => {
            worker = null;
        });
        worker = w;
    }
    worker.postMessage(msg);
}

export function startSizes(root: string, sender: WebContents): void {
    owner = sender;
    post({ type: 'start', root });
}

export function watchSizes(paths: string[], sender: WebContents): void {
    if (sender === owner) post({ type: 'watch', paths });
}
