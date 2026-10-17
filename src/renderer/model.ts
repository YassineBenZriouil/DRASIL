import type { FsNode, ListEvent } from '../shared/fs-types';

export interface TreeNode {
    node: FsNode;
    parent: TreeNode | null;
    children: TreeNode[];
    depth: number;
    expanded: boolean;
    // Children received so far (or the final count once done).
    count: number;
    // Layout: polar position, current drawn position (x, y) and animation target (tx, ty).
    angle: number;
    radius: number;
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

function makeNode(node: FsNode, parent: TreeNode | null): TreeNode {
    const x = parent?.x ?? 0;
    const y = parent?.y ?? 0;
    return {
        node,
        parent,
        children: [],
        depth: parent ? parent.depth + 1 : 0,
        expanded: false,
        count: 0,
        angle: parent?.angle ?? 0,
        radius: parent?.radius ?? 0,
        x,
        y,
        tx: x,
        ty: y,
    };
}

export function isKnown(t: TreeNode): boolean {
    return t.node.state === 'scanned' || t.node.state === 'empty';
}

// The renderer's view of the filesystem: what has been listed, and which folders are open.
export class Tree {
    root: TreeNode | null = null;
    private nextId = 1;
    private listings = new Map<number, TreeNode>();

    constructor(private onChange: () => void) {
        api.onListEvent((event) => this.handle(event));
    }

    setRoot(path: string, name: string): TreeNode {
        for (const id of this.listings.keys()) api.cancel(id);
        this.listings.clear();
        this.root = makeNode(
            {
                path,
                name,
                kind: 'directory',
                state: 'unscanned',
                hidden: false,
            },
            null
        );
        this.expand(this.root);
        return this.root;
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
        this.onChange();
    }

    collapse(t: TreeNode): void {
        if (!t.expanded) return;
        t.expanded = false;
        this.onChange();
    }

    cancel(t: TreeNode): void {
        for (const [id, n] of this.listings) if (n === t) api.cancel(id);
    }

    *visible(): Generator<TreeNode> {
        if (this.root) yield* this.visibleFrom(this.root);
    }

    private *visibleFrom(t: TreeNode): Generator<TreeNode> {
        yield t;
        if (t.expanded) for (const c of t.children) yield* this.visibleFrom(c);
    }

    private list(t: TreeNode): void {
        const id = this.nextId++;
        t.children = [];
        t.count = 0;
        t.node.state = 'loading';
        t.node.error = undefined;
        this.listings.set(id, t);
        api.list(t.node.path, id).catch((err: unknown) => {
            this.listings.delete(id);
            t.node.state = 'error';
            t.node.error = String(err);
            this.onChange();
        });
    }

    private handle(event: ListEvent): void {
        const t = this.listings.get(event.id);
        if (!t) return;
        if (event.type === 'batch') {
            for (const n of event.nodes) t.children.push(makeNode(n, t));
            t.children.sort(byKindThenName);
            t.count += event.nodes.length;
        } else {
            this.listings.delete(event.id);
            t.node.state = event.state;
            t.node.error = event.error;
            t.count = event.count;
        }
        this.onChange();
    }
}
