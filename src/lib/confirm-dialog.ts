export type ConfirmTone = 'default' | 'danger';

export interface ConfirmOptions {
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    tone?: ConfirmTone;
}

type ConfirmHandler = (options: ConfirmOptions) => Promise<boolean>;

let globalHandler: ConfirmHandler | null = null;

export function registerConfirmHandler(handler: ConfirmHandler | null) {
    globalHandler = handler;
}

export async function confirmAction(input: string | ConfirmOptions): Promise<boolean> {
    const rawOptions: ConfirmOptions = typeof input === 'string' ? { message: input } : input;
    const options: ConfirmOptions = {
        ...rawOptions,
        tone: rawOptions.tone || (/删除|delete/i.test(rawOptions.message) ? 'danger' : 'default'),
    };

    if (typeof window === 'undefined') return false;

    if (globalHandler) {
        return globalHandler(options);
    }

    return window.confirm(options.message);
}
