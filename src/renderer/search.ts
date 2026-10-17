// Search box and results list. Results stream in; the status line always says how much was
// actually searched, so an empty or short list is never mistaken for "it isn't there".
import type { SearchCoverage, SearchResult } from '../shared/fs-types';
import { parentPath } from '../shared/paths';
import type { Tree } from './model';
import { formatSize } from './ops';

const api = window.drasil;
const DEBOUNCE_MS = 250;

export class Search {
    matches = new Set<string>();
    private input = document.getElementById('search') as HTMLInputElement;
    private panel = document.getElementById('search-panel')!;
    private status = document.getElementById('search-status')!;
    private list = document.getElementById('search-results')!;
    private nextId = 1;
    private current = 0;
    private query = '';
    private found = 0;
    private folders = 0;
    private coverage: SearchCoverage | null = null;
    private timer = 0;

    constructor(
        private tree: Tree,
        private onGo: (path: string) => void,
        private onMatchesChanged: () => void
    ) {
        api.onSearchEvent((e) => {
            if (e.id !== this.current) return;
            if (e.type === 'results') this.add(e.results);
            else if (e.type === 'progress') this.folders = e.folders;
            else this.coverage = e.coverage;
            this.renderStatus();
        });
        this.input.addEventListener('input', () => {
            clearTimeout(this.timer);
            this.timer = window.setTimeout(() => this.start(), DEBOUNCE_MS);
        });
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                clearTimeout(this.timer);
                if (this.input.value.trim() !== this.query) this.start();
                else this.focusResult(0);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.focusResult(0);
            } else if (e.key === 'Escape') {
                this.input.value = '';
                this.reset();
            }
        });
        this.list.addEventListener('keydown', (e) => {
            const items = [...this.list.querySelectorAll('button')];
            const i = items.indexOf(
                document.activeElement as HTMLButtonElement
            );
            if (e.key === 'ArrowDown') this.focusResult(i + 1);
            else if (e.key === 'ArrowUp') {
                if (i <= 0) this.input.focus();
                else this.focusResult(i - 1);
            } else if (e.key === 'Escape') this.input.focus();
            else return;
            e.preventDefault();
        });
    }

    focus(): void {
        this.input.focus();
        this.input.select();
    }

    // Clear results, e.g. when the root changes and they no longer apply.
    reset(): void {
        if (this.current) api.cancelSearch(this.current);
        this.current = 0;
        this.query = '';
        this.panel.hidden = true;
        this.list.replaceChildren();
        this.matches.clear();
        this.onMatchesChanged();
    }

    updatePlaceholder(): void {
        const root = this.tree.root;
        this.input.placeholder = root
            ? `Search in “${root.node.name}”`
            : 'Search';
        this.input.disabled = !root;
    }

    private start(): void {
        const q = this.input.value.trim();
        const root = this.tree.root;
        if (this.current) api.cancelSearch(this.current);
        if (!q || !root) return this.reset();
        this.current = this.nextId++;
        this.query = q;
        this.found = 0;
        this.folders = 0;
        this.coverage = null;
        this.matches.clear();
        this.list.replaceChildren();
        this.panel.hidden = false;
        this.renderStatus();
        this.onMatchesChanged();
        api.search(this.current, root.node.path, q).catch((err: unknown) => {
            this.coverage = {
                folders: 0,
                unreadable: 0,
                unreadableSamples: [],
                excluded: 0,
                limited: false,
                cancelled: true,
            };
            this.status.textContent = `Search failed: ${String(err)}`;
        });
    }

    private add(results: SearchResult[]): void {
        const frag = document.createDocumentFragment();
        for (const r of results) {
            this.found++;
            this.matches.add(r.path);
            const li = document.createElement('li');
            const b = document.createElement('button');
            b.setAttribute('role', 'option');
            b.title = r.path;
            const name = document.createElement('span');
            name.className = 'name';
            name.append(...highlight(r.name, this.query));
            const where = document.createElement('span');
            where.className = 'where';
            const kind =
                r.kind === 'directory'
                    ? 'Folder'
                    : r.size !== undefined
                      ? formatSize(r.size)
                      : 'Item';
            // The parent path tells apart items with the same name.
            where.textContent = `${kind} · in ${parentPath(r.path) ?? r.path}`;
            b.append(name, where);
            b.addEventListener('click', () => this.onGo(r.path));
            li.append(b);
            frag.append(li);
        }
        this.list.append(frag);
        this.onMatchesChanged();
    }

    private focusResult(i: number): void {
        const items = this.list.querySelectorAll('button');
        items[Math.min(Math.max(i, 0), items.length - 1)]?.focus();
    }

    private renderStatus(): void {
        const found = `${this.found.toLocaleString()} found`;
        const checked = `${this.folders.toLocaleString()} folders checked`;
        const c = this.coverage;
        if (!c) {
            this.status.textContent = `Searching… ${found} · ${checked}`;
            return;
        }
        const parts = [`${found} in ${c.folders.toLocaleString()} folders.`];
        if (c.limited)
            parts.push(
                `Stopped at the first ${this.found.toLocaleString()} matches; type more to narrow it down.`
            );
        if (c.cancelled && !c.limited)
            parts.push('The search was stopped before it finished.');
        if (c.unreadable)
            parts.push(
                `${c.unreadable.toLocaleString()} folder${c.unreadable === 1 ? '' : 's'} couldn’t be read, so results may be incomplete (e.g. ${c.unreadableSamples[0]}).`
            );
        if (c.excluded)
            parts.push(
                `${c.excluded.toLocaleString()} excluded folder${c.excluded === 1 ? ' was' : 's were'} skipped (see Settings).`
            );
        if (!c.limited && !c.cancelled && !c.unreadable && !c.excluded)
            parts.push('Every readable folder here was searched.');
        this.status.textContent = parts.join(' ');
    }
}

// Split `name` so the matching part can be marked.
function highlight(raw: string, query: string): (string | HTMLElement)[] {
    // Work on the composed form so positions line up (macOS names are decomposed).
    const name = raw.normalize('NFC');
    const q = query.normalize('NFC');
    const i = name.toLocaleLowerCase().indexOf(q.toLocaleLowerCase());
    if (i < 0) return [name];
    const mark = document.createElement('mark');
    mark.textContent = name.slice(i, i + q.length);
    return [name.slice(0, i), mark, name.slice(i + q.length)];
}
