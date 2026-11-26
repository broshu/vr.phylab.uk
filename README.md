# vr.phylab.uk

The 3D and VR part of the electric-field lesson, on its own short address so it is quick to type on a headset.
It was moved out of learn.phylab.uk (broshu/learn.phylab.uk, `public/during/`); the lesson there is unchanged.

- `/` — the project list: big boxes to point at in a headset
- `/explore/` — Explore: place charges and charged objects in 3D and look at their field lines
- `/match/` — Match: place hidden charges to make the orange field you are shown
- The site is for VR headsets only: there are no Browser or AR modes. A project page shows the space and a large Start VR button (a browser only starts VR from a tap, a pinch or the trigger, never by itself). On a device that cannot open VR the page says so and shows the space as a preview you can turn with the mouse.
- Fewer Start VR presses (`public/xr-nav.js`): choosing a box on the home page starts VR there and hands it on, so the project opens already in VR; in VR, the project buttons on the floor (front left) go to another project and stay in VR. This needs the browser to hand the VR session on to the next page (the `sessiongranted` event in Meta Quest Browser). If it does not, the project page shows Start VR as before, and the home page stops trying in that browser. Meta Quest Browser also shows an Enter VR button in its own bar (`offerSession`).

## Adding a project

1. Add an entry to `public/projects.js` (`slug`, `title`, `blurb`). It then appears on the home page.
2. Make `public/<slug>/index.html` (copy `public/explore/index.html`). Its address is `vr.phylab.uk/<slug>/`.

## Files

- `public/space3d.js` — the 3D space (three.js, WebXR VR)
- `public/match.js`, `public/match-judge.js` — the match task and its forgiving check
- `public/xr-nav.js` — going from page to page in VR without pressing Start VR again
- `public/shell.js` — the top bar of a project page (back to the list, project name)
- `public/vendor/three/` — three.js
- `public/record.js` — a small record kept in this tab only

## How it runs

One Cloudflare Worker (`vr-phylab-uk`) serving `public/` as static files, custom domain `vr.phylab.uk`.
Deploy: `npx wrangler deploy`, or connect this repo to Workers Builds so every push to `main` deploys.
