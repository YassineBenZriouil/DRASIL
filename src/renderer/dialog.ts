// One modal <dialog> for every prompt: rename, new folder, confirmations, name conflicts.
// Requests are queued, so prompts from several operations never overlap.

export interface DialogButton {
    label: string;
    value: string;
    kind?: 'primary' | 'danger';
}

export interface DialogOptions {
    title: string;
    body?: string[];
    input?: {
        value: string;
        // Characters to preselect from the start (e.g. the name without its extension).
        select?: number;
        validate?: (value: string) => string | null;
    };
    checkbox?: string;
    buttons: DialogButton[];
    // Returned when the dialog is dismissed with Escape.
    cancelValue?: string;
}

export interface DialogResult {
    value: string;
    input: string;
    checked: boolean;
}

const dialog = document.getElementById('dialog') as HTMLDialogElement;
let queue: Promise<unknown> = Promise.resolve();

export function isDialogOpen(): boolean {
    return dialog.open;
}

export function showDialog(o: DialogOptions): Promise<DialogResult | null> {
    const run = queue.then(() => present(o));
    queue = run.catch(() => {});
    return run;
}

function present(o: DialogOptions): Promise<DialogResult | null> {
    return new Promise((resolve) => {
        const form = document.createElement('form');
        form.method = 'dialog';
        const title = document.createElement('h2');
        title.id = 'dialog-title';
        title.textContent = o.title;
        form.append(title);
        dialog.setAttribute('aria-labelledby', 'dialog-title');
        for (const line of o.body ?? []) {
            const p = document.createElement('p');
            p.textContent = line;
            form.append(p);
        }

        let input: HTMLInputElement | null = null;
        const error = document.createElement('p');
        error.className = 'message';
        error.setAttribute('role', 'alert');
        if (o.input) {
            input = document.createElement('input');
            input.type = 'text';
            input.value = o.input.value;
            input.spellcheck = false;
            input.setAttribute('aria-label', o.title);
            const check = (): void => {
                error.textContent = o.input!.validate?.(input!.value) ?? '';
            };
            input.addEventListener('input', check);
            form.append(input, error);
        }

        let checkbox: HTMLInputElement | null = null;
        if (o.checkbox) {
            const label = document.createElement('label');
            checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            label.append(checkbox, ' ', o.checkbox);
            form.append(label);
        }

        const row = document.createElement('div');
        row.className = 'buttons';
        for (const b of o.buttons) {
            const button = document.createElement('button');
            button.type = 'submit';
            button.value = b.value;
            button.textContent = b.label;
            if (b.kind) button.className = b.kind;
            row.append(button);
        }
        form.append(row);

        const finish = (result: DialogResult | null): void => {
            dialog.removeEventListener('cancel', onCancel);
            dialog.close();
            resolve(result);
        };
        const onCancel = (e: Event): void => {
            e.preventDefault();
            finish(
                o.cancelValue === undefined
                    ? null
                    : {
                          value: o.cancelValue,
                          input: input?.value ?? '',
                          checked: checkbox?.checked ?? false,
                      }
            );
        };
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const submitter = (e as SubmitEvent)
                .submitter as HTMLButtonElement | null;
            // Enter in the text field acts as the primary button.
            const value =
                submitter?.value ??
                o.buttons.find((b) => b.kind === 'primary')?.value ??
                o.buttons[0]!.value;
            const isCancel = value === o.cancelValue || value === 'cancel';
            if (input && !isCancel) {
                const problem = o.input!.validate?.(input.value) ?? null;
                if (problem) {
                    error.textContent = problem;
                    input.focus();
                    return;
                }
            }
            if (isCancel && o.cancelValue === undefined) return finish(null);
            finish({
                value,
                input: input?.value ?? '',
                checked: checkbox?.checked ?? false,
            });
        });
        dialog.addEventListener('cancel', onCancel);
        dialog.replaceChildren(form);
        dialog.showModal();
        if (input) {
            input.focus();
            input.setSelectionRange(0, o.input!.select ?? input.value.length);
        } else {
            (
                row.querySelector<HTMLButtonElement>('.primary') ??
                row.querySelector('button')
            )?.focus();
        }
    });
}
