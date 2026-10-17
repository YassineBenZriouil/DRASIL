import { execFile } from 'node:child_process';
import { win32 } from 'node:path';

// Windows marks hidden items with a file attribute that Node can't read. `dir /a:h /b` lists them;
// `/u` makes cmd write UTF-16 so non-English names survive. Elsewhere, hidden means a leading dot.
// shortcut: cmd expands %NAME% even inside quotes, so a folder path containing a matching %…% pair
// would list the wrong folder; callers only trust names that really exist in the listing. Switch to
// a native attribute read if that ever matters.
export function windowsHiddenNames(dir: string): Promise<Set<string>> {
    if (process.platform !== 'win32') return Promise.resolve(new Set());
    return new Promise((resolve) => {
        execFile(
            'cmd.exe',
            // Forward slashes would be read as dir switches.
            ['/d', '/u', '/c', 'dir', '/a:h', '/b', win32.normalize(dir)],
            {
                encoding: 'buffer',
                windowsHide: true,
                timeout: 5000,
                maxBuffer: 64 * 1024 * 1024,
            },
            // `dir` exits with an error when nothing is hidden; an empty set is the right answer then.
            (_err, stdout) => {
                const text = stdout?.length ? stdout.toString('utf16le') : '';
                resolve(new Set(text.split(/\r?\n/).filter(Boolean)));
            }
        );
    });
}
