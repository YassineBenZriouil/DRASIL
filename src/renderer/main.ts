// Plain list view of the filesystem engine. The radial tree replaces it as the main view in Phase 3;
// it stays as the accessible alternative view (Phase 8).
import type { FsNode, ListEvent, NodeState } from '../shared/fs-types';

const api = window.drasil;
const tree = document.getElementById('tree')!;
const nav = document.getElementById('locations')!;

const STATE_LABEL: Record<NodeState, string> = {
    unscanned: 'not scanned',
    loading: 'loading…',
    partial: 'partially scanned',
    scanned: '',
    empty: 'empty',
    inaccessible: 'access denied',
    unavailable: 'unavailable',
    error: 'error',
};

interface DirView {
    node: FsNode;
    toggle: HTMLButtonElement;
    status: HTMLSpanElement;
    children: HTMLUListElement;
    count: number;
}

let nextId = 1;
const listings = new Map<number, DirView>();

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string
): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text) e.textContent = text;
    return e;
}

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

function linkText(node: FsNode): string {
    if (!node.link) return '';
    const loop = node.link.loop ? ' (points to a parent folder)' : '';
    return `→ ${node.link.target}${loop}`;
}

function renderStatus(view: DirView, cancelId?: number): void {
    const { node, status } = view;
    status.className = `status ${node.state}`;
    let text = STATE_LABEL[node.state];
    if (node.state === 'loading') text = `loading… ${view.count} items`;
    else if (node.state === 'scanned') text = `${view.count} items`;
    if (node.error) text += ` — ${node.error}`;
    status.textContent = text;
    if (cancelId !== undefined) {
        const stop = el('button', '', 'Stop');
        stop.addEventListener('click', () => api.cancel(cancelId));
        status.append(' ', stop);
    }
}

function startListing(view: DirView): void {
    const id = nextId++;
    view.children.replaceChildren();
    view.count = 0;
    view.node.state = 'loading';
    view.node.error = undefined;
    listings.set(id, view);
    renderStatus(view, id);
    api.list(view.node.path, id).catch((err: unknown) => {
        listings.delete(id);
        view.node.state = 'error';
        view.node.error = String(err);
        renderStatus(view);
    });
}

function setExpanded(view: DirView, expanded: boolean): void {
    view.toggle.setAttribute('aria-expanded', String(expanded));
    view.toggle.firstChild!.textContent = expanded ? '▾ ' : '▸ ';
    view.children.hidden = !expanded;
}

function renderNode(node: FsNode): HTMLLIElement {
    const li = el('li', node.hidden ? 'hidden-item' : '');
    const row = el('div', 'row');
    li.append(row);

    if (node.kind !== 'directory') {
        row.append(el('span', '', node.name));
        const meta = [
            node.size !== undefined ? formatSize(node.size) : '',
            linkText(node),
        ].filter(Boolean);
        if (meta.length) row.append(el('span', 'meta', meta.join(' ')));
        if (node.error)
            row.append(el('span', `status ${node.state}`, node.error));
        return li;
    }

    const toggle = el('button');
    toggle.append('▸ ', node.name);
    const status = el('span');
    const children = el('ul');
    const view: DirView = { node, toggle, status, children, count: 0 };
    row.append(toggle);
    if (node.link) row.append(el('span', 'meta', linkText(node)));
    row.append(status);
    li.append(children);
    setExpanded(view, false);
    renderStatus(view);

    toggle.addEventListener('click', () => {
        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        if (node.state === 'loading') return setExpanded(view, !expanded);
        // Retry anything not fully known: unscanned, partial, failed, or a drive that came back.
        const known = node.state === 'scanned' || node.state === 'empty';
        if (!expanded && !known) startListing(view);
        setExpanded(view, !expanded);
    });
    return li;
}

api.onListEvent((event: ListEvent) => {
    const view = listings.get(event.id);
    if (!view) return;
    if (event.type === 'batch') {
        const frag = document.createDocumentFragment();
        for (const node of event.nodes) frag.append(renderNode(node));
        view.children.append(frag);
        view.count += event.nodes.length;
        renderStatus(view, event.id);
        return;
    }
    listings.delete(event.id);
    view.node.state = event.state;
    view.node.error = event.error;
    view.count = event.count;
    renderStatus(view);
});

function openRoot(path: string, name: string): void {
    for (const id of listings.keys()) api.cancel(id);
    listings.clear();
    const root = renderNode({
        path,
        name,
        kind: 'directory',
        state: 'unscanned',
        hidden: false,
    });
    const list = el('ul');
    list.append(root);
    tree.replaceChildren(list);
    root.querySelector('button')!.click();
}

api.locations().then((locations) => {
    for (const loc of locations) {
        const button = el('button', '', loc.name);
        button.title = loc.path;
        button.setAttribute('aria-pressed', 'false');
        button.addEventListener('click', () => {
            for (const b of nav.querySelectorAll('button'))
                b.setAttribute('aria-pressed', String(b === button));
            openRoot(loc.path, loc.path);
        });
        nav.append(button);
    }
});
