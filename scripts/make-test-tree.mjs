// Creates a large tree of empty files for checking performance.
// Usage: npm run make-test-tree -- <folder> [files=1000000] [perFolder=100]
// perFolder equal to files makes one flat folder holding everything.
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const [target, filesArg = '1000000', perArg = '100'] = process.argv.slice(2);
if (!target) {
    console.error(
        'Usage: npm run make-test-tree -- <folder> [files] [perFolder]'
    );
    process.exit(1);
}
const root = resolve(target);
const files = Number(filesArg);
const per = Number(perArg);
if (!(files > 0) || !(per > 0)) {
    console.error('files and perFolder must be positive numbers');
    process.exit(1);
}

// Refuse to write into a folder that already has something in it.
const existing = await readdir(root).catch(() => []);
if (existing.length) {
    console.error(`${root} is not empty. Choose a new or empty folder.`);
    process.exit(1);
}

const leafDirs = Math.ceil(files / per);
let made = 0;
for (let d = 0; d < leafDirs; d++) {
    const dir = join(root, `group-${Math.floor(d / per)}`, `folder-${d % per}`);
    await mkdir(dir, { recursive: true });
    const count = Math.min(per, files - made);
    const names = Array.from({ length: count }, (_, i) => `file-${i}.txt`);
    for (let i = 0; i < names.length; i += 256)
        await Promise.all(
            names.slice(i, i + 256).map((n) => writeFile(join(dir, n), ''))
        );
    made += count;
    if (d % 100 === 0) process.stdout.write(`\r${made.toLocaleString()} files`);
}
console.log(`\rDone: ${made.toLocaleString()} files in ${root}`);
