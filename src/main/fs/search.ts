import type { WebContents } from 'electron';
import type { Worker } from 'node:worker_threads';
import type { SearchEvent } from '../../shared/fs-types';
import { currentSettings } from '../settings';
import type { SearchRequest } from './search-worker';
import createWorker from './search-worker?nodeWorker';

let worker: Worker | null = null;
// One window explores at a time; the one that started the latest search gets the results.
let owner: WebContents | null = null;

function post(msg: SearchRequest): void {
    if (!worker) {
        const w = createWorker({});
        w.on('message', (event: SearchEvent) => {
            if (owner && !owner.isDestroyed())
                owner.send('search:event', event);
        });
        w.on('error', (err) => console.error('Search worker failed:', err));
        w.on('exit', () => {
            worker = null;
        });
        worker = w;
    }
    worker.postMessage(msg);
}

export function startSearch(
    sender: WebContents,
    id: number,
    root: string,
    query: string
): void {
    owner = sender;
    post({
        type: 'search',
        id,
        root,
        query,
        excludes: currentSettings()?.excludes ?? [],
    });
}

export function cancelSearch(sender: WebContents, id: number): void {
    if (sender === owner) post({ type: 'cancel', id });
}
