// Filters, sorting and "largest / oldest" highlights. Nothing here changes files.
import {
    defaultFilter,
    isFiltering,
    pickChildren,
    sizeOf,
    type AgeFilter,
    type Filter,
    type Highlight,
    type SortBy,
} from './filter';
import { CATEGORY_NAME, type FileCategory } from './filetypes';
import type { Tree, TreeNode } from './model';
import { formatSize } from './ops';
import type { TreeView } from './view';

const TOP_COUNT = 10;
const SIZE_STEPS: [string, number][] = [
    ['Any size', 0],
    ['1 MB', 1 << 20],
    ['10 MB', 10 << 20],
    ['100 MB', 100 << 20],
    ['1 GB', 1 << 30],
];
const AGES: [string, AgeFilter][] = [
    ['Any time', 'any'],
    ['In the last 7 days', '7d'],
    ['In the last 30 days', '30d'],
    ['In the last year', '1y'],
    ['More than a year ago', 'older1y'],
];
const SORTS: [string, SortBy][] = [
    ['Name', 'name'],
    ['Size (largest first)', 'size'],
    ['Date modified (newest first)', 'modified'],
];
const HIGHLIGHTS: [string, Highlight][] = [
    ['Nothing', 'none'],
    ['Largest folders', 'largestFolders'],
    ['Largest files', 'largestFiles'],
    ['Oldest files', 'oldestFiles'],
];

function select<T extends string | number>(
    label: string,
    options: [string, T][],
    value: T,
    onChange: (v: T) => void
): HTMLLabelElement {
    const l = document.createElement('label');
    l.append(label);
    const s = document.createElement('select');
    options.forEach(([text], i) => s.append(new Option(text, String(i))));
    s.selectedIndex = options.findIndex(([, v]) => v === value);
    s.addEventListener('change', () => onChange(options[s.selectedIndex]![1]));
    l.append(s);
    return l;
}

function checkbox(
    label: string,
    checked: boolean,
    onChange: (v: boolean) => void
): HTMLLabelElement {
    const l = document.createElement('label');
    l.className = 'check';
    const c = document.createElement('input');
    c.type = 'checkbox';
    c.checked = checked;
    c.addEventListener('change', () => onChange(c.checked));
    l.append(c, ' ', label);
    return l;
}

export class FilterPanel {
    filter: Filter = defaultFilter();
    top: TreeNode[] = [];
    private panel = document.getElementById('filters-panel')!;
    private statusEl = document.getElementById('filter-status')!;
    private topList = document.createElement('ol');
    private lastSizeLayout = 0;

    constructor(
        private tree: Tree,
        private view: TreeView,
        private onGo: (t: TreeNode) => void,
        private onMarksChanged: () => void
    ) {
        view.pick = (t) => pickChildren(t, this.filter, tree.sizes, Date.now());
        this.build();
    }

    toggle(): boolean {
        this.panel.hidden = !this.panel.hidden;
        if (!this.panel.hidden)
            this.panel.querySelector<HTMLElement>('input, select')?.focus();
        return !this.panel.hidden;
    }

    clear(): void {
        const { sortBy, highlight } = this.filter;
        this.filter = { ...defaultFilter(), sortBy, highlight };
        this.build();
        this.changed();
    }

    // Call after the tree or the sizes change.
    update(kind: 'tree' | 'sizes'): void {
        // Size order depends on totals still being calculated; re-sort now and then, not constantly.
        if (
            kind === 'sizes' &&
            this.filter.sortBy === 'size' &&
            Date.now() - this.lastSizeLayout > 2000
        ) {
            this.lastSizeLayout = Date.now();
            this.view.relayout();
        }
        if (this.filter.highlight !== 'none') this.computeTop();
        this.renderStatus();
    }

    private changed(): void {
        this.view.relayout();
        this.computeTop();
        this.renderStatus();
    }

    // The top items among what's on the tree right now.
    private computeTop(): void {
        const h = this.filter.highlight;
        const before = this.top;
        this.top = [];
        const root = this.tree.root;
        if (h !== 'none' && root) {
            const scored: [number, TreeNode][] = [];
            const walk = (t: TreeNode): void => {
                for (const c of t.shown) {
                    const isDir = c.node.kind === 'directory';
                    if (h === 'largestFolders' && isDir)
                        scored.push([sizeOf(c, this.tree.sizes), c]);
                    if (h === 'largestFiles' && c.node.kind === 'file')
                        scored.push([c.node.size ?? 0, c]);
                    if (
                        h === 'oldestFiles' &&
                        c.node.kind === 'file' &&
                        c.node.modified !== undefined
                    )
                        scored.push([-c.node.modified, c]);
                    walk(c);
                }
            };
            walk(root);
            scored.sort((a, b) => b[0] - a[0]);
            this.top = scored
                .filter(([score]) => h === 'oldestFiles' || score > 0)
                .slice(0, TOP_COUNT)
                .map(([, t]) => t);
        }
        if (
            before.length !== this.top.length ||
            before.some((t, i) => t !== this.top[i])
        ) {
            this.renderTop();
            this.onMarksChanged();
        } else if (h === 'largestFolders') this.renderTop();
    }

    private renderTop(): void {
        const h = this.filter.highlight;
        this.topList.replaceChildren(
            ...this.top.map((t) => {
                const li = document.createElement('li');
                const b = document.createElement('button');
                const detail =
                    h === 'oldestFiles'
                        ? new Date(t.node.modified!).toLocaleDateString()
                        : formatSize(sizeOf(t, this.tree.sizes));
                const done = this.tree.sizes.get(t.node.path)?.state;
                const atLeast =
                    h === 'largestFolders' && done !== 'complete'
                        ? 'at least '
                        : '';
                b.textContent = `${t.node.name} — ${atLeast}${detail}`;
                b.title = t.node.path;
                b.addEventListener('click', () => this.onGo(t));
                li.append(b);
                return li;
            })
        );
        this.topList.hidden = this.top.length === 0;
    }

    private renderStatus(): void {
        if (!isFiltering(this.filter)) {
            this.statusEl.replaceChildren();
            return;
        }
        const n = this.view.filteredOut;
        const text = document.createElement('span');
        // Only loaded items can be counted; unopened folders may hide more.
        text.textContent = `Filters on: ${n.toLocaleString()} loaded item${n === 1 ? '' : 's'} hidden (not deleted)`;
        const clear = document.createElement('button');
        clear.textContent = 'Clear filters';
        clear.addEventListener('click', () => this.clear());
        this.statusEl.replaceChildren(text, ' ', clear);
    }

    private build(): void {
        const f = this.filter;
        const set =
            <K extends keyof Filter>(key: K) =>
            (v: Filter[K]) => {
                this.filter = { ...this.filter, [key]: v };
                this.changed();
            };
        const title = document.createElement('h2');
        title.textContent = 'Filters';
        const note = document.createElement('p');
        note.className = 'hint-inline';
        note.textContent =
            'Type, size and date apply to files. Folders always stay so the tree keeps its shape.';

        const types = document.createElement('fieldset');
        const legend = document.createElement('legend');
        legend.textContent = 'File types (none ticked = all)';
        types.append(legend);
        for (const cat of Object.keys(CATEGORY_NAME) as FileCategory[]) {
            const name = CATEGORY_NAME[cat];
            types.append(
                checkbox(
                    name.charAt(0).toUpperCase() + name.slice(1) + 's',
                    f.types.has(cat),
                    (on) => {
                        const next = new Set(this.filter.types);
                        if (on) next.add(cat);
                        else next.delete(cat);
                        set('types')(next);
                    }
                )
            );
        }

        const clear = document.createElement('button');
        clear.textContent = 'Clear filters';
        clear.addEventListener('click', () => this.clear());

        const discover = document.createElement('h2');
        discover.textContent = 'Discover';

        this.panel.replaceChildren(
            title,
            note,
            checkbox('Folders only', f.foldersOnly, set('foldersOnly')),
            types,
            select('Larger than', SIZE_STEPS, f.minSize, set('minSize')),
            select('Modified', AGES, f.age, set('age')),
            checkbox('Show hidden items', f.showHidden, set('showHidden')),
            clear,
            discover,
            select('Sort by', SORTS, f.sortBy, set('sortBy')),
            select('Highlight', HIGHLIGHTS, f.highlight, set('highlight')),
            this.topList
        );
        this.renderTop();
    }
}
