import { layout, RING } from './layout';
import type { Tree, TreeNode } from './model';

const COLORS = {
    edge: 'rgba(127, 209, 168, 0.28)',
    folder: '#7fd1a8',
    dim: '#56665f',
    warn: '#e6b86a',
    bad: '#e87f7f',
    label: '#d8e2dc',
    select: '#ffffff',
    hover: 'rgba(255, 255, 255, 0.45)',
};

const FILE_COLORS: Record<string, string> = {
    image: '#c792ea',
    video: '#f78c6c',
    audio: '#ffcb6b',
    document: '#82aaff',
    archive: '#d4a373',
    code: '#89ddff',
    app: '#ff5370',
    other: '#9aa7a1',
};

const EXT_CATEGORY: Record<string, string> = {};
for (const [cat, exts] of Object.entries({
    image: 'png jpg jpeg gif webp svg bmp tif tiff heic avif ico raw',
    video: 'mp4 mkv mov avi webm wmv m4v',
    audio: 'mp3 wav flac aac ogg m4a opus wma',
    document: 'pdf doc docx txt md rtf odt xls xlsx ppt pptx csv epub',
    archive: 'zip rar 7z tar gz bz2 xz zst iso dmg',
    code: 'js ts tsx jsx py c cpp h hpp cs rs go java kt rb php json yml yaml toml html css sh ps1 bat',
    app: 'exe msi app apk deb rpm appimage dll so dylib',
}))
    for (const ext of exts.split(' ')) EXT_CATEGORY[ext] = cat;

function fileColor(name: string): string {
    const dot = name.lastIndexOf('.');
    const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
    return FILE_COLORS[EXT_CATEGORY[ext] ?? 'other']!;
}

const FOLDER_R = 7;
const FILE_R = 4;
const MIN_SCALE = 0.05;
const MAX_SCALE = 8;

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

    constructor(
        private canvas: HTMLCanvasElement,
        private tree: Tree,
        private onSelect: (t: TreeNode | null) => void
    ) {
        this.ctx = canvas.getContext('2d')!;
        new ResizeObserver(() => this.resize()).observe(canvas);
        this.bindInput();
    }

    // Call after the tree changes: recompute targets and animate towards them.
    relayout(): void {
        if (this.tree.root) layout(this.tree.root);
        this.invalidate();
    }

    select(t: TreeNode | null): void {
        this.selected = t;
        this.onSelect(t);
        this.invalidate();
    }

    // Fit everything visible on screen.
    fit(): void {
        let minX = 0;
        let maxX = 0;
        let minY = 0;
        let maxY = 0;
        for (const t of this.tree.visible()) {
            minX = Math.min(minX, t.tx);
            maxX = Math.max(maxX, t.tx);
            minY = Math.min(minY, t.ty);
            maxY = Math.max(maxY, t.ty);
        }
        const pad = 120;
        const s = Math.min(
            (this.width - pad) / Math.max(maxX - minX, 1),
            (this.height - pad) / Math.max(maxY - minY, 1)
        );
        this.scale = Math.min(Math.max(s, MIN_SCALE), 1.5);
        this.ox = this.width / 2 - ((minX + maxX) / 2) * this.scale;
        this.oy = this.height / 2 - ((minY + maxY) / 2) * this.scale;
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

    private frame = (time: number): void => {
        this.raf = 0;
        let busy = false;
        const snap = this.reducedMotion.matches;
        for (const t of this.tree.visible()) {
            const dx = t.tx - t.x;
            const dy = t.ty - t.y;
            if (snap || Math.abs(dx) + Math.abs(dy) < 0.5) {
                t.x = t.tx;
                t.y = t.ty;
            } else {
                t.x += dx * 0.18;
                t.y += dy * 0.18;
                busy = true;
            }
            if (t.node.state === 'loading') busy = true;
        }
        this.draw(time);
        if (busy) this.invalidate();
    };

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

        const nodes = [...this.tree.visible()];
        const px = 1 / scale;

        // Branches: curves that leave the parent outward, then bend towards the child.
        ctx.strokeStyle = COLORS.edge;
        ctx.lineWidth = 1.2 * px;
        for (const t of nodes) {
            const p = t.parent;
            if (!p) continue;
            const mid = p.radius + RING / 2;
            ctx.setLineDash(t.node.link ? [4 * px, 4 * px] : []);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.bezierCurveTo(
                p.radius === 0 ? p.x : Math.cos(p.angle) * mid,
                p.radius === 0 ? p.y : Math.sin(p.angle) * mid,
                Math.cos(t.angle) * mid,
                Math.sin(t.angle) * mid,
                t.x,
                t.y
            );
            ctx.stroke();
        }
        ctx.setLineDash([]);

        for (const t of nodes) this.drawNode(t, px, time);

        // Labels in screen space so text stays crisp and readable at any zoom.
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.font = '12px system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        for (const t of nodes) {
            const show =
                scale >= 0.7 ||
                t.depth <= 1 ||
                t === this.selected ||
                t === this.hover;
            if (!show) continue;
            const [sx, sy] = this.toScreen(t);
            if (sx < -200 || sy < -20 || sx > this.width + 200) continue;
            if (sy > this.height + 20) continue;
            const left = t.parent !== null && Math.cos(t.angle) < 0;
            const offset =
                Math.max(
                    (t.node.kind === 'directory' ? FOLDER_R : FILE_R) * scale,
                    3
                ) + 6;
            const name =
                t.node.name.length > 32
                    ? t.node.name.slice(0, 31) + '…'
                    : t.node.name;
            ctx.textAlign = left ? 'right' : 'left';
            ctx.globalAlpha = t.node.hidden ? 0.55 : 1;
            ctx.fillStyle = COLORS.label;
            ctx.fillText(name, sx + (left ? -offset : offset), sy);
        }
        ctx.globalAlpha = 1;
    }

    private drawNode(t: TreeNode, px: number, time: number): void {
        const { ctx } = this;
        const { node } = t;
        const isDir = node.kind === 'directory';
        // Never smaller than ~3px on screen, so nothing disappears when zoomed out.
        const r = Math.max(isDir ? FOLDER_R : FILE_R, 3 * px);
        ctx.globalAlpha = node.hidden ? 0.55 : 1;
        ctx.lineWidth = 1.5 * px;

        if (!isDir) {
            this.drawLeaf(t, r, px);
        } else {
            this.drawFolder(t, r, px, time);
        }

        if (t === this.selected || t === this.hover) {
            ctx.globalAlpha = 1;
            ctx.strokeStyle =
                t === this.selected ? COLORS.select : COLORS.hover;
            ctx.lineWidth = 2 * px;
            ctx.beginPath();
            ctx.arc(t.x, t.y, r + 4 * px, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    // Files are leaves pointing away from the center. Unreadable files are outlined in amber.
    private drawLeaf(t: TreeNode, r: number, px: number): void {
        const { ctx } = this;
        const failed = t.node.state !== 'scanned';
        ctx.beginPath();
        ctx.ellipse(t.x, t.y, r * 1.6, r * 0.8, t.angle, 0, Math.PI * 2);
        if (failed) {
            ctx.strokeStyle = COLORS.warn;
            ctx.setLineDash([2 * px, 2 * px]);
            ctx.stroke();
            ctx.setLineDash([]);
        } else {
            ctx.fillStyle = fileColor(t.node.name);
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
            ctx.arc(x, y, r, 0, Math.PI * 2);
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
                const a = (time / 300) % (Math.PI * 2);
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
                    ctx.arc(x, y, r + 2.5 * px, 0, Math.PI * 2);
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

    private hitTest(sx: number, sy: number): TreeNode | null {
        let best: TreeNode | null = null;
        let bestDist = Infinity;
        for (const t of this.tree.visible()) {
            const [x, y] = this.toScreen(t);
            const r =
                (t.node.kind === 'directory' ? FOLDER_R : FILE_R) * this.scale;
            const d = Math.hypot(x - sx, y - sy);
            if (d < Math.max(r + 4, 9) && d < bestDist) {
                best = t;
                bestDist = d;
            }
        }
        return best;
    }

    private zoomAt(sx: number, sy: number, factor: number): void {
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

        c.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            c.setPointerCapture(e.pointerId);
            drag = {
                x: e.clientX,
                y: e.clientY,
                ox: this.ox,
                oy: this.oy,
                moved: false,
            };
        });
        c.addEventListener('pointermove', (e) => {
            const rect = c.getBoundingClientRect();
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
            const hit = this.hitTest(
                e.clientX - rect.left,
                e.clientY - rect.top
            );
            if (hit !== this.hover) {
                this.hover = hit;
                c.style.cursor = hit ? 'pointer' : 'grab';
                this.invalidate();
            }
        });
        c.addEventListener('pointerup', (e) => {
            const wasDrag = drag?.moved;
            drag = null;
            c.style.cursor = this.hover ? 'pointer' : 'grab';
            if (wasDrag) return;
            const rect = c.getBoundingClientRect();
            const hit = this.hitTest(
                e.clientX - rect.left,
                e.clientY - rect.top
            );
            this.select(hit);
            if (hit) this.tree.toggle(hit);
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
                const rect = c.getBoundingClientRect();
                // Trackpad pinch arrives as ctrl+wheel with small deltas; both zoom.
                const speed = e.ctrlKey ? 0.01 : 0.0015;
                this.zoomAt(
                    e.clientX - rect.left,
                    e.clientY - rect.top,
                    Math.exp(-e.deltaY * speed)
                );
            },
            { passive: false }
        );
        c.addEventListener('keydown', (e) => {
            const t = this.selected;
            if ((e.key === 'Enter' || e.key === ' ') && t) {
                e.preventDefault();
                this.tree.toggle(t);
            } else if (e.key === 'Home') {
                this.fit();
            } else if (e.key === '+' || e.key === '=') {
                this.zoomAt(this.width / 2, this.height / 2, 1.25);
            } else if (e.key === '-') {
                this.zoomAt(this.width / 2, this.height / 2, 0.8);
            }
        });
    }
}
