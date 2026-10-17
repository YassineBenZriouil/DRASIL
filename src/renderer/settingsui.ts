// The Settings dialog. Every change applies right away and is saved by the main process.
import type { Location } from '../shared/fs-types';
import type { Settings } from '../shared/settings';
import { comboOf, displayCombo, type Keymap } from './keys';
import { formatSize } from './ops';

const api = window.drasil;

export interface SettingsContext {
    get(): Settings;
    save(patch: Partial<Settings>): Promise<void>;
    keymap: Keymap;
    locations(): Location[];
    // The folder currently shown as the root, if any.
    currentFolder(): string | null;
    // Excludes or the cache changed: recalculate sizes.
    sizesChanged(): void;
}

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

function selectRow<T extends string | number>(
    label: string,
    options: [string, T][],
    value: T,
    onChange: (v: T) => void
): HTMLLabelElement {
    const l = h('label');
    const s = h('select');
    options.forEach(([text], i) => s.append(new Option(text, String(i))));
    s.selectedIndex = Math.max(
        0,
        options.findIndex(([, v]) => v === value)
    );
    s.addEventListener('change', () => onChange(options[s.selectedIndex]![1]));
    l.append(label, s);
    return l;
}

function checkRow(
    label: string,
    checked: boolean,
    onChange: (v: boolean) => void
): HTMLLabelElement {
    const l = h('label', undefined, 'check');
    const c = h('input');
    c.type = 'checkbox';
    c.checked = checked;
    c.addEventListener('change', () => onChange(c.checked));
    l.append(c, ' ', label);
    return l;
}

export class SettingsUI {
    private dialog = document.getElementById('settings') as HTMLDialogElement;
    // While choosing a new shortcut, Escape cancels that instead of closing the dialog.
    private capturing = false;

    constructor(private ctx: SettingsContext) {
        this.dialog.addEventListener('cancel', (e) => {
            if (this.capturing) e.preventDefault();
        });
    }

    get isOpen(): boolean {
        return this.dialog.open;
    }

    async open(section?: string): Promise<void> {
        await this.build();
        if (!this.dialog.open) this.dialog.showModal();
        const target = section
            ? this.dialog.querySelector<HTMLElement>(`#settings-${section}`)
            : null;
        (
            target ??
            this.dialog.querySelector<HTMLElement>('select, input, button')
        )?.focus();
        target?.scrollIntoView({ block: 'start' });
    }

    private async build(): Promise<void> {
        const s = this.ctx.get();
        const save = (patch: Partial<Settings>): Promise<void> =>
            this.ctx.save(patch).then(() => {
                if ('excludes' in patch) this.ctx.sizesChanged();
            });
        // Rebuild only after the save, so the dialog shows the stored values.
        const saveAndRebuild = (patch: Partial<Settings>): void =>
            void save(patch).then(() => this.build());
        const sections: HTMLElement[] = [];
        const section = (
            id: string,
            title: string,
            ...children: (Node | string)[]
        ): void => {
            const sec = h('section');
            const heading = h('h3', title);
            heading.id = `settings-${id}`;
            heading.tabIndex = -1;
            sec.append(heading, ...children);
            sections.push(sec);
        };

        section(
            'appearance',
            'Appearance',
            selectRow(
                'Theme',
                [
                    ['Follow the system', 'system'],
                    ['Dark', 'dark'],
                    ['Light', 'light'],
                ],
                s.theme,
                (theme) => void save({ theme })
            ),
            selectRow(
                'Animation',
                [
                    ['Follow the system', 'system'],
                    ['Full', 'full'],
                    ['Reduced (no motion)', 'reduced'],
                ],
                s.motion,
                (motion) => void save({ motion })
            ),
            selectRow(
                'Interface size',
                [
                    ['75%', 0.75],
                    ['90%', 0.9],
                    ['100%', 1],
                    ['110%', 1.1],
                    ['125%', 1.25],
                    ['150%', 1.5],
                    ['175%', 1.75],
                    ['200%', 2],
                ],
                s.uiScale,
                (uiScale) => void save({ uiScale })
            )
        );

        section(
            'layout',
            'Layout',
            selectRow(
                'View',
                [
                    ['Tree', 'tree'],
                    ['Tree and list', 'both'],
                    ['List only', 'list'],
                ],
                s.layout,
                (layout) => void save({ layout })
            ),
            checkRow(
                'Show the details panel',
                s.inspector,
                (inspector) => void save({ inspector })
            ),
            checkRow(
                'Show hidden items by default',
                s.showHidden,
                (showHidden) => void save({ showHidden })
            )
        );

        const starts: [string, string][] = [
            ['Ask me (show the locations)', 'ask'],
            ['The last location I used', 'last'],
            ...this.ctx
                .locations()
                .map((l): [string, string] => [l.name, l.path]),
        ];
        const here = this.ctx.currentFolder();
        if (here && !starts.some(([, v]) => v === here))
            starts.push([`This folder (${here})`, here]);
        if (!starts.some(([, v]) => v === s.startLocation))
            starts.push([s.startLocation, s.startLocation]);
        section(
            'start',
            'When Drasil opens',
            selectRow(
                'Start in',
                starts,
                s.startLocation,
                (startLocation) => void save({ startLocation })
            )
        );

        // Excluded locations
        const list = h('ul', undefined, 'excludes');
        for (const path of s.excludes) {
            const li = h('li');
            const remove = h('button', 'Remove');
            remove.setAttribute(
                'aria-label',
                `Remove ${path} from excluded locations`
            );
            remove.addEventListener('click', () => {
                saveAndRebuild({
                    excludes: s.excludes.filter((p) => p !== path),
                });
            });
            li.append(h('span', path), ' ', remove);
            list.append(li);
        }
        if (!s.excludes.length)
            list.append(h('li', 'Nothing is excluded.', 'hint-inline'));
        const input = h('input');
        input.type = 'text';
        input.placeholder = 'Folder path to exclude';
        input.setAttribute('aria-label', 'Folder path to exclude');
        const error = h('p', undefined, 'message');
        error.setAttribute('role', 'alert');
        const add = (path: string): void => {
            const p = path.trim();
            if (!/^([A-Za-z]:[\\/]|\/|\\\\)/.test(p)) {
                error.textContent =
                    'Enter a full path, like C:\\Users\\me\\Videos or /home/me/videos.';
                return;
            }
            saveAndRebuild({ excludes: [...new Set([...s.excludes, p])] });
        };
        const addButton = h('button', 'Add');
        addButton.addEventListener('click', () => add(input.value));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                add(input.value);
            }
        });
        const row = h('div', undefined, 'inline');
        row.append(input, addButton);
        if (here) {
            const addHere = h('button', 'Exclude the current folder');
            addHere.addEventListener('click', () => add(here));
            row.append(addHere);
        }
        section(
            'scanning',
            'Excluded locations',
            h(
                'p',
                'Folder sizes and search skip these folders and everything in them. They still show in the tree, and totals that leave them out say so.',
                'hint-inline'
            ),
            list,
            row,
            error
        );

        // Cache
        const info = await api.cacheInfo();
        const cacheText = h(
            'p',
            info.files
                ? `Saved folder totals: ${info.files} file${info.files === 1 ? '' : 's'}, ${formatSize(info.bytes)}.`
                : 'No saved folder totals.'
        );
        const clear = h('button', 'Clear cache');
        clear.disabled = info.files === 0;
        clear.addEventListener('click', () => {
            void api.clearCache().then(() => {
                this.ctx.sizesChanged();
                void this.build();
            });
        });
        section(
            'cache',
            'Cache',
            h(
                'p',
                'To show sizes sooner, Drasil saves folder totals on this computer. Saved totals are labelled with when they were calculated, and they are recalculated each time. Clearing the cache never touches your files.',
                'hint-inline'
            ),
            cacheText,
            clear
        );

        // Shortcuts
        const table = h('table');
        const keymap = this.ctx.keymap;
        const status = h('p', undefined, 'message');
        status.setAttribute('role', 'status');
        for (const cmd of keymap.all) {
            const tr = h('tr');
            const keys = keymap.keysFor(cmd.id);
            const td = h(
                'td',
                keys.length ? keys.map(displayCombo).join(', ') : 'None'
            );
            const change = h('button', 'Change');
            change.setAttribute(
                'aria-label',
                `Change the shortcut for ${cmd.label}`
            );
            change.addEventListener('click', () => {
                this.capturing = true;
                change.textContent = 'Press keys… (Esc to cancel)';
                const onKey = (e: KeyboardEvent): void => {
                    const combo = comboOf(e);
                    if (!combo) return;
                    e.preventDefault();
                    e.stopPropagation();
                    change.removeEventListener('keydown', onKey);
                    this.capturing = false;
                    if (combo !== 'Escape') {
                        const lost = keymap.assign(cmd.id, combo);
                        void save({ keys: keymap.saved });
                        status.textContent = lost
                            ? `${displayCombo(combo)} now does “${cmd.label}”. It was removed from “${lost}”.`
                            : `${displayCombo(combo)} now does “${cmd.label}”.`;
                    }
                    void this.build().then(() =>
                        this.dialog
                            .querySelector<HTMLElement>(
                                `[data-cmd="${cmd.id}"]`
                            )
                            ?.focus()
                    );
                };
                change.addEventListener('keydown', onKey);
            });
            change.dataset.cmd = cmd.id;
            const reset = h('button', 'Reset');
            reset.setAttribute(
                'aria-label',
                `Reset the shortcut for ${cmd.label}`
            );
            reset.addEventListener('click', () => {
                keymap.reset(cmd.id);
                saveAndRebuild({ keys: keymap.saved });
            });
            const actions = h('td');
            actions.append(change, ' ', reset);
            tr.append(h('th', cmd.label), td, actions);
            table.append(tr);
        }
        const resetAll = h('button', 'Reset all shortcuts');
        resetAll.addEventListener('click', () => {
            keymap.reset();
            saveAndRebuild({ keys: keymap.saved });
        });
        section(
            'shortcuts',
            'Keyboard shortcuts',
            h(
                'p',
                'On the tree: arrow keys move between items, Enter opens, Space selects, Escape clears the selection. In the list: arrows, Home/End, Page Up/Down, typing a name jumps to it.',
                'hint-inline'
            ),
            table,
            resetAll,
            status
        );

        section(
            'privacy',
            'Privacy',
            h(
                'p',
                'Drasil works entirely on this computer. It never sends file names, paths or any other information anywhere.',
                'hint-inline'
            )
        );

        const title = h('h2', 'Settings');
        title.id = 'settings-title';
        const close = h('button', 'Close', 'primary');
        close.addEventListener('click', () => this.dialog.close());
        const body = h('div', undefined, 'settings-body');
        body.append(...sections);
        const foot = h('div', undefined, 'buttons');
        foot.append(close);
        this.dialog.setAttribute('aria-labelledby', 'settings-title');
        this.dialog.replaceChildren(title, body, foot);
    }
}
