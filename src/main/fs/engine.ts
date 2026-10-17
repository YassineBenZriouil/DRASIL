import type { WebContents } from 'electron';
import type { Worker } from 'node:worker_threads';
import type { ListEvent } from '../../shared/fs-types';
import type { WorkerRequest } from './worker';
import createWorker from './worker?nodeWorker';

interface Request {
    owner: WebContents;
    clientId: number;
}

let worker: Worker | null = null;
let nextId = 1;
const requests = new Map<number, Request>();

function send(owner: WebContents, event: ListEvent): void {
    if (!owner.isDestroyed()) owner.send('fs:list-event', event);
}

function post(msg: WorkerRequest): void {
    getWorker().postMessage(msg);
}

function getWorker(): Worker {
    if (worker) return worker;
    const w = createWorker({});
    w.on('message', (event: ListEvent) => {
        const req = requests.get(event.id);
        if (!req) return;
        if (req.owner.isDestroyed()) {
            requests.delete(event.id);
            post({ type: 'cancel', id: event.id });
            return;
        }
        if (event.type === 'done') requests.delete(event.id);
        send(req.owner, { ...event, id: req.clientId });
    });
    w.on('error', (err) => console.error('Filesystem worker failed:', err));
    // If the worker dies, every open listing ends with an error instead of hanging.
    w.on('exit', () => {
        worker = null;
        for (const req of requests.values()) {
            send(req.owner, {
                id: req.clientId,
                type: 'done',
                state: 'error',
                count: 0,
                error: 'The filesystem scanner stopped unexpectedly',
            });
        }
        requests.clear();
    });
    worker = w;
    return w;
}

export function list(path: string, owner: WebContents, clientId: number): void {
    const id = nextId++;
    requests.set(id, { owner, clientId });
    post({ type: 'list', id, path });
}

export function cancel(owner: WebContents, clientId: number): void {
    for (const [id, req] of requests) {
        if (req.owner === owner && req.clientId === clientId)
            post({ type: 'cancel', id });
    }
}
