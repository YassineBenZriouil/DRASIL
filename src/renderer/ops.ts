// File operations as the user sees them: prompts, progress, conflict questions, results.
// The main process does the work; afterwards the affected folders are always re-read from disk.
import type {
    ConflictChoice,
    ItemInfo,
    MenuEntry,
    OpEvent,
    OpSummary,
    TransferMode,
} from '../shared/fs-types';
import { nameProblem } from '../shared/names';
import { baseName, parentPath } from '../shared/paths';
import { showDialog } from './dialog';
import type { Tree, TreeNode } from './model';
import type { TreeView } from './view';

const api = window.drasil;
const isMac = api.platform === 'darwin';
const FILE_MANAGER =
    api.platform === 'win32' ? 'Explorer' : isMac ? 'Finder' : 'file manager';
const TRASH = api.platform === 'win32' ? 'Recycle Bin' : 'Trash';

export function formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let n = bytes;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) {
        n /= 1024;
        i++;
    }
    return `${i === 0 ? n : n.toFixed(1)} ${units[i]}`;
}

const plural = (n: number, word: string): string =>
    `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

// Names compare case-insensitively where the OS usually does.
const sameName = (a: string, b: string): boolean =>
    api.platform === 'linux' ? a === b : a.toLowerCase() === b.toLowerCase();

interface Running {
    mode: TransferMode;
    text: HTMLElement;
    resolve: (s: OpSummary) => void;
}

export class Ops {
    private clipboard: { mode: 'copy' | 'cut'; paths: string[] } | null = null;
    private nextId = 1;
    private running = new Map<number, Running>();
    private opsEl = document.getElementById('ops')!;
    private noticesEl = document.getElementById('notices')!;

    constructor(
        private tree: Tree,
        private view: TreeView,
        private nav: {
            // Select and show a path once it appears in the tree.
            reveal(path: string): void;
            // Make a folder the root.
            focus(t: TreeNode): void;
        }
    ) {
        api.onOpEvent((e) => void this.handle(e));
    }

    get hasClipboard(): boolean {
        return this.clipboard !== null;
    }

    // ---- Actions

    async newFolder(parent: TreeNode): Promise<void> {
        const taken = parent.children.map((c) => c.node.name);
        let name = 'New folder';
        for (let i = 2; taken.some((n) => sameName(n, name)); i++)
            name = `New folder (${i})`;
        const result = await showDialog({
            title: `New folder in “${parent.node.name}”`,
            input: { value: name, validate: (v) => this.nameError(v, taken) },
            buttons: [
                { label: 'Create', value: 'ok', kind: 'primary' },
                { label: 'Cancel', value: 'cancel' },
            ],
        });
        if (!result) return;
        const res = await api.mkdir(parent.node.path, result.input);
        if (res.error)
            return this.notify(
                `Couldn’t create the folder: ${res.error}`,
                [],
                true
            );
        this.afterChange([parent.node.path]);
        this.tree.expand(parent);
        if (res.path) this.nav.reveal(res.path);
    }

    async rename(t: TreeNode): Promise<void> {
        if (t === this.tree.root) return;
        const name = t.node.name;
        const dot = name.lastIndexOf('.');
        const siblings = (t.parent?.children ?? [])
            .filter((c) => c !== t)
            .map((c) => c.node.name);
        const result = await showDialog({
            title: `Rename “${name}”`,
            input: {
                value: name,
                // Preselect the name without its extension.
                select: t.node.kind === 'file' && dot > 0 ? dot : name.length,
                validate: (v) => this.nameError(v, siblings),
            },
            buttons: [
                { label: 'Rename', value: 'ok', kind: 'primary' },
                { label: 'Cancel', value: 'cancel' },
            ],
        });
        if (!result || result.input === name) return;
        this.tree.busy.add(t.node.path);
        const res = await api.rename(t.node.path, result.input);
        this.tree.busy.delete(t.node.path);
        if (res.error) {
            this.notify(`Couldn’t rename “${name}”: ${res.error}`, [], true);
        } else if (res.path) {
            // Update loaded paths in place so the refresh keeps this branch open.
            renamePaths(t, t.node.path, res.path);
            t.node.name = baseName(res.path);
        }
        const parent = parentPath(res.path ?? t.node.path);
        this.afterChange(parent ? [parent] : []);
        if (res.path) this.nav.reveal(res.path);
    }

    async trash(items: TreeNode[]): Promise<void> {
        const paths = this.deletable(items);
        if (!paths.length) return;
        for (const p of paths) this.tree.busy.add(p);
        const summary = await api.trash(paths);
        for (const p of paths) this.tree.busy.delete(p);
        this.report(
            summary,
            `Moved to the ${TRASH}`,
            `be moved to the ${TRASH}`
        );
        this.afterChange(paths.map(parentPath).filter((p): p is string => !!p));
    }

    async deletePermanently(items: TreeNode[]): Promise<void> {
        const paths = this.deletable(items);
        if (!paths.length) return;
        const what =
            paths.length === 1
                ? `“${baseName(paths[0]!)}”`
                : plural(paths.length, 'item');
        const result = await showDialog({
            title: `Permanently delete ${what}?`,
            body: [
                `This can’t be undone. ${paths.length === 1 ? 'It' : 'They'} will not go to the ${TRASH}.`,
                'Deleting does not securely erase the data from the disk.',
            ],
            buttons: [
                { label: 'Cancel', value: 'cancel', kind: 'primary' },
                { label: 'Delete permanently', value: 'ok', kind: 'danger' },
            ],
        });
        if (result?.value !== 'ok') return;
        for (const p of paths) this.tree.busy.add(p);
        this.setActivity(`Deleting ${what}…`);
        const summary = await api.deletePermanently(paths);
        this.setActivity('');
        for (const p of paths) this.tree.busy.delete(p);
        this.report(summary, 'Permanently deleted', 'be deleted');
        this.afterChange(paths.map(parentPath).filter((p): p is string => !!p));
    }

    cut(items: TreeNode[]): void {
        const paths = this.deletable(items);
        if (paths.length) this.clipboard = { mode: 'cut', paths };
        this.notify(
            `${plural(paths.length, 'item')} ready to move. Paste into a folder.`
        );
    }

    copy(items: TreeNode[]): void {
        const paths = items.map((t) => t.node.path);
        if (paths.length) this.clipboard = { mode: 'copy', paths };
        this.notify(
            `${plural(paths.length, 'item')} ready to copy. Paste into a folder.`
        );
    }

    async paste(dest: TreeNode): Promise<void> {
        const clip = this.clipboard;
        if (!clip) return;
        const summary = await this.transfer(
            clip.mode === 'cut' ? 'move' : 'copy',
            clip.paths,
            dest.node.path
        );
        // Moved items aren't where the clipboard says any more.
        if (clip.mode === 'cut' && !summary.cancelled) this.clipboard = null;
    }

    drop(sources: TreeNode[], target: TreeNode, copy: boolean): void {
        void this.transfer(
            copy ? 'copy' : 'move',
            sources.map((t) => t.node.path),
            target.node.path
        );
    }

    copyPath(items: TreeNode[]): void {
        api.copyText(items.map((t) => t.node.path).join('\n'));
        this.notify(
            items.length === 1
                ? 'Path copied.'
                : `${items.length} paths copied.`
        );
    }

    refresh(t: TreeNode): void {
        this.afterChange([t.node.path]);
    }

    // ---- Context menu

    async menu(x: number, y: number): Promise<void> {
        const root = this.tree.root;
        if (!root) return;
        const items = [...this.view.selection];
        const single = items.length === 1 ? items[0]! : null;
        const target = single ?? (items.length === 0 ? root : null);
        const folder =
            target &&
            (target.node.kind === 'directory' ? target : target.parent);
        const movable = items.length > 0 && !items.includes(root);
        const entries: MenuEntry[] = [];
        const add = (
            id: string,
            label: string,
            enabled = true,
            accelerator?: string
        ): void => {
            entries.push({ id, label, enabled, accelerator });
        };
        const sep = (): void => {
            if (
                entries.length &&
                !('separator' in entries[entries.length - 1]!)
            )
                entries.push({ separator: true });
        };

        if (single && single.node.kind !== 'directory') add('open', 'Open');
        if (single && single.node.kind === 'directory' && single !== root)
            add('focus', 'Show as root');
        if (target) add('reveal', `Show in ${FILE_MANAGER}`);
        sep();
        if (movable) add('cut', 'Cut', true, 'CmdOrCtrl+X');
        if (items.length) add('copy', 'Copy', true, 'CmdOrCtrl+C');
        if (folder)
            add(
                'paste',
                `Paste into “${folder.node.name}”`,
                this.hasClipboard,
                'CmdOrCtrl+V'
            );
        if (single && movable) add('rename', 'Rename…', true, 'F2');
        sep();
        if (movable) {
            add(
                'trash',
                `Move to ${TRASH}`,
                true,
                isMac ? 'Cmd+Backspace' : 'Delete'
            );
            add(
                'delete',
                'Delete permanently…',
                true,
                isMac ? 'Cmd+Alt+Backspace' : 'Shift+Delete'
            );
        }
        sep();
        if (folder) add('mkdir', 'New folder…', true, 'CmdOrCtrl+Shift+N');
        if (items.length)
            add('path', items.length === 1 ? 'Copy path' : 'Copy paths');
        if (folder) add('refresh', 'Refresh', true, 'F5');
        if ('separator' in (entries[entries.length - 1] ?? {})) entries.pop();

        const choice = await api.popupMenu(entries, x, y);
        const run: Record<string, () => void> = {
            open: () => single && void api.open(single.node.path),
            focus: () => single && this.nav.focus(single),
            reveal: () => target && void api.reveal(target.node.path),
            cut: () => this.cut(items),
            copy: () => this.copy(items),
            paste: () => folder && void this.paste(folder),
            rename: () => single && void this.rename(single),
            trash: () => void this.trash(items),
            delete: () => void this.deletePermanently(items),
            mkdir: () => folder && void this.newFolder(folder),
            path: () => this.copyPath(items),
            refresh: () => folder && this.refresh(folder),
        };
        if (choice) run[choice]?.();
    }

    // ---- Internals

    private nameError(name: string, siblings: string[]): string | null {
        return (
            nameProblem(name, api.platform) ??
            (siblings.some((n) => sameName(n, name))
                ? 'An item with this name already exists here.'
                : null)
        );
    }

    // The root (and drive roots) can't be moved, renamed or deleted.
    private deletable(items: TreeNode[]): string[] {
        return items
            .filter((t) => t !== this.tree.root && parentPath(t.node.path))
            .map((t) => t.node.path);
    }

    private transfer(
        mode: TransferMode,
        sources: string[],
        dest: string
    ): Promise<OpSummary> {
        const id = this.nextId++;
        const verb = mode === 'move' ? 'Moving' : 'Copying';
        const row = document.createElement('span');
        const text = document.createElement('span');
        text.textContent = `${verb} ${plural(sources.length, 'item')}…`;
        const cancel = document.createElement('button');
        cancel.textContent = 'Cancel';
        cancel.addEventListener('click', () => api.cancelOp(id));
        row.append(text, ' ', cancel);
        this.opsEl.append(row);
        for (const p of sources) this.tree.busy.add(p);
        this.tree.busy.add(dest);
        this.view.relayout();

        return new Promise<OpSummary>((resolve) => {
            this.running.set(id, { mode, text, resolve });
            api.transfer(id, mode, sources, dest).catch((err: unknown) => {
                this.handle({
                    id,
                    type: 'done',
                    summary: {
                        completed: 0,
                        skipped: 0,
                        failed: [{ path: dest, error: String(err) }],
                        cancelled: false,
                        notes: [],
                    },
                });
            });
        }).then((summary) => {
            row.remove();
            for (const p of sources) this.tree.busy.delete(p);
            this.tree.busy.delete(dest);
            const done = mode === 'move' ? 'Moved' : 'Copied';
            this.report(
                summary,
                done,
                `be ${mode === 'move' ? 'moved' : 'copied'}`
            );
            const parents =
                mode === 'move'
                    ? sources.map(parentPath).filter((p): p is string => !!p)
                    : [];
            this.afterChange([dest, ...parents]);
            return summary;
        });
    }

    private async handle(e: OpEvent): Promise<void> {
        const op = this.running.get(e.id);
        if (!op) return;
        if (e.type === 'progress') {
            const verb = op.mode === 'move' ? 'Moving' : 'Copying';
            const count = e.total
                ? `${e.done.toLocaleString()} of ${plural(e.total, 'item')}`
                : plural(e.done, 'item');
            const bytes = e.bytesTotal
                ? ` · ${formatSize(e.bytesDone)} of ${formatSize(e.bytesTotal)}`
                : '';
            op.text.textContent = `${verb} ${count}${bytes}`;
            op.text.title = e.current;
        } else if (e.type === 'conflict') {
            const choice = await askConflict(
                e.source,
                e.target,
                e.incoming,
                e.existing,
                e.same
            );
            api.resolveConflict(
                e.id,
                choice.value as ConflictChoice,
                choice.all
            );
        } else {
            this.running.delete(e.id);
            op.resolve(e.summary);
        }
    }

    // Re-read what changed from disk, and recalculate sizes, since totals are now stale.
    private afterChange(paths: string[]): void {
        this.tree.refresh(paths);
        this.tree.restartSizes();
        this.view.relayout();
    }

    private report(s: OpSummary, done: string, failVerb: string): void {
        const parts: string[] = [];
        if (s.cancelled) parts.push('Cancelled.');
        if (s.completed) parts.push(`${done} ${plural(s.completed, 'item')}.`);
        if (s.skipped) parts.push(`${plural(s.skipped, 'item')} skipped.`);
        if (s.failed.length)
            parts.push(
                `${plural(s.failed.length, 'item')} couldn’t ${failVerb}:`
            );
        if (!parts.length) parts.push('Nothing was changed.');
        const details = s.failed
            .slice(0, 5)
            .map((f) => `${f.path} — ${f.error}`);
        if (s.failed.length > 5)
            details.push(`…and ${s.failed.length - 5} more`);
        details.push(...s.notes);
        this.notify(
            parts.join(' '),
            details,
            s.failed.length > 0 || s.cancelled
        );
    }

    private activityEl: HTMLElement | null = null;
    private setActivity(text: string): void {
        if (!text) {
            this.activityEl?.remove();
            this.activityEl = null;
            return;
        }
        this.activityEl ??= this.opsEl.appendChild(
            document.createElement('span')
        );
        this.activityEl.textContent = text;
    }

    // Problems stay until dismissed; plain confirmations fade after a few seconds.
    notify(text: string, details: string[] = [], important = false): void {
        const box = document.createElement('div');
        box.className = important ? 'notice important' : 'notice';
        const p = document.createElement('p');
        p.textContent = text;
        box.append(p);
        if (details.length) {
            const ul = document.createElement('ul');
            for (const d of details) {
                const li = document.createElement('li');
                li.textContent = d;
                ul.append(li);
            }
            box.append(ul);
        }
        const close = document.createElement('button');
        close.textContent = 'Dismiss';
        close.addEventListener('click', () => box.remove());
        box.append(close);
        this.noticesEl.append(box);
        if (!important) setTimeout(() => box.remove(), 6000);
    }
}

function describeItem(i: ItemInfo): string {
    const parts = [
        i.kind === 'directory' ? 'folder' : i.kind === 'file' ? 'file' : 'item',
    ];
    if (i.size !== undefined) parts.push(formatSize(i.size));
    if (i.modified !== undefined)
        parts.push(`modified ${new Date(i.modified).toLocaleString()}`);
    return parts.join(', ');
}

async function askConflict(
    source: string,
    target: string,
    incoming: ItemInfo,
    existing: ItemInfo,
    same: boolean
): Promise<{ value: string; all: boolean }> {
    const folder = baseName(parentPath(target) ?? target);
    const bothDirs =
        incoming.kind === 'directory' && existing.kind === 'directory';
    const buttons = [
        { label: 'Keep both', value: 'keepBoth', kind: 'primary' as const },
        ...(bothDirs ? [{ label: 'Merge folders', value: 'merge' }] : []),
        ...(same
            ? []
            : [
                  {
                      label: `Replace (old one goes to the ${TRASH})`,
                      value: 'replace',
                  },
              ]),
        { label: 'Skip', value: 'skip' },
        { label: 'Cancel everything', value: 'cancel' },
    ];
    const result = await showDialog({
        title: `“${baseName(target)}” already exists in “${folder}”`,
        body: same
            ? [`You’re copying it into the folder it’s already in.`]
            : [
                  `Already there: ${describeItem(existing)}`,
                  `Incoming from ${source}: ${describeItem(incoming)}`,
              ],
        checkbox: 'Do the same for all remaining conflicts',
        buttons,
        cancelValue: 'cancel',
    });
    return { value: result?.value ?? 'cancel', all: result?.checked ?? false };
}

// After a rename, every loaded path under the item changes prefix.
function renamePaths(t: TreeNode, from: string, to: string): void {
    t.node.path = to + t.node.path.slice(from.length);
    for (const c of [...t.children, ...t.pending]) renamePaths(c, from, to);
}
