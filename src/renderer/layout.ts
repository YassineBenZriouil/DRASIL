import type { TreeNode } from './model';

// Minimum distance from a folder to its children's ring.
export const RING = 150;
// Space each child gets along its ring, in world units. Crowded folders push their ring outward
// until every child gets this much room, up to MAX_GAP; past that they rely on zoom.
const SPACING = 12;
const MAX_GAP = 100_000;

// Radial layout: each node gets a slice of its parent's wedge. Bigger subtrees get more room,
// with a square root so that one huge folder can't squeeze its siblings into slivers.
// `pick` chooses which children are shown, in what order (filters and sorting); the result is
// stored in `shown`. Returns how many loaded children were left out by `pick`.
export function layout(
    root: TreeNode,
    pick: (t: TreeNode) => TreeNode[]
): number {
    let filteredOut = 0;
    const weights = new Map<TreeNode, number>();
    const weigh = (t: TreeNode): number => {
        t.shown = t.expanded ? pick(t) : [];
        if (t.expanded) filteredOut += t.children.length - t.shown.length;
        let sum = 0;
        for (const c of t.shown) sum += weigh(c);
        const w = sum > 0 ? 1 + Math.sqrt(sum) : 1;
        weights.set(t, w);
        return w;
    };
    weigh(root);

    const place = (
        t: TreeNode,
        a0: number,
        a1: number,
        radius: number
    ): number => {
        t.a0 = a0;
        t.a1 = a1;
        t.angle = (a0 + a1) / 2;
        t.radius = radius;
        t.tx = Math.cos(t.angle) * radius;
        t.ty = Math.sin(t.angle) * radius;
        t.maxRadius = radius;
        const n = t.shown.length;
        if (n === 0) {
            t.childRadius = radius + RING;
            return radius;
        }
        const span = a1 - a0;
        const needed = (n * SPACING) / span;
        t.childRadius = Math.max(
            radius + RING,
            Math.min(needed, radius + MAX_GAP)
        );
        let total = 0;
        for (const c of t.shown) total += weights.get(c)!;
        let a = a0;
        for (const c of t.shown) {
            const s = (span * weights.get(c)!) / total;
            t.maxRadius = Math.max(
                t.maxRadius,
                place(c, a, a + s, t.childRadius)
            );
            a += s;
        }
        return t.maxRadius;
    };
    // Start at 12 o'clock and go clockwise.
    place(root, -Math.PI / 2, (3 * Math.PI) / 2, 0);
    return filteredOut;
}
