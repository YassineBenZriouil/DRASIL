// About, help links and bug reports. Links open in the user's browser only when they click them;
// only these fixed addresses can be opened, never anything the page asks for.
import { app, shell } from 'electron';
import { release } from 'node:os';
import { dirname } from 'node:path';
import pkg from '../../package.json';
import { logFile } from './log';
import { canSelfUpdate } from './updates';

export type LinkKind =
    'guide' | 'privacy' | 'download' | 'issues' | 'license' | 'bug';
export const LINK_KINDS: LinkKind[] = [
    'guide',
    'privacy',
    'download',
    'issues',
    'license',
    'bug',
];

const repo = pkg.homepage;

function bugUrl(): string {
    // Version and system only. No paths or file names: the user adds what they choose to share.
    const body = [
        '**What happened?**',
        '',
        '**What did you expect?**',
        '',
        '**Steps to reproduce**',
        '1. ',
        '',
        '---',
        `Drasil ${app.getVersion()} · ${process.platform} ${release()} (${process.arch}) · Electron ${process.versions.electron}`,
    ].join('\n');
    return `${repo}/issues/new?labels=bug&body=${encodeURIComponent(body)}`;
}

const LINKS: Record<LinkKind, () => string> = {
    guide: () => `${repo}/blob/main/docs/USER-GUIDE.md`,
    privacy: () => `${repo}/blob/main/docs/PRIVACY.md`,
    download: () => `${repo}/releases/latest`,
    issues: () => `${repo}/issues`,
    license: () => `${repo}/blob/main/LICENSE`,
    bug: bugUrl,
};

export function openLink(kind: LinkKind): void {
    void shell.openExternal(LINKS[kind]());
}

export function appInfo(): {
    version: string;
    canSelfUpdate: boolean;
    license: string;
} {
    return {
        version: app.getVersion(),
        canSelfUpdate: canSelfUpdate(),
        license: pkg.license,
    };
}

// Opens the folder with the local error log, e.g. to attach it to a bug report.
export function openLogFolder(): void {
    void shell.openPath(dirname(logFile()));
}
