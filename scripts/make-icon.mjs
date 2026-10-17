// Draws the app icon (a small radial world tree) and writes build/icon.png, 1024×1024.
// electron-builder turns it into .ico / .icns / Linux icons. Run: node scripts/make-icon.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const N = 1024;
const C = N / 2;
const img = new Float32Array(N * N * 4); // premultiplied RGBA, 0..1

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

// Paint `color` with coverage `a` (0..1) over the pixel.
function blend(i, color, a) {
    if (a <= 0) return;
    const o = i * 4;
    for (let k = 0; k < 3; k++)
        img[o + k] = img[o + k] * (1 - a) + color[k] * a;
    img[o + 3] = img[o + 3] * (1 - a) + a;
}

const smooth = (d) => Math.min(Math.max(0.5 - d, 0), 1); // 1px anti-aliased edge

function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(
        0,
        Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))
    );
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

const accent = hex('#7fd1a8');
const leafColors = [
    '#c792ea',
    '#f78c6c',
    '#ffcb6b',
    '#82aaff',
    '#89ddff',
    '#d4a373',
    '#ff6b85',
].map(hex);

// The tree: 7 main branches, each splitting into two leaves.
const lines = [];
const dots = [];
for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 7;
    const x1 = C + Math.cos(a) * 230;
    const y1 = C + Math.sin(a) * 230;
    lines.push([C, C, x1, y1, 13]);
    dots.push([x1, y1, 34, accent]);
    for (const s of [-0.24, 0.24]) {
        const x2 = C + Math.cos(a + s) * 375;
        const y2 = C + Math.sin(a + s) * 375;
        lines.push([x1, y1, x2, y2, 7]);
        dots.push([x2, y2, 22, leafColors[i]]);
    }
}
dots.push([C, C, 70, accent]);

const bgCenter = hex('#14261f');
const bgEdge = hex('#07090d');
const R = 470; // rounded-square half size
const corner = 200;

for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const px = x + 0.5;
        const py = y + 0.5;
        // Rounded square background with a soft light in the middle.
        const qx = Math.max(Math.abs(px - C) - (R - corner), 0);
        const qy = Math.max(Math.abs(py - C) - (R - corner), 0);
        const bgd = Math.hypot(qx, qy) - corner;
        const t = Math.min(Math.hypot(px - C, py - C) / R, 1);
        blend(
            i,
            bgCenter.map((c, k) => c * (1 - t) + bgEdge[k] * t),
            smooth(bgd)
        );
        if (bgd > 1) continue;
        // Glow around the root.
        const g = Math.exp(-((Math.hypot(px - C, py - C) / 150) ** 2)) * 0.35;
        blend(i, accent, g);
        for (const [ax, ay, bx, by, w] of lines)
            blend(
                i,
                accent,
                smooth(segDist(px, py, ax, ay, bx, by) - w / 2) * 0.55
            );
        for (const [cx, cy, r, color] of dots)
            blend(i, color, smooth(Math.hypot(px - cx, py - cy) - r));
    }
}

// PNG encoding (RGBA, 8-bit, no interlace).
const raw = Buffer.alloc(N * (N * 4 + 1));
for (let y = 0; y < N; y++) {
    raw[y * (N * 4 + 1)] = 0;
    for (let x = 0; x < N; x++) {
        const o = (y * N + x) * 4;
        const a = img[o + 3];
        const d = y * (N * 4 + 1) + 1 + x * 4;
        for (let k = 0; k < 3; k++)
            raw[d + k] = Math.round((a ? img[o + k] / a : 0) * 255);
        raw[d + 3] = Math.round(a * 255);
    }
}
const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0);
ihdr.writeUInt32BE(N, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
]);
mkdirSync('build', { recursive: true });
writeFileSync('build/icon.png', png);
console.log(`build/icon.png written (${png.length} bytes)`);
