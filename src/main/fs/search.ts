import type { WebContents } from 'electron';
import type { Worker } from 'node:worker_threads';
import { log } from '../log';
import type { SearchEvent } from '../../shared/fs-types';
import { currentSettings } from '../settings';
import type { SearchRequest } from './search-worker';
import createWorker from './search-worker?nodeWorker';

let worker: Worker | null = null;
let currentId = 0;
// One window explores at a time; the one that started the latest search gets the results.
let owner: WebContents | null = null;

function post(msg: SearchRequest): void {
    if (!worker) {
        const w = createWorker({});
        w.on('message', (event: SearchEvent) => {
            if (event.type === 'done' && event.id === currentId) currentId = 0;
            if (owner && !owner.isDestroyed())
                owner.send('search:event', event);
        });
        w.on('error', (err) => log('Search worker failed:', err));
        w.on('exit', () => {
            worker = null;
            // End the running search honestly instead of leaving it "searching" forever.
            if (currentId && owner && !owner.isDestroyed())
                owner.send('search:event', {
                    id: currentId,
                    type: 'done',
                    coverage: {
                        folders: 0,
                        unreadable: 0,
                        unreadableSamples: [],
                        excluded: 0,
                        limited: false,
                        cancelled: true,
                    },
                } satisfies SearchEvent);
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
    currentId = id;
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
