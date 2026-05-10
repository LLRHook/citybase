// citybaseApi.js — renderer-side facade for the Electron desktop API.
//
// The renderer ALWAYS runs inside the Electron shell. preload.cjs
// attaches `window.citybase` before any module evaluates here, so the
// facade is a thin re-export of that object. There is no browser
// fallback by design — we deleted the stub on 2026-05-10 because it
// was masking real bridge failures and giving the empty-state UI
// nothing to click.
//
// Tests inject a fake `window.citybase` in src/tests/setup.js before
// the App module evaluates; that's the only place the desktop bridge
// is "stubbed", and only for jsdom.
const bridge = typeof window !== 'undefined' ? window.citybase : undefined;
if (!bridge) {
  throw new Error(
    'citybaseApi: window.citybase is not present. The renderer must run inside '
    + 'the Electron shell. Use `npm run dev:desktop` (HMR) or `npm run start:desktop` '
    + '(built renderer). The browser-only path was removed.',
  );
}

export const citybaseApi = bridge;
