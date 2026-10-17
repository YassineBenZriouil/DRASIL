import type { NodeState } from '../shared/fs-types';
import { Tree, type TreeNode } from './model';
import { TreeView } from './view';

const api = window.drasil;
const canvas = document.getElementById('world') as HTMLCanvasElement;
const nav = document.getElementById('locations')!;
const hint = document.getElementById('hint')!;
const status = document.getElementById('status')!;
const progress = document.getElementById('size-progress')!;

const STATE_LABEL: Record<NodeState, string> = {
    unscanned: 'not scanned',
    loading: 'loading',
    partial: 'partially scanned',
    scanned: '',
    empty: 'empty',
    inaccessible: 'access denied',
    unavailable: 'unavailable',
    error: 'error',
};

function formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let n = bytes;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) {
        n /= 1024;
        i++;
    }
    return `${i === 0 ? n : n.toFixed(1)} ${units[i]}`;
}

// Folder totals are only called exact when the whole folder was read.
function describeSize(t: TreeNode): string {
    const size = tree.sizes.get(t.node.path);
    if (!size)
        return tree.sizeProgress.done ? 'size unknown' : 'size: calculating…';
    const total = `${formatSize(size.bytes)}, ${size.items.toLocaleString()} items inside`;
    if (size.state === 'complete') return total;
    if (size.state === 'estimate') return `at least ${total} (calculating…)`;
    return `at least ${total} (some folders could not be read)`;
}

// A text description of the selection, so nothing depends on reading shapes or colors.
function describe(t: TreeNode): string {
    const { node } = t;
    const parts: string[] = [];
    if (node.kind === 'directory') {
        if (node.state === 'scanned')
            parts.push(`${t.count.toLocaleString()} items`);
        else if (node.state === 'loading')
            parts.push(`loading, ${t.count.toLocaleString()} items so far`);
        else parts.push(STATE_LABEL[node.state]);
        if (
            node.state !== 'inaccessible' &&
            node.state !== 'unavailable' &&
            !node.link
        )
            parts.push(describeSize(t));
    } else {
        if (node.size !== undefined) parts.push(formatSize(node.size));
        if (node.state !== 'scanned') parts.push(STATE_LABEL[node.state]);
    }
    if (node.link)
        parts.push(
            `link to ${node.link.target}${node.link.loop ? ' (a parent folder)' : ''}`
        );
    if (node.hidden) parts.push('hidden');
    if (node.error) parts.push(node.error);
    return parts.join(' · ');
}

function renderProgress(): void {
    const { scanned, done } = tree.sizeProgress;
    progress.textContent = !tree.root
        ? ''
        : done
          ? 'Folder sizes ready'
          : `Calculating folder sizes… ${scanned.toLocaleString()} items checked`;
}

function renderStatus(t: TreeNode | null): void {
    if (!t) {
        status.textContent = '';
        return;
    }
    const name = document.createElement('strong');
    name.textContent = t.node.name;
    const path = document.createElement('span');
    path.className = 'path';
    path.textContent = t.node.path;
    status.replaceChildren(name, ` — ${describe(t)} — `, path);
}

const tree = new Tree((kind) => {
    if (kind === 'tree') view.relayout();
    else renderProgress();
    renderStatus(view.selected);
});
const view = new TreeView(canvas, tree, renderStatus);

document.getElementById('fit')!.addEventListener('click', () => view.fit());

api.locations().then((locations) => {
    for (const loc of locations) {
        const button = document.createElement('button');
        button.textContent = loc.name;
        button.title = loc.path;
        button.setAttribute('aria-pressed', 'false');
        button.addEventListener('click', () => {
            for (const b of nav.querySelectorAll('button'))
                b.setAttribute('aria-pressed', String(b === button));
            hint.hidden = true;
            view.select(tree.setRoot(loc.path, loc.path));
            view.fit();
            canvas.focus();
        });
        nav.append(button);
    }
});
