// Local error log for troubleshooting (e.g. during the beta). Stays on this computer; never sent.
import { app } from 'electron';
import { appendFile, mkdir, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';

const MAX_BYTES = 1024 * 1024;

export const logFile = (): string =>
    join(app.getPath('userData'), 'logs', 'drasil.log');

let queue: Promise<void> = Promise.resolve();

export function log(message: string, detail?: unknown): void {
    const extra =
        detail instanceof Error
            ? `\n${detail.stack ?? detail.message}`
            : detail !== undefined
              ? ` ${String(detail)}`
              : '';
    const line = `${new Date().toISOString()} ${message}${extra}\n`;
    console.error(line.trimEnd());
    queue = queue.then(async () => {
        try {
            const file = logFile();
            await mkdir(join(file, '..'), { recursive: true });
            // Keep one previous log so it never grows without bound.
            const size = await stat(file).then(
                (s) => s.size,
                () => 0
            );
            if (size > MAX_BYTES) await rename(file, file + '.old');
            await appendFile(file, line);
        } catch {
            // Logging must never take the app down.
        }
    });
}
