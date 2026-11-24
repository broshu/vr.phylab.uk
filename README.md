# vr.phylab.uk

The 3D and VR part of the electric-field lesson, on its own short address so it is quick to type on a headset.
It was moved out of learn.phylab.uk (broshu/learn.phylab.uk, `public/during/`); the lesson there is unchanged.

- `/` — the project list: big boxes to point at in a headset
- `/explore/` — Explore: place charges and charged objects in 3D and look at their field lines
- `/match/` — Match: place hidden charges to make the orange field you are shown
- On a device that can open VR (a headset browser), a project page starts on the VR tab with a large Start VR button; elsewhere it opens in the browser view. VR itself must be started by a tap or trigger: browsers do not allow it to start by itself.

## Adding a project

1. Add an entry to `public/projects.js` (`slug`, `title`, `blurb`). It then appears on the home page.
2. Make `public/<slug>/index.html` (copy `public/explore/index.html`). Its address is `vr.phylab.uk/<slug>/`.

## Files

- `public/space3d.js` — the 3D space (three.js, WebXR for AR and VR)
- `public/match.js`, `public/match-judge.js` — the match task and its forgiving check
- `public/shell.js` — the top bar of a project page (back to the list, project name)
- `public/vendor/three/` — three.js
- `public/record.js` — a small record kept in this tab only

## How it runs

One Cloudflare Worker (`vr-phylab-uk`) serving `public/` as static files, custom domain `vr.phylab.uk`.
Deploy: `npx wrangler deploy`, or connect this repo to Workers Builds so every push to `main` deploys.
