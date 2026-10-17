import type { DrasilApi } from '../shared/fs-types';

declare global {
    interface Window {
        drasil: DrasilApi;
    }
}
