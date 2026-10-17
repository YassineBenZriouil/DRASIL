// Keyboard shortcuts: one registry of commands, each with default keys the user can change.
// Keys are written like "Mod+Shift+N": Mod is Ctrl on Windows/Linux and Cmd on macOS.

const isMac = window.drasil.platform === 'darwin';

export interface Command {
    id: string;
    label: string;
    keys: string[];
    // Return false to let the key do its normal thing (e.g. copy selected text).
    run: () => boolean | void;
}

// The combo for a key event, in the same form as Command.keys.
export function comboOf(e: KeyboardEvent): string | null {
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;
    let key = e.key === ' ' ? 'Space' : e.key;
    if (key.length === 1) key = key.toUpperCase();
    const parts: string[] = [];
    if (isMac ? e.metaKey : e.ctrlKey) parts.push('Mod');
    if (isMac && e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    // Shift is part of symbols like "?" already; only name it for letters and named keys.
    if (e.shiftKey && (key.length > 1 || /[A-Z]/.test(key)))
        parts.push('Shift');
    parts.push(key);
    return parts.join('+');
}

// "Mod+Shift+N" → "Ctrl+Shift+N" or "⌘⇧N", for display.
export function displayCombo(combo: string): string {
    if (!isMac) return combo.replace('Mod', 'Ctrl');
    return combo
        .replace('Mod+', '⌘')
        .replace('Ctrl+', '⌃')
        .replace('Alt+', '⌥')
        .replace('Shift+', '⇧');
}

// Keys with no Mod/Alt that type text or move around; they're left to text fields and the list view.
function isPlain(combo: string): boolean {
    return (
        !/^(Mod|Ctrl|Alt)\+/.test(combo) &&
        !/^(Shift\+)?(F\d+|Delete)$/.test(combo)
    );
}

export class Keymap {
    private overrides: Record<string, string[]>;

    constructor(
        private commands: Command[],
        overrides: Record<string, string[]>
    ) {
        this.overrides = { ...overrides };
    }

    get all(): readonly Command[] {
        return this.commands;
    }

    keysFor(id: string): string[] {
        return (
            this.overrides[id] ??
            this.commands.find((c) => c.id === id)?.keys ??
            []
        );
    }

    // Assign `combo` to `id`. Returns the label of the command that lost it, if any.
    assign(id: string, combo: string): string | null {
        let taken: string | null = null;
        for (const c of this.commands) {
            if (c.id === id) continue;
            const keys = this.keysFor(c.id);
            if (keys.includes(combo)) {
                this.overrides[c.id] = keys.filter((k) => k !== combo);
                taken = c.label;
            }
        }
        this.overrides[id] = [combo];
        return taken;
    }

    reset(id?: string): void {
        if (id) delete this.overrides[id];
        else this.overrides = {};
    }

    get saved(): Record<string, string[]> {
        return { ...this.overrides };
    }

    handle(e: KeyboardEvent): boolean {
        const combo = comboOf(e);
        if (!combo) return false;
        const target = e.target as HTMLElement | null;
        const typing =
            target instanceof HTMLInputElement ||
            target instanceof HTMLSelectElement ||
            target instanceof HTMLTextAreaElement;
        // Text fields and the list view handle their own plain keys (letters, arrows, Home…).
        if (isPlain(combo) && (typing || target?.closest('[data-own-keys]')))
            return false;
        if (typing && /^Mod\+[ACVXZ]$/.test(combo)) return false;
        const cmd = this.commands.find((c) =>
            this.keysFor(c.id).includes(combo)
        );
        if (!cmd || cmd.run() === false) return false;
        e.preventDefault();
        return true;
    }
}

export const MOD_TRASH = isMac ? 'Mod+Backspace' : 'Delete';
export const MOD_DELETE = isMac ? 'Mod+Alt+Backspace' : 'Shift+Delete';
