import { parentPort } from 'node:worker_threads';
import type { ListEvent } from '../../shared/fs-types';
import { listDirectory } from './list';

export type WorkerRequest =
    { type: 'list'; id: number; path: string } | { type: 'cancel'; id: number };

const port = parentPort!;
// Active listings; the value is true once cancelled.
const active = new Map<number, boolean>();

const post = (event: ListEvent): void => port.postMessage(event);

port.on('message', (msg: WorkerRequest) => {
    if (msg.type === 'cancel') {
        if (active.has(msg.id)) active.set(msg.id, true);
        return;
    }
    const { id, path } = msg;
    active.set(id, false);
    listDirectory(
        path,
        () => active.get(id) === true,
        (nodes) => post({ id, type: 'batch', nodes })
    )
        .catch((err: unknown) => ({
            state: 'error' as const,
            count: 0,
            error: String(err),
        }))
        .then((result) => {
            active.delete(id);
            post({ id, type: 'done', ...result });
        });
});
