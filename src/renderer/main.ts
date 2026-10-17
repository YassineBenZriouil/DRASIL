import type { FsNode, Location, NodeState } from '../shared/fs-types';
import { DEFAULT_SETTINGS, type Settings } from '../shared/settings';
import { ancestry, isInside, parentPath } from '../shared/paths';
import { CATEGORY_NAME, extension, fileCategory } from './filetypes';
import { isDialogOpen } from './dialog';
import { passes } from './filter';
import { FilterPanel } from './filterpanel';
import { Keymap, MOD_DELETE, MOD_TRASH, type Command } from './keys';
import { ListView } from './listview';
import { Tree, type TreeNode } from './model';
import { Ops } from './ops';
import { Search } from './search';
import { SettingsUI } from './settingsui';
import { TreeView } from './view';
import { chooseLocation, isWelcomeOpen, showTips } from './welcome';

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
    if (size.state === 'cached')
        return `about ${total} — calculated ${new Date(size.savedAt ?? 0).toLocaleString()}, may be out of date (recalculating…)`;
    if (size.excluded)
        return `at least ${total} (some folders are excluded in Settings or couldn’t be read)`;
    return `at least ${total} (some folders could not be read)`;
}

function describeState(t: TreeNode): string {
    const { node } = t;
    if (node.kind !== 'directory') return STATE_LABEL[node.state];
    // Filtered-out items are named as hidden, so they're never mistaken for deleted ones.
    const filtered = t.expanded ? t.children.length - t.shown.length : 0;
    const hiddenNote =
        filtered > 0 ? ` (${filtered.toLocaleString()} hidden by filters)` : '';
    if (node.state === 'scanned')
        return `${t.count.toLocaleString()} items${hiddenNote}`;
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
    focusMain();
}

// Keyboard focus goes to whichever view is showing.
function focusMain(): void {
    if (settings.layout === 'list') list.focus();
    else canvas.focus();
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
        ['Center in tree', () => view.centerOn(t)],
        ['Copy path', () => ops.copyPath([t])]
    );
    if (t !== tree.root)
        actions.push(
            ['Rename…', () => void ops.rename(t)],
            ['Move to Trash', () => void ops.trash([t])]
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

// Screen readers hear selection changes made on the canvas (the list announces its own focus).
let announced: TreeNode | null = null;
function announce(): void {
    const t = view.selected;
    if (t === announced) return;
    announced = t;
    if (!t || list.hasFocus) return;
    announcer.textContent = `${t.node.name}, ${typeLabel(t.node)}, ${describeState(t) || 'selected'}`;
}

function render(): void {
    announce();
    list.redraw();
    list.follow(view.selected);
    renderStatus();
    renderActivity();
    renderCrumbs();
    renderInspector();
    renderNav();
}

let lastRoot: TreeNode | null = null;
const tree = new Tree((kind) => {
    if (kind === 'tree') {
        view.relayout();
        // A refresh may have removed selected items.
        view.pruneSelection();
    }
    if (tree.root !== lastRoot) {
        // Results from the old location don't apply any more.
        lastRoot = tree.root;
        search.reset();
        search.updatePlaceholder();
        const path = tree.root?.node.path ?? null;
        for (const b of nav.querySelectorAll<HTMLElement>('button'))
            b.setAttribute('aria-pressed', String(b.dataset.path === path));
        if (path && settings.lastLocation !== path)
            void saveSettings({ lastLocation: path });
    }
    if (kind === 'tree') {
        checkRestoredStart();
        scheduleWatch();
    }
    filters.update(kind);
    render();
});
const view = new TreeView(canvas, tree, {
    select: render,
    open: openItem,
    drop: (sources, target, copy) => ops.drop(sources, target, copy),
    menu: (x, y) => void ops.menu(x, y),
});
const ops = new Ops(tree, view, {
    reveal: (path) => tree.reveal(path),
    focus: focusOn,
});

// Where "paste" and "new folder" go: the selected folder, or the folder holding the selected file.
function folderTarget(): TreeNode | null {
    const t = view.selected ?? tree.root;
    if (!t) return null;
    return t.node.kind === 'directory' ? t : (t.parent ?? tree.root);
}
tree.onReveal = (t, found) => {
    view.select(t);
    view.centerOn(t);
    if (!found)
        ops.notify(
            'Couldn’t get to that item. It may have been moved or deleted, or a folder on the way can’t be read.',
            [],
            true
        );
    else if (!passes(t, filters.filter, Date.now()))
        ops.notify(
            `“${t.node.name}” is hidden by the current filters. Clear filters to see it in the tree.`,
            [],
            true
        );
};

function updateMarks(): void {
    view.marks = new Map();
    for (const t of filters.top) view.marks.set(t.node.path, 'top');
    for (const p of search.matches) view.marks.set(p, 'match');
    view.redraw();
}
const filters = new FilterPanel(
    tree,
    view,
    (t) => {
        view.select(t);
        view.centerOn(t);
    },
    updateMarks
);
const search = new Search(tree, (path) => tree.reveal(path), updateMarks);
const filtersButton = $('toggle-filters');
filtersButton.addEventListener('click', toggleFilters);

// ---- Settings

let settings: Settings = DEFAULT_SETTINGS;
let settingsLoaded = false;
const systemReducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function applySettings(next: Settings): void {
    const hiddenChanged =
        !settingsLoaded || settings.showHidden !== next.showHidden;
    settings = next;
    settingsLoaded = true;
    view.reducedMotion =
        next.motion === 'reduced' ||
        (next.motion === 'system' && systemReducedMotion.matches);
    document.body.dataset.layout = next.layout;
    document.body.dataset.motion = view.reducedMotion ? 'reduced' : 'full';
    listButton.setAttribute('aria-pressed', String(next.layout !== 'tree'));
    inspector.hidden = !next.inspector;
    inspectorButton.setAttribute('aria-pressed', String(next.inspector));
    if (hiddenChanged) filters.setHiddenDefault(next.showHidden);
    list.refresh();
    view.redraw();
    renderInspector();
}
systemReducedMotion.addEventListener('change', () => applySettings(settings));

async function saveSettings(patch: Partial<Settings>): Promise<void> {
    applySettings(await api.setSettings(patch));
}

function toggleInspector(): void {
    void saveSettings({ inspector: !settings.inspector });
}

function toggleList(): void {
    const layout = settings.layout === 'tree' ? 'both' : 'tree';
    void saveSettings({ layout }).then(() =>
        (layout === 'tree' ? canvas : list).focus()
    );
}

function toggleFilters(): void {
    filtersButton.setAttribute('aria-pressed', String(filters.toggle()));
}

// ---- Views

const announcer = $('announce');
const listButton = $('toggle-list');
const list = new ListView($('listview'), tree, view, {
    open: openItem,
    label: (t) =>
        [t.node.name, typeLabel(t.node), describeState(t)]
            .filter(Boolean)
            .join(', '),
    meta: (t) => {
        if (t.node.kind === 'directory') return describeState(t);
        const parts = [
            t.node.size !== undefined ? formatSize(t.node.size) : '',
            STATE_LABEL[t.node.state],
        ];
        return parts.filter(Boolean).join(' · ');
    },
    selected: (t) => {
        view.select(t);
        if (settings.layout === 'both') view.centerOn(t);
    },
});
view.onLayout = () => list.refresh();

// ---- Commands and shortcuts

function selectedItems(): TreeNode[] {
    return [...view.selection];
}

function openMenu(): void {
    const row = list.hasFocus ? list.focusedRect() : null;
    const t = view.selected;
    const [x, y] = row
        ? [row.left + 24, row.bottom]
        : t
          ? view.screenPos(t)
          : [innerWidth / 2, innerHeight / 2];
    void ops.menu(x, y);
}

const commands: Command[] = [
    { id: 'back', label: 'Back', keys: ['Alt+ArrowLeft'], run: goBack },
    {
        id: 'forward',
        label: 'Forward',
        keys: ['Alt+ArrowRight'],
        run: goForward,
    },
    {
        id: 'up',
        label: 'Parent folder',
        keys: ['Alt+ArrowUp', 'Backspace'],
        run: goUp,
    },
    {
        id: 'overview',
        label: 'See the whole tree',
        keys: ['Home'],
        run: () => view.fit(),
    },
    {
        id: 'locate',
        label: 'Center on the selection',
        keys: ['C'],
        run: () => {
            if (view.selected) view.centerOn(view.selected);
        },
    },
    {
        id: 'zoomIn',
        label: 'Zoom in',
        keys: ['+', '='],
        run: () => view.zoomBy(1.25),
    },
    {
        id: 'zoomOut',
        label: 'Zoom out',
        keys: ['-'],
        run: () => view.zoomBy(0.8),
    },
    {
        id: 'tree',
        label: 'Go to the tree',
        keys: ['Mod+1'],
        run: () => canvas.focus(),
    },
    {
        id: 'listFocus',
        label: 'Go to the list view',
        keys: ['Mod+2'],
        run: () => {
            if (settings.layout === 'tree') toggleList();
            else list.focus();
        },
    },
    {
        id: 'list',
        label: 'Show or hide the list view',
        keys: ['L'],
        run: toggleList,
    },
    {
        id: 'details',
        label: 'Show or hide details',
        keys: ['I'],
        run: toggleInspector,
    },
    {
        id: 'search',
        label: 'Search',
        keys: ['Mod+F'],
        run: () => search.focus(),
    },
    {
        id: 'filters',
        label: 'Filters and sorting',
        keys: ['Mod+Shift+F'],
        run: toggleFilters,
    },
    {
        id: 'menu',
        label: 'Actions menu',
        keys: ['Shift+F10', 'ContextMenu'],
        run: openMenu,
    },
    {
        id: 'newFolder',
        label: 'New folder',
        keys: ['Mod+Shift+N'],
        run: () => {
            const f = folderTarget();
            if (f) void ops.newFolder(f);
        },
    },
    {
        id: 'copy',
        label: 'Copy',
        keys: ['Mod+C'],
        // Leave normal text copying alone when text is selected on the page.
        run: () => {
            if (!view.selection.size || window.getSelection()?.toString())
                return false;
            ops.copy(selectedItems());
        },
    },
    {
        id: 'cut',
        label: 'Cut',
        keys: ['Mod+X'],
        run: () => {
            if (!view.selection.size) return false;
            ops.cut(selectedItems());
        },
    },
    {
        id: 'paste',
        label: 'Paste',
        keys: ['Mod+V'],
        run: () => {
            const f = folderTarget();
            if (!ops.hasClipboard || !f) return false;
            void ops.paste(f);
        },
    },
    {
        id: 'rename',
        label: 'Rename',
        keys: ['F2'],
        run: () => {
            if (view.selected) void ops.rename(view.selected);
        },
    },
    {
        id: 'trash',
        label: 'Move to Trash',
        keys: [MOD_TRASH],
        run: () => void ops.trash(selectedItems()),
    },
    {
        id: 'delete',
        label: 'Delete permanently',
        keys: [MOD_DELETE],
        run: () => void ops.deletePermanently(selectedItems()),
    },
    {
        id: 'copyPath',
        label: 'Copy path',
        keys: ['Mod+Shift+C'],
        run: () => {
            if (view.selection.size) ops.copyPath(selectedItems());
        },
    },
    {
        id: 'refresh',
        label: 'Refresh',
        keys: ['F5'],
        run: () => {
            const f = folderTarget();
            if (f) ops.refresh(f);
        },
    },
    {
        id: 'stats',
        label: 'Performance stats',
        keys: ['F9'],
        run: () => view.toggleStats(),
    },
    {
        id: 'shortcuts',
        label: 'Keyboard shortcuts',
        keys: ['F1', '?'],
        run: () => void settingsUI.open('shortcuts'),
    },
    {
        id: 'settings',
        label: 'Settings',
        keys: ['Mod+,'],
        run: () => void settingsUI.open(),
    },
];

let keymap = new Keymap(commands, {});
let locations: Location[] = [];
const settingsUI = new SettingsUI({
    get: () => settings,
    save: saveSettings,
    get keymap() {
        return keymap;
    },
    locations: () => locations,
    currentFolder: () => tree.root?.node.path ?? null,
    sizesChanged: () => tree.restartSizes(),
});

window.addEventListener('keydown', (e) => {
    if (isDialogOpen() || settingsUI.isOpen || isWelcomeOpen()) return;
    keymap.handle(e);
});
// Mouse back/forward buttons.
window.addEventListener('mouseup', (e) => {
    if (e.button === 3) goBack();
    else if (e.button === 4) goForward();
});

backButton.addEventListener('click', goBack);
forwardButton.addEventListener('click', goForward);
upButton.addEventListener('click', goUp);
$('fit').addEventListener('click', () => view.fit());
$('locate').addEventListener('click', () => {
    if (view.selected) view.centerOn(view.selected);
});
inspectorButton.addEventListener('click', toggleInspector);
listButton.addEventListener('click', toggleList);
$('open-settings').addEventListener('click', () => void settingsUI.open());
$('skip').addEventListener('click', focusMain);

// ---- Changes made by other apps

// Tell the main process which folders are open, so it can notice outside changes to them.
let watchTimer = 0;
let lastWatched = '';
function scheduleWatch(): void {
    clearTimeout(watchTimer);
    watchTimer = window.setTimeout(() => {
        const root = tree.root;
        const open: string[] = [];
        // Shallow folders first, so the limit in the main process keeps the most visible ones.
        const queue = root ? [root] : [];
        for (let i = 0; i < queue.length; i++) {
            const t = queue[i]!;
            if (t.node.kind !== 'directory' || !t.expanded) continue;
            open.push(t.node.path);
            for (const c of t.children) if (c.expanded) queue.push(c);
        }
        const key = open.join('\n');
        if (key === lastWatched) return;
        lastWatched = key;
        api.watchFolders(open);
    }, 500);
}

// Sizes are recalculated after outside changes, but not more than every few seconds.
let sizeTimer = 0;
api.onFsChanged((paths) => {
    tree.refresh(paths);
    clearTimeout(sizeTimer);
    sizeTimer = window.setTimeout(() => tree.restartSizes(), 5000);
});

// ---- Drives coming and going

const POLL_DRIVES_MS = 5000;
function renderLocations(): void {
    const path = tree.root?.node.path ?? null;
    nav.replaceChildren(
        ...locations.map((loc) => {
            const b = button(loc.name, () => openLocation(loc.path));
            b.title = loc.path;
            b.dataset.path = loc.path;
            b.setAttribute('aria-pressed', String(loc.path === path));
            return b;
        })
    );
}

// A slow drive check (e.g. a network drive timing out) must not pile up behind itself.
let polling = false;
async function pollDrives(): Promise<void> {
    if (polling) return;
    polling = true;
    const next = await api.locations().catch(() => locations);
    polling = false;
    const drives = (ls: Location[]): Map<string, Location> =>
        new Map(ls.filter((l) => l.kind === 'drive').map((l) => [l.path, l]));
    const before = drives(locations);
    const after = drives(next);
    const root = tree.root;
    for (const [path, loc] of before)
        if (!after.has(path)) {
            ops.notify(
                `“${loc.name}” was disconnected. Anything open from it is shown as unavailable.`,
                [],
                true
            );
            if (root && isInside(root.node.path, path))
                tree.refresh([root.node.path]);
        }
    for (const [path, loc] of after)
        if (!before.has(path)) {
            ops.notify(`“${loc.name}” is connected.`);
            // The drive the tree was showing came back: read it again.
            if (root && isInside(root.node.path, path))
                tree.refresh([root.node.path]);
        }
    const changed =
        next.map((l) => l.path).join('|') !==
        locations.map((l) => l.path).join('|');
    locations = next;
    if (changed) renderLocations();
}

// ---- Errors

// Anything unexpected is logged locally and mentioned once, instead of failing silently.
let lastErrorNotice = 0;
function reportError(message: string): void {
    api.logError(message);
    if (Date.now() - lastErrorNotice < 10_000) return;
    lastErrorNotice = Date.now();
    ops.notify(
        'Something went wrong. Your files were not changed by it, and the details were saved to the log. If the view looks wrong, press F5.',
        [],
        true
    );
}
window.addEventListener('error', (e) =>
    reportError(`${e.message} at ${e.filename}:${e.lineno}`)
);
window.addEventListener('unhandledrejection', (e) =>
    reportError(`Unhandled: ${String(e.reason)}`)
);

// ---- Start

// If the remembered location turns out to be gone, offer the picker instead of an empty tree.
let restoring: string | null = null;
function checkRestoredStart(): void {
    const root = tree.root;
    if (!restoring || !root || root.node.path !== restoring) return;
    const state = root.node.state;
    if (state === 'loading' || state === 'unscanned') return;
    const path = restoring;
    restoring = null;
    if (
        state === 'unavailable' ||
        state === 'inaccessible' ||
        state === 'error'
    )
        void pickLocation(
            `Your last location, ${path}, isn’t available right now.`
        );
}

async function pickLocation(message?: string): Promise<void> {
    const first = !settings.onboarded;
    const path = await chooseLocation(locations, { first, message });
    if (first) await saveSettings({ onboarded: true });
    if (path) openLocation(path);
    if (path && !settings.tipsDismissed)
        showTips(() => void saveSettings({ tipsDismissed: true }));
}

void (async () => {
    applySettings(await api.getSettings());
    keymap = new Keymap(commands, settings.keys);
    locations = await api.locations();
    renderLocations();
    setInterval(() => void pollDrives(), POLL_DRIVES_MS);
    const start =
        settings.startLocation === 'ask'
            ? null
            : settings.startLocation === 'last'
              ? settings.lastLocation
              : settings.startLocation;
    if (!settings.onboarded || !start) {
        await pickLocation();
        return;
    }
    restoring = start;
    openLocation(start);
    if (!settings.tipsDismissed)
        showTips(() => void saveSettings({ tipsDismissed: true }));
})();
