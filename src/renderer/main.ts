import type { FsNode, NodeState } from '../shared/fs-types';
import { ancestry, parentPath } from '../shared/paths';
import { CATEGORY_NAME, extension, fileCategory } from './filetypes';
import { Tree, type TreeNode } from './model';
import { TreeView } from './view';

const api = window.drasil;
const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
    document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('world');
const nav = $('locations');
const hint = $('hint');
const status = $('status');
const activity = $('activity');
const crumbs = $('crumbs');
const inspector = $('inspector');
const backButton = $<HTMLButtonElement>('back');
const forwardButton = $<HTMLButtonElement>('forward');
const upButton = $<HTMLButtonElement>('up');
const inspectorButton = $('toggle-inspector');

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

const FILE_MANAGER = navigator.userAgent.includes('Windows')
    ? 'Explorer'
    : navigator.userAgent.includes('Mac')
      ? 'Finder'
      : 'file manager';

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

function hasFolderSize(node: FsNode): boolean {
    return (
        node.kind === 'directory' &&
        node.state !== 'inaccessible' &&
        node.state !== 'unavailable' &&
        !node.link
    );
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

function describeState(t: TreeNode): string {
    const { node } = t;
    if (node.kind !== 'directory') return STATE_LABEL[node.state];
    if (node.state === 'scanned') return `${t.count.toLocaleString()} items`;
    if (node.state === 'loading')
        return `loading, ${t.count.toLocaleString()} items so far`;
    return STATE_LABEL[node.state];
}

function linkText(node: FsNode): string {
    if (!node.link) return '';
    return `${node.link.target}${node.link.loop ? ' (a parent folder)' : ''}`;
}

// A text description of the selection, so nothing depends on reading shapes or colors.
function describe(t: TreeNode): string {
    const { node } = t;
    const parts: string[] = [];
    if (node.kind === 'directory') {
        parts.push(describeState(t));
        if (hasFolderSize(node)) parts.push(describeSize(t));
    } else {
        if (node.size !== undefined) parts.push(formatSize(node.size));
        if (node.state !== 'scanned') parts.push(STATE_LABEL[node.state]);
    }
    if (node.link) parts.push(`link to ${linkText(node)}`);
    if (node.hidden) parts.push('hidden');
    if (node.error) parts.push(node.error);
    return parts.filter(Boolean).join(' · ');
}

function typeLabel(node: FsNode): string {
    if (node.kind === 'directory') return node.link ? 'Folder link' : 'Folder';
    if (node.kind === 'other') return node.link ? 'Link' : 'Other';
    const ext = extension(node.name);
    const kind = CATEGORY_NAME[fileCategory(node.name)];
    const label = ext ? `${ext.toUpperCase()} ${kind}` : kind;
    return (
        label.charAt(0).toUpperCase() +
        label.slice(1) +
        (node.link ? ' (link)' : '')
    );
}

// ---- History: each entry is a root plus what was selected. Roots are kept as live
// nodes, so going back restores the branch exactly as it was left open.

interface Entry {
    root: TreeNode;
    selected: TreeNode | null;
}
const MAX_HISTORY = 50;
const back: Entry[] = [];
const forward: Entry[] = [];

function current(): Entry | null {
    return tree.root ? { root: tree.root, selected: view.selected } : null;
}

function remember(): void {
    const entry = current();
    if (!entry) return;
    back.push(entry);
    if (back.length > MAX_HISTORY) back.shift();
    forward.length = 0;
}

function restore(entry: Entry): void {
    tree.useRoot(entry.root);
    view.select(entry.selected ?? entry.root);
    view.fit();
}

function goBack(): void {
    const entry = back.pop();
    const now = current();
    if (!entry || !now) return;
    forward.push(now);
    restore(entry);
}

function goForward(): void {
    const entry = forward.pop();
    const now = current();
    if (!entry || !now) return;
    back.push(now);
    restore(entry);
}

function openLocation(path: string): void {
    remember();
    hint.hidden = true;
    view.select(tree.setRoot(path));
    view.fit();
    canvas.focus();
}

// Make a folder already in the tree the new root.
function focusOn(t: TreeNode): void {
    if (t.node.kind !== 'directory' || t === tree.root) return;
    remember();
    tree.useRoot(t);
    tree.expand(t);
    view.select(t);
    view.fit();
}

// Re-root at a folder above the current root, then open the way back down to where we were.
function jumpTo(path: string): void {
    const root = tree.root;
    if (!root) return;
    const target = view.selected ?? root;
    remember();
    const adopt = parentPath(root.node.path) === path ? root : null;
    view.select(tree.setRoot(path, adopt));
    view.fit();
    tree.reveal(target.node.path);
}

function goUp(): void {
    const parent = tree.root && parentPath(tree.root.node.path);
    if (parent) jumpTo(parent);
}

function openItem(t: TreeNode): void {
    if (t.node.kind === 'directory') focusOn(t);
    else void runAction(api.open(t.node.path));
}

let message = '';
async function runAction(result: Promise<string>): Promise<void> {
    message = await result;
    renderInspector();
}

// ---- Rendering

function renderStatus(): void {
    const t = view.selected;
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

function renderActivity(): void {
    const parts: string[] = [];
    const n = tree.activeListings;
    if (n) parts.push(`Reading ${n} folder${n === 1 ? '' : 's'}…`);
    if (tree.root) {
        const { scanned, done } = tree.sizeProgress;
        parts.push(
            done
                ? 'Folder sizes ready'
                : `Calculating folder sizes… ${scanned.toLocaleString()} items checked`
        );
    }
    activity.textContent = parts.join(' · ');
}

function button(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
}

// Path bar: every folder from the top of the drive down to the selection.
// Folders above the current root are dimmed; clicking one moves the root up to it.
let crumbsShape = '';
function renderCrumbs(): void {
    const root = tree.root;
    const target = view.selected ?? root;
    const shape = root && target ? `${root.node.path}|${target.node.path}` : '';
    if (shape === crumbsShape) return;
    crumbsShape = shape;
    if (!root || !target) {
        crumbs.replaceChildren();
        return;
    }
    const chain: TreeNode[] = [];
    for (let n: TreeNode | null = target; n; n = n.parent) {
        chain.unshift(n);
        if (n === root) break;
    }
    const items: HTMLElement[] = [];
    for (const path of ancestry(root.node.path).slice(0, -1)) {
        const b = button(
            path === '/'
                ? '/'
                : (path.split(/[\\/]/).filter(Boolean).pop() ?? path),
            () => jumpTo(path)
        );
        b.className = 'outside';
        b.title = `Show ${path}`;
        items.push(b);
    }
    for (const n of chain) {
        const label =
            n === root && items.length === 0 ? n.node.path : n.node.name;
        const b = button(label, () => {
            view.select(n);
            view.centerOn(n);
        });
        b.title = n.node.path;
        if (n === target) b.setAttribute('aria-current', 'location');
        items.push(b);
    }
    const out: (HTMLElement | string)[] = [];
    items.forEach((b, i) => {
        if (i) {
            const sep = document.createElement('span');
            sep.className = 'sep';
            sep.textContent = '›';
            sep.setAttribute('aria-hidden', 'true');
            out.push(sep);
        }
        out.push(b);
    });
    crumbs.replaceChildren(...out);
}

interface InspectorContent {
    title: string;
    rows: [string, string][];
    actions: [string, () => void][];
}

function inspectorContent(t: TreeNode): InspectorContent {
    const { node } = t;
    const rows: [string, string][] = [
        ['Location', parentPath(node.path) ?? node.path],
        ['Type', typeLabel(node)],
    ];
    if (node.kind === 'directory') {
        if (hasFolderSize(node)) rows.push(['Size', describeSize(t)]);
        rows.push(['Contains', describeState(t)]);
    } else {
        if (node.size !== undefined) rows.push(['Size', formatSize(node.size)]);
        rows.push(['Status', STATE_LABEL[node.state]]);
    }
    if (node.modified !== undefined)
        rows.push(['Modified', new Date(node.modified).toLocaleString()]);
    rows.push(['Points to', linkText(node)]);
    if (node.hidden) rows.push(['Hidden', 'Yes']);
    rows.push(['Problem', node.error ?? '']);

    const actions: [string, () => void][] = [];
    if (node.kind !== 'directory') actions.push(['Open', () => openItem(t)]);
    else if (t !== tree.root) actions.push(['Show as root', () => focusOn(t)]);
    actions.push(
        [
            `Show in ${FILE_MANAGER}`,
            () => void runAction(api.reveal(node.path)),
        ],
        ['Center in tree', () => view.centerOn(t)]
    );
    return { title: node.name, rows: rows.filter(([, v]) => v), actions };
}

// Sizes update several times a second, so the panel is only rebuilt when its layout changes;
// otherwise values are updated in place (rebuilding mid-click would swallow the click).
let inspected: TreeNode | null = null;
let inspectorShape = '';
let valueCells: HTMLElement[] = [];
let messageEl: HTMLElement | null = null;

function renderInspector(): void {
    if (inspector.hidden) return;
    const t = view.selected;
    if (t !== inspected) message = '';
    inspected = t;
    if (!t) {
        if (inspectorShape !== 'empty') {
            const p = document.createElement('p');
            p.className = 'hint-inline';
            p.textContent = 'Select a file or folder.';
            inspector.replaceChildren(p);
            inspectorShape = 'empty';
        }
        return;
    }
    const content = inspectorContent(t);
    const shape = JSON.stringify([
        t.node.path,
        content.title,
        content.rows.map(([k]) => k),
        content.actions.map(([k]) => k),
    ]);
    if (shape === inspectorShape) {
        content.rows.forEach(([, v], i) => {
            if (valueCells[i]!.textContent !== v)
                valueCells[i]!.textContent = v;
        });
    } else {
        inspectorShape = shape;
        const title = document.createElement('h2');
        title.textContent = content.title;
        const dl = document.createElement('dl');
        valueCells = content.rows.map(([k, v]) => {
            const dt = document.createElement('dt');
            dt.textContent = k;
            const dd = document.createElement('dd');
            dd.textContent = v;
            dl.append(dt, dd);
            return dd;
        });
        const actions = document.createElement('div');
        actions.className = 'actions';
        for (const [label, run] of content.actions)
            actions.append(button(label, run));
        messageEl = document.createElement('p');
        messageEl.className = 'message';
        messageEl.setAttribute('role', 'status');
        inspector.replaceChildren(title, dl, actions, messageEl);
    }
    messageEl!.textContent = message;
}

function renderNav(): void {
    backButton.disabled = back.length === 0;
    forwardButton.disabled = forward.length === 0;
    upButton.disabled = !tree.root || parentPath(tree.root.node.path) === null;
}

function render(): void {
    renderStatus();
    renderActivity();
    renderCrumbs();
    renderInspector();
    renderNav();
}

const tree = new Tree((kind) => {
    if (kind === 'tree') view.relayout();
    render();
});
const view = new TreeView(canvas, tree, render, openItem);
tree.onReveal = (t) => {
    view.select(t);
    view.centerOn(t);
};

function toggleInspector(): void {
    inspector.hidden = !inspector.hidden;
    inspectorButton.setAttribute('aria-pressed', String(!inspector.hidden));
    renderInspector();
}

backButton.addEventListener('click', goBack);
forwardButton.addEventListener('click', goForward);
upButton.addEventListener('click', goUp);
$('fit').addEventListener('click', () => view.fit());
$('locate').addEventListener('click', () => {
    if (view.selected) view.centerOn(view.selected);
});
inspectorButton.addEventListener('click', toggleInspector);

window.addEventListener('keydown', (e) => {
    if (e.altKey && e.key === 'ArrowLeft') goBack();
    else if (e.altKey && e.key === 'ArrowRight') goForward();
    else if ((e.altKey && e.key === 'ArrowUp') || e.key === 'Backspace') goUp();
    else if (e.altKey || e.ctrlKey || e.metaKey) return;
    else if (e.key === 'i' || e.key === 'I') toggleInspector();
    else if ((e.key === 'c' || e.key === 'C') && view.selected)
        view.centerOn(view.selected);
    else return;
    e.preventDefault();
});
// Mouse back/forward buttons.
window.addEventListener('mouseup', (e) => {
    if (e.button === 3) goBack();
    else if (e.button === 4) goForward();
});

api.locations().then((locations) => {
    for (const loc of locations) {
        const b = button(loc.name, () => {
            for (const other of nav.querySelectorAll('button'))
                other.setAttribute('aria-pressed', String(other === b));
            openLocation(loc.path);
        });
        b.title = loc.path;
        b.setAttribute('aria-pressed', 'false');
        nav.append(b);
    }
});
