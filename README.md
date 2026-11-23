# vr.phylab.uk

The 3D and VR part of the electric-field lesson, on its own short address so it is quick to type on a headset.
It was moved out of learn.phylab.uk (broshu/learn.phylab.uk, `public/during/`); the lesson there is unchanged.

- `/` — one page: **Explore** the 3D space (Browser / AR / VR tabs), then **Match** a hidden field
- `public/space3d.js` — the 3D space (three.js, WebXR for AR and VR)
- `public/match.js`, `public/match-judge.js` — the match task and its forgiving check
- `public/vendor/three/` — three.js
- `public/record.js` — a small record kept in this tab only

## How it runs

One Cloudflare Worker (`vr-phylab-uk`) serving `public/` as static files, custom domain `vr.phylab.uk`.
Deploy: `npx wrangler deploy`, or connect this repo to Workers Builds so every push to `main` deploys.
