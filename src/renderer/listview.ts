// The accessible alternative to the canvas: an ARIA tree of the same Tree model, fully usable with
// a keyboard and a screen reader. Only rows near the scroll position exist in the DOM, so it copes
// with huge folders; the focused row is always kept so focus never jumps.
import type { Tree, TreeNode } from './model';
import type { TreeView } from './view';

const ROW = 26;
const OVERSCAN = 12;
const TYPEAHEAD_MS = 600;

export interface ListHandlers {
    open(t: TreeNode): void;
    // Spoken name of a row: name plus kind and state (not sizes, which change too often).
    label(t: TreeNode): string;
    // Short visible detail next to the name.
    meta(t: TreeNode): string;
    // The list moved the selection (keyboard or click).
    selected(t: TreeNode): void;
}

export class ListView {
    private rows: TreeNode[] = [];
    private levels: number[] = [];
    private index = new Map<TreeNode, number>();
    private els = new Map<TreeNode, HTMLElement>();
    private focusIndex = 0;
    private spacer = document.createElement('div');
    private typed = '';
    private typedAt = 0;
    private raf = 0;

    constructor(
        private el: HTMLElement,
        private tree: Tree,
        private view: TreeView,
        private handlers: ListHandlers
    ) {
        el.append(this.spacer);
        this.spacer.className = 'spacer';
        el.addEventListener('scroll', () => this.schedule());
        new ResizeObserver(() => this.schedule()).observe(el);
        el.addEventListener('click', (e) => this.onClick(e));
        el.addEventListener('dblclick', (e) => {
            const t = this.rowAt(e);
            if (t) this.handlers.open(t);
        });
        el.addEventListener('keydown', (e) => this.onKey(e));
        // Tabbing into the list lands on the focused row.
        el.addEventListener('focus', () =>
            this.focusRow(this.focusIndex, false)
        );
    }

    get visible(): boolean {
        return !this.el.hidden && this.el.offsetParent !== null;
    }

    // Rebuild rows from the tree (after layout, so filters and sorting match the canvas).
    refresh(): void {
        const focused = this.rows[this.focusIndex];
        this.rows = [];
        this.levels = [];
        this.index.clear();
        const root = this.tree.root;
        if (root) {
            const walk = (t: TreeNode, level: number): void => {
                this.index.set(t, this.rows.length);
                this.rows.push(t);
                this.levels.push(level);
                for (const c of t.shown) walk(c, level + 1);
            };
            walk(root, 1);
        }
        const i = focused ? this.index.get(focused) : undefined;
        this.focusIndex = Math.min(
            i ?? this.focusIndex,
            Math.max(this.rows.length - 1, 0)
        );
        this.spacer.style.height = `${this.rows.length * ROW}px`;
        this.schedule();
    }

    // Follow a selection made elsewhere (canvas, search) without stealing focus.
    follow(t: TreeNode | null): void {
        if (!t || this.el.contains(document.activeElement)) return;
        const i = this.index.get(t);
        if (i === undefined) return;
        this.focusIndex = i;
        this.scrollTo(i);
        this.schedule();
    }

    focus(): void {
        this.focusRow(this.focusIndex, false);
    }

    get hasFocus(): boolean {
        return this.el.contains(document.activeElement);
    }

    // Where the focused row is on screen, for placing the context menu.
    focusedRect(): DOMRect | null {
        const t = this.rows[this.focusIndex];
        return (t && this.els.get(t)?.getBoundingClientRect()) ?? null;
    }

    // Re-render rows (selection or states changed) without rebuilding the list.
    redraw(): void {
        this.schedule();
    }

    private schedule(): void {
        if (!this.raf)
            this.raf = requestAnimationFrame(() => {
                this.raf = 0;
                this.render();
            });
    }

    private render(): void {
        if (!this.visible) return;
        const top = this.el.scrollTop;
        const start = Math.max(0, Math.floor(top / ROW) - OVERSCAN);
        const end = Math.min(
            this.rows.length,
            Math.ceil((top + this.el.clientHeight) / ROW) + OVERSCAN
        );
        const keep = new Set<TreeNode>();
        const want = [];
        for (let i = start; i < end; i++) want.push(i);
        if (
            this.rows[this.focusIndex] &&
            (this.focusIndex < start || this.focusIndex >= end)
        )
            want.push(this.focusIndex);
        for (const i of want) {
            const t = this.rows[i]!;
            keep.add(t);
            let row = this.els.get(t);
            if (!row) {
                row = this.createRow();
                this.els.set(t, row);
                this.el.append(row);
            }
            this.updateRow(row, t, i);
        }
        for (const [t, row] of this.els)
            if (!keep.has(t)) {
                row.remove();
                this.els.delete(t);
            }
    }

    private createRow(): HTMLElement {
        const row = document.createElement('div');
        row.setAttribute('role', 'treeitem');
        row.className = 'row';
        const twisty = document.createElement('span');
        twisty.className = 'twisty';
        twisty.setAttribute('aria-hidden', 'true');
        const name = document.createElement('span');
        name.className = 'name';
        const meta = document.createElement('span');
        meta.className = 'meta';
        meta.setAttribute('aria-hidden', 'true');
        row.append(twisty, name, meta);
        return row;
    }

    private updateRow(row: HTMLElement, t: TreeNode, i: number): void {
        const set = (name: string, value: string | null): void => {
            if (value === null) row.removeAttribute(name);
            else if (row.getAttribute(name) !== value)
                row.setAttribute(name, value);
        };
        const text = (el: Element, value: string): void => {
            if (el.textContent !== value) el.textContent = value;
        };
        const isDir = t.node.kind === 'directory';
        const siblings =
            t.parent && t !== this.tree.root ? t.parent.shown : [t];
        row.dataset.index = String(i);
        row.style.top = `${i * ROW}px`;
        row.style.paddingLeft = `${(this.levels[i]! - 1) * 16 + 4}px`;
        set('aria-level', String(this.levels[i]));
        set('aria-setsize', String(siblings.length));
        set('aria-posinset', String(siblings.indexOf(t) + 1));
        set('aria-expanded', isDir ? String(t.expanded) : null);
        set('aria-selected', String(this.view.selection.has(t)));
        set('aria-busy', t.node.state === 'loading' ? 'true' : null);
        set('aria-label', this.handlers.label(t));
        set('tabindex', i === this.focusIndex ? '0' : '-1');
        row.classList.toggle('hidden-item', t.node.hidden);
        const [twisty, name, meta] = row.children;
        text(twisty!, isDir ? (t.expanded ? '▾' : '▸') : '');
        text(name!, t.node.name);
        text(meta!, this.handlers.meta(t));
    }

    private scrollTo(i: number): void {
        const y = i * ROW;
        if (y < this.el.scrollTop) this.el.scrollTop = y;
        else if (y + ROW > this.el.scrollTop + this.el.clientHeight)
            this.el.scrollTop = y + ROW - this.el.clientHeight;
    }

    private focusRow(i: number, select = true): void {
        if (!this.rows.length) return;
        this.focusIndex = Math.min(Math.max(i, 0), this.rows.length - 1);
        this.scrollTo(this.focusIndex);
        this.render();
        const t = this.rows[this.focusIndex]!;
        this.els.get(t)?.focus({ preventScroll: true });
        if (select) this.handlers.selected(t);
    }

    private rowAt(e: Event): TreeNode | null {
        const row = (e.target as HTMLElement).closest<HTMLElement>(
            '[role="treeitem"]'
        );
        return row ? (this.rows[Number(row.dataset.index)] ?? null) : null;
    }

    private onClick(e: MouseEvent): void {
        const t = this.rowAt(e);
        if (!t) return;
        const i = this.index.get(t)!;
        if ((e.target as HTMLElement).classList.contains('twisty')) {
            this.tree.toggle(t);
            this.focusRow(i, false);
        } else if (e.ctrlKey || e.metaKey) {
            this.view.toggleSelected(t);
            this.focusRow(i, false);
        } else this.focusRow(i);
    }

    private onKey(e: KeyboardEvent): void {
        const t = this.rows[this.focusIndex];
        if (!t || e.altKey || ((e.ctrlKey || e.metaKey) && e.key !== ' '))
            return;
        const page = Math.max(1, Math.floor(this.el.clientHeight / ROW) - 1);
        const isDir = t.node.kind === 'directory';
        switch (e.key) {
            case 'ArrowDown':
                this.focusRow(this.focusIndex + 1);
                break;
            case 'ArrowUp':
                this.focusRow(this.focusIndex - 1);
                break;
            case 'PageDown':
                this.focusRow(this.focusIndex + page);
                break;
            case 'PageUp':
                this.focusRow(this.focusIndex - page);
                break;
            case 'Home':
                this.focusRow(0);
                break;
            case 'End':
                this.focusRow(this.rows.length - 1);
                break;
            case 'ArrowRight':
                if (isDir && !t.expanded) this.tree.expand(t);
                else if (t.shown.length) this.focusRow(this.focusIndex + 1);
                break;
            case 'ArrowLeft':
                if (isDir && t.expanded && t !== this.tree.root)
                    this.tree.collapse(t);
                else if (t.parent && t !== this.tree.root)
                    this.focusRow(this.index.get(t.parent) ?? 0);
                break;
            case 'Enter':
                if (isDir) this.tree.toggle(t);
                else this.handlers.open(t);
                break;
            case ' ':
                // Ctrl/Cmd+Space adds to or removes from the selection; Space selects.
                if (e.ctrlKey || e.metaKey) this.view.toggleSelected(t);
                else this.handlers.selected(t);
                this.schedule();
                break;
            default:
                if (e.key.length !== 1) return;
                this.typeahead(e.key);
        }
        e.preventDefault();
    }

    // Typing letters jumps to the next row whose name starts with them.
    private typeahead(ch: string): void {
        const now = Date.now();
        this.typed = now - this.typedAt > TYPEAHEAD_MS ? ch : this.typed + ch;
        this.typedAt = now;
        const q = this.typed.toLocaleLowerCase();
        const n = this.rows.length;
        const from =
            this.typed.length === 1 ? this.focusIndex + 1 : this.focusIndex;
        for (let k = 0; k < n; k++) {
            const i = (from + k) % n;
            if (this.rows[i]!.node.name.toLocaleLowerCase().startsWith(q)) {
                this.focusRow(i);
                return;
            }
        }
    }
}
