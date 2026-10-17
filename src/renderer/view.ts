import { CATEGORY_COLOR, fileCategory } from './filetypes';
import { layout } from './layout';
import type { Tree, TreeNode } from './model';

const COLORS = {
    edge: 'rgba(127, 209, 168, 0.28)',
    cluster: 'rgba(127, 209, 168, 0.35)',
    folder: '#7fd1a8',
    dim: '#56665f',
    warn: '#e6b86a',
    bad: '#e87f7f',
    label: '#d8e2dc',
    muted: '#7d8a84',
    select: '#ffffff',
    hover: 'rgba(255, 255, 255, 0.45)',
};

const TAU = Math.PI * 2;
const mod = (a: number, m: number): number => ((a % m) + m) % m;

// Node sizes in world units, clamped on screen so nodes stay visible far away and modest up close.
const FOLDER_R = 7;
const FILE_R = 4;
const MIN_PX = 1.5;
const MAX_FOLDER_PX = 9;
const MAX_FILE_PX = 6;
// Level of detail, in screen pixels between neighbouring siblings:
// below CLUSTER_PX a folder's children are drawn as one band; below LABEL_PX names are hidden.
const CLUSTER_PX = 3;
const LABEL_PX = 14;
const FONT_PX = 12;
const MIN_SCALE = 0.002;
const MAX_SCALE = 40;
// Re-layout at most this often while folders stream in (and never more than half the time).
const MIN_LAYOUT_MS = 100;

interface Viewport {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    minDist: number;
    maxDist: number;
    full: boolean;
    lo: number;
    width: number;
}

export class TreeView {
    selected: TreeNode | null = null;
    private hover: TreeNode | null = null;
    private scale = 1;
    private ox = 0;
    private oy = 0;
    private width = 0;
    private height = 0;
    private raf = 0;
    private ctx: CanvasRenderingContext2D;
    private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    // What the last frame drew, reused for hit-testing.
    private drawn: TreeNode[] = [];
    private edges: TreeNode[] = [];
    private clusters: TreeNode[] = [];
    private layoutDirty = false;
    private lastLayout = -Infinity;
    private layoutCost = 0;
    private stats = false;
    private lastFrame = 0;
    private fps = 0;
    private frameCost = 0;
    private cam: { scale: number; ox: number; oy: number } | null = null;

    constructor(
        private canvas: HTMLCanvasElement,
        private tree: Tree,
        private onSelect: (t: TreeNode | null) => void,
        // Double-click or Enter on an item: files open in their app, folders become the root.
        private onOpen: (t: TreeNode) => void
    ) {
        this.ctx = canvas.getContext('2d')!;
        new ResizeObserver(() => this.resize()).observe(canvas);
        this.bindInput();
    }

    // Call after the tree changes. Layout runs on the next frame, throttled while folders stream in.
    relayout(): void {
        this.layoutDirty = true;
        this.invalidate();
    }

    select(t: TreeNode | null): void {
        this.selected = t;
        this.onSelect(t);
        this.invalidate();
    }

    // Fit the whole tree on screen.
    fit(): void {
        this.runLayout(performance.now());
        const r = (this.tree.root?.maxRadius ?? 0) + 80;
        const s = Math.min(this.width, this.height) / (2 * r);
        this.animateTo(clampScale(Math.min(s, 1.5)), 0, 0);
    }

    // Glide to `t`, zooming in if needed so it and its siblings get readable labels.
    centerOn(t: TreeNode): void {
        this.runLayout(performance.now());
        const arc = (t.a1 - t.a0) * t.radius;
        const need = t === this.tree.root ? 0 : (LABEL_PX * 1.5) / arc;
        this.animateTo(clampScale(Math.max(this.scale, need)), t.tx, t.ty);
    }

    // Move the camera so world point (wx, wy) ends up in the middle of the screen at `scale`.
    private animateTo(scale: number, wx: number, wy: number): void {
        const ox = this.width / 2 - wx * scale;
        const oy = this.height / 2 - wy * scale;
        if (this.reducedMotion.matches) {
            this.scale = scale;
            this.ox = ox;
            this.oy = oy;
            this.cam = null;
        } else this.cam = { scale, ox, oy };
        this.invalidate();
    }

    // One step of the camera glide: zoom geometrically and move the world point at the
    // screen center, so the motion feels even at any zoom level. Returns true while moving.
    private stepCamera(): boolean {
        const cam = this.cam;
        if (!cam) return false;
        const hw = this.width / 2;
        const hh = this.height / 2;
        const cx = (hw - this.ox) / this.scale;
        const cy = (hh - this.oy) / this.scale;
        const tx = (hw - cam.ox) / cam.scale;
        const ty = (hh - cam.oy) / cam.scale;
        const ratio = cam.scale / this.scale;
        if (
            Math.abs(Math.log(ratio)) < 0.01 &&
            Math.hypot(tx - cx, ty - cy) * this.scale < 0.5
        ) {
            this.scale = cam.scale;
            this.ox = cam.ox;
            this.oy = cam.oy;
            this.cam = null;
            return false;
        }
        this.scale *= Math.pow(ratio, 0.2);
        const nx = cx + (tx - cx) * 0.2;
        const ny = cy + (ty - cy) * 0.2;
        this.ox = hw - nx * this.scale;
        this.oy = hh - ny * this.scale;
        return true;
    }

    toggleStats(): void {
        this.stats = !this.stats;
        this.invalidate();
    }

    private invalidate(): void {
        if (!this.raf) this.raf = requestAnimationFrame(this.frame);
    }

    private resize(): void {
        const first = this.width === 0;
        this.width = this.canvas.clientWidth;
        this.height = this.canvas.clientHeight;
        const dpr = devicePixelRatio;
        this.canvas.width = Math.round(this.width * dpr);
        this.canvas.height = Math.round(this.height * dpr);
        if (first) {
            this.ox = this.width / 2;
            this.oy = this.height / 2;
        }
        this.invalidate();
    }

    private runLayout(now: number): void {
        if (!this.layoutDirty || !this.tree.root) return;
        this.tree.flush();
        layout(this.tree.root);
        this.layoutDirty = false;
        this.lastLayout = now;
        this.layoutCost = performance.now() - now;
    }

    private frame = (time: number): void => {
        this.raf = 0;
        const start = performance.now();
        let busy = this.stepCamera() || this.stats;

        if (this.layoutDirty) {
            const wait = Math.max(MIN_LAYOUT_MS, 2 * this.layoutCost);
            if (start - this.lastLayout >= wait) this.runLayout(start);
            else busy = true;
        }

        this.collect();

        // Animate only what's on screen; off-screen nodes catch up when they come into view.
        const snap = this.reducedMotion.matches;
        for (const t of this.drawn) {
            const dx = t.tx - t.x;
            const dy = t.ty - t.y;
            if (snap || Math.abs(dx) + Math.abs(dy) < 0.5 / this.scale) {
                t.x = t.tx;
                t.y = t.ty;
            } else {
                t.x += dx * 0.18;
                t.y += dy * 0.18;
                busy = true;
            }
            if (t.node.state === 'loading') busy = true;
        }
        for (const t of this.clusters)
            if (t.node.state === 'loading') busy = true;

        this.draw(time);

        this.frameCost = performance.now() - start;
        if (this.lastFrame) {
            const instant = 1000 / Math.max(time - this.lastFrame, 1);
            this.fps = this.fps * 0.9 + instant * 0.1;
        }
        this.lastFrame = busy ? time : 0;
        if (this.stats) this.drawStats();
        if (busy) this.invalidate();
    };

    private viewport(): Viewport {
        const m = 40 / this.scale;
        const x0 = -this.ox / this.scale - m;
        const y0 = -this.oy / this.scale - m;
        const x1 = (this.width - this.ox) / this.scale + m;
        const y1 = (this.height - this.oy) / this.scale + m;
        const dx = Math.max(x0, 0, -x1);
        const dy = Math.max(y0, 0, -y1);
        const corners: [number, number][] = [
            [x0, y0],
            [x1, y0],
            [x0, y1],
            [x1, y1],
        ];
        const maxDist = Math.max(...corners.map(([x, y]) => Math.hypot(x, y)));
        const full = x0 <= 0 && x1 >= 0 && y0 <= 0 && y1 >= 0;
        let lo = 0;
        let width = TAU;
        if (!full) {
            // Angular range of the screen as seen from the tree's center.
            const c = Math.atan2((y0 + y1) / 2, (x0 + x1) / 2);
            const ds = corners.map(
                ([x, y]) => mod(Math.atan2(y, x) - c + Math.PI, TAU) - Math.PI
            );
            lo = c + Math.min(...ds);
            width = Math.max(...ds) - Math.min(...ds);
        }
        return {
            x0,
            y0,
            x1,
            y1,
            minDist: Math.hypot(dx, dy),
            maxDist,
            full,
            lo,
            width,
        };
    }

    // Walk only the parts of the tree that can be on screen. Children are found by binary search
    // on their wedges, so a folder with a million entries costs only what is visible.
    private collect(): void {
        this.drawn = [];
        this.edges = [];
        this.clusters = [];
        const root = this.tree.root;
        if (!root) return;
        const v = this.viewport();
        const overlaps = (a0: number, a1: number): boolean => {
            if (v.full) return true;
            const d = mod(a0 - v.lo, TAU);
            return d <= v.width || d + (a1 - a0) >= TAU;
        };

        const visit = (t: TreeNode): void => {
            if (t.tx >= v.x0 && t.tx <= v.x1 && t.ty >= v.y0 && t.ty <= v.y1)
                this.drawn.push(t);
            const n = t.children.length;
            if (!t.expanded || n === 0) return;
            if (t.maxRadius < v.minDist || t.radius > v.maxDist) return;

            const span = t.a1 - t.a0;
            if (((span * t.childRadius) / n) * this.scale < CLUSTER_PX) {
                if (overlaps(t.a0, t.a1) && t.childRadius <= v.maxDist + 50)
                    this.clusters.push(t);
                return;
            }

            for (const [s, e] of this.ranges(t, v)) {
                for (let i = lowerBound(t.children, t.a0 + s); i < n; i++) {
                    const c = t.children[i]!;
                    if (c.a0 - t.a0 > e) break;
                    if (c.radius >= v.minDist) this.edges.push(c);
                    if (c.radius <= v.maxDist) visit(c);
                }
            }
        };
        visit(root);
    }

    // The parts of t's wedge (as offsets from t.a0) that overlap the screen.
    private ranges(t: TreeNode, v: Viewport): [number, number][] {
        const span = t.a1 - t.a0;
        if (v.full) return [[0, span]];
        const d = mod(v.lo - t.a0, TAU);
        const out: [number, number][] = [];
        for (const s of [d, d - TAU]) {
            const a = Math.max(s, 0);
            const b = Math.min(s + v.width, span);
            if (a <= b) out.push([a, b]);
        }
        return out;
    }

    private nodePx(t: TreeNode): number {
        const isDir = t.node.kind === 'directory';
        const max = isDir ? MAX_FOLDER_PX : MAX_FILE_PX;
        let px = Math.min(
            Math.max((isDir ? FOLDER_R : FILE_R) * this.scale, MIN_PX),
            max
        );
        // Don't let siblings overlap each other.
        if (t !== this.tree.root)
            px = Math.max(Math.min(px, this.siblingPx(t) * 0.45), MIN_PX);
        return px;
    }

    private siblingPx(t: TreeNode): number {
        return t !== this.tree.root
            ? (t.a1 - t.a0) * t.radius * this.scale
            : Infinity;
    }

    private toScreen(t: TreeNode): [number, number] {
        return [t.x * this.scale + this.ox, t.y * this.scale + this.oy];
    }

    private draw(time: number): void {
        const { ctx, scale } = this;
        const dpr = devicePixelRatio;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (!this.tree.root) return;
        ctx.setTransform(
            dpr * scale,
            0,
            0,
            dpr * scale,
            dpr * this.ox,
            dpr * this.oy
        );
        const px = 1 / scale;

        // Branches: curves that leave the parent outward, then bend towards the child.
        ctx.strokeStyle = COLORS.edge;
        ctx.lineWidth = 1.2 * px;
        for (const dashed of [false, true]) {
            ctx.setLineDash(dashed ? [4 * px, 4 * px] : []);
            ctx.beginPath();
            for (const t of this.edges) {
                if (Boolean(t.node.link) !== dashed) continue;
                const p = t.parent!;
                const mid = (p.radius + p.childRadius) / 2;
                ctx.moveTo(p.x, p.y);
                ctx.bezierCurveTo(
                    p.radius === 0 ? p.x : Math.cos(p.angle) * mid,
                    p.radius === 0 ? p.y : Math.sin(p.angle) * mid,
                    Math.cos(t.angle) * mid,
                    Math.sin(t.angle) * mid,
                    t.x,
                    t.y
                );
            }
            ctx.stroke();
        }
        ctx.setLineDash([]);

        // Crowded folders: one band along their children's ring, until you zoom in.
        for (const t of this.clusters) {
            const mid = (t.radius + t.childRadius) / 2;
            ctx.strokeStyle = COLORS.edge;
            ctx.lineWidth = 1.2 * px;
            ctx.beginPath();
            ctx.moveTo(t.x, t.y);
            ctx.quadraticCurveTo(
                Math.cos(t.angle) * mid,
                Math.sin(t.angle) * mid,
                Math.cos(t.angle) * t.childRadius,
                Math.sin(t.angle) * t.childRadius
            );
            ctx.stroke();
            ctx.strokeStyle = COLORS.cluster;
            ctx.lineWidth = 8 * px;
            ctx.lineCap = 'round';
            ctx.beginPath();
            const pad = Math.min((t.a1 - t.a0) * 0.05, 0.02);
            ctx.arc(0, 0, t.childRadius, t.a0 + pad, t.a1 - pad);
            ctx.stroke();
            ctx.lineCap = 'butt';
        }

        for (const t of this.drawn) this.drawNode(t, px, time);

        // Labels in screen space at a fixed size. They are hidden, never shrunk, when there's no room.
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.font = `${FONT_PX}px system-ui, sans-serif`;
        ctx.textBaseline = 'middle';
        for (const t of this.drawn) this.drawLabel(t);
        for (const t of this.clusters) this.drawClusterLabel(t);
        ctx.globalAlpha = 1;
    }

    private drawLabel(t: TreeNode): void {
        const { ctx } = this;
        const focus = t === this.selected || t === this.hover;
        const isRoot = t === this.tree.root;
        if (!focus && !isRoot && this.siblingPx(t) < LABEL_PX) return;
        const r = this.nodePx(t);
        // Room before the children's ring; leaves can run outward freely.
        const room =
            t.expanded && t.children.length
                ? (t.childRadius - t.radius) * this.scale - r - 16
                : 260;
        const maxChars = Math.floor(room / (FONT_PX * 0.55));
        if (maxChars < 4 && !focus) return;
        const name = t.node.name;
        const text =
            name.length > Math.max(maxChars, 4) && !focus
                ? name.slice(0, maxChars - 1) + '…'
                : name;
        const [sx, sy] = this.toScreen(t);
        ctx.globalAlpha = t.node.hidden ? 0.55 : 1;
        ctx.fillStyle = COLORS.label;
        ctx.save();
        ctx.translate(sx, sy);
        if (isRoot) {
            // The root shows its full path, so it's always clear where the tree starts.
            ctx.textAlign = 'center';
            ctx.fillText(t.node.path, 0, r + 12);
        } else {
            // Read along the branch, flipped on the left so text is never upside down.
            const left = Math.cos(t.angle) < 0;
            ctx.rotate(left ? t.angle + Math.PI : t.angle);
            ctx.textAlign = left ? 'right' : 'left';
            ctx.fillText(text, left ? -(r + 6) : r + 6, 0);
        }
        ctx.restore();
    }

    private drawClusterLabel(t: TreeNode): void {
        const arcPx = (t.a1 - t.a0) * t.childRadius * this.scale;
        if (arcPx < 60) return;
        const { ctx } = this;
        const sx = Math.cos(t.angle) * t.childRadius * this.scale + this.ox;
        const sy = Math.sin(t.angle) * t.childRadius * this.scale + this.oy;
        const more = t.node.state === 'loading' ? '+' : '';
        ctx.globalAlpha = 1;
        ctx.fillStyle = COLORS.muted;
        ctx.textAlign = 'center';
        ctx.fillText(
            `${t.count.toLocaleString()}${more} items · zoom in`,
            sx,
            sy - 14
        );
    }

    private drawNode(t: TreeNode, px: number, time: number): void {
        const { ctx } = this;
        const r = this.nodePx(t) * px;
        ctx.globalAlpha = t.node.hidden ? 0.55 : 1;
        ctx.lineWidth = 1.5 * px;
        if (t.node.kind === 'directory') this.drawFolder(t, r, px, time);
        else this.drawLeaf(t, r, px);

        if (t === this.selected || t === this.hover) {
            ctx.globalAlpha = 1;
            ctx.strokeStyle =
                t === this.selected ? COLORS.select : COLORS.hover;
            ctx.lineWidth = 2 * px;
            ctx.beginPath();
            ctx.arc(t.x, t.y, r + 4 * px, 0, TAU);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    // Files are leaves pointing away from the center. Unreadable files are outlined in amber.
    private drawLeaf(t: TreeNode, r: number, px: number): void {
        const { ctx } = this;
        ctx.beginPath();
        ctx.ellipse(t.x, t.y, r * 1.6, r * 0.8, t.angle, 0, TAU);
        if (t.node.state !== 'scanned') {
            ctx.strokeStyle = COLORS.warn;
            ctx.setLineDash([2 * px, 2 * px]);
            ctx.stroke();
            ctx.setLineDash([]);
        } else {
            ctx.fillStyle = CATEGORY_COLOR[fileCategory(t.node.name)];
            ctx.fill();
        }
    }

    // Folder shapes, so state never depends on color alone:
    //   dashed ring = not scanned, spinning arc = loading, filled = opened,
    //   filled + outer ring = closed with contents, plain ring = empty,
    //   half filled = partially scanned, ring with X = no access / unavailable, triangle = error.
    private drawFolder(t: TreeNode, r: number, px: number, time: number): void {
        const { ctx } = this;
        const { x, y } = t;
        const circle = (): void => {
            ctx.beginPath();
            ctx.arc(x, y, r, 0, TAU);
        };
        const cross = (color: string): void => {
            const d = r * 0.55;
            ctx.strokeStyle = color;
            ctx.beginPath();
            ctx.moveTo(x - d, y - d);
            ctx.lineTo(x + d, y + d);
            ctx.moveTo(x + d, y - d);
            ctx.lineTo(x - d, y + d);
            ctx.stroke();
        };

        switch (t.node.state) {
            case 'unscanned':
                ctx.strokeStyle = COLORS.folder;
                ctx.setLineDash([2.5 * px, 2.5 * px]);
                circle();
                ctx.stroke();
                ctx.setLineDash([]);
                break;
            case 'loading': {
                ctx.strokeStyle = COLORS.dim;
                circle();
                ctx.stroke();
                const a = (time / 300) % TAU;
                ctx.strokeStyle = COLORS.folder;
                ctx.lineWidth = 2.5 * px;
                ctx.beginPath();
                ctx.arc(x, y, r, a, a + Math.PI * 0.6);
                ctx.stroke();
                break;
            }
            case 'scanned':
                ctx.fillStyle = COLORS.folder;
                circle();
                ctx.fill();
                if (!t.expanded) {
                    ctx.strokeStyle = COLORS.folder;
                    ctx.beginPath();
                    ctx.arc(x, y, r + 2.5 * px, 0, TAU);
                    ctx.stroke();
                }
                break;
            case 'empty':
                ctx.strokeStyle = COLORS.dim;
                circle();
                ctx.stroke();
                break;
            case 'partial':
                ctx.strokeStyle = COLORS.warn;
                circle();
                ctx.stroke();
                ctx.fillStyle = COLORS.warn;
                ctx.beginPath();
                ctx.arc(x, y, r, Math.PI / 2, (3 * Math.PI) / 2);
                ctx.fill();
                break;
            case 'inaccessible':
                ctx.strokeStyle = COLORS.warn;
                circle();
                ctx.stroke();
                cross(COLORS.warn);
                break;
            case 'unavailable':
                ctx.strokeStyle = COLORS.warn;
                ctx.setLineDash([2.5 * px, 2.5 * px]);
                circle();
                ctx.stroke();
                ctx.setLineDash([]);
                cross(COLORS.warn);
                break;
            case 'error':
                ctx.strokeStyle = COLORS.bad;
                ctx.beginPath();
                ctx.moveTo(x, y - r);
                ctx.lineTo(x + r, y + r * 0.8);
                ctx.lineTo(x - r, y + r * 0.8);
                ctx.closePath();
                ctx.stroke();
                break;
        }
    }

    private drawStats(): void {
        const { ctx } = this;
        const mem = (performance as { memory?: { usedJSHeapSize: number } })
            .memory;
        const heap = mem
            ? ` · heap ${Math.round(mem.usedJSHeapSize / 1048576)} MB`
            : '';
        const lines = [
            `${Math.round(this.fps)} fps · frame ${this.frameCost.toFixed(1)} ms · layout ${this.layoutCost.toFixed(1)} ms`,
            `drawn ${this.drawn.length.toLocaleString()} · groups ${this.clusters.length} · loaded ${this.tree.loaded.toLocaleString()}${heap}`,
        ];
        ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
        ctx.font = '12px ui-monospace, monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(8, 8, 470, 40);
        ctx.fillStyle = COLORS.label;
        lines.forEach((l, i) => ctx.fillText(l, 14, 12 + i * 16));
    }

    private hitTest(sx: number, sy: number): TreeNode | null {
        let best: TreeNode | null = null;
        let bestDist = Infinity;
        for (const t of this.drawn) {
            const [x, y] = this.toScreen(t);
            const d = Math.hypot(x - sx, y - sy);
            if (d < Math.max(this.nodePx(t) + 4, 8) && d < bestDist) {
                best = t;
                bestDist = d;
            }
        }
        return best;
    }

    private hitCluster(sx: number, sy: number): TreeNode | null {
        const wx = (sx - this.ox) / this.scale;
        const wy = (sy - this.oy) / this.scale;
        const r = Math.hypot(wx, wy);
        const a = Math.atan2(wy, wx);
        for (const t of this.clusters) {
            if (Math.abs(r - t.childRadius) * this.scale > 10) continue;
            if (mod(a - t.a0, TAU) <= t.a1 - t.a0) return t;
        }
        return null;
    }

    private zoomAt(sx: number, sy: number, factor: number): void {
        this.cam = null;
        const next = Math.min(
            Math.max(this.scale * factor, MIN_SCALE),
            MAX_SCALE
        );
        const k = next / this.scale;
        this.ox = sx - (sx - this.ox) * k;
        this.oy = sy - (sy - this.oy) * k;
        this.scale = next;
        this.invalidate();
    }

    private bindInput(): void {
        const c = this.canvas;
        let drag: {
            x: number;
            y: number;
            ox: number;
            oy: number;
            moved: boolean;
        } | null = null;
        const local = (e: MouseEvent): [number, number] => {
            const rect = c.getBoundingClientRect();
            return [e.clientX - rect.left, e.clientY - rect.top];
        };

        c.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            c.setPointerCapture(e.pointerId);
            this.cam = null;
            drag = {
                x: e.clientX,
                y: e.clientY,
                ox: this.ox,
                oy: this.oy,
                moved: false,
            };
        });
        c.addEventListener('pointermove', (e) => {
            if (drag) {
                const dx = e.clientX - drag.x;
                const dy = e.clientY - drag.y;
                if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
                if (drag.moved) {
                    this.ox = drag.ox + dx;
                    this.oy = drag.oy + dy;
                    c.style.cursor = 'grabbing';
                    this.invalidate();
                }
                return;
            }
            const [sx, sy] = local(e);
            const hit = this.hitTest(sx, sy);
            if (hit !== this.hover) {
                this.hover = hit;
                this.invalidate();
            }
            c.style.cursor =
                hit || this.hitCluster(sx, sy) ? 'pointer' : 'grab';
        });
        c.addEventListener('pointerup', (e) => {
            const wasDrag = drag?.moved;
            drag = null;
            c.style.cursor = this.hover ? 'pointer' : 'grab';
            if (wasDrag) return;
            const [sx, sy] = local(e);
            const hit = this.hitTest(sx, sy);
            if (hit) {
                this.select(hit);
                this.tree.toggle(hit);
                return;
            }
            const cluster = this.hitCluster(sx, sy);
            if (cluster) {
                // Zoom in far enough for the group to open into individual items.
                const n = cluster.children.length;
                const spacing =
                    (((cluster.a1 - cluster.a0) * cluster.childRadius) / n) *
                    this.scale;
                this.select(cluster);
                this.zoomAt(sx, sy, Math.max((CLUSTER_PX * 2) / spacing, 1.5));
                return;
            }
            this.select(null);
        });
        c.addEventListener('dblclick', (e) => {
            const [sx, sy] = local(e);
            const hit = this.hitTest(sx, sy);
            if (hit) this.onOpen(hit);
        });
        c.addEventListener('pointerleave', () => {
            if (this.hover) {
                this.hover = null;
                this.invalidate();
            }
        });
        c.addEventListener(
            'wheel',
            (e) => {
                e.preventDefault();
                const [sx, sy] = local(e);
                // Trackpad pinch arrives as ctrl+wheel with small deltas; both zoom.
                const speed = e.ctrlKey ? 0.01 : 0.0015;
                this.zoomAt(sx, sy, Math.exp(-e.deltaY * speed));
            },
            { passive: false }
        );
        c.addEventListener('keydown', (e) => {
            const t = this.selected;
            if (e.key === 'Enter' && t && t.node.kind !== 'directory') {
                e.preventDefault();
                this.onOpen(t);
            } else if ((e.key === 'Enter' || e.key === ' ') && t) {
                e.preventDefault();
                this.tree.toggle(t);
            } else if (e.key === 'Home') {
                this.fit();
            } else if (e.key === '+' || e.key === '=') {
                this.zoomAt(this.width / 2, this.height / 2, 1.25);
            } else if (e.key === '-') {
                this.zoomAt(this.width / 2, this.height / 2, 0.8);
            } else if (e.key === 'F2') {
                this.toggleStats();
            }
        });
    }
}

function clampScale(s: number): number {
    return Math.min(Math.max(s, MIN_SCALE), MAX_SCALE);
}

// First child whose wedge ends at or after angle `a`.
function lowerBound(children: TreeNode[], a: number): number {
    let lo = 0;
    let hi = children.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (children[mid]!.a1 < a) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}
