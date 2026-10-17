import type { SizeInfo } from '../shared/fs-types';
import { fileCategory, type FileCategory } from './filetypes';
import type { TreeNode } from './model';

export type AgeFilter = 'any' | '7d' | '30d' | '1y' | 'older1y';
export type SortBy = 'name' | 'size' | 'modified';
export type Highlight =
    'none' | 'largestFolders' | 'largestFiles' | 'oldestFiles';

// Type, size and age apply to files; folders always stay, since they hold the tree together.
export interface Filter {
    foldersOnly: boolean;
    types: Set<FileCategory>;
    minSize: number;
    age: AgeFilter;
    showHidden: boolean;
    sortBy: SortBy;
    highlight: Highlight;
}

export function defaultFilter(): Filter {
    return {
        foldersOnly: false,
        types: new Set(),
        minSize: 0,
        age: 'any',
        showHidden: true,
        sortBy: 'name',
        highlight: 'none',
    };
}

// True when some items may be hidden from view (sorting and highlights hide nothing).
export function isFiltering(f: Filter): boolean {
    return (
        f.foldersOnly ||
        f.types.size > 0 ||
        f.minSize > 0 ||
        f.age !== 'any' ||
        !f.showHidden
    );
}

const DAY = 86_400_000;
const AGE_MS: Record<Exclude<AgeFilter, 'any'>, number> = {
    '7d': 7 * DAY,
    '30d': 30 * DAY,
    '1y': 365 * DAY,
    older1y: 365 * DAY,
};

export function passes(t: TreeNode, f: Filter, now: number): boolean {
    const n = t.node;
    if (n.hidden && !f.showHidden) return false;
    if (n.kind === 'directory') return true;
    if (f.foldersOnly) return false;
    if (f.types.size && !f.types.has(fileCategory(n.name))) return false;
    if (f.minSize && (n.size ?? 0) < f.minSize) return false;
    if (f.age !== 'any') {
        // Without a date we can't say it matches, so it's hidden (and counted as hidden).
        if (n.modified === undefined) return false;
        const age = now - n.modified;
        if (f.age === 'older1y' ? age < AGE_MS.older1y : age > AGE_MS[f.age])
            return false;
    }
    return true;
}

// Size used for sorting and "largest": file size, or the folder total calculated so far.
export function sizeOf(t: TreeNode, sizes: Map<string, SizeInfo>): number {
    return t.node.kind === 'directory'
        ? (sizes.get(t.node.path)?.bytes ?? 0)
        : (t.node.size ?? 0);
}

// The children to lay out for `t`: filtered, then in the chosen order. Returns the original
// (already name-sorted) array when nothing changes, so the common case costs nothing.
export function pickChildren(
    t: TreeNode,
    f: Filter,
    sizes: Map<string, SizeInfo>,
    now: number
): TreeNode[] {
    let list = isFiltering(f)
        ? t.children.filter((c) => passes(c, f, now))
        : t.children;
    if (f.sortBy !== 'name') {
        if (list === t.children) list = [...list];
        const key =
            f.sortBy === 'size'
                ? (c: TreeNode) => -sizeOf(c, sizes)
                : (c: TreeNode) => -(c.node.modified ?? 0);
        // Stable sort: ties keep name order.
        list.sort((a, b) => key(a) - key(b));
    }
    return list;
}
