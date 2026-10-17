import { shell } from 'electron';
import { lstat, mkdir, rename, rm } from 'node:fs/promises';
import { dirname, join, parse } from 'node:path';
import type { OpResult, OpSummary } from '../../shared/fs-types';
import { nameProblem } from '../../shared/names';
import { friendlyError } from './common';

function emptySummary(): OpSummary {
    return {
        completed: 0,
        skipped: 0,
        failed: [],
        cancelled: false,
        notes: [],
    };
}

// Drive and filesystem roots can't be renamed or deleted from here.
function isRoot(path: string): boolean {
    return parse(path).root === path;
}

export async function makeFolder(
    parent: string,
    name: string
): Promise<OpResult> {
    const problem = nameProblem(name, process.platform);
    if (problem) return { error: problem };
    const path = join(parent, name);
    try {
        // Without `recursive`, this fails instead of reusing an existing folder.
        await mkdir(path);
        return { path };
    } catch (err) {
        return { error: friendlyError(err) };
    }
}

export async function renameItem(
    path: string,
    name: string
): Promise<OpResult> {
    const problem = nameProblem(name, process.platform);
    if (problem) return { error: problem };
    if (isRoot(path)) return { error: 'A drive can’t be renamed here' };
    const target = join(dirname(path), name);
    if (target === path) return { path };
    try {
        const [src, existing] = await Promise.all([
            lstat(path, { bigint: true }),
            lstat(target, { bigint: true }).catch(() => null),
        ]);
        // On case-insensitive drives "a.txt" → "A.txt" finds the same file; that's allowed.
        const sameFile =
            existing && existing.dev === src.dev && existing.ino === src.ino;
        if (existing && !sameFile)
            return { error: 'An item with this name already exists' };
        await rename(path, target);
        return { path: target };
    } catch (err) {
        return { error: friendlyError(err) };
    }
}

export async function trashItems(paths: string[]): Promise<OpSummary> {
    const summary = emptySummary();
    for (const path of paths) {
        if (isRoot(path)) {
            summary.failed.push({ path, error: 'A drive can’t be deleted' });
            continue;
        }
        try {
            await shell.trashItem(path);
            summary.completed++;
        } catch (err) {
            summary.failed.push({
                path,
                error: `Couldn’t move to the Trash (${friendlyError(err)}). Nothing was deleted.`,
            });
        }
    }
    return summary;
}

export async function deleteItems(paths: string[]): Promise<OpSummary> {
    const summary = emptySummary();
    for (const path of paths) {
        if (isRoot(path)) {
            summary.failed.push({ path, error: 'A drive can’t be deleted' });
            continue;
        }
        try {
            await rm(path, { recursive: true });
            summary.completed++;
        } catch (err) {
            summary.failed.push({ path, error: friendlyError(err) });
            // rm may have removed part of a folder before failing.
            const left = await lstat(path).then(
                () => true,
                () => false
            );
            if (left)
                summary.notes.push(
                    `${path} may be partly deleted. Some of its contents could not be removed.`
                );
        }
    }
    return summary;
}
