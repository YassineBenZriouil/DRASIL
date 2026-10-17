// Privacy guard: no request may leave the computer. Only the app's own files (and the local dev
// server while developing) load. The one exception is an update check the user started (or turned
// on in Settings), and then only to GitHub, where releases live. Anything else is blocked and logged.
import { app, session, type Session } from 'electron';
import { log } from './log';

const LOCAL_PROTOCOLS = [
    'file:',
    'data:',
    'blob:',
    'devtools:',
    'chrome-extension:',
];
const UPDATE_HOSTS = [
    'github.com',
    'api.github.com',
    'objects.githubusercontent.com',
    'release-assets.githubusercontent.com',
];

let updateAccess = false;

// Open the GitHub door only for the duration of an update check or download.
export function setUpdateAccess(on: boolean): void {
    updateAccess = on;
}

function guard(s: Session): void {
    const dev = process.env['ELECTRON_RENDERER_URL'];
    const devHost = dev ? new URL(dev).host : null;
    s.webRequest.onBeforeRequest((details, callback) => {
        const url = new URL(details.url);
        const allowed =
            LOCAL_PROTOCOLS.includes(url.protocol) ||
            (devHost !== null && url.host === devHost) ||
            (updateAccess &&
                url.protocol === 'https:' &&
                UPDATE_HOSTS.includes(url.hostname));
        if (!allowed)
            log('Blocked a network request (this is a bug)', details.url);
        callback({ cancel: !allowed });
    });
}

export function blockNetwork(): void {
    guard(session.defaultSession);
    // The updater uses its own session; every session gets the same guard.
    app.on('session-created', guard);
}
