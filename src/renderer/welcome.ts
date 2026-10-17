// First-launch welcome and location picker (also used when the last location is gone),
// plus a small dismissible card of getting-around tips. No tutorial to click through.
import type { Location } from '../shared/fs-types';

const dialog = document.getElementById('welcome') as HTMLDialogElement;
const tips = document.getElementById('tips')!;

function h<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    text?: string,
    className?: string
): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (text) e.textContent = text;
    if (className) e.className = className;
    return e;
}

// Resolves to the chosen folder, or null if dismissed.
export function chooseLocation(
    locations: Location[],
    opts: { first: boolean; message?: string }
): Promise<string | null> {
    return new Promise((resolve) => {
        const title = h(
            'h2',
            opts.first ? 'Welcome to Drasil' : 'Choose a location'
        );
        title.id = 'welcome-title';
        const parts: HTMLElement[] = [title];
        if (opts.first)
            parts.push(
                h(
                    'p',
                    'Drasil shows your files as a living tree: folders are branches and files are leaves. Zoom out to see the whole shape, zoom in for the details, and manage your files right in the tree.'
                )
            );
        if (opts.message) parts.push(h('p', opts.message, 'message'));
        parts.push(h('h3', 'Where would you like to start?'));

        const finish = (path: string | null): void => {
            dialog.close();
            resolve(path);
        };
        for (const [heading, kind] of [
            ['Places', 'place'],
            ['Drives', 'drive'],
        ] as const) {
            const items = locations.filter((l) => l.kind === kind);
            if (!items.length) continue;
            const group = h('div', undefined, 'choices');
            group.setAttribute('role', 'group');
            group.setAttribute('aria-label', heading);
            for (const loc of items) {
                const b = h('button');
                b.append(
                    h('span', loc.name, 'name'),
                    h('span', loc.path, 'where')
                );
                b.addEventListener('click', () => finish(loc.path));
                group.append(b);
            }
            parts.push(h('p', heading, 'group-label'), group);
        }
        if (opts.first)
            parts.push(
                h(
                    'p',
                    'Only the place you pick is read, a little at a time. Everything stays on this computer: Drasil never sends file names or anything else over the internet.',
                    'hint-inline'
                )
            );
        const later = h('button', opts.first ? 'Not now' : 'Cancel');
        later.addEventListener('click', () => finish(null));
        const foot = h('div', undefined, 'buttons');
        foot.append(later);
        parts.push(foot);

        dialog.setAttribute('aria-labelledby', 'welcome-title');
        dialog.replaceChildren(...parts);
        dialog.addEventListener('cancel', () => resolve(null), { once: true });
        dialog.showModal();
        dialog.querySelector<HTMLButtonElement>('.choices button')?.focus();
    });
}

export function isWelcomeOpen(): boolean {
    return dialog.open;
}

export function showTips(onDismiss: () => void): void {
    const close = h('button', 'Got it');
    close.addEventListener('click', () => {
        tips.hidden = true;
        onDismiss();
    });
    const list = h('ul');
    for (const tip of [
        'Click a folder to open it; double-click to make it the center.',
        'Drag empty space to move around, scroll or pinch to zoom.',
        'Right-click (or the menu key) for actions like rename and delete.',
        'Press L for a list view, and F1 for every keyboard shortcut.',
    ])
        list.append(h('li', tip));
    tips.replaceChildren(h('p', 'Getting around', 'tips-title'), list, close);
    tips.hidden = false;
}
