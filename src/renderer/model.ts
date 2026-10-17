import type { FsNode, ListEvent, SizeInfo } from '../shared/fs-types';
import { baseName, isInside } from '../shared/paths';

export interface TreeNode {
    node: FsNode;
    parent: TreeNode | null;
    // Sorted children that are part of the layout.
    children: TreeNode[];
    // Received but not yet merged in. Merging happens once per layout pass, not per batch,
    // so a folder with a million entries isn't re-sorted thousands of times.
    pending: TreeNode[];
    depth: number;
    expanded: boolean;
    // Children received so far (or the final count once done).
    count: number;
    // Layout (see layout.ts): wedge [a0, a1], polar position, ring radius for children,
    // farthest descendant radius, current drawn position (x, y) and animation target (tx, ty).
    a0: number;
    a1: number;
    angle: number;
    radius: number;
    childRadius: number;
    maxRadius: number;
    x: number;
    y: number;
    tx: number;
    ty: number;
}

const api = window.drasil;
const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: 'base',
});

function byKindThenName(a: TreeNode, b: TreeNode): number {
    const dirA = a.node.kind === 'directory' ? 0 : 1;
    const dirB = b.node.kind === 'directory' ? 0 : 1;
    return dirA - dirB || collator.compare(a.node.name, b.node.name);
}

function merge(a: TreeNode[], b: TreeNode[]): TreeNode[] {
    const out = new Array<TreeNode>(a.length + b.length);
    let i = 0;
    let j = 0;
    let k = 0;
    while (i < a.length && j < b.length)
        out[k++] = byKindThenName(a[i]!, b[j]!) <= 0 ? a[i++]! : b[j++]!;
    while (i < a.length) out[k++] = a[i++]!;
    while (j < b.length) out[k++] = b[j++]!;
    return out;
}

function makeNode(node: FsNode, parent: TreeNode | null): TreeNode {
    const x = parent?.x ?? 0;
    const y = parent?.y ?? 0;
    const angle = parent?.angle ?? 0;
    const radius = parent?.radius ?? 0;
    return {
        node,
        parent,
        children: [],
        pending: [],
        depth: parent ? parent.depth + 1 : 0,
        expanded: false,
        count: 0,
        a0: angle,
        a1: angle,
        angle,
        radius,
        childRadius: radius,
        maxRadius: radius,
        x,
        y,
        tx: x,
        ty: y,
    };
}

function descendants(t: TreeNode): number {
    let n = t.pending.length;
    for (const c of t.children) n += 1 + descendants(c);
    return n;
}

export function isKnown(t: TreeNode): boolean {
    return t.node.state === 'scanned' || t.node.state === 'empty';
}

export type ChangeKind = 'tree' | 'sizes';

function contains(ancestor: TreeNode, t: TreeNode): boolean {
    for (let n: TreeNode | null = t; n; n = n.parent)
        if (n === ancestor) return true;
    return false;
}

// The renderer's view of the filesystem: what has been listed, which folders are open,
// and the folder sizes calculated so far.
export class Tree {
    root: TreeNode | null = null;
    // Nodes received under the current root.
    loaded = 0;
    sizes = new Map<string, SizeInfo>();
    sizeProgress = { scanned: 0, done: false };
    // Called when reveal() reaches its target (or the deepest folder it could get to).
    onReveal: (t: TreeNode, found: boolean) => void = () => {};
    private nextId = 1;
    private listings = new Map<number, TreeNode>();
    private withPending = new Set<TreeNode>();
    // A previous root to reuse when it shows up in a listing (after going up a level).
    private adopt: TreeNode | null = null;
    private revealing: string | null = null;

    constructor(private onChange: (kind: ChangeKind) => void) {
        api.onListEvent((event) => this.handle(event));
        api.onSizeEvent((event) => {
            if (event.type === 'sizes')
                for (const s of event.sizes) this.sizes.set(s.path, s);
            else this.sizeProgress = event;
            this.onChange('sizes');
        });
    }

    get activeListings(): number {
        return this.listings.size;
    }

    // Start a fresh tree at `path`. If `adopt` is a folder directly inside it,
    // that existing branch (with what's open in it) is reused instead of re-listed.
    setRoot(path: string, adopt: TreeNode | null = null): TreeNode {
        const root = makeNode(
            {
                path,
                name: baseName(path),
                kind: 'directory',
                state: 'unscanned',
                hidden: false,
            },
            null
        );
        this.useRoot(root);
        this.adopt = adopt;
        this.expand(root);
        return root;
    }

    // Make an existing node the root, keeping everything already listed and opened under it.
    useRoot(t: TreeNode): void {
        this.root = t;
        this.revealing = null;
        this.adopt = null;
        // Listings outside the new root aren't needed. They stay tracked so their final
        // 'partial' state still lands on the node, which may come back through history.
        for (const [id, n] of this.listings)
            if (!contains(t, n)) api.cancel(id);
        this.sizes.clear();
        this.sizeProgress = { scanned: 0, done: false };
        this.loaded = 1 + descendants(t);
        void api.startSizes(t.node.path);
        const dirs: string[] = [];
        for (const d of this.visibleFrom(t, true))
            if (d.node.kind === 'directory') dirs.push(d.node.path);
        this.watch(dirs);
        this.onChange('tree');
    }

    // Open folders one level at a time down to `path`, listing them as needed.
    reveal(path: string): void {
        this.revealing = path;
        this.continueReveal();
    }

    toggle(t: TreeNode): void {
        if (t.expanded) this.collapse(t);
        else this.expand(t);
    }

    expand(t: TreeNode): void {
        if (t.node.kind !== 'directory' || t.expanded) return;
        t.expanded = true;
        // Re-opened branches grow out of their parent instead of jumping in.
        for (const d of this.visibleFrom(t)) {
            d.x = t.x;
            d.y = t.y;
        }
        // Anything not fully known is listed again: unscanned, partial, failed, or a drive that came back.
        if (!isKnown(t) && t.node.state !== 'loading') this.list(t);
        this.onChange('tree');
    }

    collapse(t: TreeNode): void {
        if (!t.expanded) return;
        t.expanded = false;
        this.onChange('tree');
    }

    // Merge received children into their sorted lists. Called right before each layout pass.
    flush(): void {
        const dirs: string[] = [];
        for (const t of this.withPending) {
            t.pending.sort(byKindThenName);
            for (const c of t.pending)
                if (c.node.kind === 'directory') dirs.push(c.node.path);
            t.children = merge(t.children, t.pending);
            t.pending = [];
        }
        this.withPending.clear();
        this.watch(dirs);
    }

    *visible(): Generator<TreeNode> {
        if (this.root) yield* this.visibleFrom(this.root);
    }

    private *visibleFrom(t: TreeNode, all = false): Generator<TreeNode> {
        yield t;
        if (t.expanded || all)
            for (const c of t.children) yield* this.visibleFrom(c, all);
    }

    private watch(dirs: string[]): void {
        for (let i = 0; i < dirs.length; i += 5000)
            api.watchSizes(dirs.slice(i, i + 5000));
    }

    private continueReveal(): void {
        const target = this.revealing;
        if (!target || !this.root) return;
        let t = this.root;
        if (isInside(target, t.node.path)) {
            for (;;) {
                if (t.node.path === target || t.node.kind !== 'directory')
                    break;
                this.expand(t);
                const next =
                    t.children.find((c) => isInside(target, c.node.path)) ??
                    t.pending.find((c) => isInside(target, c.node.path));
                if (next) {
                    t = next;
                    continue;
                }
                // Still listing: wait for more entries.
                if (t.node.state === 'loading') return;
                break;
            }
        }
        this.revealing = null;
        this.onReveal(t, t.node.path === target);
    }

    private list(t: TreeNode): void {
        const id = this.nextId++;
        if (this.root && contains(this.root, t)) this.loaded -= descendants(t);
        t.children = [];
        t.pending = [];
        t.count = 0;
        t.node.state = 'loading';
        t.node.error = undefined;
        this.listings.set(id, t);
        api.list(t.node.path, id).catch((err: unknown) => {
            this.listings.delete(id);
            t.node.state = 'error';
            t.node.error = String(err);
            this.onChange('tree');
        });
    }

    private handle(event: ListEvent): void {
        const t = this.listings.get(event.id);
        if (!t) return;
        const counted = this.root !== null && contains(this.root, t);
        if (event.type === 'batch') {
            for (const n of event.nodes) {
                const old = this.adopt;
                if (old && n.path === old.node.path) {
                    old.parent = t;
                    t.pending.push(old);
                    this.adopt = null;
                    if (counted) this.loaded += descendants(old);
                } else t.pending.push(makeNode(n, t));
            }
            this.withPending.add(t);
            t.count += event.nodes.length;
            if (counted) this.loaded += event.nodes.length;
        } else {
            this.listings.delete(event.id);
            t.node.state = event.state;
            t.node.error = event.error;
            t.count = event.count;
        }
        this.onChange('tree');
        this.continueReveal();
    }
}
