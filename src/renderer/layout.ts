import type { TreeNode } from './model';

export const RING = 150;

// Radial layout: each node gets a wedge of its parent's wedge, sized by how many visible leaves it holds.
// Depth sets the distance from the center.
export function layout(root: TreeNode): void {
    const weights = new Map<TreeNode, number>();
    const weigh = (t: TreeNode): number => {
        let sum = 0;
        if (t.expanded) for (const c of t.children) sum += weigh(c);
        const w = Math.max(1, sum);
        weights.set(t, w);
        return w;
    };
    weigh(root);

    const place = (t: TreeNode, a0: number, a1: number): void => {
        t.angle = (a0 + a1) / 2;
        t.radius = t.depth * RING;
        t.tx = Math.cos(t.angle) * t.radius;
        t.ty = Math.sin(t.angle) * t.radius;
        if (!t.expanded) return;
        const total = weights.get(t)!;
        let a = a0;
        for (const c of t.children) {
            const span = ((a1 - a0) * weights.get(c)!) / total;
            place(c, a, a + span);
            a += span;
        }
    };
    // Start at 12 o'clock and go clockwise.
    place(root, -Math.PI / 2, (3 * Math.PI) / 2);
}
