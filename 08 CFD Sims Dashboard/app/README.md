# app/

The CFD viewer, served by Firebase Hosting from this folder. Ported from
`07 CFD PDF Viewer/app/` on 2026-09-02; `core.js`'s header lists what changed
in the port. `library.js` is the only file that talks to Firebase; `cache.js` is the only
one that touches the Cache API and IndexedDB. `ds/` is
copied from `05 Design System/` and must stay byte-identical to it; only
`tokens.css` is loaded (see the comment in `index.html`). `vendor/` is pdf.js,
refreshed with `npm run vendor`.
