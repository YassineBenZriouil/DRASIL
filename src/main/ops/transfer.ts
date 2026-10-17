// Move and copy, with conflict prompts, progress, cancel and an honest summary.
// Safety rules: copies never overwrite (COPYFILE_EXCL); "replace" sends the existing item to the
// Trash first; a cross-drive move deletes the source only after a fully successful copy.
import { shell, type WebContents } from 'electron';
import type { BigIntStats, Stats } from 'node:fs';
import { constants } from 'node:fs';
import {
    copyFile,
    lstat,
    mkdir,
    readdir,
    readlink,
    realpath,
    rename,
    rm,
    rmdir,
    stat,
    symlink,
    utimes,
} from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type {
    ConflictChoice,
    ItemInfo,
    OpEvent,
    OpSummary,
    TransferMode,
} from '../../shared/fs-types';
import { friendlyError, isSameOrInside, uniqueName } from './common';

const PROGRESS_MS = 100;

class Job {
    cancelled = false;
    // Set when the user ticks "do this for all remaining conflicts".
    applyAll: ConflictChoice | null = null;
    answer: ((r: { choice: ConflictChoice; all: boolean }) => void) | null =
        null;
    done = 0;
    total = 0;
    bytesDone = 0;
    bytesTotal = 0;
    current = '';
    summary: OpSummary = {
        completed: 0,
        skipped: 0,
        failed: [],
        cancelled: false,
        notes: [],
    };
    private lastProgress = 0;

    constructor(
        readonly id: number,
        readonly mode: TransferMode,
        private owner: WebContents
    ) {}

    send(event: OpEvent): void {
        if (!this.owner.isDestroyed()) this.owner.send('op:event', event);
    }

    tick(bytes = 0): void {
        this.done++;
        this.bytesDone += bytes;
        const now = Date.now();
        if (now - this.lastProgress < PROGRESS_MS) return;
        this.lastProgress = now;
        this.send({
            id: this.id,
            type: 'progress',
            done: this.done,
            total: this.total,
            bytesDone: this.bytesDone,
            bytesTotal: this.bytesTotal,
            current: this.current,
        });
    }

    fail(path: string, err: unknown): void {
        this.summary.failed.push({ path, error: friendlyError(err) });
    }

    async ask(
        source: string,
        target: string,
        incoming: Stats,
        existing: Stats,
        same: boolean
    ): Promise<ConflictChoice> {
        const bothDirs = incoming.isDirectory() && existing.isDirectory();
        if (this.applyAll) {
            const c = this.applyAll;
            // An "apply to all" choice that doesn't fit this conflict falls back to the safe option.
            if (c === 'merge' && !bothDirs) return 'skip';
            if (c === 'replace' && same) return 'keepBoth';
            return c;
        }
        const event: OpEvent = {
            id: this.id,
            type: 'conflict',
            source,
            target,
            incoming: info(incoming),
            existing: info(existing),
            same,
        };
        const answer = await new Promise<{
            choice: ConflictChoice;
            all: boolean;
        }>((resolve) => {
            this.answer = resolve;
            this.send(event);
        });
        this.answer = null;
        if (answer.all) this.applyAll = answer.choice;
        if (answer.choice === 'replace' && same) return 'keepBoth';
        if (answer.choice === 'merge' && !bothDirs) return 'skip';
        return answer.choice;
    }
}

function info(s: Stats): ItemInfo {
    return {
        kind: s.isDirectory() ? 'directory' : s.isFile() ? 'file' : 'other',
        size: s.isFile() ? s.size : undefined,
        modified: s.mtimeMs,
    };
}

function sameFile(a: BigIntStats, b: BigIntStats): boolean {
    return a.dev === b.dev && a.ino === b.ino;
}

const jobs = new Map<string, Job>();
const key = (owner: WebContents, id: number): string => `${owner.id}:${id}`;

export function resolveConflict(
    owner: WebContents,
    id: number,
    choice: ConflictChoice,
    all: boolean
): void {
    jobs.get(key(owner, id))?.answer?.({ choice, all });
}

export function cancelTransfer(owner: WebContents, id: number): void {
    const job = jobs.get(key(owner, id));
    if (!job) return;
    job.cancelled = true;
    // A pending conflict question counts as answered with "cancel".
    job.answer?.({ choice: 'cancel', all: false });
}

// Counts items and bytes for the progress total. Doesn't follow links.
async function measure(job: Job, path: string): Promise<void> {
    if (job.cancelled) return;
    const s = await lstat(path).catch(() => null);
    if (!s) return;
    job.total++;
    if (s.isFile()) job.bytesTotal += s.size;
    if (s.isDirectory() && !s.isSymbolicLink()) {
        const names = await readdir(path).catch(() => [] as string[]);
        for (const n of names) await measure(job, join(path, n));
    }
}

// Copy one item (recursively). Returns true only if everything inside was copied.
async function copyTree(
    job: Job,
    src: string,
    st: Stats,
    target: string
): Promise<boolean> {
    if (job.cancelled) return false;
    job.current = src;
    try {
        if (st.isSymbolicLink()) {
            // Copy the link itself, never what it points to.
            const link = await readlink(src);
            const pointsToDir = await stat(src).then(
                (s) => s.isDirectory(),
                () => false
            );
            const type =
                process.platform === 'win32' && pointsToDir
                    ? 'junction'
                    : pointsToDir
                      ? 'dir'
                      : 'file';
            await symlink(link, target, type);
            job.tick();
            return true;
        }
        if (st.isDirectory()) {
            await mkdir(target);
            job.tick();
            let ok = true;
            for (const name of await readdir(src)) {
                if (job.cancelled) return false;
                const child = join(src, name);
                try {
                    const cs = await lstat(child);
                    if (!(await copyTree(job, child, cs, join(target, name))))
                        ok = false;
                } catch (err) {
                    job.fail(child, err);
                    ok = false;
                }
            }
            return ok;
        }
        if (st.isFile()) {
            // shortcut: progress moves per file, not within one big file; stream with a byte counter if huge single files need it.
            await copyFile(src, target, constants.COPYFILE_EXCL);
            await utimes(target, st.atime, st.mtime).catch(() => {});
            job.tick(st.size);
            return true;
        }
        job.summary.failed.push({
            path: src,
            error: 'Special files (devices, sockets, pipes) are not copied',
        });
        return false;
    } catch (err) {
        job.fail(src, err);
        return false;
    }
}

// Put `src` at `target`, asking about conflicts. `top` items count towards the summary.
async function place(
    job: Job,
    src: string,
    st: Stats,
    targetPath: string,
    top: boolean
): Promise<void> {
    let target = targetPath;
    const existing = await lstat(target).catch(() => null);
    if (existing) {
        const [a, b] = await Promise.all([
            lstat(src, { bigint: true }),
            lstat(target, { bigint: true }),
        ]);
        const same = sameFile(a, b);
        const choice = await job.ask(src, target, st, existing, same);
        if (choice === 'cancel') {
            job.cancelled = true;
            return;
        }
        if (choice === 'skip') {
            if (top) job.summary.skipped++;
            return;
        }
        if (choice === 'keepBoth') {
            target = await uniqueName(target, st.isDirectory());
        } else if (choice === 'replace') {
            try {
                await shell.trashItem(target);
                job.summary.notes.push(
                    `The item that was replaced at ${target} is in the Trash.`
                );
            } catch (err) {
                job.summary.failed.push({
                    path: src,
                    error: `Couldn’t move the existing item to the Trash, so nothing was replaced (${friendlyError(err)})`,
                });
                return;
            }
        } else {
            // Merge two folders: place each child, asking about each conflict inside.
            let names: string[];
            try {
                names = await readdir(src);
            } catch (err) {
                job.fail(src, err);
                return;
            }
            const failedBefore = job.summary.failed.length;
            for (const name of names) {
                if (job.cancelled) break;
                const child = join(src, name);
                try {
                    await place(
                        job,
                        child,
                        await lstat(child),
                        join(target, name),
                        false
                    );
                } catch (err) {
                    job.fail(child, err);
                }
            }
            if (job.mode === 'move' && !job.cancelled) {
                // Only removes the source folder if it ended up empty.
                await rmdir(src).catch(() =>
                    job.summary.notes.push(
                        `Some items stayed in ${src} because they were skipped or couldn’t be moved.`
                    )
                );
            }
            if (top && job.summary.failed.length === failedBefore)
                job.summary.completed++;
            return;
        }
    }

    if (job.mode === 'move') {
        try {
            // shortcut: a file created at `target` between the check above and this rename would be overwritten on macOS/Linux; tiny window, acceptable for now.
            await rename(src, target);
            job.tick();
            if (top) job.summary.completed++;
            return;
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== 'EXDEV') {
                job.fail(src, err);
                return;
            }
        }
        // Different drive: copy, then delete the source only if every part arrived.
        await measure(job, src);
        const ok = await copyTree(job, src, st, target);
        if (ok && !job.cancelled) {
            try {
                await rm(src, { recursive: true });
                if (top) job.summary.completed++;
            } catch (err) {
                job.summary.failed.push({
                    path: src,
                    error: `Copied to ${target}, but the original couldn’t be removed (${friendlyError(err)})`,
                });
            }
        } else {
            job.summary.notes.push(
                `${src} was not fully moved. The original is untouched; a partial copy may be at ${target}.`
            );
        }
        return;
    }

    const ok = await copyTree(job, src, st, target);
    if (ok && top) job.summary.completed++;
    else if (!ok && (await lstat(target).catch(() => null)))
        job.summary.notes.push(`A partial copy was left at ${target}.`);
}

export async function transfer(
    owner: WebContents,
    id: number,
    mode: TransferMode,
    sources: string[],
    dest: string
): Promise<void> {
    const job = new Job(id, mode, owner);
    jobs.set(key(owner, id), job);
    try {
        let destReal: string;
        try {
            destReal = await realpath(dest);
            if (!(await stat(destReal)).isDirectory())
                throw new Error('The destination is not a folder');
        } catch (err) {
            job.fail(dest, err);
            return;
        }
        if (mode === 'copy') for (const s of sources) await measure(job, s);

        for (const src of sources) {
            if (job.cancelled) break;
            try {
                const st = await lstat(src);
                // Resolve the folder holding the item, not a link's target.
                const srcReal = join(
                    await realpath(dirname(src)),
                    basename(src)
                );
                if (st.isDirectory() && isSameOrInside(destReal, srcReal)) {
                    job.summary.failed.push({
                        path: src,
                        error: `Can’t ${mode} a folder into itself`,
                    });
                    continue;
                }
                if (
                    mode === 'move' &&
                    isSameOrInside(dirname(srcReal), destReal) &&
                    isSameOrInside(destReal, dirname(srcReal))
                ) {
                    job.summary.skipped++;
                    job.summary.notes.push(
                        `${basename(src)} is already in that folder.`
                    );
                    continue;
                }
                await place(job, src, st, join(dest, basename(src)), true);
            } catch (err) {
                job.fail(src, err);
            }
        }
    } finally {
        job.summary.cancelled = job.cancelled;
        jobs.delete(key(owner, id));
        job.send({ id, type: 'done', summary: job.summary });
    }
}
